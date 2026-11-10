// Hook para processar ações criadas diretamente com status 'pending'
// Todas as variáveis e funções auxiliares ficam INLINE no callback.

onRecordCreate((e) => {
  // Garantir que user seja atribuído ou validado estritamente para o usuário autenticado da requisição.
  // NUNCA usar variáveis globais (globalThis) que contaminam o estado entre sessões concorrentes!
  const recUser = e.record.getString('user')
  let authUserId = ''
  let authEmail = ''

  try {
    if (e.auth && e.auth.id) {
      authUserId = e.auth.id
      authEmail = e.auth.getString('email') || ''
    }
  } catch (_) {}

  // Se e.auth não estiver acoplado (ou seja, tool call do agente ou chamada com token no header)
  if (!authUserId) {
    // Tentar extrair do header de autorização se presente na requisição HTTP
    try {
      const qInfo = (typeof e.requestInfo === 'function' ? e.requestInfo() : null) || {}
      let qToken = ''
      if (qInfo.headers && typeof qInfo.headers === 'object') {
        const authHdr = qInfo.headers.authorization || qInfo.headers.Authorization || ''
        if (authHdr && typeof authHdr === 'string' && authHdr.toLowerCase().startsWith('bearer ')) {
          qToken = authHdr.slice(7).trim()
        }
      }
      if (qToken) {
        try {
          const u = $app.findAuthRecordByToken(qToken, 'auth') || $app.findAuthRecordByToken(qToken)
          if (u && u.id) {
            authUserId = u.id
            authEmail = u.getString('email') || ''
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  // Se o registro foi enviado com um `user`, verificar se esse user existe no banco
  if (recUser) {
    try {
      const existingUser = $app.findRecordById('users', recUser)
      if (!existingUser) {
        // Se o user especificado não existe e temos authUserId válido, corrigir
        if (authUserId) {
          e.record.set('user', authUserId)
        }
      }
    } catch (_) {
      if (authUserId) {
        e.record.set('user', authUserId)
      }
    }
  } else if (authUserId) {
    // Se não veio user no payload da ferramenta, preencher com o usuário autenticado da requisição
    e.record.set('user', authUserId)
  }

  // Se houver usuário autenticado no contexto HTTP direto e ele for diferente do campo user,
  // prevalecer a autoridade do usuário autenticado da requisição (evita spoofing)
  if (authUserId && recUser && recUser !== authUserId) {
    // Se a chamada HTTP veio de um usuário autenticado legítimo, ele só pode criar para si mesmo
    e.record.set('user', authUserId)
  }

  const effectiveUserId = e.record.getString('user')
  if (!effectiveUserId) {
    return e.next()
  }

  const actionType = e.record.getString('action_type')
  const currentStatus = e.record.getString('status')

  // Na criação: só processa se já for 'pending' (se for 'pending_approval', aguarda aprovação)
  if (currentStatus !== 'pending') {
    return e.next()
  }

  // 1. Obter dados do usuário se ainda não tiver email
  if (!authEmail) {
    try {
      const uRec = $app.findRecordById('users', effectiveUserId)
      if (uRec) authEmail = uRec.getString('email') || ''
    } catch (_) {}
  }

  // 2. Buscar configurações Zernio do usuário (multi-tenancy estrito)
  let settingsRecord = null
  try {
    const found = $app.findRecordsByFilter(
      'app_settings',
      "key = 'whatsapp_zernio' && user = '" + effectiveUserId + "'",
      '-created',
      1,
      0,
    )
    if (found && found.length > 0) {
      settingsRecord = found[0]
    }
  } catch (_) {}

  // Apenas a conta fabiano@adapta.org (seus próprios registros) pode ter fallback de API key de ambiente
  const isOwner = authEmail === 'fabiano@adapta.org' && effectiveUserId === 'a86jljjq08mft7l'
  const userApiKey = settingsRecord ? (settingsRecord.getString('zernio_api_key') || '').trim() : ''
  const rawApiKey = ($secrets.get('ZERNIO_API_KEY') || $os.getenv('ZERNIO_API_KEY') || '').trim()
  const apiKey = userApiKey || (isOwner ? rawApiKey : '')

  if (!apiKey) {
    e.record.set('status', 'failed')
    e.record.set(
      'error_message',
      'Chave Zernio API não encontrada para este usuário. Configure em Configurações > Conexão.',
    )
    return e.next()
  }

  const defaultAccountId = settingsRecord ? settingsRecord.getString('zernio_account_id') : ''
  const accountId =
    defaultAccountId || (isOwner ? ($os.getenv('ZERNIO_ACCOUNT_ID') || '').trim() : '')

  let params = {}
  try {
    let rawParams = null
    try {
      rawParams = e.record.getString('params')
    } catch (_) {}

    if (rawParams && typeof rawParams === 'string' && rawParams.trim().length > 0) {
      try {
        params = JSON.parse(rawParams)
      } catch (_) {}
    }

    if (!params || typeof params !== 'object' || Object.keys(params).length === 0) {
      const directVal = e.record.get('params')
      if (directVal) {
        if (typeof directVal === 'string') {
          try {
            params = JSON.parse(directVal)
          } catch (_) {
            params = {}
          }
        } else if (typeof directVal === 'object') {
          if (
            Array.isArray(directVal) &&
            directVal.length > 0 &&
            typeof directVal[0] === 'number'
          ) {
            try {
              let str = ''
              for (let i = 0; i < directVal.length; i++) {
                str += String.fromCharCode(directVal[i])
              }
              params = JSON.parse(str)
            } catch (_) {}
          } else if (typeof directVal.string === 'function') {
            try {
              params = JSON.parse(directVal.string())
            } catch (_) {}
          } else {
            params = directVal
          }
        }
      }
    }
  } catch (parseErr) {
    console.log('[agent_action_processor] Falha ao parsear params: ' + parseErr.message)
    params = {}
  }

  // AÇÃO 1: CRIAR TEMPLATE NA ZERNIO
  if (actionType === 'create_zernio_template') {
    let rawName = (params.name || params.template_name || params.templateName || '').trim()
    let name = rawName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')

    let rawCategory = (params.category || 'UTILITY').toString().trim().toUpperCase()
    let category = 'UTILITY'
    if (rawCategory === 'UTILIDADE' || rawCategory === 'UTIL' || rawCategory.includes('UTIL')) {
      category = 'UTILITY'
    } else if (
      rawCategory === 'MARKETING' ||
      rawCategory === 'PROPAGANDA' ||
      rawCategory === 'PROMO'
    ) {
      category = 'MARKETING'
    } else if (
      rawCategory === 'AUTHENTICATION' ||
      rawCategory === 'AUTENTICACAO' ||
      rawCategory === 'AUTH' ||
      rawCategory === 'OTP'
    ) {
      category = 'AUTHENTICATION'
    }

    let rawLanguage = (params.language || 'pt_BR').toString().trim()
    let language = rawLanguage.replace('-', '_')
    if (
      language.toLowerCase() === 'pt' ||
      language.toLowerCase() === 'pt_br' ||
      language.toLowerCase() === 'portugues'
    ) {
      language = 'pt_BR'
    }

    let bodyText = (
      params.body ||
      params.text ||
      params.bodyText ||
      params.body_text ||
      params.content ||
      ''
    )
      .toString()
      .trim()

    const headerText = (params.headerText || params.header_text || params.header || '')
      .toString()
      .trim()

    const footerText = (params.footerText || params.footer_text || params.footer || '')
      .toString()
      .trim()

    let components = []
    if (Array.isArray(params.components) && params.components.length > 0) {
      for (let c = 0; c < params.components.length; c++) {
        const comp = params.components[c]
        if (!comp || typeof comp !== 'object') continue
        let cType = (comp.type || '').toString().trim().toLowerCase()
        if (!cType && comp.format === 'TEXT' && comp.text) cType = 'header'
        if (!cType && comp.text) cType = 'body'
        if (!cType && Array.isArray(comp.buttons)) cType = 'buttons'
        if (!cType) continue

        const itemObj = { type: cType }
        if (comp.text !== undefined && comp.text !== null) {
          itemObj.text = String(comp.text).trim()
          if (!bodyText && cType === 'body') bodyText = itemObj.text
        }
        if (comp.format) itemObj.format = comp.format
        if (comp.example) itemObj.example = comp.example
        if (Array.isArray(comp.buttons)) {
          const btnArr = []
          for (let bi = 0; bi < comp.buttons.length; bi++) {
            const b = comp.buttons[bi]
            if (!b || !b.text) continue
            const rawBType = (b.type || 'QUICK_REPLY').toString().trim().toUpperCase()
            const btnObj = { type: rawBType, text: String(b.text).trim() }
            if (rawBType === 'URL') {
              btnObj.url = String(b.url || '').trim()
              if (b.example) btnObj.example = b.example
            } else if (rawBType === 'PHONE_NUMBER') {
              btnObj.phone_number = String(b.phone_number || b.phoneNumber || '').trim()
            }
            btnArr.push(btnObj)
          }
          if (btnArr.length > 0) itemObj.buttons = btnArr
        }
        components.push(itemObj)
      }
    }

    if (components.length === 0) {
      let buttons = Array.isArray(params.buttons) ? params.buttons : []
      if (headerText) components.push({ type: 'header', format: 'TEXT', text: headerText })
      if (bodyText) components.push({ type: 'body', text: bodyText })
      if (footerText) components.push({ type: 'footer', text: footerText })
      if (buttons.length > 0) {
        const metaButtons = []
        for (let i = 0; i < buttons.length; i++) {
          const b = buttons[i]
          if (!b || !b.text) continue
          const bType = (b.type || 'QUICK_REPLY').toString().trim().toUpperCase()
          if (bType === 'URL') {
            const bObj = {
              type: 'URL',
              text: String(b.text).trim(),
              url: String(b.url || '').trim(),
            }
            if (b.example) bObj.example = b.example
            metaButtons.push(bObj)
          } else if (bType === 'PHONE_NUMBER') {
            metaButtons.push({
              type: 'PHONE_NUMBER',
              text: String(b.text).trim(),
              phone_number: String(b.phoneNumber || b.phone_number || '').trim(),
            })
          } else {
            metaButtons.push({ type: 'QUICK_REPLY', text: String(b.text).trim() })
          }
        }
        if (metaButtons.length > 0) components.push({ type: 'buttons', buttons: metaButtons })
      }
    }

    const providedExamples = params.examples || params.example_values || params.sample_values || {}
    let enrichedComponents = []
    for (let ci = 0; ci < components.length; ci++) {
      const c = components[ci]
      if (c.type === 'body') {
        let count = 0
        const text = (c.text || '').replace(/\{\{\s*(\d+|\w+)\s*\}\}/g, () => {
          count++
          return '{{' + count + '}}'
        })
        c.text = text
        if (!bodyText) bodyText = text

        if (count > 0) {
          const bodySampleValues = []
          for (let vi = 0; vi < count; vi++) {
            const varNum = vi + 1
            const customVal =
              providedExamples[varNum] ||
              providedExamples[String(varNum)] ||
              (Array.isArray(providedExamples) ? providedExamples[vi] : null) ||
              (params.example && params.example.body_text && params.example.body_text[0]
                ? params.example.body_text[0][vi]
                : null)
            const sample =
              customVal !== null && customVal !== undefined && String(customVal).trim() !== ''
                ? String(customVal).trim()
                : vi === 0
                  ? 'Maria'
                  : vi === 1
                    ? 'pedido #1234'
                    : 'informação ' + varNum
            bodySampleValues.push(sample)
          }
          if (!c.example || typeof c.example !== 'object')
            c.example = { body_text: [bodySampleValues] }
          else if (!c.example.body_text || !Array.isArray(c.example.body_text))
            c.example.body_text = [bodySampleValues]
        }
      } else if (c.type === 'header' && c.text) {
        if (!c.format) c.format = 'TEXT'
        let count = 0
        const text = (c.text || '').replace(/\{\{\s*(\d+|\w+)\s*\}\}/g, () => {
          count++
          return '{{' + count + '}}'
        })
        c.text = text
        if (count > 0) {
          const sample = params.header_example || params.headerExample || 'Aviso'
          if (!c.example || typeof c.example !== 'object')
            c.example = { header_text: [String(sample).trim()] }
          else if (!c.example.header_text || !Array.isArray(c.example.header_text))
            c.example.header_text = [String(sample).trim()]
        }
      } else if (c.type === 'buttons' && Array.isArray(c.buttons)) {
        for (let bi = 0; bi < c.buttons.length; bi++) {
          const btn = c.buttons[bi]
          if (btn && btn.type === 'URL' && btn.url) {
            let count = 0
            btn.url = (btn.url || '').replace(/\{\{\s*(\d+|\w+)\s*\}\}/g, () => {
              count++
              return '{{' + count + '}}'
            })
            if (
              count > 0 &&
              (!btn.example || !Array.isArray(btn.example) || btn.example.length === 0)
            ) {
              btn.example = ['promo']
            }
          }
        }
      }
      enrichedComponents.push(c)
    }
    components = enrichedComponents

    let hasBody = false
    for (let ci = 0; ci < components.length; ci++) {
      if (components[ci].type === 'body' && components[ci].text) {
        hasBody = true
        break
      }
    }

    if (!name || (!bodyText && !hasBody)) {
      e.record.set('status', 'failed')
      e.record.set(
        'error_message',
        'Nome e corpo do template são obrigatórios para criação na Zernio.',
      )
      return e.next()
    }

    const payload = {
      name: name,
      category: category,
      language: language,
      components: components,
    }
    if (accountId) payload.accountId = accountId

    try {
      const res = $http.send({
        url: 'https://zernio.com/api/v1/whatsapp/templates',
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Atendente-WhatsApp/1.0',
        },
        data: payload,
        timeout: 25,
      })

      if (res.statusCode >= 200 && res.statusCode < 300) {
        const resData = res.json || {}
        const tplData = resData.template || resData.data || resData
        const metaStatus = (tplData.status || resData.status || 'PENDING').toString().toUpperCase()
        const isRejected = metaStatus === 'REJECTED'
        const rejectedReason =
          tplData.rejected_reason ||
          tplData.rejectedReason ||
          resData.rejected_reason ||
          resData.rejectedReason ||
          ''

        if (isRejected) {
          const failMsg =
            'Template submetido mas REJEITADO imediatamente pela Meta. Motivo: "' +
            (rejectedReason || 'INVALID_FORMAT') +
            '".'
          e.record.set('status', 'failed')
          e.record.set('error_message', failMsg)
          e.record.set('result', {
            success: false,
            rejected: true,
            status: 'REJECTED',
            rejected_reason: rejectedReason || 'INVALID_FORMAT',
            templateName: name,
            category: category,
            language: language,
            details: resData,
          })
        } else {
          e.record.set('status', 'completed')
          e.record.set('result', {
            success: true,
            message:
              metaStatus === 'APPROVED'
                ? 'Template criado e APROVADO pela Meta via Zernio!'
                : 'Template criado e submetido com sucesso para análise da Meta via Zernio.',
            templateName: name,
            category: category,
            language: language,
            status: metaStatus || 'PENDING',
            details: resData,
          })
          e.record.set('error_message', '')
        }
      } else {
        const resJson = res.json || {}
        let errMsg = 'Falha ao criar template na Zernio HTTP ' + res.statusCode
        if (resJson.message) errMsg = resJson.message
        else if (resJson.error)
          errMsg = typeof resJson.error === 'string' ? resJson.error : JSON.stringify(resJson.error)
        e.record.set('status', 'failed')
        e.record.set('error_message', errMsg)
        e.record.set('result', { success: false, statusCode: res.statusCode, details: resJson })
      }
    } catch (createErr) {
      e.record.set('status', 'failed')
      e.record.set('error_message', 'Erro de conexão com a API Zernio: ' + createErr.message)
    }

    return e.next()
  }

  // AÇÃO 2: ENVIAR MENSAGEM VIA ZERNIO
  if (actionType === 'send_zernio_message') {
    let conversationId = (params.conversationId || params.conversation_id || '').toString().trim()
    const phone = (params.phone || params.recipient || params.to || '').toString().trim()
    const message = (params.message || params.text || params.body || '').toString().trim()
    const templateName = (params.templateName || params.template_name || params.template || '')
      .toString()
      .trim()
    const templateLanguage = (
      params.templateLanguage ||
      params.template_language ||
      params.language ||
      'pt_BR'
    )
      .toString()
      .trim()
    const templateVariables =
      params.templateVariables || params.variables || params.template_variables
        ? typeof (params.templateVariables || params.variables || params.template_variables) ===
          'object'
          ? params.templateVariables || params.variables || params.template_variables
          : null
        : null

    if (!message && !templateName) {
      e.record.set('status', 'failed')
      e.record.set('error_message', 'Mensagem de texto ou templateName deve ser informado.')
      return e.next()
    }

    let convRecord = null
    if (conversationId) {
      try {
        convRecord = $app.findRecordById('conversations', conversationId)
        if (convRecord && convRecord.getString('user') !== effectiveUserId) {
          e.record.set('status', 'failed')
          e.record.set('error_message', 'Sem permissão para enviar mensagem nesta conversa.')
          return e.next()
        }
      } catch (_) {}
    } else if (phone) {
      try {
        const cleanedPhone = phone.replace(/[^\d+]/g, '')
        const foundConvs = $app.findRecordsByFilter(
          'conversations',
          "user = '" + effectiveUserId + "' && phone ~ '" + cleanedPhone + "'",
          '-updated',
          1,
          0,
        )
        if (foundConvs && foundConvs.length > 0) {
          convRecord = foundConvs[0]
          conversationId = convRecord.id
        }
      } catch (_) {}
    }

    const recipientPhone = phone || (convRecord ? convRecord.getString('phone') : '')
    const zernioId = convRecord ? convRecord.getString('zernio_id') : ''
    const convAccountId = convRecord ? convRecord.getString('zernio_account_id') : ''
    const effectiveAccountId =
      convAccountId ||
      defaultAccountId ||
      (isOwner ? ($os.getenv('ZERNIO_ACCOUNT_ID') || '').trim() : '')

    if (!recipientPhone && !zernioId) {
      e.record.set('status', 'failed')
      e.record.set('error_message', 'Nenhum destinatário ou conversa válida foi informado.')
      return e.next()
    }

    let templatePayloadObject = null
    if (templateName) {
      templatePayloadObject = { name: templateName, language: templateLanguage }
      if (templateVariables && Object.keys(templateVariables).length > 0) {
        const paramsList = []
        const sortedKeys = Object.keys(templateVariables).sort((a, b) => {
          const numA = parseInt(a, 10)
          const numB = parseInt(b, 10)
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB
          return a.localeCompare(b)
        })
        for (let i = 0; i < sortedKeys.length; i++) {
          const k = sortedKeys[i]
          paramsList.push({ type: 'text', text: String(templateVariables[k] || '') })
        }
        templatePayloadObject.components = [{ type: 'body', parameters: paramsList }]
      }
    }

    let sentViaZernio = false
    let zernioResponseData = null
    let zernioMessageId = ''

    if (zernioId && !templateName) {
      try {
        const payload = { message: message }
        if (effectiveAccountId) payload.accountId = effectiveAccountId
        const res1 = $http.send({
          url:
            'https://zernio.com/api/v1/inbox/conversations/' +
            encodeURIComponent(zernioId) +
            '/messages',
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'Atendente-WhatsApp/1.0',
          },
          data: payload,
          timeout: 15,
        })
        if (res1.statusCode >= 200 && res1.statusCode < 300) {
          sentViaZernio = true
          zernioResponseData = res1.json || {}
          zernioMessageId =
            (zernioResponseData.message && zernioResponseData.message.id) ||
            zernioResponseData.id ||
            zernioResponseData.platformMessageId ||
            ''
        }
      } catch (_) {}
    }

    if (!sentViaZernio && recipientPhone) {
      try {
        const payload = { platform: 'whatsapp', recipient: recipientPhone }
        if (templateName && templatePayloadObject) {
          payload.template = templatePayloadObject
          payload.type = 'template'
          if (message) payload.message = message
        } else {
          payload.message = message
        }
        if (effectiveAccountId) payload.accountId = effectiveAccountId

        const res2 = $http.send({
          url: 'https://zernio.com/api/v1/messages',
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'Atendente-WhatsApp/1.0',
          },
          data: payload,
          timeout: 15,
        })

        if (res2.statusCode >= 200 && res2.statusCode < 300) {
          sentViaZernio = true
          zernioResponseData = res2.json || {}
          zernioMessageId =
            (zernioResponseData.message && zernioResponseData.message.id) ||
            zernioResponseData.id ||
            zernioResponseData.platformMessageId ||
            ''
        }
      } catch (_) {}
    }

    if (!sentViaZernio) {
      e.record.set('status', 'failed')
      e.record.set('error_message', 'Falha ao entregar mensagem via API Zernio.')
      e.record.set('result', { success: false, details: zernioResponseData })
      return e.next()
    }

    const now = new Date().toISOString()
    const finalStoredBody = message || (templateName ? '[Template: ' + templateName + ']' : '')

    if (convRecord) {
      try {
        const msgCol = $app.findCollectionByNameOrId('messages')
        const savedMsg = new Record(msgCol)
        savedMsg.set('user', effectiveUserId)
        savedMsg.set('conversation', convRecord.id)
        savedMsg.set('direction', 'out')
        savedMsg.set('body', finalStoredBody)
        savedMsg.set('sent_at', now)
        if (zernioMessageId) savedMsg.set('zernio_id', zernioMessageId)
        $app.save(savedMsg)

        convRecord.set('last_message_at', now)
        convRecord.set('last_direction', 'out')
        convRecord.set('responded_at', now)
        convRecord.set('status', 'acompanhamento')
        $app.save(convRecord)
      } catch (_) {}
    }

    e.record.set('status', 'completed')
    e.record.set('result', {
      success: true,
      message: 'Mensagem enviada com sucesso via Zernio.',
      recipient: recipientPhone,
      sentAt: now,
      zernioMessageId: zernioMessageId,
      body: finalStoredBody,
    })
    e.record.set('error_message', '')
    return e.next()
  }

  return e.next()
}, 'agent_actions')
