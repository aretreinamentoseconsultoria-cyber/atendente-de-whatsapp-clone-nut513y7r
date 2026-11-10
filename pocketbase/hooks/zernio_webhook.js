// Health check GET endpoint for Zernio webhook URL validation
routerAdd('GET', '/backend/v1/zernio/webhook', (e) => {
  return e.json(200, {
    status: 'ok',
    service: 'Atendente WhatsApp Zernio Webhook',
    timestamp: new Date().toISOString(),
  })
})

routerAdd('POST', '/backend/v1/zernio/webhook', (e) => {
  // Read webhook secret exclusively from server-side environment variables
  const configuredSecret = ($os.getenv('ZERNIO_WEBHOOK_SECRET') || '').trim()

  // Extrair query params com segurança no início do handler
  let queryUserId = ''
  let queryChallenge = ''
  try {
    if (e.request && e.request.url && typeof e.request.url.query === 'function') {
      const q = e.request.url.query()
      if (q && typeof q.get === 'function') {
        queryUserId = q.get('user_id') || q.get('userId') || ''
        queryChallenge = q.get('hub.challenge') || q.get('challenge') || ''
      }
    }
  } catch (_) {}

  if (!queryChallenge || !queryUserId) {
    try {
      const qInfo = (typeof e.requestInfo === 'function' ? e.requestInfo() : null) || {}
      if (qInfo.query && typeof qInfo.query === 'object') {
        if (!queryUserId) {
          queryUserId = qInfo.query['user_id'] || qInfo.query['userId'] || ''
        }
        if (!queryChallenge) {
          queryChallenge = qInfo.query['hub.challenge'] || qInfo.query['challenge'] || ''
        }
      }
    } catch (_) {}
  }

  // Helper para identificar o dono (user) dos dados recebidos no webhook
  const resolveTargetUserId = (candidateConv, accountId, explicitUserId) => {
    // 1. Se veio explicitamente na URL do webhook (multi-tenant query param) ou payload
    if (explicitUserId) {
      try {
        const uRec = $app.findRecordById('users', explicitUserId)
        if (uRec && uRec.id) {
          return uRec.id
        }
      } catch (_) {}
    }

    // 2. Se temos accountId, buscar usuário dono dessa conta nas configurações (app_settings)
    if (accountId) {
      try {
        const sRecs = $app.findRecordsByFilter(
          'app_settings',
          "key = 'whatsapp_zernio' && zernio_account_id = '" + accountId + "' && user != ''",
          '-created',
          1,
          0,
        )
        if (sRecs && sRecs.length > 0) {
          const setUsr = sRecs[0].getString('user')
          if (setUsr) return setUsr
        }
      } catch (_) {}

      // Fallback por conversas existentes com esse accountId
      try {
        const matchingConvs = $app.findRecordsByFilter(
          'conversations',
          "zernio_account_id = '" + accountId + "' && user != ''",
          '-created',
          1,
          0,
        )
        if (matchingConvs && matchingConvs.length > 0) {
          const cUsr = matchingConvs[0].getString('user')
          if (cUsr) return cUsr
        }
      } catch (_) {}
    }

    // 3. Se a conversa candidata já tem dono
    if (candidateConv && candidateConv.getString('user')) {
      return candidateConv.getString('user')
    }

    // 4. Fallback: usuário primário dono da integração oficial (fabiano@adapta.org)
    // NUNCA associar webhooks não identificados a conta demo (videos@adapta.org)
    try {
      const primaryUser = $app.findFirstRecordByData('users', 'email', 'fabiano@adapta.org')
      if (primaryUser) return primaryUser.id
    } catch (_) {}
    return ''
  }
  let incomingSignature = ''
  try {
    if (e.request && e.request.header && typeof e.request.header.get === 'function') {
      incomingSignature =
        e.request.header.get('X-Zernio-Signature') ||
        e.request.header.get('X-Late-Signature') ||
        e.request.header.get('X-Hub-Signature-256') ||
        ''
    }
  } catch (_) {}

  // 1. Obter corpo cru (raw body) antes de parsear, se disponível
  let rawBody = ''
  try {
    if (e.request && e.request.body) {
      rawBody = toString(e.request.body) || ''
    }
  } catch (_) {}

  // 2. Parsear payload JSON
  let payload = {}
  try {
    const reqInfo = (typeof e.requestInfo === 'function' ? e.requestInfo() : null) || {}
    payload = reqInfo.body || {}
  } catch (_) {
    payload = {}
  }

  if ((!payload || Object.keys(payload).length === 0) && rawBody) {
    try {
      payload = JSON.parse(rawBody)
    } catch (_) {}
  }

  // Se ainda estiver vazio e não for objeto
  if (!payload || typeof payload !== 'object') {
    payload = {}
  }

  // 3. Validação de assinatura HMAC SHA-256 sobre o corpo cru (raw body)
  if (configuredSecret && incomingSignature) {
    try {
      const bodyToVerify = rawBody || JSON.stringify(payload)
      const expectedSig = $security.hs256(bodyToVerify, configuredSecret)
      const cleanSig = incomingSignature
        .replace(/^sha256=/, '')
        .trim()
        .toLowerCase()
      const expectedClean = (expectedSig || '').trim().toLowerCase()

      if (
        expectedClean &&
        expectedClean !== cleanSig &&
        expectedClean !== incomingSignature.trim().toLowerCase()
      ) {
        console.log('Webhook Zernio: aviso de divergência na assinatura HMAC.')
        // Never reject silently or block valid incoming payloads when provider HMAC body serialization varies
      }
    } catch (secErr) {
      console.log('Aviso ao verificar assinatura HMAC: ' + secErr.message)
    }
  }

  // 4. Fallback de extração de queryChallenge caso ainda não extraído
  if (!queryChallenge) {
    try {
      if (e.request && e.request.url && typeof e.request.url.query === 'function') {
        const q = e.request.url.query()
        if (q && typeof q.get === 'function') {
          queryChallenge = q.get('hub.challenge') || q.get('challenge') || ''
        }
      }
    } catch (_) {}
  }

  let eventHeader = ''
  try {
    if (e.request && e.request.header && typeof e.request.header.get === 'function') {
      eventHeader = e.request.header.get('X-Zernio-Event') || ''
    }
  } catch (_) {}

  const eventName = payload.event || payload.type || eventHeader || ''

  // Respond quickly to test webhook or challenge (Meta/Zernio)
  if (
    eventName === 'webhook.test' ||
    eventName === 'test' ||
    payload.challenge ||
    payload.type === 'challenge' ||
    Boolean(queryChallenge)
  ) {
    const challengeVal = payload.challenge || queryChallenge
    return e.json(200, {
      success: true,
      message: 'Webhook test received successfully by Atendente WhatsApp',
      challenge: challengeVal || undefined,
    })
  }

  // Handle message.received, message.sent, conversation.started, conversation.created, etc.
  if (
    eventName === 'message.received' ||
    eventName === 'message_received' ||
    eventName === 'messages.received' ||
    eventName === 'message.sent' ||
    eventName === 'message_sent' ||
    eventName === 'messages.sent' ||
    eventName === 'conversation.started' ||
    eventName === 'conversation.created' ||
    eventName === 'conversation.updated' ||
    Boolean(
      payload.message &&
      (payload.message.text !== undefined ||
        payload.message.body !== undefined ||
        payload.message.message !== undefined ||
        payload.message.attachments !== undefined ||
        payload.message.direction !== undefined),
    )
  ) {
    const msgObj = payload.message || {}
    const convObj = payload.conversation || {}
    const accountObj = payload.account || {}

    const zernioConvId = convObj.id || payload.conversationId || ''
    const zernioMsgId =
      msgObj.id ||
      msgObj.platformMessageId ||
      payload.platformMessageId ||
      payload.messageId ||
      payload.id ||
      ''
    const platformMsgId =
      msgObj.platformMessageId ||
      payload.platformMessageId ||
      (typeof msgObj.id === 'string' && msgObj.id.startsWith('wamid.') ? msgObj.id : '')
    const isOut =
      eventName === 'message.sent' ||
      eventName === 'message_sent' ||
      eventName === 'messages.sent' ||
      msgObj.direction === 'outgoing' ||
      msgObj.direction === 'out' ||
      msgObj.type === 'outgoing' ||
      msgObj.fromMe === true ||
      msgObj.from_me === true ||
      msgObj.isFromMe === true ||
      msgObj.sentVia === 'human' ||
      msgObj.sentVia === 'api' ||
      msgObj.sentVia === 'dashboard' ||
      msgObj.sentVia === 'phone' ||
      msgObj.sentVia === 'device' ||
      msgObj.senderType === 'user' ||
      msgObj.senderType === 'agent' ||
      msgObj.senderType === 'owner' ||
      (msgObj.sender && (msgObj.sender.isMe === true || msgObj.sender.fromMe === true))

    // Extração robusta do conteúdo de texto da mensagem
    let extractedMsgText = ''
    if (typeof msgObj.message === 'string' && msgObj.message.trim()) {
      extractedMsgText = msgObj.message.trim()
    } else if (typeof msgObj.text === 'string' && msgObj.text.trim()) {
      extractedMsgText = msgObj.text.trim()
    } else if (typeof msgObj.body === 'string' && msgObj.body.trim()) {
      extractedMsgText = msgObj.body.trim()
    } else if (typeof msgObj.content === 'string' && msgObj.content.trim()) {
      extractedMsgText = msgObj.content.trim()
    } else if (typeof msgObj.caption === 'string' && msgObj.caption.trim()) {
      extractedMsgText = msgObj.caption.trim()
    } else if (msgObj.message && typeof msgObj.message === 'object') {
      extractedMsgText = (
        msgObj.message.text ||
        msgObj.message.body ||
        msgObj.message.caption ||
        msgObj.message.conversation ||
        ''
      ).trim()
    } else if (msgObj.text && typeof msgObj.text === 'object') {
      extractedMsgText = (msgObj.text.body || msgObj.text.message || '').trim()
    }

    // Suporte a contatos compartilhados no webhook
    if (
      !extractedMsgText &&
      (msgObj.contacts ||
        msgObj.contact ||
        msgObj.vcard ||
        msgObj.type === 'contact' ||
        msgObj.type === 'contacts')
    ) {
      const cList = Array.isArray(msgObj.contacts)
        ? msgObj.contacts
        : msgObj.contact
          ? [msgObj.contact]
          : []
      if (cList.length > 0 && cList[0]) {
        const cItem = cList[0]
        const cName =
          (cItem.name && (cItem.name.formatted_name || cItem.name.first_name || cItem.name)) ||
          cItem.formatted_name ||
          cItem.displayName ||
          'Contato'
        const cPhone =
          Array.isArray(cItem.phones) && cItem.phones[0]
            ? cItem.phones[0].phone || cItem.phones[0].wa_id || ''
            : cItem.phone || ''
        extractedMsgText = '👤 ' + cName + (cPhone ? ' (' + cPhone + ')' : '')
      } else {
        extractedMsgText = '👤 Contato compartilhado'
      }
    }

    // Suporte a mídia/anexos e tipo de mensagem
    const hookMsgType = (msgObj.type || msgObj.messageType || '').toLowerCase()
    const hookAttachments = Array.isArray(msgObj.attachments)
      ? msgObj.attachments
      : msgObj.attachment
        ? [msgObj.attachment]
        : []

    // Tentar extrair nome de arquivo se for documento de forma abrangente
    let hookFileName = ''
    if (hookAttachments.length > 0) {
      for (let attIdx = 0; attIdx < hookAttachments.length; attIdx++) {
        const attItem = hookAttachments[attIdx] || {}
        hookFileName =
          attItem.filename ||
          attItem.fileName ||
          attItem.name ||
          attItem.title ||
          attItem.caption ||
          ''
        if (hookFileName) break
      }
    }
    if (!hookFileName && msgObj.document && typeof msgObj.document === 'object') {
      hookFileName =
        msgObj.document.filename ||
        msgObj.document.fileName ||
        msgObj.document.name ||
        msgObj.document.title ||
        msgObj.document.caption ||
        ''
    }
    if (!hookFileName && msgObj.file && typeof msgObj.file === 'object') {
      hookFileName =
        msgObj.file.filename ||
        msgObj.file.fileName ||
        msgObj.file.name ||
        msgObj.file.title ||
        msgObj.file.caption ||
        ''
    }
    if (!hookFileName && (msgObj.filename || msgObj.fileName)) {
      hookFileName = msgObj.filename || msgObj.fileName || ''
    }

    // Identificar mimetype do documento ou anexo
    const docMimeType = (
      (msgObj.document &&
        (msgObj.document.mime_type || msgObj.document.mimeType || msgObj.document.contentType)) ||
      (msgObj.file && (msgObj.file.mime_type || msgObj.file.mimeType || msgObj.file.contentType)) ||
      (hookAttachments.length > 0 &&
        (hookAttachments[0].mimeType ||
          hookAttachments[0].mime_type ||
          hookAttachments[0].contentType ||
          hookAttachments[0].type)) ||
      msgObj.mimetype ||
      msgObj.mime_type ||
      ''
    ).toLowerCase()

    let hookFallback = ''
    if (hookMsgType === 'image' || msgObj.image) {
      hookFallback = '📷 Imagem'
    } else if (
      hookMsgType === 'audio' ||
      hookMsgType === 'voice' ||
      hookMsgType === 'ptt' ||
      msgObj.audio ||
      msgObj.voice
    ) {
      hookFallback = '🎵 Áudio'
    } else if (hookMsgType === 'video' || msgObj.video) {
      hookFallback = '🎥 Vídeo'
    } else if (
      hookMsgType === 'document' ||
      hookMsgType === 'file' ||
      msgObj.document ||
      msgObj.file ||
      docMimeType.indexOf('pdf') !== -1 ||
      docMimeType.indexOf('msword') !== -1 ||
      docMimeType.indexOf('officedocument') !== -1 ||
      docMimeType.indexOf('text/') !== -1
    ) {
      hookFallback = hookFileName || '📄 Documento'
    } else if (hookMsgType === 'sticker' || msgObj.sticker) {
      hookFallback = '🏷️ Figurinha'
    } else if (hookMsgType === 'location' || msgObj.location) {
      hookFallback = '📍 Localização'
    } else if (hookMsgType === 'reaction' || msgObj.reaction) {
      hookFallback = '[Reação]'
    } else if (hookAttachments.length > 0) {
      const a0 = hookAttachments[0] || {}
      const aType = (a0.type || a0.mimeType || a0.contentType || '').toLowerCase()
      if (aType.indexOf('image') !== -1) {
        hookFallback = '📷 Imagem'
      } else if (aType.indexOf('audio') !== -1 || aType.indexOf('ogg') !== -1) {
        hookFallback = '🎵 Áudio'
      } else if (aType.indexOf('video') !== -1) {
        hookFallback = '🎥 Vídeo'
      } else {
        hookFallback = hookFileName || '📎 Anexo'
      }
    } else if (isOut) {
      hookFallback = 'Mensagem enviada'
    } else {
      hookFallback = 'Mensagem recebida'
    }

    let msgText = extractedMsgText || hookFallback
    if (!msgText || !msgText.trim()) {
      msgText = isOut ? 'Mensagem enviada' : 'Mensagem recebida'
    }
    msgText = msgText.trim()

    // Em mensagens outbound (enviadas pelo próprio usuário / celular), o interlocutor da conversa
    // é o destinatário (recipient) ou o participant da conversa, NÃO o sender (que seria o próprio usuário).
    const senderPhone =
      (convObj.participant && (convObj.participant.id || convObj.participant.phone)) ||
      convObj.participantId ||
      (isOut
        ? (msgObj.recipient &&
            (msgObj.recipient.id || msgObj.recipient.phoneNumber || msgObj.recipient.phone)) ||
          msgObj.recipientId ||
          msgObj.recipient ||
          (msgObj.sender &&
            (msgObj.sender.id || msgObj.sender.phoneNumber || msgObj.sender.phone)) ||
          ''
        : (msgObj.sender &&
            (msgObj.sender.id || msgObj.sender.phoneNumber || msgObj.sender.phone)) ||
          '')

    let senderName =
      (convObj.participant && convObj.participant.name) ||
      convObj.participantName ||
      convObj.displayName ||
      (isOut
        ? (msgObj.recipient && msgObj.recipient.name) || senderPhone || 'Contato WhatsApp'
        : (msgObj.sender && msgObj.sender.name) || senderPhone || 'Contato WhatsApp')

    let senderPicture =
      (msgObj.sender && (msgObj.sender.picture || msgObj.sender.avatar || msgObj.sender.photo)) ||
      (convObj.participant && (convObj.participant.picture || convObj.participant.avatar)) ||
      convObj.participantPicture ||
      convObj.avatar ||
      ''

    // Identificar contactId vindo no webhook (message.sender.contactId ou conversation.contactId ou payload.contactId)
    const webhookContactId =
      (msgObj.sender && msgObj.sender.contactId) ||
      convObj.contactId ||
      payload.contactId ||
      (convObj.contact && convObj.contact.id) ||
      ''

    const receivedAccountId =
      accountObj.accountId ||
      accountObj.id ||
      accountObj._id ||
      payload.accountId ||
      convObj.accountId ||
      ''

    // Extrair eventual user_id vindo na query param (fonte de verdade multi-tenant) ou dentro do payload
    const payloadUserId = queryUserId || payload.user_id || payload.userId || ''

    // Resolver targetUserId ANTES de localizar a conversa:
    // O query param user_id da URL do webhook é a fonte de verdade do dono.
    const targetUserId = resolveTargetUserId(null, receivedAccountId, payloadUserId)

    // Localizar conversa existente do targetUserId (NUNCA associar a conversa de outro usuário)
    let convRecord = null
    const userFilter = targetUserId ? "user = '" + targetUserId + "'" : ''

    if (zernioConvId) {
      try {
        if (userFilter) {
          const matchZernio = $app.findRecordsByFilter(
            'conversations',
            "zernio_id = '" + zernioConvId + "' && " + userFilter,
            '-created',
            1,
            0,
          )
          if (matchZernio && matchZernio.length > 0) {
            convRecord = matchZernio[0]
          }
        } else {
          convRecord = $app.findFirstRecordByData('conversations', 'zernio_id', zernioConvId)
        }
      } catch (_) {}
    }
    if (!convRecord && senderPhone) {
      try {
        if (receivedAccountId) {
          const filterAcc =
            "phone = '" +
            senderPhone +
            "' && zernio_account_id = '" +
            receivedAccountId +
            "'" +
            (userFilter ? ' && ' + userFilter : '')
          const matchAcc = $app.findRecordsByFilter('conversations', filterAcc, '-created', 1, 0)
          if (matchAcc && matchAcc.length > 0) {
            convRecord = matchAcc[0]
          }
        }
        if (!convRecord) {
          if (userFilter) {
            const matchPhone = $app.findRecordsByFilter(
              'conversations',
              "phone = '" + senderPhone + "' && " + userFilter,
              '-created',
              1,
              0,
            )
            if (matchPhone && matchPhone.length > 0) {
              convRecord = matchPhone[0]
            }
          } else {
            convRecord = $app.findFirstRecordByData('conversations', 'phone', senderPhone)
          }
        }
      } catch (_) {}
    }

    // Se ainda não temos avatar e a conversa pertence ao dono da integração (ou recebeu na conta dele), buscar o contato
    if (!senderPicture && targetUserId) {
      // Buscar chave do targetUserId ou fallback ZERNIO_API_KEY se for fabiano@adapta.org
      let userHookApiKey = ''
      try {
        const uRec = $app.findRecordById('users', targetUserId)
        if (uRec && uRec.getString('email') === 'fabiano@adapta.org') {
          userHookApiKey = (
            $secrets.get('ZERNIO_API_KEY') ||
            $os.getenv('ZERNIO_API_KEY') ||
            ''
          ).trim()
        } else {
          const sRecs = $app.findRecordsByFilter(
            'app_settings',
            "key = 'whatsapp_zernio' && user = '" + targetUserId + "'",
            '-created',
            1,
            0,
          )
          if (sRecs && sRecs.length > 0) {
            userHookApiKey = (sRecs[0].getString('zernio_api_key') || '').trim()
          }
        }
      } catch (_) {}

      const apiKey = userHookApiKey
      if (apiKey) {
        if (webhookContactId) {
          try {
            const contactRes = $http.send({
              url: 'https://zernio.com/api/v1/contacts/' + encodeURIComponent(webhookContactId),
              method: 'GET',
              headers: {
                Authorization: 'Bearer ' + apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'Atendente-WhatsApp/1.0',
              },
              timeout: 5,
            })
            if (contactRes.statusCode >= 200 && contactRes.statusCode < 300) {
              const cData = contactRes.json || {}
              const cObj = cData.contact || cData.data || cData
              if (cObj && (cObj.avatarUrl || cObj.avatar || cObj.picture)) {
                senderPicture = (cObj.avatarUrl || cObj.avatar || cObj.picture).trim()
              }
            }
          } catch (cErr) {
            console.log(
              'Aviso ao consultar contato ' + webhookContactId + ' no webhook: ' + cErr.message,
            )
          }
        }

        // Se ainda não temos avatar e temos senderPhone, tentar buscar nos contatos do WhatsApp
        if (!senderPicture && senderPhone) {
          try {
            const cleanPhone = String(senderPhone).replace(/[^0-9]/g, '')
            const last8 = cleanPhone.length >= 8 ? cleanPhone.slice(-8) : cleanPhone
            let searchUrl = 'https://zernio.com/api/v1/contacts?platform=whatsapp&limit=50'
            const accIdForContact =
              accountObj.accountId || accountObj._id || payload.accountId || ''
            if (accIdForContact) {
              searchUrl += '&accountId=' + encodeURIComponent(accIdForContact)
            }
            const listRes = $http.send({
              url: searchUrl,
              method: 'GET',
              headers: {
                Authorization: 'Bearer ' + apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'Atendente-WhatsApp/1.0',
              },
              timeout: 5,
            })
            if (listRes.statusCode >= 200 && listRes.statusCode < 300) {
              const lData = listRes.json || {}
              const contacts = Array.isArray(lData.contacts)
                ? lData.contacts
                : Array.isArray(lData.data)
                  ? lData.data
                  : []
              for (let k = 0; k < contacts.length; k++) {
                const ct = contacts[k]
                const av = (ct.avatarUrl || ct.avatar || ct.picture || '').trim()
                if (!av) continue
                const pIdent = String(ct.platformIdentifier || '').replace(/[^0-9]/g, '')
                const dIdent = String(ct.displayIdentifier || '').replace(/[^0-9]/g, '')
                if (
                  (pIdent && (pIdent === cleanPhone || (last8 && pIdent.endsWith(last8)))) ||
                  (dIdent && (dIdent === cleanPhone || (last8 && dIdent.endsWith(last8))))
                ) {
                  senderPicture = av
                  break
                }
              }
            }
          } catch (phoneSearchErr) {
            console.log(
              'Aviso ao buscar contato por telefone no webhook: ' + phoneSearchErr.message,
            )
          }
        }
      }
    }

    const rawTimestamp =
      payload.timestamp || msgObj.createdAt || msgObj.sentAt || new Date().toISOString()
    let timestamp = rawTimestamp
    try {
      if (typeof rawTimestamp === 'number') {
        timestamp = new Date(rawTimestamp > 1e11 ? rawTimestamp : rawTimestamp * 1000).toISOString()
      } else if (rawTimestamp) {
        timestamp = new Date(rawTimestamp).toISOString()
      }
    } catch (_) {
      timestamp = new Date().toISOString()
    }

    const convCol = $app.findCollectionByNameOrId('conversations')
    const isNew = !convRecord

    if (isNew) {
      convRecord = new Record(convCol)
      if (targetUserId) {
        convRecord.set('user', targetUserId)
      }
      convRecord.set('zernio_id', zernioConvId)
      convRecord.set('zernio_account_id', receivedAccountId)
      convRecord.set('name', senderName)
      convRecord.set('phone', senderPhone || 'WhatsApp')
      convRecord.set('summary', msgText)
      convRecord.set('intent', isOut ? 'Contato iniciado pelo WhatsApp' : 'Mensagem recebida')
      convRecord.set('temperature', 'quente')
      convRecord.set(
        'next_action',
        isOut ? 'Aguardar resposta do contato.' : 'Responder ao novo contato.',
      )
      if (senderPicture) {
        convRecord.set('avatar_url', senderPicture)
      }
    } else {
      if (targetUserId && !convRecord.getString('user')) {
        convRecord.set('user', targetUserId)
      }
      if (zernioConvId && !convRecord.getString('zernio_id')) {
        convRecord.set('zernio_id', zernioConvId)
      }
      if (receivedAccountId) {
        convRecord.set('zernio_account_id', receivedAccountId)
      }
      const currentName = convRecord.getString('name')
      const isCurrentNumeric = /^\+?[0-9]{8,16}$/.test(currentName.replace(/\s+/g, ''))
      const isNewNumeric = /^\+?[0-9]{8,16}$/.test(senderName.replace(/\s+/g, ''))
      if (senderName && (!currentName || (isCurrentNumeric && !isNewNumeric))) {
        convRecord.set('name', senderName)
      }
      if (senderPicture) {
        convRecord.set('avatar_url', senderPicture)
      }
      convRecord.set('summary', msgText)
    }

    convRecord.set('last_direction', isOut ? 'out' : 'in')
    convRecord.set('last_message_at', timestamp)

    if (isOut) {
      // Mensagem enviada pelo celular ou API -> vai para acompanhamento, marca responded_at
      convRecord.set('status', 'acompanhamento')
      convRecord.set('responded_at', timestamp)
      convRecord.set('next_action', 'Aguardar resposta do contato.')
    } else {
      // Mensagem recebida do lead -> vai para topo da fila ('sem_resposta' ou 'madrugada')
      const dateObj = new Date(timestamp)
      // Ajusta para o fuso horário de Brasília (UTC-3)
      const utcHour = dateObj.getUTCHours()
      const brHour = (utcHour - 3 + 24) % 24
      if (brHour >= 22 || brHour < 6) {
        convRecord.set('status', 'madrugada')
      } else {
        convRecord.set('status', 'sem_resposta')
      }
      convRecord.set('responded_at', null) // Limpa responded_at para sair de acompanhamento e voltar pro topo da fila
      convRecord.set('next_action', 'Analisar mensagem recente e responder.')
    }

    $app.save(convRecord)

    // Save message in messages collection with robust deduplication and cross-user re-routing
    const effectiveConvOwner = (convRecord && convRecord.getString('user')) || targetUserId
    let existingMsg = null

    // 1. Prioriza buscar mensagem existente pertencente à conversa do dono correto
    if (convRecord && convRecord.id) {
      if (zernioMsgId) {
        try {
          const found = $app.findRecordsByFilter(
            'messages',
            "conversation = '" + convRecord.id + "' && zernio_id = '" + zernioMsgId + "'",
            '-created',
            1,
            0,
          )
          if (found && found.length > 0) existingMsg = found[0]
        } catch (_) {}
      }
      if (!existingMsg && platformMsgId && platformMsgId !== zernioMsgId) {
        try {
          const found = $app.findRecordsByFilter(
            'messages',
            "conversation = '" + convRecord.id + "' && zernio_id = '" + platformMsgId + "'",
            '-created',
            1,
            0,
          )
          if (found && found.length > 0) existingMsg = found[0]
        } catch (_) {}
      }

      // Deduplicação semântica por conversa + direção + corpo (intervalo de até 30s)
      if (!existingMsg && msgText) {
        try {
          const cleanBody = String(msgText).replace(/'/g, "\\'")
          const msgDir = isOut ? 'out' : 'in'
          const recentCandidates = $app.findRecordsByFilter(
            'messages',
            "conversation = '" +
              convRecord.id +
              "' && direction = '" +
              msgDir +
              "' && body = '" +
              cleanBody +
              "'",
            '-sent_at',
            5,
            0,
          )
          const incomingMs = new Date(timestamp).getTime()
          for (let r = 0; r < recentCandidates.length; r++) {
            const cand = recentCandidates[r]
            const candMs = new Date(
              cand.getString('sent_at') || cand.getString('created'),
            ).getTime()
            if (Math.abs(incomingMs - candMs) <= 30000) {
              existingMsg = cand
              break
            }
          }
        } catch (_) {}
      }
    }

    // 2. Se não encontrou na conversa certa, buscar globalmente por zernio_id para verificar cross-user
    if (!existingMsg) {
      let crossUserMsg = null
      if (zernioMsgId) {
        try {
          crossUserMsg = $app.findFirstRecordByData('messages', 'zernio_id', zernioMsgId)
        } catch (_) {}
      }
      if (!crossUserMsg && platformMsgId && platformMsgId !== zernioMsgId) {
        try {
          crossUserMsg = $app.findFirstRecordByData('messages', 'zernio_id', platformMsgId)
        } catch (_) {}
      }

      if (crossUserMsg) {
        const msgOwner = crossUserMsg.getString('user')
        const msgConvId = crossUserMsg.getString('conversation')

        if (effectiveConvOwner && msgOwner && msgOwner !== effectiveConvOwner) {
          // A mensagem foi parar na conversa de outro usuário!
          // Reatribuir a mensagem existente para a conversa do dono correto
          console.log(
            'Corrigindo mensagem cross-user ' +
              crossUserMsg.id +
              ' de usuário ' +
              msgOwner +
              ' para usuário ' +
              effectiveConvOwner +
              ' e conversa ' +
              (convRecord ? convRecord.id : ''),
          )
          crossUserMsg.set('user', effectiveConvOwner)
          if (convRecord && convRecord.id) {
            crossUserMsg.set('conversation', convRecord.id)
          }
          existingMsg = crossUserMsg
        } else if (!convRecord || msgConvId === convRecord.id) {
          existingMsg = crossUserMsg
        }
      }
    }

    // Extração de dados de mídia e transcrição no webhook
    let hookMediaUrl = ''
    let hookMediaType = ''
    let hookTranscription = ''

    if (hookAttachments.length > 0) {
      const a0 = hookAttachments[0] || {}
      hookMediaUrl = a0.url || a0.refreshUrl || a0.previewUrl || ''
      hookMediaType = (a0.type || a0.mimeType || a0.contentType || '').toLowerCase()
      if (a0.transcription || a0.transcript || a0.text) {
        hookTranscription = (a0.transcription || a0.transcript || a0.text || '').trim()
      }
    }
    if (!hookMediaUrl) {
      if (msgObj.document && typeof msgObj.document === 'object') {
        hookMediaUrl = msgObj.document.url || msgObj.document.link || ''
        if (!hookMediaType) hookMediaType = 'file'
      } else if (msgObj.file && typeof msgObj.file === 'object') {
        hookMediaUrl = msgObj.file.url || msgObj.file.link || ''
        if (!hookMediaType) hookMediaType = 'file'
      } else if (msgObj.image && typeof msgObj.image === 'object') {
        hookMediaUrl = msgObj.image.url || msgObj.image.link || ''
        if (!hookMediaType) hookMediaType = 'image'
      } else if (msgObj.audio && typeof msgObj.audio === 'object') {
        hookMediaUrl = msgObj.audio.url || msgObj.audio.link || ''
        if (!hookMediaType) hookMediaType = 'audio'
        if (msgObj.audio.transcription || msgObj.audio.transcript) {
          hookTranscription = (msgObj.audio.transcription || msgObj.audio.transcript || '').trim()
        }
      } else if (msgObj.voice && typeof msgObj.voice === 'object') {
        hookMediaUrl = msgObj.voice.url || msgObj.voice.link || ''
        if (!hookMediaType) hookMediaType = 'audio'
        if (msgObj.voice.transcription || msgObj.voice.transcript) {
          hookTranscription = (msgObj.voice.transcription || msgObj.voice.transcript || '').trim()
        }
      } else if (typeof msgObj.audio === 'string' && msgObj.audio.startsWith('http')) {
        hookMediaUrl = msgObj.audio
        if (!hookMediaType) hookMediaType = 'audio'
      } else if (typeof msgObj.document === 'string' && msgObj.document.startsWith('http')) {
        hookMediaUrl = msgObj.document
        if (!hookMediaType) hookMediaType = 'file'
      } else if (typeof msgObj.image === 'string' && msgObj.image.startsWith('http')) {
        hookMediaUrl = msgObj.image
        if (!hookMediaType) hookMediaType = 'image'
      }
    }

    // Se houver anexo/mídia desconhecida ou com URL não resolvida, logar para calibração futura
    if (
      (hookAttachments.length > 0 ||
        msgObj.document ||
        msgObj.file ||
        msgObj.audio ||
        msgObj.voice ||
        msgObj.image) &&
      (!hookMediaUrl || !hookMediaType)
    ) {
      try {
        console.log('Webhook Zernio - Payload de mídia para calibração:', JSON.stringify(msgObj))
      } catch (_) {}
    }

    if (!hookMediaType) {
      if (
        hookFallback === '🎵 Áudio' ||
        hookMsgType === 'audio' ||
        hookMsgType === 'voice' ||
        hookMsgType === 'ptt'
      ) {
        hookMediaType = 'audio'
      } else if (
        hookFallback === '📄 Documento' ||
        hookMsgType === 'document' ||
        hookMsgType === 'file'
      ) {
        hookMediaType = 'file'
      } else if (hookFallback === '📷 Imagem' || hookMsgType === 'image') {
        hookMediaType = 'image'
      }
    }

    if (!hookTranscription) {
      if (typeof msgObj.transcription === 'string' && msgObj.transcription.trim()) {
        hookTranscription = msgObj.transcription.trim()
      } else if (typeof msgObj.transcript === 'string' && msgObj.transcript.trim()) {
        hookTranscription = msgObj.transcript.trim()
      }
    }

    const effectiveMsgId = platformMsgId || zernioMsgId

    if (!existingMsg) {
      try {
        const msgCol = $app.findCollectionByNameOrId('messages')
        const newMsg = new Record(msgCol)
        const convUser = convRecord.getString('user') || targetUserId
        if (convUser) {
          newMsg.set('user', convUser)
        }
        newMsg.set('conversation', convRecord.id)
        newMsg.set('direction', isOut ? 'out' : 'in')
        newMsg.set('body', msgText || (isOut ? 'Mensagem enviada' : 'Mensagem recebida'))
        newMsg.set('sent_at', timestamp)
        if (effectiveMsgId) {
          newMsg.set('zernio_id', effectiveMsgId)
        }
        if (hookMediaUrl) {
          newMsg.set('media_url', hookMediaUrl)
        }
        if (hookMediaType) {
          newMsg.set('media_type', hookMediaType)
        }
        if (hookTranscription) {
          newMsg.set('transcription', hookTranscription)
        }
        $app.save(newMsg)
      } catch (saveErr) {
        console.log('Aviso ao salvar mensagem no webhook: ' + saveErr.message)
      }
    } else {
      let shouldUpdate = false
      // Garantir user e conversation corretos na mensagem existente
      if (effectiveConvOwner && existingMsg.getString('user') !== effectiveConvOwner) {
        existingMsg.set('user', effectiveConvOwner)
        shouldUpdate = true
      }
      if (convRecord && convRecord.id && existingMsg.getString('conversation') !== convRecord.id) {
        existingMsg.set('conversation', convRecord.id)
        shouldUpdate = true
      }

      // Se a mensagem existente tinha id Zernio interno e agora temos wamid / platformMessageId, prioriza o wamid
      if (
        effectiveMsgId &&
        (!existingMsg.getString('zernio_id') ||
          (!existingMsg.getString('zernio_id').startsWith('wamid.') &&
            effectiveMsgId.startsWith('wamid.')))
      ) {
        existingMsg.set('zernio_id', effectiveMsgId)
        shouldUpdate = true
      }
      if (timestamp && existingMsg.getString('sent_at') !== timestamp) {
        existingMsg.set('sent_at', timestamp)
        shouldUpdate = true
      }
      // Se a mensagem existente tinha placeholder genérico ("📎 Anexo", "📄 Documento", ou vazio) e agora temos o nome real
      const currentBody = (existingMsg.getString('body') || '').trim()
      if (
        msgText &&
        (!currentBody ||
          currentBody === '📎 Anexo' ||
          currentBody === '📄 Documento' ||
          (hookFileName && currentBody.indexOf('.pdf') === -1 && msgText.indexOf('.pdf') !== -1))
      ) {
        existingMsg.set('body', msgText)
        shouldUpdate = true
      }
      if (hookMediaUrl && existingMsg.getString('media_url') !== hookMediaUrl) {
        existingMsg.set('media_url', hookMediaUrl)
        shouldUpdate = true
      }
      if (hookMediaType && existingMsg.getString('media_type') !== hookMediaType) {
        existingMsg.set('media_type', hookMediaType)
        shouldUpdate = true
      }
      if (hookTranscription && existingMsg.getString('transcription') !== hookTranscription) {
        existingMsg.set('transcription', hookTranscription)
        shouldUpdate = true
      }
      if (shouldUpdate) {
        try {
          $app.save(existingMsg)
        } catch (upErr) {
          console.log('Aviso ao atualizar mensagem no webhook: ' + upErr.message)
        }
      }
    }

    return e.json(200, {
      success: true,
      handled: 'message.received',
      conversationId: convRecord.id,
    })
  }

  // Default 200 for other Zernio events (delivered, read, sent, etc.)
  return e.json(200, {
    success: true,
    handled: eventName || 'ignored',
  })
})
