routerAdd('GET', '/backend/v1/zernio/media', (e) => {
  // 1. Identificar usuário autenticado (ou via auth header ou token na query se carregado via <audio src>)
  let authUser = e.auth
  let authUserId = authUser ? authUser.id : ''
  let authEmail = authUser ? authUser.getString('email') : ''

  // Se o browser chamar <audio src="..."> direto, e.auth pode não ser preenchido se não enviar Bearer no header.
  // Aceitamos token na query param `token` ou no header Authorization Bearer para autenticar o usuário
  let queryToken = ''
  let queryMsgId = ''
  let queryUrl = ''
  try {
    const qInfo = (typeof e.requestInfo === 'function' ? e.requestInfo() : null) || {}
    if (qInfo.query && typeof qInfo.query === 'object') {
      queryToken = qInfo.query.token || ''
      queryMsgId = qInfo.query.messageId || qInfo.query.id || ''
      queryUrl = qInfo.query.url || ''
    }
    if (!queryToken && qInfo.headers && typeof qInfo.headers === 'object') {
      const authHdr = qInfo.headers.authorization || qInfo.headers.Authorization || ''
      if (authHdr && typeof authHdr === 'string' && authHdr.toLowerCase().startsWith('bearer ')) {
        queryToken = authHdr.slice(7).trim()
      }
    }
  } catch (_) {}

  if (!queryToken || !queryMsgId || !queryUrl) {
    try {
      if (e.request && e.request.url && typeof e.request.url.query === 'function') {
        const q = e.request.url.query()
        if (q && typeof q.get === 'function') {
          if (!queryToken) queryToken = q.get('token') || ''
          if (!queryMsgId) queryMsgId = q.get('messageId') || q.get('id') || ''
          if (!queryUrl) queryUrl = q.get('url') || ''
        }
      }
    } catch (_) {}
  }

  if (!queryToken && e.request && e.request.header && typeof e.request.header.get === 'function') {
    try {
      const hVal =
        e.request.header.get('Authorization') || e.request.header.get('authorization') || ''
      if (hVal && hVal.toLowerCase().startsWith('bearer ')) {
        queryToken = hVal.slice(7).trim()
      }
    } catch (_) {}
  }

  if (!authUserId && queryToken) {
    // 1. Assinatura canônica do PocketBase v0.36+: findAuthRecordByToken(token, 'auth')
    try {
      const userRec = $app.findAuthRecordByToken(queryToken, 'auth')
      if (userRec && userRec.id) {
        authUser = userRec
        authUserId = userRec.id
        authEmail = userRec.getString('email')
      }
    } catch (errAuthType) {
      console.log('findAuthRecordByToken com tipo "auth" falhou: ' + errAuthType.message)
    }

    // 2. Fallback sem especificar tipo
    if (!authUserId) {
      try {
        const userRec = $app.findAuthRecordByToken(queryToken)
        if (userRec && userRec.id) {
          authUser = userRec
          authUserId = userRec.id
          authEmail = userRec.getString('email')
        }
      } catch (errAuthDefault) {
        console.log('findAuthRecordByToken padrão falhou: ' + errAuthDefault.message)
      }
    }

    // 3. Fallback de compatibilidade antiga
    if (!authUserId) {
      try {
        const userRec = $app.findAuthRecordByToken(queryToken, 'users')
        if (userRec && userRec.id) {
          authUser = userRec
          authUserId = userRec.id
          authEmail = userRec.getString('email')
        }
      } catch (_) {}
    }
  }

  if (!authUserId) {
    return e.json(401, {
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Não autenticado para acessar mídia. Faça login novamente.',
    })
  }

  // 2. Verificar mensagem ou conversa para multi-tenancy estrito
  let targetMsgRecord = null
  let targetConvRecord = null

  if (queryMsgId) {
    try {
      targetMsgRecord = $app.findRecordById('messages', queryMsgId)
      if (targetMsgRecord) {
        const msgOwner = targetMsgRecord.getString('user')
        if (msgOwner && msgOwner !== authUserId) {
          return e.json(403, {
            success: false,
            message: 'Sem permissão para acessar esta mídia (mensagem pertence a outro usuário).',
          })
        }
        const convId = targetMsgRecord.getString('conversation')
        if (convId) {
          try {
            targetConvRecord = $app.findRecordById('conversations', convId)
            if (
              targetConvRecord &&
              targetConvRecord.getString('user') &&
              targetConvRecord.getString('user') !== authUserId
            ) {
              return e.json(403, {
                success: false,
                message: 'Sem permissão para acessar a conversa correspondente.',
              })
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // 3. Localizar chave da Zernio
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
  const userApiKey = settingsRecord ? (settingsRecord.getString('zernio_api_key') || '').trim() : ''
  const rawApiKey = ($secrets.get('ZERNIO_API_KEY') || $os.getenv('ZERNIO_API_KEY') || '').trim()
  // Se o usuário autenticado for o dono da mensagem e não tiver chave própria configurada, usar o secret global
  const apiKey = userApiKey || (isOwner ? rawApiKey : rawApiKey || '')

  if (!apiKey) {
    return e.json(400, {
      success: false,
      code: 'MISSING_API_KEY',
      message: 'Chave Zernio API não encontrada. Configure sua chave Zernio nas configurações.',
    })
  }

  // 4. Determinar URL da mídia da Zernio a ser requisitada
  let mediaUrlToFetch = queryUrl
  if (!mediaUrlToFetch && targetMsgRecord) {
    mediaUrlToFetch = targetMsgRecord.getString('media_url') || ''
  }

  // Se não tem media_url mas temos targetMsgRecord com zernio_id, só tenta se for mensagem de mídia com ID numérico
  if (!mediaUrlToFetch && targetMsgRecord) {
    const rawZId = targetMsgRecord.getString('zernio_id') || ''
    const mType = targetMsgRecord.getString('media_type') || ''
    if (rawZId && !rawZId.startsWith('wamid.') && mType) {
      mediaUrlToFetch = '/api/v1/whatsapp/media/' + encodeURIComponent(rawZId)
    }
  }

  if (!mediaUrlToFetch) {
    return e.json(400, {
      success: false,
      code: 'MISSING_MEDIA_PARAM',
      message: 'Parâmetro de mídia (url ou messageId) não informado ou sem URL gravada.',
    })
  }

  // Se for URL relativa ou apenas path, completar com domínio da Zernio
  if (mediaUrlToFetch.startsWith('/')) {
    mediaUrlToFetch = 'https://zernio.com' + mediaUrlToFetch
  }

  // Resolver accountId da conversa, mensagem ou settings
  let resolvedAccId = ''
  if (targetConvRecord) {
    resolvedAccId = targetConvRecord.getString('zernio_account_id')
  }
  if (!resolvedAccId && targetMsgRecord) {
    const rawMUrl = targetMsgRecord.getString('media_url') || ''
    const accMatch = rawMUrl.match(/[?&]accountId=([^&]+)/)
    if (accMatch && accMatch[1]) {
      resolvedAccId = decodeURIComponent(accMatch[1])
    }
  }
  if (!resolvedAccId && settingsRecord) {
    resolvedAccId = settingsRecord.getString('zernio_account_id')
  }

  // Se a URL exigir accountId e não tiver na query, tentar anexar do convRecord ou settings
  if (mediaUrlToFetch.indexOf('accountId=') === -1 && resolvedAccId) {
    const sep = mediaUrlToFetch.indexOf('?') === -1 ? '?' : '&'
    mediaUrlToFetch += sep + 'accountId=' + encodeURIComponent(resolvedAccId)
  }

  // 5. Fazer a requisição autenticada para a Zernio, com renovação automática de URL caso esteja expirada
  const fetchAudioFromUrl = (urlToFetch) => {
    let finalUrl = urlToFetch
    if (finalUrl.startsWith('/')) {
      finalUrl = 'https://zernio.com' + finalUrl
    }
    if (finalUrl.indexOf('accountId=') === -1) {
      let accToUse = resolvedAccId
      if (!accToUse && targetConvRecord) {
        accToUse = targetConvRecord.getString('zernio_account_id')
      }
      if (!accToUse && settingsRecord) {
        accToUse = settingsRecord.getString('zernio_account_id')
      }
      if (accToUse) {
        const sep = finalUrl.indexOf('?') === -1 ? '?' : '&'
        finalUrl += sep + 'accountId=' + encodeURIComponent(accToUse)
      }
    }

    return $http.send({
      url: finalUrl,
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'User-Agent': 'Atendente-WhatsApp/1.0',
      },
      timeout: 25,
    })
  }

  // Helper para buscar URL fresca na Zernio caso a URL gravada esteja expirada (400, 401, 403, 404 ou 410)
  const refreshMediaUrlFromZernio = () => {
    try {
      const zernioMsgId = targetMsgRecord ? targetMsgRecord.getString('zernio_id') : ''
      let convZernioId = targetConvRecord ? targetConvRecord.getString('zernio_id') : ''
      let targetAccountId = targetConvRecord ? targetConvRecord.getString('zernio_account_id') : ''
      if (!targetAccountId && settingsRecord) {
        targetAccountId = settingsRecord.getString('zernio_account_id')
      }

      // Se não temos a conversa carregada, tentar carregá-la do targetMsgRecord
      if (!convZernioId && targetMsgRecord) {
        const cId = targetMsgRecord.getString('conversation')
        if (cId) {
          try {
            const cRec = $app.findRecordById('conversations', cId)
            if (cRec) {
              convZernioId = cRec.getString('zernio_id')
              if (!targetAccountId) targetAccountId = cRec.getString('zernio_account_id')
            }
          } catch (_) {}
        }
      }

      // 1. Tentar endpoint direto de mensagem da Zernio se existir: GET /v1/messages/:id
      if (zernioMsgId) {
        try {
          let directUrl = 'https://zernio.com/api/v1/messages/' + encodeURIComponent(zernioMsgId)
          if (targetAccountId) directUrl += '?accountId=' + encodeURIComponent(targetAccountId)
          const dRes = $http.send({
            url: directUrl,
            method: 'GET',
            headers: {
              Authorization: 'Bearer ' + apiKey,
              'User-Agent': 'Atendente-WhatsApp/1.0',
            },
            timeout: 10,
          })
          if (dRes.statusCode >= 200 && dRes.statusCode < 300 && dRes.json) {
            const dJson = dRes.json || {}
            const dMsg = dJson.message || dJson.data || dJson
            const atts = Array.isArray(dMsg.attachments) ? dMsg.attachments : []
            let freshUrl = ''
            if (atts.length > 0 && atts[0]) {
              freshUrl = atts[0].url || atts[0].refreshUrl || atts[0].previewUrl || ''
            }
            if (!freshUrl && dMsg.audio) {
              freshUrl =
                dMsg.audio.url ||
                dMsg.audio.link ||
                (typeof dMsg.audio === 'string' ? dMsg.audio : '')
            }
            if (!freshUrl && dMsg.voice) {
              freshUrl = dMsg.voice.url || dMsg.voice.link || ''
            }
            if (freshUrl) return freshUrl
          }
        } catch (_) {}
      }

      // 2. Se temos a conversa na Zernio, consultar mensagens da conversa para capturar a URL assinada recente
      if (convZernioId) {
        let convMsgsUrl =
          'https://zernio.com/api/v1/inbox/conversations/' +
          encodeURIComponent(convZernioId) +
          '/messages?limit=50&sortOrder=desc'
        if (targetAccountId) {
          convMsgsUrl += '&accountId=' + encodeURIComponent(targetAccountId)
        }
        const cRes = $http.send({
          url: convMsgsUrl,
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'User-Agent': 'Atendente-WhatsApp/1.0',
          },
          timeout: 12,
        })
        if (cRes.statusCode >= 200 && cRes.statusCode < 300 && cRes.json) {
          const cJson = cRes.json || {}
          const msgs = Array.isArray(cJson.messages)
            ? cJson.messages
            : Array.isArray(cJson.data)
              ? cJson.data
              : []
          for (let i = 0; i < msgs.length; i++) {
            const item = msgs[i]
            const mId = item.id || item.platformMessageId || item.messageId || ''
            const pId =
              item.platformMessageId ||
              (typeof item.id === 'string' && item.id.startsWith('wamid.') ? item.id : '')
            if (
              (zernioMsgId && (mId === zernioMsgId || pId === zernioMsgId)) ||
              (!zernioMsgId &&
                (item.audio || item.voice || (item.attachments && item.attachments.length > 0)))
            ) {
              const atts = Array.isArray(item.attachments) ? item.attachments : []
              let freshUrl = ''
              if (atts.length > 0 && atts[0]) {
                freshUrl = atts[0].url || atts[0].refreshUrl || atts[0].previewUrl || ''
              }
              if (!freshUrl && item.audio) {
                freshUrl =
                  item.audio.url ||
                  item.audio.link ||
                  (typeof item.audio === 'string' ? item.audio : '')
              }
              if (!freshUrl && item.voice) {
                freshUrl = item.voice.url || item.voice.link || ''
              }
              if (freshUrl) return freshUrl
            }
          }
        }
      }
    } catch (refErr) {
      console.log('Aviso ao tentar renovar URL de mídia na Zernio: ' + refErr.message)
    }
    return ''
  }

  try {
    let mediaRes = fetchAudioFromUrl(mediaUrlToFetch)

    // Se o retorno indicar que a URL assinada anterior expirou ou falhou
    const isExpiredStatus =
      mediaRes.statusCode === 400 ||
      mediaRes.statusCode === 401 ||
      mediaRes.statusCode === 403 ||
      mediaRes.statusCode === 404 ||
      mediaRes.statusCode === 410

    if (isExpiredStatus) {
      console.log(
        'URL de mídia da Zernio expirada ou inválida (HTTP ' +
          mediaRes.statusCode +
          '). Tentando buscar URL fresca na API Zernio...',
      )
      const freshUrl = refreshMediaUrlFromZernio()
      if (freshUrl && freshUrl !== mediaUrlToFetch) {
        console.log('URL fresca de mídia obtida com sucesso na Zernio. Re-executando streaming...')
        mediaUrlToFetch = freshUrl
        mediaRes = fetchAudioFromUrl(freshUrl)

        // Se conseguiu fazer download com a nova URL fresca, atualiza no banco local para futuras consultas
        if (mediaRes.statusCode >= 200 && mediaRes.statusCode < 300 && targetMsgRecord) {
          try {
            targetMsgRecord.set('media_url', freshUrl)
            $app.save(targetMsgRecord)
          } catch (_) {}
        }
      }
    }

    if (mediaRes.statusCode >= 200 && mediaRes.statusCode < 300) {
      // Obter contentType retornado pela Zernio
      let contentType = ''
      try {
        if (mediaRes.headers) {
          for (let h in mediaRes.headers) {
            if (h.toLowerCase() === 'content-type') {
              const val = mediaRes.headers[h]
              if (Array.isArray(val) && val.length > 0) {
                contentType = val[0]
              } else if (typeof val === 'string') {
                contentType = val
              }
              break
            }
          }
        }
      } catch (_) {}

      const detectedType = targetMsgRecord ? targetMsgRecord.getString('media_type') || '' : ''

      // Fallback inteligente para content-type conforme URL ou tipo da mensagem
      if (!contentType || contentType === 'application/octet-stream') {
        const lowerUrl = mediaUrlToFetch.toLowerCase()
        if (lowerUrl.indexOf('.pdf') !== -1) {
          contentType = 'application/pdf'
        } else if (lowerUrl.indexOf('.doc') !== -1 || lowerUrl.indexOf('.docx') !== -1) {
          contentType = 'application/msword'
        } else if (lowerUrl.indexOf('.xls') !== -1 || lowerUrl.indexOf('.xlsx') !== -1) {
          contentType = 'application/vnd.ms-excel'
        } else if (lowerUrl.indexOf('.jpg') !== -1 || lowerUrl.indexOf('.jpeg') !== -1) {
          contentType = 'image/jpeg'
        } else if (lowerUrl.indexOf('.png') !== -1) {
          contentType = 'image/png'
        } else if (lowerUrl.indexOf('.webp') !== -1) {
          contentType = 'image/webp'
        } else if (lowerUrl.indexOf('.mp3') !== -1) {
          contentType = 'audio/mpeg'
        } else if (lowerUrl.indexOf('.ogg') !== -1 || lowerUrl.indexOf('.opus') !== -1) {
          contentType = 'audio/ogg'
        } else if (lowerUrl.indexOf('.wav') !== -1) {
          contentType = 'audio/wav'
        } else if (lowerUrl.indexOf('.m4a') !== -1) {
          contentType = 'audio/mp4'
        } else if (detectedType === 'file') {
          contentType = 'application/pdf'
        } else if (detectedType === 'image') {
          contentType = 'image/jpeg'
        } else {
          contentType = 'audio/ogg'
        }
      }

      // Permitir CORS e cache local
      if (e.response && typeof e.response.header === 'function') {
        const rh = e.response.header()
        if (rh && typeof rh.set === 'function') {
          rh.set('Access-Control-Allow-Origin', '*')
          rh.set('Cache-Control', 'public, max-age=86400')
          rh.set('Accept-Ranges', 'bytes')
        }
      }

      // Retornar os bytes brutos da mídia
      return e.blob(mediaRes.statusCode, contentType, mediaRes.raw)
    } else {
      console.log(
        'Aviso ao buscar mídia da Zernio (HTTP ' +
          mediaRes.statusCode +
          '): ' +
          (mediaRes.raw ? mediaRes.raw.slice(0, 160) : ''),
      )
      let customMsg = 'Não foi possível recuperar o áudio da Zernio.'
      if (mediaRes.statusCode === 401 || mediaRes.statusCode === 403) {
        customMsg = 'Chave da Zernio não autorizada a baixar esta mídia.'
      } else if (mediaRes.statusCode === 404 || mediaRes.statusCode === 410) {
        customMsg = 'Mídia expirada ou não encontrada na Zernio/Meta.'
      } else if (mediaRes.statusCode === 400) {
        customMsg = 'Requisição inválida para a Zernio (verifique conta ou ID).'
      }
      return e.json(mediaRes.statusCode || 502, {
        success: false,
        statusCode: mediaRes.statusCode,
        code: mediaRes.statusCode === 401 ? 'UNAUTHORIZED_ZERNIO' : 'MEDIA_NOT_FOUND',
        message: customMsg,
      })
    }
  } catch (err) {
    console.log('Erro de conexão ao buscar mídia na Zernio: ' + err.message)
    return e.json(502, {
      success: false,
      message: 'Falha de conexão ao buscar áudio: ' + err.message,
    })
  }
})
