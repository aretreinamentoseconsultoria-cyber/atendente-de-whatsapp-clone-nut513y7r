routerAdd(
  'POST',
  '/backend/v1/zernio/sync',
  (e) => {
    // Identificar o usuário solicitante (autenticado via $apis.requireAuth())
    const authUser = e.auth
    const authUserId = authUser ? authUser.id : ''
    const authEmail = authUser ? authUser.getString('email') : ''

    // Localizar app_settings do usuário atual
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

    // Secret global ZERNIO_API_KEY só é acessível estritamente para o dono principal (fabiano@adapta.org)
    // Usuários demo ou novos sem chave própria NUNCA usam o secret global
    const isOwner = authEmail === 'fabiano@adapta.org'
    const userApiKey = settingsRecord
      ? (settingsRecord.getString('zernio_api_key') || '').trim()
      : ''
    const rawApiKey = ($secrets.get('ZERNIO_API_KEY') || $os.getenv('ZERNIO_API_KEY') || '').trim()
    const apiKey = userApiKey || (isOwner ? rawApiKey : '')

    // Conta demo (videos@adapta.org) nunca executa sync real na API da Zernio
    if (authEmail === 'videos@adapta.org') {
      return e.json(200, {
        success: true,
        message: 'Conta demo: sincronização simulada mantendo dados de exemplo intactos.',
        conversationsSynced: 12,
        messagesSynced: 0,
        failedItems: 0,
        isPartial: false,
        errors: [],
      })
    }

    // Allow accountId to come optionally from request body to sync a specific number
    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    const requestedAccountId = (reqBody.accountId || '').trim()
    const fallbackDefaultAccountId = settingsRecord
      ? (settingsRecord.getString('zernio_account_id') || '').trim()
      : ''

    if (!apiKey) {
      return e.json(400, {
        success: false,
        code: 'MISSING_API_KEY',
        message:
          'Nenhuma integração WhatsApp configurada para esta conta. Conecte sua conta Zernio nas Configurações.',
      })
    }

    // Descobrir contas conectadas caso não seja especificada uma para sincronizar
    let targetAccountIds = []
    if (requestedAccountId) {
      targetAccountIds.push(requestedAccountId)
    } else {
      try {
        const accRes = $http.send({
          url: 'https://zernio.com/api/v1/accounts',
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'Atendente-WhatsApp/1.0',
          },
          timeout: 10,
        })
        if (accRes.statusCode >= 200 && accRes.statusCode < 300) {
          const accJson = accRes.json || {}
          const accList = Array.isArray(accJson.accounts) ? accJson.accounts : []
          for (let a = 0; a < accList.length; a++) {
            const accObj = accList[a]
            if (accObj._id && (accObj.platform === 'whatsapp' || !accObj.platform)) {
              targetAccountIds.push(accObj._id)
            }
          }
        }
      } catch (accErr) {
        console.log('Aviso ao consultar contas para sync: ' + accErr.message)
      }
    }

    let zernioConversations = []
    const seenConvIds = {}

    // Função inline para buscar conversas de um queryParams com suporte a paginação por cursor
    const fetchConversations = (baseParams) => {
      let cursor = ''
      let hasMore = true
      let page = 0
      const maxPages = 20

      while (hasMore && page < maxPages) {
        page++
        let queryUrl = 'https://zernio.com/api/v1/inbox/conversations?' + baseParams
        if (cursor) {
          queryUrl += '&cursor=' + encodeURIComponent(cursor)
        }

        try {
          const res = $http.send({
            url: queryUrl,
            method: 'GET',
            headers: {
              Authorization: 'Bearer ' + apiKey,
              'Content-Type': 'application/json',
              'User-Agent': 'Atendente-WhatsApp/1.0',
            },
            timeout: 20,
          })

          if (res.statusCode >= 200 && res.statusCode < 300) {
            const bodyJson = res.json || {}
            const items = Array.isArray(bodyJson.data)
              ? bodyJson.data
              : Array.isArray(bodyJson.conversations)
                ? bodyJson.conversations
                : []

            for (let k = 0; k < items.length; k++) {
              const it = items[k]
              if (it && it.id && !seenConvIds[it.id]) {
                seenConvIds[it.id] = true
                zernioConversations.push(it)
              }
            }

            const pagination = bodyJson.pagination || {}
            if (pagination.hasMore && pagination.nextCursor) {
              cursor = pagination.nextCursor
            } else {
              hasMore = false
            }
          } else {
            console.log(
              'Aviso ao consultar conversas (HTTP ' +
                res.statusCode +
                ' ' +
                baseParams +
                '): ' +
                (res.raw ? res.raw.slice(0, 160) : ''),
            )
            hasMore = false
          }
        } catch (err) {
          console.log('Aviso ao consultar conversas (' + baseParams + '): ' + err.message)
          hasMore = false
        }
      }
    }

    // 1. Se houver contas/números específicos identificados, busca prioritariamente por accountId (garante accountId em cada item)
    if (targetAccountIds.length > 0) {
      for (let t = 0; t < targetAccountIds.length; t++) {
        const accParam = encodeURIComponent(targetAccountIds[t])
        fetchConversations('platform=whatsapp&limit=100&sortOrder=desc&accountId=' + accParam)
        fetchConversations(
          'platform=whatsapp&status=active&limit=100&sortOrder=desc&accountId=' + accParam,
        )
      }
    }

    // 2. Busca geral (todas as conversas da conta Zernio - status active e archived)
    fetchConversations('platform=whatsapp&limit=100&sortOrder=desc')
    fetchConversations('platform=whatsapp&status=active&limit=100&sortOrder=desc')
    fetchConversations('platform=whatsapp&status=archived&limit=100&sortOrder=desc')

    // 3. Buscar contatos na Zernio via GET /v1/contacts para mapear fotos de perfil (avatars)
    const contactAvatarMap = {}
    const phoneAvatarMap = {}

    const fetchContactsForQuery = (queryParams) => {
      let skip = 0
      const limit = 100
      let hasMore = true
      let pages = 0

      while (hasMore && pages < 5) {
        pages++
        try {
          const cRes = $http.send({
            url:
              'https://zernio.com/api/v1/contacts?' +
              queryParams +
              '&limit=' +
              limit +
              '&skip=' +
              skip,
            method: 'GET',
            headers: {
              Authorization: 'Bearer ' + apiKey,
              'Content-Type': 'application/json',
              'User-Agent': 'Atendente-WhatsApp/1.0',
            },
            timeout: 15,
          })

          if (cRes.statusCode >= 200 && cRes.statusCode < 300) {
            const cJson = cRes.json || {}
            const contactsList = Array.isArray(cJson.contacts)
              ? cJson.contacts
              : Array.isArray(cJson.data)
                ? cJson.data
                : []

            for (let c = 0; c < contactsList.length; c++) {
              const ct = contactsList[c]
              if (!ct) continue
              const av = (ct.avatarUrl || ct.avatar || ct.picture || '').trim()
              if (!av) continue

              if (ct.id && !contactAvatarMap[ct.id]) {
                contactAvatarMap[ct.id] = av
              }
              if (ct.contactId && !contactAvatarMap[ct.contactId]) {
                contactAvatarMap[ct.contactId] = av
              }
              if (ct.platformIdentifier) {
                const cleanIdent = String(ct.platformIdentifier).replace(/[^0-9]/g, '')
                if (cleanIdent && !phoneAvatarMap[cleanIdent]) {
                  phoneAvatarMap[cleanIdent] = av
                }
              }
              if (ct.displayIdentifier) {
                const cleanDisplay = String(ct.displayIdentifier).replace(/[^0-9]/g, '')
                if (cleanDisplay && !phoneAvatarMap[cleanDisplay]) {
                  phoneAvatarMap[cleanDisplay] = av
                }
              }
            }

            const pagination = cJson.pagination || {}
            if (contactsList.length < limit || pagination.hasMore === false) {
              hasMore = false
            } else {
              skip += limit
            }
          } else {
            hasMore = false
          }
        } catch (cErr) {
          console.log(
            'Aviso ao consultar contatos da Zernio (' + queryParams + '): ' + cErr.message,
          )
          hasMore = false
        }
      }
    }

    if (targetAccountIds.length > 0) {
      for (let ta = 0; ta < targetAccountIds.length; ta++) {
        fetchContactsForQuery(
          'platform=whatsapp&accountId=' + encodeURIComponent(targetAccountIds[ta]),
        )
      }
    }
    fetchContactsForQuery('platform=whatsapp')

    const resolvePhoneAvatar = (rawPhone) => {
      if (!rawPhone) return ''
      const clean = String(rawPhone).replace(/[^0-9]/g, '')
      if (!clean) return ''
      if (phoneAvatarMap[clean]) return phoneAvatarMap[clean]
      if (clean.length >= 8) {
        const last8 = clean.slice(-8)
        const keys = Object.keys(phoneAvatarMap)
        for (let k = 0; k < keys.length; k++) {
          if (keys[k].endsWith(last8)) {
            return phoneAvatarMap[keys[k]]
          }
        }
      }
      return ''
    }

    let conversationsSynced = 0
    let messagesSynced = 0
    let failedItems = 0
    const now = new Date().toISOString()
    const syncErrors = []

    // Proteção de tempo e processamento progressivo em lote:
    // Permite buscar mensagens de muito mais conversas sem risco de timeout no hook.
    const syncStartTime = Date.now()
    const MAX_EXECUTION_TIME_MS = 25000 // 25s máximo para deixar margem antes de timeout do proxy
    const MAX_CONVERSATIONS_PER_SYNC = 150 // Eleva significativamente o teto para sincronização profunda de mensagens

    // Identificar conversas locais no banco que já têm mensagens para priorizar as que NÃO têm
    const localConvsWithMessages = {}
    try {
      const convUserFilter = authUserId ? "user = '" + authUserId + "'" : '1=1'
      // Consultar mensagens do usuário para ver quais conversas já possuem histórico
      const existingMsgs = $app.findRecordsByFilter('messages', convUserFilter, '-created', 5000, 0)
      for (let em = 0; em < existingMsgs.length; em++) {
        const convRel = existingMsgs[em].getString('conversation')
        if (convRel) {
          localConvsWithMessages[convRel] = true
        }
      }
    } catch (chkErr) {
      console.log('Aviso ao mapear mensagens locais existentes: ' + chkErr.message)
    }

    const processedConvIds = {}

    for (let i = 0; i < zernioConversations.length; i++) {
      const item = zernioConversations[i]
      const zernioId = item.id || ''
      if (!zernioId) continue

      // Extração robusta do telefone / participante
      const rawParticipantId =
        item.participantId ||
        item.phone ||
        (item.contact && (item.contact.phone || item.contact.id)) ||
        ''
      const participantId = (rawParticipantId ? String(rawParticipantId) : zernioId).trim()

      let participantName = item.participantName || item.displayName || item.contactName || ''
      if (!participantName) {
        participantName = participantId || 'Contato WhatsApp'
      }

      let participantPicture =
        item.participantPicture ||
        item.participantPhoto ||
        item.avatar ||
        item.avatarUrl ||
        (item.contact && (item.contact.picture || item.contact.avatar || item.contact.photo)) ||
        ''

      const itemContactId = item.contactId || (item.contact && item.contact.id) || ''
      if (!participantPicture && itemContactId && contactAvatarMap[itemContactId]) {
        participantPicture = contactAvatarMap[itemContactId]
      }
      if (!participantPicture && participantId) {
        participantPicture = resolvePhoneAvatar(participantId)
      }

      const lastMessageText = item.lastMessage || 'Conversa iniciada'
      const rawUpdatedTime = item.updatedTime || item.lastMessageAt || item.updatedAt || now
      let updatedTime = rawUpdatedTime
      try {
        if (typeof rawUpdatedTime === 'number') {
          updatedTime = new Date(
            rawUpdatedTime > 1e11 ? rawUpdatedTime : rawUpdatedTime * 1000,
          ).toISOString()
        } else if (rawUpdatedTime) {
          const d = new Date(rawUpdatedTime)
          if (!isNaN(d.getTime())) {
            updatedTime = d.toISOString()
          } else {
            updatedTime = now
          }
        }
      } catch (_) {
        updatedTime = now
      }

      const unreadCount = item.unreadCount || 0

      // Resolução em cascata do accountId para esta conversa
      let resolvedAccountId = (
        item.accountId ||
        requestedAccountId ||
        fallbackDefaultAccountId ||
        (targetAccountIds.length === 1 ? targetAccountIds[0] : '')
      ).trim()

      let convRecord = null
      try {
        // Find existing conversation in DB for THIS user
        const userFilter = authUserId ? " && user = '" + authUserId + "'" : ''
        try {
          const matchZernio = $app.findRecordsByFilter(
            'conversations',
            "zernio_id = '" + zernioId + "'" + userFilter,
            '-created',
            1,
            0,
          )
          if (matchZernio && matchZernio.length > 0) {
            convRecord = matchZernio[0]
          }
        } catch (_) {}

        if (!convRecord && participantId) {
          try {
            if (resolvedAccountId) {
              const existingSameAcc = $app.findRecordsByFilter(
                'conversations',
                "phone = '" +
                  participantId +
                  "' && zernio_account_id = '" +
                  resolvedAccountId +
                  "'" +
                  userFilter,
                '-created',
                1,
                0,
              )
              if (existingSameAcc && existingSameAcc.length > 0) {
                convRecord = existingSameAcc[0]
              }
            }
            if (!convRecord) {
              const existingAny = $app.findRecordsByFilter(
                'conversations',
                "phone = '" +
                  participantId +
                  "' && (zernio_id = '' || zernio_id = '" +
                  zernioId +
                  "')" +
                  userFilter,
                '-created',
                1,
                0,
              )
              if (existingAny && existingAny.length > 0) {
                convRecord = existingAny[0]
              }
            }
          } catch (_) {}
        }

        // Se o registro existente já tiver zernio_account_id, adote-o caso ainda não tenhamos
        if (convRecord && !resolvedAccountId) {
          resolvedAccountId = (convRecord.getString('zernio_account_id') || '').trim()
        }

        // Se ainda não tivermos resolvedAccountId e só houver uma conta na lista de targetAccountIds
        if (!resolvedAccountId && targetAccountIds.length > 0) {
          resolvedAccountId = targetAccountIds[0]
        }

        const isNew = !convRecord
        if (isNew) {
          const convCol = $app.findCollectionByNameOrId('conversations')
          convRecord = new Record(convCol)
          if (authUserId) {
            convRecord.set('user', authUserId)
          }
          convRecord.set('zernio_id', zernioId)
          if (resolvedAccountId) {
            convRecord.set('zernio_account_id', resolvedAccountId)
          }
          convRecord.set('name', participantName || 'Contato WhatsApp')
          convRecord.set('phone', participantId || zernioId)
          convRecord.set('status', unreadCount > 0 ? 'sem_resposta' : 'acompanhamento')
          convRecord.set('last_direction', unreadCount > 0 ? 'in' : 'out')
          convRecord.set('last_message_at', updatedTime)
          convRecord.set('summary', lastMessageText)
          convRecord.set('intent', 'Contato via WhatsApp')
          convRecord.set('temperature', 'quente')
          convRecord.set('next_action', 'Analisar mensagem recente e responder.')
        } else {
          if (authUserId && !convRecord.getString('user')) {
            convRecord.set('user', authUserId)
          }
          if (!convRecord.getString('zernio_id')) {
            convRecord.set('zernio_id', zernioId)
          }
          if (resolvedAccountId && !convRecord.getString('zernio_account_id')) {
            convRecord.set('zernio_account_id', resolvedAccountId)
          }
          const currentName = convRecord.getString('name')
          const isCurrentNumeric = /^\+?[0-9]{8,16}$/.test(currentName.replace(/\s+/g, ''))
          const isNewNumeric = /^\+?[0-9]{8,16}$/.test(participantName.replace(/\s+/g, ''))
          if (participantName && (!currentName || (isCurrentNumeric && !isNewNumeric))) {
            convRecord.set('name', participantName)
          }
          if (!convRecord.getString('phone') && participantId) {
            convRecord.set('phone', participantId)
          }
          if (lastMessageText) {
            convRecord.set('summary', lastMessageText)
          }
          // Garantir campos obrigatórios caso preexistissem em branco
          if (!convRecord.getString('status')) {
            convRecord.set('status', 'acompanhamento')
          }
          if (!convRecord.getString('last_direction')) {
            convRecord.set('last_direction', 'out')
          }
        }

        if (participantPicture) {
          convRecord.set('avatar_url', participantPicture)
        } else if (!convRecord.getString('avatar_url')) {
          const fallbackAv = resolvePhoneAvatar(convRecord.getString('phone'))
          if (fallbackAv) {
            convRecord.set('avatar_url', fallbackAv)
          }
        }

        convRecord.set('last_message_at', updatedTime)
        $app.save(convRecord)
        conversationsSynced++
        if (convRecord.id) {
          processedConvIds[convRecord.id] = true
        }
      } catch (saveErr) {
        failedItems++
        const errDetail =
          'Conversa ' +
          (participantName || zernioId) +
          ' (' +
          zernioId +
          '): ' +
          (saveErr.message || String(saveErr))
        console.log('Falha ao salvar conversa Zernio: ' + errDetail)
        if (syncErrors.length < 5) {
          syncErrors.push(errDetail)
        }
        continue
      }

      // Sincronizar histórico detalhado de mensagens
      let lastFetchedDirection = null
      let lastFetchedSentAt = null

      const isBeyondTimeLimit = Date.now() - syncStartTime > MAX_EXECUTION_TIME_MS
      const hasReachedBatchLimit = i >= MAX_CONVERSATIONS_PER_SYNC
      const hasLocalMessages =
        convRecord && convRecord.id && Boolean(localConvsWithMessages[convRecord.id])

      // Priorização inteligente:
      // 1. Sempre tenta buscar para conversas sem mensagens locais (enquanto houver margem de tempo)
      // 2. Para conversas que já têm mensagens locais, busca até o limite da fatia da execução
      const shouldFetchMessages =
        !isBeyondTimeLimit &&
        (!hasLocalMessages || !hasReachedBatchLimit) &&
        convRecord &&
        convRecord.id

      if (shouldFetchMessages) {
        // Lista de contas candidatas para buscar as mensagens
        const syncAccCandidates = []
        if (resolvedAccountId) syncAccCandidates.push(resolvedAccountId)
        for (let ta = 0; ta < targetAccountIds.length; ta++) {
          if (!syncAccCandidates.includes(targetAccountIds[ta])) {
            syncAccCandidates.push(targetAccountIds[ta])
          }
        }

        if (syncAccCandidates.length === 0) {
          const missingMsg =
            'Conversa ' +
            (participantName || zernioId) +
            ': busca de mensagens ignorada pois nenhum accountId foi identificado.'
          console.log(missingMsg)
          if (syncErrors.length < 5) {
            syncErrors.push(missingMsg)
          }
        } else {
          // Loop de busca testando as contas candidatas
          const allFetchedMsgs = []
          for (let sAccIdx = 0; sAccIdx < syncAccCandidates.length; sAccIdx++) {
            const accToTry = syncAccCandidates[sAccIdx]
            let msgCursor = ''
            let msgHasMore = true
            let msgPage = 0
            const MAX_MSG_PAGES = 3
            const candidateMsgs = []

            while (msgHasMore && msgPage < MAX_MSG_PAGES) {
              msgPage++
              try {
                let msgUrl =
                  'https://zernio.com/api/v1/inbox/conversations/' +
                  encodeURIComponent(zernioId) +
                  '/messages?limit=100&sortOrder=desc&accountId=' +
                  encodeURIComponent(accToTry)

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
                  timeout: 8,
                })

                if (msgRes.statusCode >= 200 && msgRes.statusCode < 300) {
                  const msgJson = msgRes.json || {}
                  const pageMsgs = Array.isArray(msgJson.messages)
                    ? msgJson.messages
                    : Array.isArray(msgJson.data)
                      ? msgJson.data
                      : []
                  for (let pm = 0; pm < pageMsgs.length; pm++) {
                    candidateMsgs.push(pageMsgs[pm])
                  }

                  const msgPagination = msgJson.pagination || {}
                  if (msgPagination.hasMore && msgPagination.nextCursor) {
                    msgCursor = msgPagination.nextCursor
                  } else {
                    msgHasMore = false
                  }
                } else {
                  msgHasMore = false
                }
              } catch (pageErr) {
                msgHasMore = false
              }
            }

            if (candidateMsgs.length > 0) {
              for (let cm = 0; cm < candidateMsgs.length; cm++) {
                allFetchedMsgs.push(candidateMsgs[cm])
              }
              if (convRecord.getString('zernio_account_id') !== accToTry) {
                try {
                  convRecord.set('zernio_account_id', accToTry)
                  $app.save(convRecord)
                } catch (_) {}
              }
              break
            }
          }

          if (allFetchedMsgs.length > 0) {
            // sortOrder=desc traz as mensagens mais recentes primeiro na API da Zernio.
            // Invertemos para ordem cronológica (antigas -> recentes) para iterar do início ao fim
            // e garantir que a última mensagem defina o lastFetchedDirection e lastFetchedSentAt.
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
                    msgSentAt = new Date(
                      rawMsgTime > 1e11 ? rawMsgTime : rawMsgTime * 1000,
                    ).toISOString()
                  } else if (rawMsgTime) {
                    const md = new Date(rawMsgTime)
                    msgSentAt = !isNaN(md.getTime()) ? md.toISOString() : now
                  }
                } catch (_) {
                  msgSentAt = now
                }

                lastFetchedDirection = dir
                lastFetchedSentAt = msgSentAt

                // Extração profunda e segura do conteúdo da mensagem
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

                // Suporte a contatos compartilhados (vCard / contact array)
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

                // Suporte a mídias, áudios, imagens, documentos, stickers e localização
                const msgType = (zMsg.type || zMsg.messageType || '').toLowerCase()
                const attachments = Array.isArray(zMsg.attachments)
                  ? zMsg.attachments
                  : zMsg.attachment
                    ? [zMsg.attachment]
                    : []
                const hasAttachments = attachments.length > 0

                let syncFileName = ''
                if (hasAttachments) {
                  const a0 = attachments[0] || {}
                  syncFileName = a0.filename || a0.fileName || a0.name || a0.title || ''
                }
                if (!syncFileName && zMsg.document && typeof zMsg.document === 'object') {
                  syncFileName =
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
                  fallbackLabel = syncFileName || '📄 Documento'
                } else if (msgType === 'sticker' || zMsg.sticker) {
                  fallbackLabel = '🏷️ Figurinha'
                } else if (msgType === 'location' || zMsg.location) {
                  fallbackLabel = '📍 Localização'
                } else if (msgType === 'reaction' || zMsg.reaction) {
                  fallbackLabel = '[Reação]'
                } else if (hasAttachments) {
                  const att0 = attachments[0] || {}
                  const attType = (
                    att0.type ||
                    att0.mimeType ||
                    att0.contentType ||
                    ''
                  ).toLowerCase()
                  if (attType.indexOf('image') !== -1) {
                    fallbackLabel = '📷 Imagem'
                  } else if (attType.indexOf('audio') !== -1 || attType.indexOf('ogg') !== -1) {
                    fallbackLabel = '🎵 Áudio'
                  } else if (attType.indexOf('video') !== -1) {
                    fallbackLabel = '🎥 Vídeo'
                  } else {
                    fallbackLabel = syncFileName || '📎 Anexo'
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

                // Deduplicação semântica
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

                // 1. Extração da URL da mídia
                if (hasAttachments) {
                  const att0 = attachments[0] || {}
                  detectedMediaUrl = att0.url || att0.refreshUrl || att0.previewUrl || ''
                  detectedMediaType = (
                    att0.type ||
                    att0.mimeType ||
                    att0.contentType ||
                    ''
                  ).toLowerCase()
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
                  } else if (
                    typeof zMsg.document === 'string' &&
                    zMsg.document.startsWith('http')
                  ) {
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
                    if (authUserId) {
                      newMsg.set('user', authUserId)
                    } else if (convRecord.getString('user')) {
                      newMsg.set('user', convRecord.getString('user'))
                    }
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
                    if (convRecord && convRecord.id) {
                      localConvsWithMessages[convRecord.id] = true
                    }
                  } catch (msgSaveErr) {
                    console.log(
                      'Aviso ao salvar mensagem individual na conversa ' +
                        zernioId +
                        ': ' +
                        msgSaveErr.message,
                    )
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
                  // Se o body da existente era nulo/vazio ou o novo tem mais detalhe
                  const currentExistingBody = (existingMsg.getString('body') || '').trim()
                  if (!currentExistingBody && msgBody) {
                    existingMsg.set('body', msgBody)
                    shouldUpdate = true
                  }
                  // Garantir que a existente nunca seja salva com body vazio
                  if (!existingMsg.getString('body')) {
                    existingMsg.set(
                      'body',
                      dir === 'out' ? 'Mensagem enviada' : 'Mensagem recebida',
                    )
                    shouldUpdate = true
                  }
                  if (detectedMediaUrl && existingMsg.getString('media_url') !== detectedMediaUrl) {
                    existingMsg.set('media_url', detectedMediaUrl)
                    shouldUpdate = true
                  }
                  if (
                    detectedMediaType &&
                    existingMsg.getString('media_type') !== detectedMediaType
                  ) {
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
                    } catch (upErr) {
                      console.log('Aviso ao atualizar mensagem existente: ' + upErr.message)
                    }
                  }
                }
              } catch (msgItemErr) {
                console.log(
                  'Aviso ao processar mensagem individual na conversa ' +
                    zernioId +
                    ': ' +
                    msgItemErr.message,
                )
              }
            }
          }
        }
      }

      if (!lastFetchedDirection && convRecord && convRecord.id) {
        try {
          const dbMsgs = $app.findRecordsByFilter(
            'messages',
            "conversation = '" + convRecord.id + "'",
            '-sent_at',
            1,
            0,
          )
          if (dbMsgs && dbMsgs.length > 0) {
            lastFetchedDirection = dbMsgs[0].getString('direction')
            lastFetchedSentAt = dbMsgs[0].getString('sent_at')
          }
        } catch (_) {}
      }

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
            const dateObj = new Date(lastFetchedSentAt || updatedTime)
            const hour = dateObj.getHours()
            if (hour >= 22 || hour < 6) {
              convRecord.set('status', 'madrugada')
            } else {
              convRecord.set('status', 'sem_resposta')
            }
            convRecord.set('responded_at', '')
          } else {
            if (unreadCount > 0) {
              convRecord.set('last_direction', 'in')
              const dateObj = new Date(updatedTime)
              const hour = dateObj.getHours()
              if (hour >= 22 || hour < 6) {
                convRecord.set('status', 'madrugada')
              } else {
                convRecord.set('status', 'sem_resposta')
              }
              convRecord.set('responded_at', '')
            } else {
              convRecord.set('last_direction', 'out')
              convRecord.set('status', 'acompanhamento')
              if (!convRecord.getString('responded_at')) {
                convRecord.set('responded_at', updatedTime)
              }
            }
          }
          $app.save(convRecord)
        } catch (statusSaveErr) {
          console.log('Aviso ao atualizar status da conversa: ' + statusSaveErr.message)
        }
      }
    }

    // Backfill de avatar para conversas deste usuário
    try {
      const convUserFilter = authUserId ? "user = '" + authUserId + "'" : '1=1'
      const allConvsInDb = $app.findRecordsByFilter(
        'conversations',
        convUserFilter,
        '-last_message_at',
        5000,
        0,
      )
      let backfilledAvatarsCount = 0
      for (let rc = 0; rc < allConvsInDb.length; rc++) {
        const cRec = allConvsInDb[rc]
        const existingAv = cRec.getString('avatar_url')
        if (!existingAv) {
          const cPhone = cRec.getString('phone') || ''
          const matchedAvatar = resolvePhoneAvatar(cPhone)
          if (matchedAvatar) {
            cRec.set('avatar_url', matchedAvatar)
            $app.save(cRec)
            backfilledAvatarsCount++
          }
        }
      }
      if (backfilledAvatarsCount > 0) {
        console.log('Backfill de avatares: ' + backfilledAvatarsCount + ' conversas ganharam foto.')
      }
    } catch (backfillErr) {
      console.log('Aviso ao aplicar backfill de avatares no sync: ' + backfillErr.message)
    }

    if (settingsRecord) {
      try {
        settingsRecord.set('last_synced_at', now)
        settingsRecord.set('is_connected', true)
        const summaryStatusMsg =
          failedItems > 0
            ? 'Sincronizado parcialmente: ' +
              conversationsSynced +
              ' conversas salvas (' +
              failedItems +
              ' com falha).'
            : 'Sincronizado com sucesso: ' + conversationsSynced + ' conversas ativas na conta.'
        settingsRecord.set('test_status_message', summaryStatusMsg)
        $app.save(settingsRecord)
      } catch (setSaveErr) {
        console.log('Aviso ao salvar settings após sync: ' + setSaveErr.message)
      }
    }

    let resultMessage = ''
    if (conversationsSynced > 0) {
      resultMessage =
        'Sincronização concluída: ' +
        conversationsSynced +
        ' conversas e ' +
        messagesSynced +
        ' mensagens sincronizadas com sucesso.'
      if (failedItems > 0) {
        resultMessage += ' (' + failedItems + ' com pendência).'
      }
    } else if (zernioConversations.length === 0) {
      resultMessage = 'Nenhuma conversa recente encontrada na conta Zernio.'
    } else {
      resultMessage =
        'Não foi possível salvar novos dados da Zernio (' + failedItems + ' falhas registradas).'
    }

    return e.json(200, {
      success: conversationsSynced > 0 || zernioConversations.length === 0,
      message: resultMessage,
      conversationsSynced: conversationsSynced,
      messagesSynced: messagesSynced,
      failedItems: failedItems,
      isPartial: failedItems > 0 && conversationsSynced > 0,
      errors: syncErrors,
    })
  },
  $apis.requireAuth(),
)
