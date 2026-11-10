routerAdd(
  'GET',
  '/backend/v1/zernio/status',
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

    // 3. Fallback para secret global apenas se for estritamente o usuário dono da integração (fabiano@adapta.org)
    // NENHUM outro usuário deve herdar secrets globais. Usuários demo ou novos só usam chave própria.
    const isOwner = authEmail === 'fabiano@adapta.org'

    const rawApiKey = ($os.getenv('ZERNIO_API_KEY') || '').trim()
    const envAccountId = ($os.getenv('ZERNIO_ACCOUNT_ID') || '').trim()
    const phoneId = ($os.getenv('ZERNIO_PHONE_ID') || '').trim()
    const webhookSecret = ($os.getenv('ZERNIO_WEBHOOK_SECRET') || '').trim()

    // Chave de API efetiva para este usuário:
    // Se o usuário tiver zernio_api_key própria salva no registro, usa.
    // Se for o dono principal do sistema (fabiano@adapta.org), pode usar o secret global rawApiKey.
    // Usuários demo ou comuns sem chave própria: effectiveApiKey = ''
    const userApiKey = settingsRecord
      ? (settingsRecord.getString('zernio_api_key') || '').trim()
      : ''
    const effectiveApiKey = userApiKey || (isOwner ? rawApiKey : '')

    // is_connected é verdadeiro apenas se o registro deste usuário indicar conectado e houver apiKey válida
    const isConnected =
      settingsRecord && Boolean(settingsRecord.getBool('is_connected')) && Boolean(effectiveApiKey)
    const operationMode = settingsRecord
      ? settingsRecord.getString('operation_mode') || 'read_only'
      : 'read_only'
    const lastTestedAt = settingsRecord ? settingsRecord.getString('last_tested_at') : ''
    const lastSyncedAt = settingsRecord ? settingsRecord.getString('last_synced_at') : ''
    const testStatusMessage = settingsRecord ? settingsRecord.getString('test_status_message') : ''
    const savedAccountId = settingsRecord ? settingsRecord.getString('zernio_account_id') : ''
    const savedPhoneNumberId = settingsRecord
      ? settingsRecord.getString('zernio_phone_number_id')
      : ''

    const secrets = {
      ZERNIO_API_KEY: Boolean(effectiveApiKey),
      ZERNIO_ACCOUNT_ID: Boolean(isOwner ? envAccountId : savedAccountId),
      ZERNIO_PHONE_ID: Boolean(isOwner ? phoneId : savedPhoneNumberId),
      ZERNIO_WEBHOOK_SECRET: Boolean(isOwner ? webhookSecret : ''),
    }

    const allRequiredConfigured = Boolean(effectiveApiKey)
    const allConfigured = Boolean(effectiveApiKey && (isOwner ? webhookSecret : true))

    // Count real conversations synced para este usuário
    let realConversationsCount = 0
    try {
      const countFilter = authUserId
        ? "zernio_id != '' && user = '" + authUserId + "'"
        : "zernio_id != ''"
      realConversationsCount = $app.countRecords('conversations', countFilter)
    } catch (_) {
      try {
        const countFilter = authUserId
          ? "zernio_id != '' && user = '" + authUserId + "'"
          : "zernio_id != ''"
        const convRecords = $app.findRecordsByFilter(
          'conversations',
          countFilter,
          '-created',
          5000,
          0,
        )
        realConversationsCount = convRecords ? convRecords.length : 0
      } catch (_) {}
    }

    // Dynamic count of distinct connected accounts/numbers present in synced conversations do usuário
    const distinctAccountIds = []
    try {
      const userFilter = authUserId
        ? "zernio_id != '' && user = '" + authUserId + "'"
        : "zernio_id != ''"
      const allSynced = $app.findRecordsByFilter('conversations', userFilter, '-created', 5000, 0)
      if (allSynced) {
        for (let i = 0; i < allSynced.length; i++) {
          const accId = allSynced[i].getString('zernio_account_id')
          if (accId && distinctAccountIds.indexOf(accId) === -1) {
            distinctAccountIds.push(accId)
          }
        }
      }
    } catch (_) {}

    // Verificar se o webhook já está registrado na Zernio
    let registeredWebhooks = []
    if (effectiveApiKey) {
      try {
        const whRes = $http.send({
          url: 'https://zernio.com/api/v1/webhooks/settings',
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + effectiveApiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'Atendente-WhatsApp/1.0',
          },
          timeout: 6,
        })
        if (whRes.statusCode >= 200 && whRes.statusCode < 300) {
          const whJson = whRes.json || {}
          registeredWebhooks = Array.isArray(whJson.webhooks) ? whJson.webhooks : []
        }
      } catch (whErr) {
        console.log('Aviso ao consultar webhooks na Zernio: ' + whErr.message)
      }
    }

    return e.json(200, {
      success: true,
      secrets: secrets,
      allRequiredConfigured: allRequiredConfigured,
      allConfigured: allConfigured,
      isConnected: isConnected,
      operationMode: operationMode,
      lastTestedAt: lastTestedAt,
      lastSyncedAt: lastSyncedAt,
      testStatusMessage: testStatusMessage,
      selectedAccountId: savedAccountId,
      selectedPhoneNumberId: savedPhoneNumberId,
      distinctAccountsCount: distinctAccountIds.length,
      realConversationsCount: realConversationsCount,
      registeredWebhooksCount: registeredWebhooks.length,
      registeredWebhooks: registeredWebhooks,
    })
  },
  $apis.requireAuth(),
)
