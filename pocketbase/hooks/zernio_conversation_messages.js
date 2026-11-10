routerAdd(
  'POST',
  '/backend/v1/zernio/conversation-messages',
  (e) => {
    // Identificar usuário autenticado
    const authUser = e.auth
    const authUserId = authUser ? authUser.id : ''
    const authEmail = authUser ? authUser.getString('email') : ''

    if (!authUserId) {
      return e.json(401, {
        success: false,
        message: 'Não autenticado.',
      })
    }

    // Localizar app_settings do usuário atual
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

    // Conta demo (videos@adapta.org) não chama API externa
    if (authEmail === 'videos@adapta.org') {
      return e.json(200, {
        success: true,
        messagesSynced: 0,
        message: 'Conta demo: mensagens já pré-carregadas.',
      })
    }

    if (!apiKey) {
      return e.json(400, {
        success: false,
        code: 'MISSING_API_KEY',
        message: 'Chave Zernio API não encontrada para esta conta.',
      })
    }

    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    const conversationId = (reqBody.conversationId || '').trim()
    if (!conversationId) {
      return e.json(400, {
        success: false,
        message: 'O campo conversationId é obrigatório.',
      })
    }

    // Buscar conversa no banco
    let convRecord = null
    try {
      convRecord = $app.findRecordById('conversations', conversationId)
      if (
        convRecord &&
        convRecord.getString('user') &&
        convRecord.getString('user') !== authUserId
      ) {
        return e.json(403, {
          success: false,
          message: 'Sem permissão para acessar esta conversa.',
        })
      }
    } catch (findErr) {
      return e.json(404, {
        success: false,
        message: 'Conversa não encontrada: ' + findErr.message,
      })
    }

    const zernioId = convRecord.getString('zernio_id') || ''
    if (!zernioId) {
      return e.json(200, {
        success: true,
        messagesSynced: 0,
        message: 'Conversa não possui ID Zernio associado.',
      })
    }

    let resolvedAccountId = (convRecord.getString('zernio_account_id') || '').trim()
    if (!resolvedAccountId && settingsRecord) {
      resolvedAccountId = (settingsRecord.getString('zernio_account_id') || '').trim()
    }

    // Lista de candidatos de accountId para tentar
    const candidateAccountIds = []
    if (resolvedAccountId) {
      candidateAccountIds.push(resolvedAccountId)
    }

    // Buscar todas as contas da Zernio caso precisemos tentar outras contas
    try {
      const accRes = $http.send({
        url: 'https://zernio.com/api/v1/accounts',
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Atendente-WhatsApp/1.0',
        },
        timeout: 8,
      })
      if (accRes.statusCode >= 200 && accRes.statusCode < 300) {
        const accJson = accRes.json || {}
        const accList = Array.isArray(accJson.accounts) ? accJson.accounts : []
        for (let a = 0; a < accList.length; a++) {
          const accObj = accList[a]
          const accId = accObj._id || accObj.id
          if (accId && !candidateAccountIds.includes(accId)) {
            candidateAccountIds.push(accId)
          }
        }
      }
    } catch (accErr) {
      console.log('Aviso ao consultar contas para conversa sob demanda: ' + accErr.message)
    }

    if (candidateAccountIds.length === 0) {
      return e.json(400, {
        success: false,
        code: 'MISSING_ACCOUNT_ID',
        message: 'Não foi possível identificar o accountId da Zernio para esta conversa.',
      })
    }

    const participantId = (convRecord.getString('phone') || '').trim()
    const now = new Date().toISOString()
    let messagesSynced = 0
    let lastFetchedDirection = null
    let lastFetchedSentAt = null
    let successfulAccountId = ''
    let lastErrorSnippet = ''

    const allFetchedMsgs = []

    // Tentar buscar mensagens usando candidateAccountIds até obter mensagens ou encontrar a conta certa
    for (let cIdx = 0; cIdx < candidateAccountIds.length; cIdx++) {
      const currentAccId = candidateAccountIds[cIdx]
      let msgCursor = ''
      let msgHasMore = true
      let msgPage = 0
      const MAX_MSG_PAGES = 3
      const currentAccMsgs = []
      let encounteredHttpError = false

      while (msgHasMore && msgPage < MAX_MSG_PAGES) {
        msgPage++
        try {
          let msgUrl =
            'https://zernio.com/api/v1/inbox/conversations/' +
            encodeURIComponent(zernioId) +
            '/messages?limit=100&sortOrder=desc&accountId=' +
            encodeURIComponent(currentAccId)

          if (msgCursor) {
            msgUrl += '&cursor=' + encodeURIComponent(msgCursor)
          }

          const msgRes = $http.send({
            url: msgUrl,
            method: 'GET',
            headers: {
              Authorization: 'Bearer ' + apiKey,
              'Content-Type': 'application/json',
              'User-Agent': 'Atendente-WhatsApp/1.0',
            },
            timeout: 10,
          })

          if (msgRes.statusCode >= 200 && msgRes.statusCode < 300) {
            const msgJson = msgRes.json || {}
            const pageMsgs = Array.isArray(msgJson.messages)
              ? msgJson.messages
              : Array.isArray(msgJson.data)
                ? msgJson.data
                : []
            for (let pm = 0; pm < pageMsgs.length; pm++) {
              currentAccMsgs.push(pageMsgs[pm])
            }

            const msgPagination = msgJson.pagination || {}
            if (msgPagination.hasMore && msgPagination.nextCursor) {
              msgCursor = msgPagination.nextCursor
            } else {
              msgHasMore = false
            }
          } else {
            encounteredHttpError = true
            lastErrorSnippet =
              'HTTP ' + msgRes.statusCode + ': ' + (msgRes.raw ? msgRes.raw.slice(0, 160) : '')
            console.log(
              'Aviso: busca sob demanda retornou HTTP ' +
                msgRes.statusCode +
                ' para conversa ' +
                zernioId +
                ' com conta ' +
                currentAccId +
                ': ' +
                (msgRes.raw ? msgRes.raw.slice(0, 160) : ''),
            )
            msgHasMore = false
          }
        } catch (pageErr) {
          lastErrorSnippet = pageErr.message
          console.log(
            'Aviso ao buscar página ' +
              msgPage +
              ' sob demanda da conversa ' +
              zernioId +
              ' com conta ' +
              currentAccId +
              ': ' +
              pageErr.message,
          )
          msgHasMore = false
        }
      }

      if (currentAccMsgs.length > 0) {
        successfulAccountId = currentAccId
        for (let m = 0; m < currentAccMsgs.length; m++) {
          allFetchedMsgs.push(currentAccMsgs[m])
        }
        // Se encontrou mensagens com essa conta, atualiza zernio_account_id na conversa para fixar a correta
        if (convRecord.getString('zernio_account_id') !== successfulAccountId) {
          try {
            convRecord.set('zernio_account_id', successfulAccountId)
            $app.save(convRecord)
          } catch (_) {}
        }
        break
      } else if (!encounteredHttpError && !successfulAccountId) {
        // A requisição foi 200 OK mas veio vazia nesta conta; guardamos como fallback se nenhuma outra tiver
        successfulAccountId = currentAccId
      }
    }

    if (allFetchedMsgs.length > 0) {
      const msgs = allFetchedMsgs.slice().reverse()
      const msgCol = $app.findCollectionByNameOrId('messages')

      for (let m = 0; m < msgs.length; m++) {
        try {
          const zMsg = msgs[m]
          const zMsgId = zMsg.id || zMsg.platformMessageId || zMsg.messageId || ''
          const platformMsgId =
            zMsg.platformMessageId ||
            (typeof zMsg.id === 'string' && zMsg.id.startsWith('wamid.') ? zMsg.id : '')
          if (!zMsgId && !platformMsgId) continue

          const isOutgoing =
            zMsg.direction === 'outgoing' ||
            zMsg.direction === 'out' ||
            zMsg.type === 'outgoing' ||
            zMsg.fromMe === true ||
            zMsg.from_me === true ||
            zMsg.isFromMe === true ||
            zMsg.sentVia === 'human' ||
            zMsg.sentVia === 'api' ||
            zMsg.sentVia === 'dashboard' ||
            zMsg.sentVia === 'phone' ||
            zMsg.sentVia === 'device' ||
            zMsg.senderType === 'user' ||
            zMsg.senderType === 'agent' ||
            zMsg.senderType === 'owner' ||
            (zMsg.sender && (zMsg.sender.isMe === true || zMsg.sender.fromMe === true)) ||
            (participantId &&
              zMsg.sender &&
              zMsg.sender.id &&
              zMsg.sender.id !== participantId &&
              !zMsg.sender.id.includes(participantId))
          const dir = isOutgoing ? 'out' : 'in'

          const rawMsgTime = zMsg.createdAt || zMsg.sentAt || zMsg.timestamp || now
          let msgSentAt = rawMsgTime
          try {
            if (typeof rawMsgTime === 'number') {
              msgSentAt = new Date(rawMsgTime > 1e11 ? rawMsgTime : rawMsgTime * 1000).toISOString()
            } else if (rawMsgTime) {
              const md = new Date(rawMsgTime)
              msgSentAt = !isNaN(md.getTime()) ? md.toISOString() : now
            }
          } catch (_) {
            msgSentAt = now
          }

          lastFetchedDirection = dir
          lastFetchedSentAt = msgSentAt

          let extractedText = ''
          if (typeof zMsg.message === 'string' && zMsg.message.trim()) {
            extractedText = zMsg.message.trim()
          } else if (typeof zMsg.text === 'string' && zMsg.text.trim()) {
            extractedText = zMsg.text.trim()
          } else if (typeof zMsg.body === 'string' && zMsg.body.trim()) {
            extractedText = zMsg.body.trim()
          } else if (typeof zMsg.content === 'string' && zMsg.content.trim()) {
            extractedText = zMsg.content.trim()
          } else if (typeof zMsg.caption === 'string' && zMsg.caption.trim()) {
            extractedText = zMsg.caption.trim()
          } else if (zMsg.message && typeof zMsg.message === 'object') {
            extractedText = (
              zMsg.message.text ||
              zMsg.message.body ||
              zMsg.message.caption ||
              zMsg.message.conversation ||
              ''
            ).trim()
          } else if (zMsg.text && typeof zMsg.text === 'object') {
            extractedText = (zMsg.text.body || zMsg.text.message || '').trim()
          }

          if (
            !extractedText &&
            (zMsg.contacts ||
              zMsg.contact ||
              zMsg.vcard ||
              zMsg.type === 'contact' ||
              zMsg.type === 'contacts')
          ) {
            const cList = Array.isArray(zMsg.contacts)
              ? zMsg.contacts
              : zMsg.contact
                ? [zMsg.contact]
                : []
            if (cList.length > 0 && cList[0]) {
              const cItem = cList[0]
              const cName =
                (cItem.name &&
                  (cItem.name.formatted_name || cItem.name.first_name || cItem.name)) ||
                cItem.formatted_name ||
                cItem.displayName ||
                'Contato'
              const cPhone =
                Array.isArray(cItem.phones) && cItem.phones[0]
                  ? cItem.phones[0].phone || cItem.phones[0].wa_id || ''
                  : cItem.phone || ''
              extractedText = '👤 ' + cName + (cPhone ? ' (' + cPhone + ')' : '')
            } else {
              extractedText = '👤 Contato compartilhado'
            }
          }

          const msgType = (zMsg.type || zMsg.messageType || '').toLowerCase()
          const attachments = Array.isArray(zMsg.attachments)
            ? zMsg.attachments
            : zMsg.attachment
              ? [zMsg.attachment]
              : []
          const hasAttachments = attachments.length > 0

          let convMsgFileName = ''
          if (hasAttachments) {
            const a0 = attachments[0] || {}
            convMsgFileName = a0.filename || a0.fileName || a0.name || a0.title || ''
          }
          if (!convMsgFileName && zMsg.document && typeof zMsg.document === 'object') {
            convMsgFileName =
              zMsg.document.filename || zMsg.document.fileName || zMsg.document.name || ''
          }

          let fallbackLabel = ''
          if (msgType === 'image' || zMsg.image) {
            fallbackLabel = '📷 Imagem'
          } else if (
            msgType === 'audio' ||
            msgType === 'voice' ||
            msgType === 'ptt' ||
            zMsg.audio ||
            zMsg.voice
          ) {
            fallbackLabel = '🎵 Áudio'
          } else if (msgType === 'video' || zMsg.video) {
            fallbackLabel = '🎥 Vídeo'
          } else if (msgType === 'document' || msgType === 'file' || zMsg.document) {
            fallbackLabel = convMsgFileName || '📄 Documento'
          } else if (msgType === 'sticker' || zMsg.sticker) {
            fallbackLabel = '🏷️ Figurinha'
          } else if (msgType === 'location' || zMsg.location) {
            fallbackLabel = '📍 Localização'
          } else if (msgType === 'reaction' || zMsg.reaction) {
            fallbackLabel = '[Reação]'
          } else if (hasAttachments) {
            const att0 = attachments[0] || {}
            const attType = (att0.type || att0.mimeType || att0.contentType || '').toLowerCase()
            if (attType.indexOf('image') !== -1) {
              fallbackLabel = '📷 Imagem'
            } else if (attType.indexOf('audio') !== -1 || attType.indexOf('ogg') !== -1) {
              fallbackLabel = '🎵 Áudio'
            } else if (attType.indexOf('video') !== -1) {
              fallbackLabel = '🎥 Vídeo'
            } else {
              fallbackLabel = convMsgFileName || '📎 Anexo'
            }
          } else if (isOutgoing) {
            fallbackLabel = 'Mensagem enviada'
          } else {
            fallbackLabel = 'Mensagem recebida'
          }

          let msgBody = extractedText || fallbackLabel
          if (!msgBody || !msgBody.trim()) {
            msgBody = isOutgoing ? 'Mensagem enviada' : 'Mensagem recebida'
          }
          msgBody = msgBody.trim()

          let existingMsg = null
          if (zMsgId) {
            try {
              const mFilter = authUserId
                ? "zernio_id = '" + zMsgId + "' && user = '" + authUserId + "'"
                : "zernio_id = '" + zMsgId + "'"
              const foundM = $app.findRecordsByFilter('messages', mFilter, '-created', 1, 0)
              if (foundM && foundM.length > 0) existingMsg = foundM[0]
            } catch (_) {}
          }
          if (!existingMsg && platformMsgId && platformMsgId !== zMsgId) {
            try {
              const pmFilter = authUserId
                ? "zernio_id = '" + platformMsgId + "' && user = '" + authUserId + "'"
                : "zernio_id = '" + platformMsgId + "'"
              const foundPM = $app.findRecordsByFilter('messages', pmFilter, '-created', 1, 0)
              if (foundPM && foundPM.length > 0) existingMsg = foundPM[0]
            } catch (_) {}
          }

          if (!existingMsg && convRecord && convRecord.id && msgBody) {
            try {
              const cleanBody = String(msgBody).replace(/'/g, "\\'")
              const recentCandidates = $app.findRecordsByFilter(
                'messages',
                "conversation = '" +
                  convRecord.id +
                  "' && direction = '" +
                  dir +
                  "' && body = '" +
                  cleanBody +
                  "'",
                '-sent_at',
                5,
                0,
              )
              const incomingMs = new Date(msgSentAt).getTime()
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

          // Extração de dados de mídia (URL, tipo, áudio) e transcrição
          let detectedMediaUrl = ''
          let detectedMediaType = ''
          let detectedTranscription = ''

          if (hasAttachments) {
            const att0 = attachments[0] || {}
            detectedMediaUrl = att0.url || att0.refreshUrl || att0.previewUrl || ''
            detectedMediaType = (att0.type || att0.mimeType || att0.contentType || '').toLowerCase()
            if (att0.transcription || att0.transcript || att0.text) {
              detectedTranscription = (
                att0.transcription ||
                att0.transcript ||
                att0.text ||
                ''
              ).trim()
            }
          }
          if (!detectedMediaUrl) {
            if (zMsg.document && typeof zMsg.document === 'object') {
              detectedMediaUrl = zMsg.document.url || zMsg.document.link || ''
              if (!detectedMediaType) detectedMediaType = 'file'
            } else if (zMsg.file && typeof zMsg.file === 'object') {
              detectedMediaUrl = zMsg.file.url || zMsg.file.link || ''
              if (!detectedMediaType) detectedMediaType = 'file'
            } else if (zMsg.image && typeof zMsg.image === 'object') {
              detectedMediaUrl = zMsg.image.url || zMsg.image.link || ''
              if (!detectedMediaType) detectedMediaType = 'image'
            } else if (zMsg.audio && typeof zMsg.audio === 'object') {
              detectedMediaUrl = zMsg.audio.url || zMsg.audio.link || ''
              if (!detectedMediaType) detectedMediaType = 'audio'
              if (zMsg.audio.transcription || zMsg.audio.transcript) {
                detectedTranscription = (
                  zMsg.audio.transcription ||
                  zMsg.audio.transcript ||
                  ''
                ).trim()
              }
            } else if (zMsg.voice && typeof zMsg.voice === 'object') {
              detectedMediaUrl = zMsg.voice.url || zMsg.voice.link || ''
              if (!detectedMediaType) detectedMediaType = 'audio'
              if (zMsg.voice.transcription || zMsg.voice.transcript) {
                detectedTranscription = (
                  zMsg.voice.transcription ||
                  zMsg.voice.transcript ||
                  ''
                ).trim()
              }
            } else if (typeof zMsg.audio === 'string' && zMsg.audio.startsWith('http')) {
              detectedMediaUrl = zMsg.audio
              if (!detectedMediaType) detectedMediaType = 'audio'
            } else if (typeof zMsg.document === 'string' && zMsg.document.startsWith('http')) {
              detectedMediaUrl = zMsg.document
              if (!detectedMediaType) detectedMediaType = 'file'
            } else if (typeof zMsg.image === 'string' && zMsg.image.startsWith('http')) {
              detectedMediaUrl = zMsg.image
              if (!detectedMediaType) detectedMediaType = 'image'
            }
          }

          if (!detectedMediaType) {
            if (
              fallbackLabel === '🎵 Áudio' ||
              msgType === 'audio' ||
              msgType === 'voice' ||
              msgType === 'ptt'
            ) {
              detectedMediaType = 'audio'
            } else if (
              fallbackLabel === '📄 Documento' ||
              msgType === 'document' ||
              msgType === 'file'
            ) {
              detectedMediaType = 'file'
            } else if (fallbackLabel === '📷 Imagem' || msgType === 'image') {
              detectedMediaType = 'image'
            }
          }

          if (!detectedTranscription) {
            if (typeof zMsg.transcription === 'string' && zMsg.transcription.trim()) {
              detectedTranscription = zMsg.transcription.trim()
            } else if (typeof zMsg.transcript === 'string' && zMsg.transcript.trim()) {
              detectedTranscription = zMsg.transcript.trim()
            }
          }

          const effectiveMsgId = platformMsgId || zMsgId

          if (!existingMsg) {
            try {
              const newMsg = new Record(msgCol)
              newMsg.set('user', authUserId)
              newMsg.set('zernio_id', effectiveMsgId)
              newMsg.set('conversation', convRecord.id)
              newMsg.set('direction', dir)
              newMsg.set(
                'body',
                msgBody || (dir === 'out' ? 'Mensagem enviada' : 'Mensagem recebida'),
              )
              newMsg.set('sent_at', msgSentAt)
              if (detectedMediaUrl) {
                newMsg.set('media_url', detectedMediaUrl)
              }
              if (detectedMediaType) {
                newMsg.set('media_type', detectedMediaType)
              }
              if (detectedTranscription) {
                newMsg.set('transcription', detectedTranscription)
              }
              $app.save(newMsg)
              messagesSynced++
            } catch (saveErr) {
              console.log('Aviso ao salvar mensagem sob demanda: ' + saveErr.message)
            }
          } else {
            let shouldUpdate = false
            if (
              effectiveMsgId &&
              (!existingMsg.getString('zernio_id') ||
                (!existingMsg.getString('zernio_id').startsWith('wamid.') &&
                  effectiveMsgId.startsWith('wamid.')))
            ) {
              existingMsg.set('zernio_id', effectiveMsgId)
              shouldUpdate = true
            }
            if (msgSentAt && existingMsg.getString('sent_at') !== msgSentAt) {
              existingMsg.set('sent_at', msgSentAt)
              shouldUpdate = true
            }
            const currentExistingBody = (existingMsg.getString('body') || '').trim()
            if (!currentExistingBody && msgBody) {
              existingMsg.set('body', msgBody)
              shouldUpdate = true
            }
            if (detectedMediaUrl && existingMsg.getString('media_url') !== detectedMediaUrl) {
              existingMsg.set('media_url', detectedMediaUrl)
              shouldUpdate = true
            }
            if (detectedMediaType && existingMsg.getString('media_type') !== detectedMediaType) {
              existingMsg.set('media_type', detectedMediaType)
              shouldUpdate = true
            }
            if (
              detectedTranscription &&
              existingMsg.getString('transcription') !== detectedTranscription
            ) {
              existingMsg.set('transcription', detectedTranscription)
              shouldUpdate = true
            }
            if (shouldUpdate) {
              try {
                $app.save(existingMsg)
              } catch (_) {}
            }
          }
        } catch (msgErr) {
          console.log('Aviso ao iterar mensagem sob demanda: ' + msgErr.message)
        }
      }
    }

    // Atualiza direção e status da conversa se aplicável
    if (convRecord) {
      try {
        if (lastFetchedDirection === 'out') {
          convRecord.set('last_direction', 'out')
          convRecord.set('status', 'acompanhamento')
          if (lastFetchedSentAt && !convRecord.getString('responded_at')) {
            convRecord.set('responded_at', lastFetchedSentAt)
          }
        } else if (lastFetchedDirection === 'in') {
          convRecord.set('last_direction', 'in')
          const dateObj = new Date(lastFetchedSentAt || now)
          const hour = dateObj.getHours()
          if (hour >= 22 || hour < 6) {
            convRecord.set('status', 'madrugada')
          } else {
            convRecord.set('status', 'sem_resposta')
          }
          convRecord.set('responded_at', '')
        }
        $app.save(convRecord)
      } catch (_) {}
    }

    const hadMessages = allFetchedMsgs.length > 0
    return e.json(200, {
      success: true,
      conversationId: conversationId,
      messagesSynced: messagesSynced,
      totalFetched: allFetchedMsgs.length,
      accountIdUsed: successfulAccountId,
      lastError: hadMessages ? '' : lastErrorSnippet,
      message:
        messagesSynced > 0
          ? 'Sincronizadas ' + messagesSynced + ' mensagens da conversa.'
          : hadMessages
            ? 'Mensagens já estavam atualizadas.'
            : lastErrorSnippet
              ? 'Falha ao consultar Zernio: ' + lastErrorSnippet
              : 'Nenhuma nova mensagem encontrada na Zernio.',
    })
  },
  $apis.requireAuth(),
)
