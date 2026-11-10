routerAdd(
  'GET',
  '/backend/v1/zernio/templates',
  (e) => {
    // 1. Identificar usuário autenticado (multi-tenancy)
    let authUser = e.auth
    let authUserId = authUser ? authUser.id : ''
    let authEmail = authUser ? authUser.getString('email') : ''

    if (!authUserId) {
      let queryToken = ''
      try {
        const qInfo = (typeof e.requestInfo === 'function' ? e.requestInfo() : null) || {}
        if (qInfo.headers && typeof qInfo.headers === 'object') {
          const authHdr = qInfo.headers.authorization || qInfo.headers.Authorization || ''
          if (
            authHdr &&
            typeof authHdr === 'string' &&
            authHdr.toLowerCase().startsWith('bearer ')
          ) {
            queryToken = authHdr.slice(7).trim()
          }
        }
      } catch (_) {}
      if (queryToken) {
        try {
          const uRec = $app.findAuthRecordByToken(queryToken, 'auth')
          if (uRec && uRec.id) {
            authUser = uRec
            authUserId = uRec.id
            authEmail = uRec.getString('email')
          }
        } catch (_) {}
        if (!authUserId) {
          try {
            const uRec = $app.findAuthRecordByToken(queryToken)
            if (uRec && uRec.id) {
              authUser = uRec
              authUserId = uRec.id
              authEmail = uRec.getString('email')
            }
          } catch (_) {}
        }
      }
    }

    if (!authUserId) {
      return e.json(401, { success: false, message: 'Autenticação necessária.' })
    }

    // 2. Buscar configurações do usuário
    let settingsRecord = null
    try {
      const found = $app.findRecordsByFilter(
        'app_settings',
        "key = 'whatsapp_zernio' && user = '" + authUserId + "'",
        '-created',
        1,
        0,
      )
      if (found && found.length > 0) {
        settingsRecord = found[0]
      }
    } catch (_) {}

    const isOwner = authEmail === 'fabiano@adapta.org'
    const userApiKey = settingsRecord
      ? (settingsRecord.getString('zernio_api_key') || '').trim()
      : ''
    const rawApiKey = ($secrets.get('ZERNIO_API_KEY') || $os.getenv('ZERNIO_API_KEY') || '').trim()
    const apiKey = userApiKey || (isOwner ? rawApiKey : '')

    if (!apiKey) {
      return e.json(400, {
        success: false,
        code: 'MISSING_API_KEY',
        message: 'Chave Zernio API não encontrada. Configure em Configurações > Conexão.',
      })
    }

    const defaultAccountId = settingsRecord ? settingsRecord.getString('zernio_account_id') : ''
    const accountId =
      defaultAccountId || (isOwner ? ($os.getenv('ZERNIO_ACCOUNT_ID') || '').trim() : '')

    // 3. Chamar GET /v1/whatsapp/templates na Zernio
    let targetUrl = 'https://zernio.com/api/v1/whatsapp/templates'
    if (accountId) {
      targetUrl += '?accountId=' + encodeURIComponent(accountId)
    }

    try {
      const res = $http.send({
        url: targetUrl,
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Atendente-WhatsApp/1.0',
        },
        timeout: 20,
      })

      if (res.statusCode >= 200 && res.statusCode < 300) {
        const json = res.json || {}
        let templates = []
        if (Array.isArray(json)) {
          templates = json
        } else if (Array.isArray(json.templates)) {
          templates = json.templates
        } else if (Array.isArray(json.data)) {
          templates = json.data
        } else if (Array.isArray(json.items)) {
          templates = json.items
        }

        return e.json(200, {
          success: true,
          templates: templates,
          count: templates.length,
        })
      }

      console.log('Erro ao listar templates na Zernio HTTP ' + res.statusCode + ': ' + res.raw)
      return e.json(res.statusCode || 502, {
        success: false,
        message: 'Falha ao buscar templates na Zernio.',
        details: res.json || res.raw,
      })
    } catch (fetchErr) {
      console.log('Exceção ao listar templates Zernio: ' + fetchErr.message)
      return e.json(502, {
        success: false,
        message: 'Erro de conexão com a API Zernio: ' + fetchErr.message,
      })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/zernio/templates',
  (e) => {
    let authUser = e.auth
    let authUserId = authUser ? authUser.id : ''
    let authEmail = authUser ? authUser.getString('email') : ''

    if (!authUserId) {
      return e.json(401, { success: false, message: 'Autenticação necessária.' })
    }

    let settingsRecord = null
    try {
      const found = $app.findRecordsByFilter(
        'app_settings',
        "key = 'whatsapp_zernio' && user = '" + authUserId + "'",
        '-created',
        1,
        0,
      )
      if (found && found.length > 0) {
        settingsRecord = found[0]
      }
    } catch (_) {}

    const isOwner = authEmail === 'fabiano@adapta.org'
    const userApiKey = settingsRecord
      ? (settingsRecord.getString('zernio_api_key') || '').trim()
      : ''
    const rawApiKey = ($secrets.get('ZERNIO_API_KEY') || $os.getenv('ZERNIO_API_KEY') || '').trim()
    const apiKey = userApiKey || (isOwner ? rawApiKey : '')

    if (!apiKey) {
      return e.json(400, {
        success: false,
        code: 'MISSING_API_KEY',
        message: 'Chave Zernio API não encontrada.',
      })
    }

    const defaultAccountId = settingsRecord ? settingsRecord.getString('zernio_account_id') : ''
    const accountId =
      defaultAccountId || (isOwner ? ($os.getenv('ZERNIO_ACCOUNT_ID') || '').trim() : '')

    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    const name = (reqBody.name || '').trim().toLowerCase().replace(/\s+/g, '_')
    const category = (reqBody.category || 'UTILITY').toUpperCase()
    const language = (reqBody.language || 'pt_BR').trim()
    const bodyText = (reqBody.body || reqBody.text || '').trim()
    const buttons = Array.isArray(reqBody.buttons) ? reqBody.buttons : []

    if (!name) {
      return e.json(400, { success: false, message: 'O nome do template é obrigatório.' })
    }
    if (!bodyText) {
      return e.json(400, { success: false, message: 'O corpo (texto) do template é obrigatório.' })
    }

    // Helpers inline para validação, renumeração de variáveis e exemplos da Meta
    const resequenceVariables = function (str) {
      if (!str || typeof str !== 'string') return { text: str || '', count: 0 }
      let counter = 0
      const transformed = str.replace(/\{\{\s*(\d+|\w+)\s*\}\}/g, function () {
        counter++
        return '{{' + counter + '}}'
      })
      return { text: transformed, count: counter }
    }

    const getPlausibleSampleValue = function (index, contextHint) {
      const hint = (contextHint || '').toLowerCase()
      if (index === 0) {
        if (hint.includes('pedido') || hint.includes('order')) return '12345'
        if (hint.includes('empresa') || hint.includes('marca')) return 'Alô Atendimento'
        return 'João'
      }
      if (index === 1) {
        if (hint.includes('pedido') || hint.includes('protocolo')) return '#12345'
        if (hint.includes('data') || hint.includes('dia') || hint.includes('vence'))
          return 'amanhã às 14h'
        if (hint.includes('valor') || hint.includes('desconto')) return '20%'
        return 'pedido #1234'
      }
      if (index === 2) {
        if (hint.includes('horario') || hint.includes('hora')) return '15h'
        return 'informação 3'
      }
      return 'informação ' + (index + 1)
    }

    // Montar components para a Zernio (tipos de componente estritamente em minúsculas: 'body', 'header', 'footer', 'buttons')
    const headerText = (reqBody.headerText || reqBody.header_text || reqBody.header || '').trim()
    const footerText = (reqBody.footerText || reqBody.footer_text || reqBody.footer || '').trim()

    let components = []

    if (Array.isArray(reqBody.components) && reqBody.components.length > 0) {
      // Se components veio pronto, apenas normalizar types para minúsculas
      for (let c = 0; c < reqBody.components.length; c++) {
        const item = reqBody.components[c]
        if (!item || typeof item !== 'object') continue
        let cType = (item.type || '').trim().toLowerCase()
        if (!cType && item.format === 'TEXT' && item.text) {
          cType = 'header'
        }
        if (!cType && item.text) {
          cType = 'body'
        }
        if (!cType) continue

        const normComp = { type: cType }
        if (item.text) normComp.text = String(item.text).trim()
        if (item.format) normComp.format = item.format
        if (item.example) normComp.example = item.example
        if (Array.isArray(item.buttons)) {
          const btnArr = []
          for (let bi = 0; bi < item.buttons.length; bi++) {
            const b = item.buttons[bi]
            if (!b || !b.text) continue
            const bType = (b.type || 'QUICK_REPLY').toUpperCase()
            const btnObj = {
              type: bType,
              text: String(b.text).trim(),
            }
            if (bType === 'URL') {
              btnObj.url = b.url || ''
              if (b.example) btnObj.example = b.example
            } else if (bType === 'PHONE_NUMBER') {
              btnObj.phone_number = b.phoneNumber || b.phone_number || ''
            }
            btnArr.push(btnObj)
          }
          if (btnArr.length > 0) normComp.buttons = btnArr
        }
        components.push(normComp)
      }
    } else {
      // Montagem automática se components não foi enviado
      if (headerText) {
        components.push({
          type: 'header',
          format: 'TEXT',
          text: headerText,
        })
      }

      components.push({
        type: 'body',
        text: bodyText,
      })

      if (footerText) {
        components.push({
          type: 'footer',
          text: footerText,
        })
      }

      // Botões opcionais:
      if (buttons.length > 0) {
        const metaButtons = []
        for (let i = 0; i < buttons.length; i++) {
          const b = buttons[i]
          if (!b || !b.text) continue
          const bType = (b.type || 'QUICK_REPLY').toUpperCase()
          if (bType === 'URL') {
            const bObj = {
              type: 'URL',
              text: b.text.trim(),
              url: b.url || '',
            }
            if (b.example) bObj.example = b.example
            metaButtons.push(bObj)
          } else if (bType === 'PHONE_NUMBER') {
            metaButtons.push({
              type: 'PHONE_NUMBER',
              text: b.text.trim(),
              phone_number: b.phoneNumber || b.phone_number || '',
            })
          } else {
            metaButtons.push({
              type: 'QUICK_REPLY',
              text: b.text.trim(),
            })
          }
        }
        if (metaButtons.length > 0) {
          components.push({
            type: 'buttons',
            buttons: metaButtons,
          })
        }
      }
    }

    // Enriquecimento e validação obrigatória da Meta para variáveis e exemplos em components
    const providedExamples =
      reqBody.examples || reqBody.example_values || reqBody.sample_values || {}
    let enrichedComponents = []

    for (let ci = 0; ci < components.length; ci++) {
      const c = components[ci]
      if (c.type === 'body') {
        const seq = resequenceVariables(c.text || '')
        c.text = seq.text

        // Se contiver variáveis, Meta EXIGE example.body_text: [["ex1", "ex2", ...]]
        if (seq.count > 0) {
          const bodySampleValues = []
          for (let vi = 0; vi < seq.count; vi++) {
            const varNum = vi + 1
            const customVal =
              providedExamples[varNum] ||
              providedExamples[String(varNum)] ||
              (Array.isArray(providedExamples) ? providedExamples[vi] : null) ||
              (reqBody.example && reqBody.example.body_text && reqBody.example.body_text[0]
                ? reqBody.example.body_text[0][vi]
                : null)
            const sample =
              customVal !== null && customVal !== undefined && String(customVal).trim() !== ''
                ? String(customVal).trim()
                : getPlausibleSampleValue(vi, c.text)
            bodySampleValues.push(sample)
          }

          if (!c.example || typeof c.example !== 'object') {
            c.example = { body_text: [bodySampleValues] }
          } else if (!c.example.body_text || !Array.isArray(c.example.body_text)) {
            c.example.body_text = [bodySampleValues]
          }
        }
      } else if (c.type === 'header') {
        if (!c.format) c.format = 'TEXT'
        if (c.text) {
          const seq = resequenceVariables(c.text)
          c.text = seq.text
          if (seq.count > 0) {
            const headerSample =
              reqBody.header_example ||
              reqBody.headerExample ||
              (c.example && Array.isArray(c.example.header_text)
                ? c.example.header_text[0]
                : null) ||
              'Aviso Importante'
            if (!c.example || typeof c.example !== 'object') {
              c.example = { header_text: [String(headerSample).trim()] }
            } else if (!c.example.header_text || !Array.isArray(c.example.header_text)) {
              c.example.header_text = [String(headerSample).trim()]
            }
          }
        }
      } else if (c.type === 'buttons' && Array.isArray(c.buttons)) {
        for (let bi = 0; bi < c.buttons.length; bi++) {
          const btn = c.buttons[bi]
          if (btn && btn.type === 'URL' && btn.url) {
            const seq = resequenceVariables(btn.url)
            btn.url = seq.text
            if (seq.count > 0) {
              if (!btn.example || !Array.isArray(btn.example) || btn.example.length === 0) {
                const urlSample =
                  reqBody.button_url_example ||
                  reqBody.buttonUrlExample ||
                  (btn.example && typeof btn.example === 'string' ? btn.example : null) ||
                  'promo2026'
                btn.example = [String(urlSample).trim()]
              }
            }
          }
        }
      }

      enrichedComponents.push(c)
    }
    components = enrichedComponents

    const payload = {
      name: name,
      category: category,
      language: language,
      components: components,
    }

    if (accountId) {
      payload.accountId = accountId
    }

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
          return e.json(422, {
            success: false,
            status: 'REJECTED',
            rejected_reason: rejectedReason || 'INVALID_FORMAT',
            message: failMsg,
            template: tplData,
          })
        }

        return e.json(200, {
          success: true,
          message:
            metaStatus === 'APPROVED'
              ? 'Template criado e APROVADO pela Meta via Zernio!'
              : 'Template criado e submetido com sucesso para análise da Meta.',
          template: tplData || { name: name, category: category, language: language },
        })
      }

      console.log('Erro ao criar template na Zernio HTTP ' + res.statusCode + ': ' + res.raw)
      let errMsg = 'Falha ao criar template na Zernio/Meta.'
      const resJson = res.json || {}
      if (resJson.message) errMsg = resJson.message
      else if (resJson.error)
        errMsg = typeof resJson.error === 'string' ? resJson.error : JSON.stringify(resJson.error)

      return e.json(res.statusCode || 502, {
        success: false,
        message: errMsg,
        details: resJson,
      })
    } catch (createErr) {
      console.log('Exceção ao criar template Zernio: ' + createErr.message)
      return e.json(502, {
        success: false,
        message: 'Erro de conexão ao criar template: ' + createErr.message,
      })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'DELETE',
  '/backend/v1/zernio/templates/{id}',
  (e) => {
    let authUser = e.auth
    let authUserId = authUser ? authUser.id : ''
    let authEmail = authUser ? authUser.getString('email') : ''

    if (!authUserId) {
      return e.json(401, { success: false, message: 'Autenticação necessária.' })
    }

    const templateId = e.request.pathValue('id')
    if (!templateId) {
      return e.json(400, { success: false, message: 'ID/nome do template não informado.' })
    }

    let settingsRecord = null
    try {
      const found = $app.findRecordsByFilter(
        'app_settings',
        "key = 'whatsapp_zernio' && user = '" + authUserId + "'",
        '-created',
        1,
        0,
      )
      if (found && found.length > 0) {
        settingsRecord = found[0]
      }
    } catch (_) {}

    const isOwner = authEmail === 'fabiano@adapta.org'
    const userApiKey = settingsRecord
      ? (settingsRecord.getString('zernio_api_key') || '').trim()
      : ''
    const rawApiKey = ($secrets.get('ZERNIO_API_KEY') || $os.getenv('ZERNIO_API_KEY') || '').trim()
    const apiKey = userApiKey || (isOwner ? rawApiKey : '')

    if (!apiKey) {
      return e.json(400, {
        success: false,
        code: 'MISSING_API_KEY',
        message: 'Chave Zernio API não encontrada.',
      })
    }

    const defaultAccountId = settingsRecord ? settingsRecord.getString('zernio_account_id') : ''
    const accountId =
      defaultAccountId || (isOwner ? ($os.getenv('ZERNIO_ACCOUNT_ID') || '').trim() : '')

    let deleteUrl = 'https://zernio.com/api/v1/whatsapp/templates/' + encodeURIComponent(templateId)
    if (accountId) {
      deleteUrl += '?accountId=' + encodeURIComponent(accountId)
    }

    try {
      const res = $http.send({
        url: deleteUrl,
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Atendente-WhatsApp/1.0',
        },
        timeout: 20,
      })

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return e.json(200, {
          success: true,
          message: 'Template excluído com sucesso.',
        })
      }

      console.log('Erro ao deletar template na Zernio HTTP ' + res.statusCode + ': ' + res.raw)
      return e.json(res.statusCode || 502, {
        success: false,
        message: 'Falha ao excluir template na Zernio/Meta.',
        details: res.json || res.raw,
      })
    } catch (delErr) {
      console.log('Exceção ao deletar template Zernio: ' + delErr.message)
      return e.json(502, {
        success: false,
        message: 'Erro de conexão ao excluir template: ' + delErr.message,
      })
    }
  },
  $apis.requireAuth(),
)
