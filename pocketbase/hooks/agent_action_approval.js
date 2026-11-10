// Rotas HTTP autenticadas para aprovação e rejeição de ações do Agente
// POST /backend/v1/agent-actions/{id}/approve
// POST /backend/v1/agent-actions/{id}/reject
// Todas as funções e variáveis são mantidas estritamente INLINE dentro de cada callback (regra PocketBase JSVM)

routerAdd(
  'POST',
  '/backend/v1/agent-actions/{id}/approve',
  (e) => {
    let authUser = e.auth
    let authUserId = authUser ? authUser.id : ''

    if (!authUserId) {
      try {
        const qInfo = (typeof e.requestInfo === 'function' ? e.requestInfo() : null) || {}
        if (qInfo.headers && typeof qInfo.headers === 'object') {
          const authHdr = qInfo.headers.authorization || qInfo.headers.Authorization || ''
          if (
            authHdr &&
            typeof authHdr === 'string' &&
            authHdr.toLowerCase().startsWith('bearer ')
          ) {
            const queryToken = authHdr.slice(7).trim()
            const userRec = $app.findAuthRecordByToken(queryToken)
            if (userRec && userRec.id) {
              authUserId = userRec.id
              authUser = userRec
            }
          }
        }
      } catch (_) {}
    }

    if (!authUserId) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }

    const actionId = e.request.pathValue('id')
    if (!actionId) {
      return e.json(400, { error: 'ID da ação não informado.' })
    }

    let actionRecord = null
    try {
      actionRecord = $app.findRecordById('agent_actions', actionId)
    } catch (_) {
      return e.json(404, { error: 'Ação não encontrada.' })
    }

    // Validação de multi-tenancy
    const ownerId = actionRecord.getString('user')
    if (ownerId && ownerId !== authUserId) {
      return e.json(403, { error: 'Você não tem permissão para aprovar esta ação.' })
    }

    const currentStatus = actionRecord.getString('status')
    if (currentStatus === 'completed') {
      return e.json(200, {
        success: true,
        message: 'Ação já foi aprovada e executada com sucesso anteriormente.',
        status: 'completed',
        id: actionRecord.id,
      })
    }

    // Executar a ação aprovada
    const actionType = actionRecord.getString('action_type')

    // 1. Obter apiKey Zernio do usuário
    let authEmail = ''
    try {
      const uRec = $app.findRecordById('users', authUserId)
      if (uRec) authEmail = uRec.getString('email') || ''
    } catch (_) {}

    let settingsRecord = null
    try {
      const found = $app.findRecordsByFilter(
        'app_settings',
        "key = 'whatsapp_zernio' && user = '" + authUserId + "'",
        '-created',
        1,
        0,
      )
      if (found && found.length > 0) settingsRecord = found[0]
    } catch (_) {}

    const isOwner = authEmail === 'fabiano@adapta.org'
    const userApiKey = settingsRecord
      ? (settingsRecord.getString('zernio_api_key') || '').trim()
      : ''
    const rawApiKey = ($secrets.get('ZERNIO_API_KEY') || $os.getenv('ZERNIO_API_KEY') || '').trim()
    const apiKey = userApiKey || (isOwner ? rawApiKey : '')

    if (!apiKey) {
      actionRecord.set('status', 'failed')
      actionRecord.set(
        'error_message',
        'Chave Zernio API não encontrada para este usuário. Configure em Configurações > Conexão.',
      )
      $app.save(actionRecord)
      return e.json(400, {
        error: 'Chave Zernio API não configurada na sua conta. Acesse Configurações para conectar.',
      })
    }

    const defaultAccountId = settingsRecord ? settingsRecord.getString('zernio_account_id') : ''
    const accountId =
      defaultAccountId || (isOwner ? ($os.getenv('ZERNIO_ACCOUNT_ID') || '').trim() : '')

    // Extrair params
    let params = {}
    try {
      const rawParams = actionRecord.getString('params')
      if (rawParams && typeof rawParams === 'string' && rawParams.trim().length > 0) {
        params = JSON.parse(rawParams)
      } else {
        const dVal = actionRecord.get('params')
        if (dVal && typeof dVal === 'object') params = dVal
      }
    } catch (_) {
      params = {}
    }

    // EXECUÇÃO 1: CRIAR TEMPLATE NA ZERNIO
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

      const providedExamples =
        params.examples || params.example_values || params.sample_values || {}
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
        actionRecord.set('status', 'failed')
        actionRecord.set(
          'error_message',
          'Nome e corpo do template são obrigatórios para criação na Zernio.',
        )
        $app.save(actionRecord)
        return e.json(400, {
          error: 'Nome e corpo do template são obrigatórios para criação na Zernio.',
        })
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
          const metaStatus = (tplData.status || resData.status || 'PENDING')
            .toString()
            .toUpperCase()
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
            actionRecord.set('status', 'failed')
            actionRecord.set('error_message', failMsg)
            actionRecord.set('result', {
              success: false,
              rejected: true,
              status: 'REJECTED',
              rejected_reason: rejectedReason || 'INVALID_FORMAT',
              templateName: name,
              category: category,
              language: language,
              details: resData,
            })
            $app.save(actionRecord)

            return e.json(200, {
              success: false,
              status: 'failed',
              error_message: failMsg,
              template_status: 'REJECTED',
              rejected_reason: rejectedReason || 'INVALID_FORMAT',
              record: actionRecord,
            })
          } else {
            actionRecord.set('status', 'completed')
            actionRecord.set('result', {
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
            actionRecord.set('error_message', '')
            $app.save(actionRecord)

            return e.json(200, {
              success: true,
              status: 'completed',
              message:
                metaStatus === 'APPROVED'
                  ? 'Template criado e APROVADO pela Meta via Zernio!'
                  : 'Template criado e submetido com sucesso para análise da Meta via Zernio.',
              template_name: name,
              template_status: metaStatus || 'PENDING',
              record: actionRecord,
            })
          }
        } else {
          const resJson = res.json || {}
          let errMsg = 'Falha ao criar template na Zernio HTTP ' + res.statusCode
          if (resJson.message) errMsg = resJson.message
          else if (resJson.error)
            errMsg =
              typeof resJson.error === 'string' ? resJson.error : JSON.stringify(resJson.error)
          actionRecord.set('status', 'failed')
          actionRecord.set('error_message', errMsg)
          actionRecord.set('result', {
            success: false,
            statusCode: res.statusCode,
            details: resJson,
          })
          $app.save(actionRecord)
          return e.json(400, { error: errMsg, record: actionRecord })
        }
      } catch (err) {
        actionRecord.set('status', 'failed')
        actionRecord.set('error_message', 'Erro de conexão com Zernio: ' + err.message)
        $app.save(actionRecord)
        return e.json(500, { error: err.message, record: actionRecord })
      }
    }

    // EXECUÇÃO 2: ENVIAR MENSAGEM VIA ZERNIO
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
        actionRecord.set('status', 'failed')
        actionRecord.set('error_message', 'Mensagem de texto ou templateName deve ser informado.')
        $app.save(actionRecord)
        return e.json(400, { error: 'Mensagem de texto ou templateName deve ser informado.' })
      }

      let convRecord = null
      if (conversationId) {
        try {
          convRecord = $app.findRecordById('conversations', conversationId)
          if (convRecord && convRecord.getString('user') !== authUserId) {
            actionRecord.set('status', 'failed')
            actionRecord.set('error_message', 'Sem permissão nesta conversa.')
            $app.save(actionRecord)
            return e.json(403, { error: 'Sem permissão para enviar mensagem nesta conversa.' })
          }
        } catch (_) {}
      } else if (phone) {
        try {
          const cleanedPhone = phone.replace(/[^\d+]/g, '')
          const foundConvs = $app.findRecordsByFilter(
            'conversations',
            "user = '" + authUserId + "' && phone ~ '" + cleanedPhone + "'",
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
        actionRecord.set('status', 'failed')
        actionRecord.set('error_message', 'Nenhum destinatário ou conversa válida.')
        $app.save(actionRecord)
        return e.json(400, { error: 'Nenhum destinatário ou conversa válida foi informado.' })
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
        actionRecord.set('status', 'failed')
        actionRecord.set('error_message', 'Falha ao entregar mensagem via API Zernio.')
        actionRecord.set('result', { success: false, details: zernioResponseData })
        $app.save(actionRecord)
        return e.json(400, {
          error: 'Falha ao entregar mensagem via API Zernio.',
          record: actionRecord,
        })
      }

      const now = new Date().toISOString()
      const finalStoredBody = message || (templateName ? '[Template: ' + templateName + ']' : '')

      if (convRecord) {
        try {
          const msgCol = $app.findCollectionByNameOrId('messages')
          const savedMsg = new Record(msgCol)
          savedMsg.set('user', authUserId)
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

      actionRecord.set('status', 'completed')
      actionRecord.set('result', {
        success: true,
        message: 'Mensagem enviada com sucesso via Zernio.',
        recipient: recipientPhone,
        sentAt: now,
        zernioMessageId: zernioMessageId,
        body: finalStoredBody,
      })
      actionRecord.set('error_message', '')
      $app.save(actionRecord)

      return e.json(200, {
        success: true,
        status: 'completed',
        message: 'Mensagem enviada com sucesso ao contato!',
        recipient: recipientPhone,
        record: actionRecord,
      })
    }

    // Ação desconhecida
    return e.json(400, { error: 'Tipo de ação desconhecido: ' + actionType })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/agent-actions/{id}/reject',
  (e) => {
    let authUser = e.auth
    let authUserId = authUser ? authUser.id : ''

    if (!authUserId) {
      try {
        const qInfo = (typeof e.requestInfo === 'function' ? e.requestInfo() : null) || {}
        if (qInfo.headers && typeof qInfo.headers === 'object') {
          const authHdr = qInfo.headers.authorization || qInfo.headers.Authorization || ''
          if (
            authHdr &&
            typeof authHdr === 'string' &&
            authHdr.toLowerCase().startsWith('bearer ')
          ) {
            const queryToken = authHdr.slice(7).trim()
            const userRec = $app.findAuthRecordByToken(queryToken)
            if (userRec && userRec.id) {
              authUserId = userRec.id
              authUser = userRec
            }
          }
        }
      } catch (_) {}
    }

    if (!authUserId) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }

    const actionId = e.request.pathValue('id')
    if (!actionId) {
      return e.json(400, { error: 'ID da ação não informado.' })
    }

    let actionRecord = null
    try {
      actionRecord = $app.findRecordById('agent_actions', actionId)
    } catch (_) {
      return e.json(404, { error: 'Ação não encontrada.' })
    }

    const ownerId = actionRecord.getString('user')
    if (ownerId && ownerId !== authUserId) {
      return e.json(403, { error: 'Você não tem permissão para recusar esta ação.' })
    }

    const currentStatus = actionRecord.getString('status')
    if (currentStatus === 'completed') {
      return e.json(400, { error: 'Esta ação já foi executada e não pode ser recusada.' })
    }

    try {
      let bodyData = {}
      try {
        bodyData = e.requestInfo().body || {}
      } catch (_) {}

      const reason = (bodyData.reason || bodyData.feedback || 'Recusado pelo usuário.')
        .toString()
        .trim()

      actionRecord.set('status', 'rejected')
      actionRecord.set('error_message', reason)
      $app.save(actionRecord)

      return e.json(200, {
        success: true,
        status: 'rejected',
        id: actionRecord.id,
        reason: reason,
        message: 'Proposta recusada com sucesso. Nenhuma ação externa foi executada.',
      })
    } catch (saveErr) {
      return e.json(500, { error: 'Falha ao recusar ação: ' + saveErr.message })
    }
  },
  $apis.requireAuth(),
)
