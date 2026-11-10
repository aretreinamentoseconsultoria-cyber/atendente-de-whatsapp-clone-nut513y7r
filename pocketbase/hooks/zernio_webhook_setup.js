// Endpoint principal com hífen: POST /backend/v1/zernio/webhook-setup
routerAdd(
  'POST',
  '/backend/v1/zernio/webhook-setup',
  (e) => {
    // 1. Identificar usuário autenticado
    const authUser = e.auth
    const authUserId = authUser ? authUser.id : ''
    const authEmail = authUser ? authUser.getString('email') : ''

    // 2. Buscar configurações vinculadas ao usuário atual
    let settingsRecord = null
    if (authUserId) {
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
    }

    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    const providedApiKey = (reqBody.apiKey || reqBody.api_key || '').trim()
    const isOwner = authEmail === 'fabiano@adapta.org'
    const userApiKey = settingsRecord
      ? (settingsRecord.getString('zernio_api_key') || '').trim()
      : ''
    const rawApiKey = ($os.getenv('ZERNIO_API_KEY') || '').trim()
    const apiKey = providedApiKey || userApiKey || (isOwner ? rawApiKey : '')

    // Se uma nova apiKey foi fornecida e validada com sucesso, ou se precisarmos atualizar o registro
    if (providedApiKey && authUserId) {
      if (!settingsRecord) {
        try {
          const settingsCol = $app.findCollectionByNameOrId('app_settings')
          settingsRecord = new Record(settingsCol)
          settingsRecord.set('key', 'whatsapp_zernio')
          settingsRecord.set('user', authUserId)
          settingsRecord.set('operation_mode', 'read_only')
        } catch (_) {}
      }
      if (settingsRecord) {
        settingsRecord.set('zernio_api_key', providedApiKey)
        try {
          $app.save(settingsRecord)
        } catch (_) {}
      }
    }

    if (!apiKey) {
      return e.json(400, {
        success: false,
        code: 'MISSING_API_KEY',
        message:
          'Chave da Zernio API não encontrada para este usuário. Por favor, cole e teste sua chave no passo anterior do assistente ou nas Configurações.',
      })
    }

    // Montagem da URL de callback:
    // IMPORTANTE: O webhook da Zernio DEVE usar o domínio interno fixo do Skip Cloud
    // (https://atendente-de-whatsapp-04cc6.shrd00.internal.goskip.dev) e NUNCA a URL de preview
    // (preview.goskip.app), que muda a cada deploy.
    const FIXED_BACKEND_URL = 'https://atendente-de-whatsapp-04cc6.shrd00.internal.goskip.dev'

    let baseAppUrl = FIXED_BACKEND_URL
    if (
      reqBody.webhookUrl &&
      reqBody.webhookUrl.indexOf('preview.goskip.app') === -1 &&
      reqBody.webhookUrl.indexOf('localhost') === -1
    ) {
      baseAppUrl = reqBody.webhookUrl.trim()
    }

    const appUrl = baseAppUrl.replace(/\/+$/, '')

    // Webhook target URL com identificador do usuário para isolamento multi-tenant
    const webhookTargetUrl =
      appUrl + '/backend/v1/zernio/webhook?user_id=' + encodeURIComponent(authUserId)

    // Webhook secret opcional para assinatura HMAC
    const webhookSecret = isOwner
      ? ($os.getenv('ZERNIO_WEBHOOK_SECRET') || '').trim()
      : settingsRecord
        ? (settingsRecord.getString('zernio_webhook_secret') || '').trim()
        : ''

    // 1. Listar webhooks existentes via GET /v1/webhooks/settings para evitar duplicatas
    let existingWebhooks = []
    try {
      const getRes = $http.send({
        url: 'https://zernio.com/api/v1/webhooks/settings',
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Atendente-WhatsApp/1.0',
        },
        timeout: 10,
      })
      if (getRes.statusCode >= 200 && getRes.statusCode < 300) {
        const getJson = getRes.json || {}
        existingWebhooks = Array.isArray(getJson.webhooks) ? getJson.webhooks : []
      }
    } catch (getErr) {
      console.log('Aviso ao consultar webhooks existentes: ' + getErr.message)
    }

    // Verificar se já existe webhook cadastrado para este usuário ou para o endpoint geral
    let matchedWebhook = null
    for (let i = 0; i < existingWebhooks.length; i++) {
      const w = existingWebhooks[i]
      if (!w || !w.url) continue
      // Match exato com user_id
      if (w.url === webhookTargetUrl) {
        matchedWebhook = w
        break
      }
      // Match com endpoint geral do backend
      if (
        w.url.indexOf('/backend/v1/zernio/webhook') !== -1 &&
        (w.url.indexOf('user_id=' + authUserId) !== -1 || (!w.url.indexOf('user_id=') && isOwner))
      ) {
        matchedWebhook = w
        break
      }
    }

    const desiredEvents = [
      'message.received',
      'message.sent',
      'message.delivered',
      'message.read',
      'message.failed',
      'conversation.started',
    ]

    // Se já estiver cadastrado com a mesma URL e eventos essenciais ativos
    if (matchedWebhook) {
      const whEvents = Array.isArray(matchedWebhook.events) ? matchedWebhook.events : []
      const hasReceived = whEvents.indexOf('message.received') !== -1
      const hasSent = whEvents.indexOf('message.sent') !== -1

      if (
        hasReceived &&
        hasSent &&
        matchedWebhook.url === webhookTargetUrl &&
        matchedWebhook.isActive !== false
      ) {
        return e.json(200, {
          success: true,
          alreadyRegistered: true,
          message: 'Webhook já estava cadastrado e ativo na Zernio para este endpoint.',
          webhookUrl: webhookTargetUrl,
          webhookId: matchedWebhook._id,
          existingWebhooks: existingWebhooks,
        })
      }

      // Se já existe mas precisa ser atualizado (ex: URL desatualizada ou faltavam eventos como message.sent)
      if (matchedWebhook._id) {
        try {
          const updateData = {
            _id: matchedWebhook._id,
            url: webhookTargetUrl,
            events: desiredEvents,
            isActive: true,
          }
          if (webhookSecret) {
            updateData.secret = webhookSecret
          }

          const putRes = $http.send({
            url: 'https://zernio.com/api/v1/webhooks/settings',
            method: 'PUT',
            headers: {
              Authorization: 'Bearer ' + apiKey,
              'Content-Type': 'application/json',
              'User-Agent': 'Atendente-WhatsApp/1.0',
            },
            data: updateData,
            timeout: 15,
          })

          if (putRes.statusCode >= 200 && putRes.statusCode < 300) {
            return e.json(200, {
              success: true,
              registered: true,
              updated: true,
              message:
                'Webhook atualizado com sucesso na Zernio com os eventos message.received e message.sent!',
              webhookUrl: webhookTargetUrl,
              webhookId: matchedWebhook._id,
              response: putRes.json,
            })
          }
        } catch (updateErr) {
          console.log('Aviso ao atualizar webhook existente: ' + updateErr.message)
        }
      }
    }

    // Registrar novo webhook na Zernio: POST /v1/webhooks/settings
    // A documentação oficial da Zernio especifica POST /v1/webhooks/settings com { name, url, events, [secret] }
    const createData = {
      name: 'Atendente WhatsApp Alô',
      url: webhookTargetUrl,
      events: desiredEvents,
      isActive: true,
    }
    if (webhookSecret) {
      createData.secret = webhookSecret
    }

    try {
      let regRes = $http.send({
        url: 'https://zernio.com/api/v1/webhooks/settings',
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Atendente-WhatsApp/1.0',
        },
        data: createData,
        timeout: 15,
      })

      // Fallback: se POST retornar 404 ou 405 por variação da API, tentar PUT
      if (regRes.statusCode === 404 || regRes.statusCode === 405) {
        regRes = $http.send({
          url: 'https://zernio.com/api/v1/webhooks/settings',
          method: 'PUT',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'Atendente-WhatsApp/1.0',
          },
          data: createData,
          timeout: 15,
        })
      }

      if (regRes.statusCode >= 200 && regRes.statusCode < 300) {
        return e.json(200, {
          success: true,
          registered: true,
          message: 'Webhook cadastrado com sucesso na Zernio!',
          webhookUrl: webhookTargetUrl,
          response: regRes.json,
        })
      } else {
        const errJson = regRes.json || {}
        const rawErrMsg =
          typeof errJson.message === 'string'
            ? errJson.message
            : typeof errJson.error === 'string'
              ? errJson.error
              : JSON.stringify(errJson)

        console.log(
          'Erro ao registrar webhook na Zernio (HTTP ' + regRes.statusCode + '): ' + rawErrMsg,
        )

        let friendlyMsg = 'A Zernio rejeitou a configuração do webhook.'
        if (
          rawErrMsg.indexOf('Invalid option') !== -1 ||
          rawErrMsg.indexOf('expected one of') !== -1
        ) {
          friendlyMsg = 'A Zernio rejeitou um evento inválido — lista corrigida, tente novamente.'
        } else if (regRes.statusCode === 401) {
          friendlyMsg = 'Chave da API da Zernio inválida ou expirada. Verifique nas configurações.'
        } else if (regRes.statusCode === 403) {
          friendlyMsg =
            'Sua conta Zernio não possui permissão para cadastrar webhooks ou o recurso não está habilitado no plano.'
        } else if (rawErrMsg && rawErrMsg.length < 120 && rawErrMsg.indexOf('{') === -1) {
          friendlyMsg = rawErrMsg
        }

        return e.json(400, {
          success: false,
          registered: false,
          message: friendlyMsg,
          rawError: rawErrMsg,
          statusCode: regRes.statusCode,
          details: errJson,
        })
      }
    } catch (err) {
      return e.json(502, {
        success: false,
        registered: false,
        message: 'Erro de conexão ao registrar webhook na Zernio: ' + err.message,
      })
    }
  },
  $apis.requireAuth(),
)

// Endpoint com barra (/backend/v1/zernio/webhook/setup) mantido para retrocompatibilidade
routerAdd(
  'POST',
  '/backend/v1/zernio/webhook/setup',
  (e) => {
    // Redireciona a chamada para a mesma lógica invocando o handler inline
    // 1. Identificar usuário autenticado
    const authUser = e.auth
    const authUserId = authUser ? authUser.id : ''
    const authEmail = authUser ? authUser.getString('email') : ''

    // 2. Buscar configurações vinculadas ao usuário atual
    let settingsRecord = null
    if (authUserId) {
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
    }

    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    const providedApiKey = (reqBody.apiKey || reqBody.api_key || '').trim()
    const isOwner = authEmail === 'fabiano@adapta.org'
    const userApiKey = settingsRecord
      ? (settingsRecord.getString('zernio_api_key') || '').trim()
      : ''
    const rawApiKey = ($os.getenv('ZERNIO_API_KEY') || '').trim()
    const apiKey = providedApiKey || userApiKey || (isOwner ? rawApiKey : '')

    if (providedApiKey && authUserId) {
      if (!settingsRecord) {
        try {
          const settingsCol = $app.findCollectionByNameOrId('app_settings')
          settingsRecord = new Record(settingsCol)
          settingsRecord.set('key', 'whatsapp_zernio')
          settingsRecord.set('user', authUserId)
          settingsRecord.set('operation_mode', 'read_only')
        } catch (_) {}
      }
      if (settingsRecord) {
        settingsRecord.set('zernio_api_key', providedApiKey)
        try {
          $app.save(settingsRecord)
        } catch (_) {}
      }
    }

    if (!apiKey) {
      return e.json(400, {
        success: false,
        code: 'MISSING_API_KEY',
        message:
          'Chave da Zernio API não encontrada para este usuário. Por favor, cole e teste sua chave no passo anterior do assistente ou nas Configurações.',
      })
    }
    // Montagem da URL de callback:
    // IMPORTANTE: O webhook da Zernio DEVE usar o domínio interno fixo do Skip Cloud
    // (https://atendente-de-whatsapp-04cc6.shrd00.internal.goskip.dev) e NUNCA a URL de preview
    // (preview.goskip.app), que muda a cada deploy.
    const FIXED_BACKEND_URL = 'https://atendente-de-whatsapp-04cc6.shrd00.internal.goskip.dev'

    let baseAppUrl = FIXED_BACKEND_URL
    if (
      reqBody.webhookUrl &&
      reqBody.webhookUrl.indexOf('preview.goskip.app') === -1 &&
      reqBody.webhookUrl.indexOf('localhost') === -1
    ) {
      baseAppUrl = reqBody.webhookUrl.trim()
    }

    const appUrl = baseAppUrl.replace(/\/+$/, '')

    // Webhook target URL com identificador do usuário para isolamento multi-tenant
    const webhookTargetUrl =
      appUrl + '/backend/v1/zernio/webhook?user_id=' + encodeURIComponent(authUserId)

    // Webhook secret opcional para assinatura HMAC
    const webhookSecret = isOwner
      ? ($os.getenv('ZERNIO_WEBHOOK_SECRET') || '').trim()
      : settingsRecord
        ? (settingsRecord.getString('zernio_webhook_secret') || '').trim()
        : ''

    // 1. Listar webhooks existentes via GET /v1/webhooks/settings para evitar duplicatas
    let existingWebhooks = []
    try {
      const getRes = $http.send({
        url: 'https://zernio.com/api/v1/webhooks/settings',
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Atendente-WhatsApp/1.0',
        },
        timeout: 10,
      })
      if (getRes.statusCode >= 200 && getRes.statusCode < 300) {
        const getJson = getRes.json || {}
        existingWebhooks = Array.isArray(getJson.webhooks) ? getJson.webhooks : []
      }
    } catch (getErr) {
      console.log('Aviso ao consultar webhooks existentes: ' + getErr.message)
    }

    // Verificar se já existe webhook cadastrado para este usuário ou para o endpoint geral
    let matchedWebhook = null
    for (let i = 0; i < existingWebhooks.length; i++) {
      const w = existingWebhooks[i]
      if (!w || !w.url) continue
      // Match exato com user_id
      if (w.url === webhookTargetUrl) {
        matchedWebhook = w
        break
      }
      // Match com endpoint geral do backend
      if (
        w.url.indexOf('/backend/v1/zernio/webhook') !== -1 &&
        (w.url.indexOf('user_id=' + authUserId) !== -1 || (!w.url.indexOf('user_id=') && isOwner))
      ) {
        matchedWebhook = w
        break
      }
    }

    const desiredEvents = [
      'message.received',
      'message.sent',
      'message.delivered',
      'message.read',
      'message.failed',
      'conversation.started',
    ]

    // Se já estiver cadastrado com a mesma URL e eventos essenciais ativos
    if (matchedWebhook) {
      const whEvents = Array.isArray(matchedWebhook.events) ? matchedWebhook.events : []
      const hasReceived = whEvents.indexOf('message.received') !== -1
      const hasSent = whEvents.indexOf('message.sent') !== -1

      if (
        hasReceived &&
        hasSent &&
        matchedWebhook.url === webhookTargetUrl &&
        matchedWebhook.isActive !== false
      ) {
        return e.json(200, {
          success: true,
          alreadyRegistered: true,
          message: 'Webhook já estava cadastrado e ativo na Zernio para este endpoint.',
          webhookUrl: webhookTargetUrl,
          webhookId: matchedWebhook._id,
          existingWebhooks: existingWebhooks,
        })
      }

      // Se já existe mas precisa ser atualizado (ex: URL desatualizada ou faltavam eventos como message.sent)
      if (matchedWebhook._id) {
        try {
          const updateData = {
            _id: matchedWebhook._id,
            url: webhookTargetUrl,
            events: desiredEvents,
            isActive: true,
          }
          if (webhookSecret) {
            updateData.secret = webhookSecret
          }

          const putRes = $http.send({
            url: 'https://zernio.com/api/v1/webhooks/settings',
            method: 'PUT',
            headers: {
              Authorization: 'Bearer ' + apiKey,
              'Content-Type': 'application/json',
              'User-Agent': 'Atendente-WhatsApp/1.0',
            },
            data: updateData,
            timeout: 15,
          })

          if (putRes.statusCode >= 200 && putRes.statusCode < 300) {
            return e.json(200, {
              success: true,
              registered: true,
              updated: true,
              message:
                'Webhook atualizado com sucesso na Zernio com os eventos message.received e message.sent!',
              webhookUrl: webhookTargetUrl,
              webhookId: matchedWebhook._id,
              response: putRes.json,
            })
          }
        } catch (updateErr) {
          console.log('Aviso ao atualizar webhook existente: ' + updateErr.message)
        }
      }
    }

    // Registrar novo webhook na Zernio: POST /v1/webhooks/settings
    // A documentação oficial da Zernio especifica POST /v1/webhooks/settings com { name, url, events, [secret] }
    const createData = {
      name: 'Atendente WhatsApp Alô',
      url: webhookTargetUrl,
      events: desiredEvents,
      isActive: true,
    }
    if (webhookSecret) {
      createData.secret = webhookSecret
    }

    try {
      let regRes = $http.send({
        url: 'https://zernio.com/api/v1/webhooks/settings',
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Atendente-WhatsApp/1.0',
        },
        data: createData,
        timeout: 15,
      })

      // Fallback: se POST retornar 404 ou 405 por variação da API, tentar PUT
      if (regRes.statusCode === 404 || regRes.statusCode === 405) {
        regRes = $http.send({
          url: 'https://zernio.com/api/v1/webhooks/settings',
          method: 'PUT',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'Atendente-WhatsApp/1.0',
          },
          data: createData,
          timeout: 15,
        })
      }

      if (regRes.statusCode >= 200 && regRes.statusCode < 300) {
        return e.json(200, {
          success: true,
          registered: true,
          message: 'Webhook cadastrado com sucesso na Zernio!',
          webhookUrl: webhookTargetUrl,
          response: regRes.json,
        })
      } else {
        const errJson = regRes.json || {}
        const rawErrMsg =
          typeof errJson.message === 'string'
            ? errJson.message
            : typeof errJson.error === 'string'
              ? errJson.error
              : JSON.stringify(errJson)

        console.log(
          'Erro ao registrar webhook na Zernio (HTTP ' + regRes.statusCode + '): ' + rawErrMsg,
        )

        let friendlyMsg = 'A Zernio rejeitou a configuração do webhook.'
        if (
          rawErrMsg.indexOf('Invalid option') !== -1 ||
          rawErrMsg.indexOf('expected one of') !== -1
        ) {
          friendlyMsg = 'A Zernio rejeitou um evento inválido — lista corrigida, tente novamente.'
        } else if (regRes.statusCode === 401) {
          friendlyMsg = 'Chave da API da Zernio inválida ou expirada. Verifique nas configurações.'
        } else if (regRes.statusCode === 403) {
          friendlyMsg =
            'Sua conta Zernio não possui permissão para cadastrar webhooks ou o recurso não está habilitado no plano.'
        } else if (rawErrMsg && rawErrMsg.length < 120 && rawErrMsg.indexOf('{') === -1) {
          friendlyMsg = rawErrMsg
        }

        return e.json(400, {
          success: false,
          registered: false,
          message: friendlyMsg,
          rawError: rawErrMsg,
          statusCode: regRes.statusCode,
          details: errJson,
        })
      }
    } catch (err) {
      return e.json(502, {
        success: false,
        registered: false,
        message: 'Erro de conexão ao registrar webhook na Zernio: ' + err.message,
      })
    }
  },
  $apis.requireAuth(),
)
