routerAdd(
  'POST',
  '/backend/v1/zernio/test',
  (e) => {
    // 1. Identificar usuário autenticado
    const authUser = e.auth
    const authUserId = authUser ? authUser.id : ''
    const authEmail = authUser ? authUser.getString('email') : ''

    // 2. Localizar app_settings do usuário atual
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

    // 3. Obter chave enviada no corpo da requisição (ex: teste pelo wizard de onboarding)
    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    const providedApiKey = (reqBody.apiKey || reqBody.api_key || '').trim()

    // 4. Determinar se o usuário tem direito ao fallback do secret global ZERNIO_API_KEY:
    // Estritamente o usuário dono/principal (fabiano@adapta.org).
    // Usuários normais ou demo NUNCA usam o secret global, mesmo que tenham registro em app_settings.
    const isPrimaryOwner = authEmail === 'fabiano@adapta.org'

    const savedApiKey = settingsRecord
      ? (settingsRecord.getString('zernio_api_key') || '').trim()
      : ''

    let apiKey = providedApiKey || savedApiKey
    if (!apiKey && isPrimaryOwner) {
      apiKey = ($os.getenv('ZERNIO_API_KEY') || '').trim()
    }

    // Rate limit server-side / throttling no endpoint de teste:
    // Se o teste já foi executado nos últimos 3 segundos para o mesmo usuário sem nova apiKey, reutilizar
    if (!providedApiKey && settingsRecord && settingsRecord.getString('last_tested_at')) {
      try {
        const lastTestedMs = new Date(settingsRecord.getString('last_tested_at')).getTime()
        const diffMs = Date.now() - lastTestedMs
        if (diffMs > 0 && diffMs < 3000 && settingsRecord.getBool('is_connected')) {
          return e.json(200, {
            success: true,
            connected: true,
            throttled: true,
            message:
              settingsRecord.getString('test_status_message') ||
              'Conexão validada com sucesso na Zernio!',
            statusCode: 200,
          })
        }
      } catch (_) {}
    }

    if (!apiKey) {
      if (settingsRecord) {
        settingsRecord.set('is_connected', false)
        settingsRecord.set(
          'test_status_message',
          'Nenhuma integração WhatsApp/Zernio configurada para esta conta.',
        )
        settingsRecord.set('last_tested_at', new Date().toISOString())
        $app.save(settingsRecord)
      }
      return e.json(400, {
        success: false,
        connected: false,
        code: 'MISSING_API_KEY',
        message:
          'Chave de API não informada. Conecte sua conta WhatsApp no assistente de configuração.',
      })
    }

    // 5. Fetch connected accounts from Zernio: GET /v1/accounts
    let accounts = []
    try {
      const accRes = $http.send({
        url: 'https://zernio.com/api/v1/accounts',
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Atendente-WhatsApp/1.0',
        },
        timeout: 15,
      })

      if (accRes.statusCode >= 200 && accRes.statusCode < 300) {
        const bodyJson = accRes.json || {}
        accounts = Array.isArray(bodyJson.accounts) ? bodyJson.accounts : []
      } else if (accRes.statusCode === 401 || accRes.statusCode === 403) {
        const errJson = accRes.json || {}
        const msg =
          errJson.message || errJson.error || 'Chave Zernio API inválida ou sem permissão.'
        if (settingsRecord) {
          settingsRecord.set('is_connected', false)
          settingsRecord.set('test_status_message', 'Falha de autenticação: ' + msg)
          settingsRecord.set('last_tested_at', new Date().toISOString())
          $app.save(settingsRecord)
        }
        return e.json(accRes.statusCode, {
          success: false,
          connected: false,
          code: 'UNAUTHORIZED',
          message: 'Chave rejeitada pela Zernio (HTTP ' + accRes.statusCode + '): ' + msg,
          statusCode: accRes.statusCode,
          details: errJson,
        })
      }
    } catch (err) {
      console.log('Aviso ao consultar /v1/accounts da Zernio: ' + err.message)
    }

    // 6. Query phone-numbers endpoint for phone numbers metadata: GET /v1/phone-numbers
    let connectedPhones = []
    try {
      const phoneRes = $http.send({
        url: 'https://zernio.com/api/v1/phone-numbers',
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Atendente-WhatsApp/1.0',
        },
        timeout: 15,
      })
      if (phoneRes.statusCode >= 200 && phoneRes.statusCode < 300) {
        const pBody = phoneRes.json || {}
        connectedPhones = Array.isArray(pBody.connected) ? pBody.connected : []
      }
    } catch (err) {
      console.log('Aviso ao consultar /v1/phone-numbers da Zernio: ' + err.message)
    }

    // Filter WhatsApp accounts
    const whatsappAccounts = []
    for (let i = 0; i < accounts.length; i++) {
      const a = accounts[i]
      const platform = (a.platform || '').toLowerCase()
      if (platform === 'whatsapp' || !platform) {
        let enrichedPhone = a.username || a.displayName || ''
        let enrichedDisplayName = a.displayName || a.name || ''
        for (let p = 0; p < connectedPhones.length; p++) {
          if (connectedPhones[p].accountId === a._id) {
            enrichedPhone = connectedPhones[p].phoneNumber || enrichedPhone
            if (!enrichedDisplayName && connectedPhones[p].displayName) {
              enrichedDisplayName = connectedPhones[p].displayName
            }
            break
          }
        }
        let photoUrl = a.avatarUrl || a.avatar || a.picture || a.profilePictureUrl || ''
        if (!photoUrl && a._id) {
          try {
            const bpRes = $http.send({
              url:
                'https://zernio.com/api/v1/whatsapp/business-profile?accountId=' +
                encodeURIComponent(a._id),
              method: 'GET',
              headers: {
                Authorization: 'Bearer ' + apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'Atendente-WhatsApp/1.0',
              },
              timeout: 6,
            })
            if (bpRes.statusCode >= 200 && bpRes.statusCode < 300) {
              const bpJson = bpRes.json || {}
              const bpData = bpJson.businessProfile || bpJson.data || bpJson
              if (bpData && bpData.profilePictureUrl) {
                photoUrl = bpData.profilePictureUrl
              }
            }
          } catch (bpErr) {
            console.log('Aviso ao consultar business profile para ' + a._id + ': ' + bpErr.message)
          }
        }

        whatsappAccounts.push({
          id: a._id,
          platform: a.platform || 'whatsapp',
          username: a.username || '',
          displayName: enrichedDisplayName || a.username || 'WhatsApp Business',
          phoneNumber: enrichedPhone,
          avatarUrl: photoUrl,
          isActive: a.isActive !== false,
          profileName: a.profileId && typeof a.profileId === 'object' ? a.profileId.name : '',
        })
      }
    }

    if (whatsappAccounts.length === 0 && accounts.length > 0) {
      for (let i = 0; i < accounts.length; i++) {
        const a = accounts[i]
        whatsappAccounts.push({
          id: a._id,
          platform: a.platform || 'unknown',
          username: a.username || '',
          displayName: a.displayName || a.username || 'Conta ' + (i + 1),
          phoneNumber: a.username || '',
          isActive: a.isActive !== false,
          profileName: a.profileId && typeof a.profileId === 'object' ? a.profileId.name : '',
        })
      }
    }

    for (let c = 0; c < connectedPhones.length; c++) {
      const cp = connectedPhones[c]
      const cpAccId = cp.accountId || ''
      if (
        cpAccId &&
        !whatsappAccounts.some(function (item) {
          return item.id === cpAccId
        })
      ) {
        whatsappAccounts.push({
          id: cpAccId,
          platform: 'whatsapp',
          username: cp.phoneNumber || '',
          displayName: cp.displayName || cp.phoneNumber || 'WhatsApp Conectado',
          phoneNumber: cp.phoneNumber || '',
          isActive: true,
          profileName: '',
        })
      }
    }

    // 7. Test listing conversations: GET /v1/inbox/conversations?platform=whatsapp&limit=5
    try {
      const res = $http.send({
        url: 'https://zernio.com/api/v1/inbox/conversations?platform=whatsapp&limit=5',
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Atendente-WhatsApp/1.0',
        },
        timeout: 15,
      })

      const now = new Date().toISOString()
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const bodyJson = res.json || {}
        const conversations = bodyJson.data || []
        const totalFound = Array.isArray(conversations) ? conversations.length : 0

        // Se o usuário não tem settingsRecord ainda, criar um novo vinculado a ele
        if (!settingsRecord && authUserId) {
          try {
            const settingsCol = $app.findCollectionByNameOrId('app_settings')
            settingsRecord = new Record(settingsCol)
            settingsRecord.set('key', 'whatsapp_zernio')
            settingsRecord.set('user', authUserId)
            settingsRecord.set('operation_mode', 'read_only')
          } catch (createErr) {
            console.log('Aviso ao instanciar app_settings: ' + createErr.message)
          }
        }

        if (settingsRecord) {
          settingsRecord.set('is_connected', true)
          settingsRecord.set('last_tested_at', now)

          // Persistir a chave se foi fornecida no teste
          if (providedApiKey) {
            settingsRecord.set('zernio_api_key', providedApiKey)
          }

          if (whatsappAccounts.length > 0 && !settingsRecord.getString('zernio_account_id')) {
            settingsRecord.set('zernio_account_id', whatsappAccounts[0].id)
            if (whatsappAccounts[0].phoneNumber) {
              settingsRecord.set('zernio_phone_number_id', whatsappAccounts[0].phoneNumber)
            }
          }

          const targetLabel =
            whatsappAccounts.length > 1
              ? 'Conectado à Zernio: ' +
                whatsappAccounts.length +
                ' números ativos simultaneamente na conta.'
              : whatsappAccounts.length === 1
                ? 'Conectado à Zernio: 1 número ativo.'
                : 'Conexão estabelecida com sucesso via Zernio API'

          settingsRecord.set('test_status_message', targetLabel)
          try {
            $app.save(settingsRecord)
          } catch (saveErr) {
            console.log('Aviso ao salvar app_settings no teste: ' + saveErr.message)
          }
        }

        return e.json(200, {
          success: true,
          connected: true,
          message:
            whatsappAccounts.length > 0
              ? 'Conexão validada com sucesso! ' +
                whatsappAccounts.length +
                ' número(s) WhatsApp conectado(s).'
              : 'Conexão validada com sucesso na Zernio!',
          conversationsCount: totalFound,
          accounts: whatsappAccounts,
          statusCode: res.statusCode,
        })
      } else {
        if (whatsappAccounts.length > 0) {
          if (!settingsRecord && authUserId) {
            try {
              const settingsCol = $app.findCollectionByNameOrId('app_settings')
              settingsRecord = new Record(settingsCol)
              settingsRecord.set('key', 'whatsapp_zernio')
              settingsRecord.set('user', authUserId)
              settingsRecord.set('operation_mode', 'read_only')
            } catch (_) {}
          }

          if (settingsRecord) {
            settingsRecord.set('is_connected', true)
            settingsRecord.set('last_tested_at', now)
            if (providedApiKey) {
              settingsRecord.set('zernio_api_key', providedApiKey)
            }
            if (!settingsRecord.getString('zernio_account_id')) {
              settingsRecord.set('zernio_account_id', whatsappAccounts[0].id)
              if (whatsappAccounts[0].phoneNumber) {
                settingsRecord.set('zernio_phone_number_id', whatsappAccounts[0].phoneNumber)
              }
            }
            settingsRecord.set(
              'test_status_message',
              'Autenticado na Zernio: ' +
                whatsappAccounts.length +
                ' número(s) ativo(s) simultaneamente.',
            )
            try {
              $app.save(settingsRecord)
            } catch (_) {}
          }

          return e.json(200, {
            success: true,
            connected: true,
            message:
              'Autenticado com sucesso na Zernio! ' +
              whatsappAccounts.length +
              ' conta(s) localizada(s).',
            conversationsCount: 0,
            accounts: whatsappAccounts,
            statusCode: res.statusCode,
          })
        }

        const errorBody = res.json || {}
        const errorMsg =
          errorBody.error ||
          errorBody.message ||
          'Código HTTP ' + res.statusCode + ' retornado pela Zernio.'

        if (settingsRecord) {
          settingsRecord.set('is_connected', false)
          settingsRecord.set('test_status_message', 'Falha: ' + errorMsg)
          settingsRecord.set('last_tested_at', now)
          $app.save(settingsRecord)
        }

        return e.json(400, {
          success: false,
          connected: false,
          message: 'Falha ao autenticar com a Zernio: ' + errorMsg,
          statusCode: res.statusCode,
          details: errorBody,
        })
      }
    } catch (err) {
      const now = new Date().toISOString()
      if (settingsRecord) {
        settingsRecord.set('is_connected', false)
        settingsRecord.set('test_status_message', 'Erro de rede: ' + err.message)
        settingsRecord.set('last_tested_at', now)
        $app.save(settingsRecord)
      }

      return e.json(502, {
        success: false,
        connected: false,
        message: 'Não foi possível conectar ao servidor da Zernio: ' + err.message,
      })
    }
  },
  $apis.requireAuth(),
)
