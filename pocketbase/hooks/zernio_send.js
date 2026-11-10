routerAdd(
  'POST',
  '/backend/v1/zernio/send',
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

    const isOwner = authEmail === 'fabiano@adapta.org'
    const userApiKey = settingsRecord
      ? (settingsRecord.getString('zernio_api_key') || '').trim()
      : ''
    const rawApiKey = ($secrets.get('ZERNIO_API_KEY') || $os.getenv('ZERNIO_API_KEY') || '').trim()
    const apiKey = userApiKey || (isOwner ? rawApiKey : '')

    // Check operation mode: default to 'read_only' if not configured
    const currentMode = settingsRecord
      ? settingsRecord.getString('operation_mode') || 'read_only'
      : 'read_only'

    if (currentMode !== 'read_write') {
      return e.json(403, {
        success: false,
        code: 'READ_ONLY_MODE',
        message:
          'O sistema está em Modo Revisão. Para enviar mensagens diretamente pelo Alô, acesse Configurações > Operação e habilite o Modo Envio Assistido.',
      })
    }

    if (!apiKey) {
      return e.json(500, {
        success: false,
        code: 'MISSING_API_KEY',
        message: 'Chave Zernio API não encontrada para este usuário. Configure nas Configurações.',
      })
    }

    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    const conversationId = (reqBody.conversationId || '').trim()
    const message = (reqBody.message || '').trim()
    const templateName = (reqBody.templateName || '').trim()
    const templateLanguage = (reqBody.templateLanguage || 'pt_BR').trim()
    const templateVariables =
      reqBody.templateVariables && typeof reqBody.templateVariables === 'object'
        ? reqBody.templateVariables
        : null

    if (!conversationId) {
      return e.json(400, {
        success: false,
        message: 'O campo conversationId é obrigatório.',
      })
    }

    if (!message && !templateName) {
      return e.json(400, {
        success: false,
        message: 'O campo message ou templateName deve ser informado.',
      })
    }

    // Buscar registro da conversa no banco (garantindo escopo do usuário se autenticado)
    let convRecord = null
    try {
      convRecord = $app.findRecordById('conversations', conversationId)
      if (
        convRecord &&
        authUserId &&
        convRecord.getString('user') &&
        convRecord.getString('user') !== authUserId
      ) {
        return e.json(403, {
          success: false,
          message: 'Sem permissão para enviar mensagem nesta conversa.',
        })
      }
    } catch (findErr) {
      return e.json(404, {
        success: false,
        message: 'Conversa não encontrada: ' + findErr.message,
      })
    }

    const zernioId = convRecord.getString('zernio_id') || ''
    const phone = convRecord.getString('phone') || ''
    const convAccountId = convRecord.getString('zernio_account_id') || ''
    const defaultAccountId = settingsRecord ? settingsRecord.getString('zernio_account_id') : ''
    const accountId =
      convAccountId ||
      defaultAccountId ||
      (isOwner ? ($os.getenv('ZERNIO_ACCOUNT_ID') || '').trim() : '')

    let sentViaZernio = false
    let zernioResponseData = null
    let zernioMessageId = ''

    // Montagem do payload suportando template oficial da Meta
    let templatePayloadObject = null
    if (templateName) {
      templatePayloadObject = {
        name: templateName,
        language: templateLanguage,
      }
      if (templateVariables && Object.keys(templateVariables).length > 0) {
        // Montar parâmetros do componente de body
        const params = []
        // Se as chaves forem numéricas ("1", "2"...) ou nomeadas
        const sortedKeys = Object.keys(templateVariables).sort((a, b) => {
          const numA = parseInt(a, 10)
          const numB = parseInt(b, 10)
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB
          return a.localeCompare(b)
        })
        for (let i = 0; i < sortedKeys.length; i++) {
          const k = sortedKeys[i]
          params.push({
            type: 'text',
            text: String(templateVariables[k] || ''),
          })
        }
        templatePayloadObject.components = [
          {
            type: 'body',
            parameters: params,
          },
        ]
      }
    }

    // Tentativa 1: POST /v1/inbox/conversations/:id/messages (ou com template se não tiver templateName)
    if (zernioId && !templateName) {
      try {
        const payload = {
          message: message,
        }
        if (accountId) {
          payload.accountId = accountId
        }

        const res = $http.send({
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

        if (res.statusCode >= 200 && res.statusCode < 300) {
          sentViaZernio = true
          zernioResponseData = res.json || {}
          zernioMessageId =
            (zernioResponseData.message && zernioResponseData.message.id) ||
            zernioResponseData.id ||
            zernioResponseData.platformMessageId ||
            ''
        } else {
          console.log(
            'Falha na tentativa 1 (/inbox/conversations/' +
              zernioId +
              '/messages HTTP ' +
              res.statusCode +
              '): ' +
              JSON.stringify(res.json || {}),
          )
        }
      } catch (err1) {
        console.log('Exceção na tentativa 1: ' + err1.message)
      }
    }

    // Tentativa 2: fallback POST /v1/messages (suporta texto livre e template)
    if (!sentViaZernio && phone) {
      try {
        const payload = {
          platform: 'whatsapp',
          recipient: phone,
        }
        if (templateName && templatePayloadObject) {
          payload.template = templatePayloadObject
          payload.type = 'template'
          if (message) payload.message = message
        } else {
          payload.message = message
        }
        if (accountId) {
          payload.accountId = accountId
        }

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
        } else {
          console.log(
            'Falha na tentativa 2 (/messages HTTP ' +
              res2.statusCode +
              '): ' +
              JSON.stringify(res2.json || {}),
          )
        }
      } catch (err2) {
        console.log('Exceção na tentativa 2: ' + err2.message)
      }
    }

    if (!sentViaZernio) {
      return e.json(502, {
        success: false,
        code: 'SEND_FAILED',
        message:
          'Falha ao entregar mensagem via API Zernio. Verifique se o destinatário é válido e a conta está ativa.',
        details: zernioResponseData,
      })
    }

    // Salvar a mensagem enviada no banco local
    const now = new Date().toISOString()
    let savedMsgRecord = null
    const finalStoredBody = message || (templateName ? '[Template: ' + templateName + ']' : '')
    try {
      const msgCol = $app.findCollectionByNameOrId('messages')
      savedMsgRecord = new Record(msgCol)
      if (authUserId) {
        savedMsgRecord.set('user', authUserId)
      } else if (convRecord.getString('user')) {
        savedMsgRecord.set('user', convRecord.getString('user'))
      }
      savedMsgRecord.set('conversation', convRecord.id)
      savedMsgRecord.set('direction', 'out')
      savedMsgRecord.set('body', finalStoredBody)
      savedMsgRecord.set('sent_at', now)
      if (zernioMessageId) {
        savedMsgRecord.set('zernio_id', zernioMessageId)
      }
      $app.save(savedMsgRecord)
    } catch (saveMsgErr) {
      console.log('Aviso: falha ao salvar mensagem enviada no DB: ' + saveMsgErr.message)
    }

    // Atualizar conversa
    try {
      convRecord.set('last_message_at', now)
      convRecord.set('last_direction', 'out')
      convRecord.set('responded_at', now)
      convRecord.set('status', 'acompanhamento')
      $app.save(convRecord)
    } catch (saveConvErr) {
      console.log('Aviso: falha ao atualizar conversa após envio: ' + saveConvErr.message)
    }

    return e.json(200, {
      success: true,
      message: 'Mensagem enviada com sucesso.',
      sentAt: now,
      zernioMessageId: zernioMessageId,
      messageRecord: savedMsgRecord
        ? {
            id: savedMsgRecord.id,
            conversation: savedMsgRecord.getString('conversation'),
            direction: savedMsgRecord.getString('direction'),
            body: savedMsgRecord.getString('body'),
            sent_at: savedMsgRecord.getString('sent_at'),
            zernio_id: savedMsgRecord.getString('zernio_id'),
          }
        : null,
    })
  },
  $apis.requireAuth(),
)
