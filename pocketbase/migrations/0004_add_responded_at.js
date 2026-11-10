/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. conversations.avatar_url e conversations.responded_at
    try {
      const conversations = app.findCollectionByNameOrId('conversations')
      if (conversations) {
        let modified = false
        if (!conversations.fields.getByName('avatar_url')) {
          conversations.fields.add(
            new TextField({
              name: 'avatar_url',
              required: false,
            }),
          )
          modified = true
        }
        if (!conversations.fields.getByName('responded_at')) {
          conversations.fields.add(
            new DateField({
              name: 'responded_at',
              required: false,
            }),
          )
          modified = true
        }
        if (modified) {
          app.save(conversations)
        }
      }
    } catch (_) {}

    // 2. messages: tornar body opcional e adicionar campos de mídia/transcrição
    try {
      const messages = app.findCollectionByNameOrId('messages')
      if (messages) {
        let modified = false

        const bodyField = messages.fields.getByName('body')
        if (bodyField && bodyField.required) {
          bodyField.required = false
          modified = true
        }

        if (!messages.fields.getByName('message_type')) {
          messages.fields.add(
            new SelectField({
              name: 'message_type',
              required: false,
              maxSelect: 1,
              values: ['text', 'audio', 'image', 'document', 'template', 'video'],
            }),
          )
          modified = true
        }
        if (!messages.fields.getByName('media_url')) {
          messages.fields.add(new TextField({ name: 'media_url', required: false }))
          modified = true
        }
        if (!messages.fields.getByName('transcription')) {
          messages.fields.add(new TextField({ name: 'transcription', required: false }))
          modified = true
        }
        if (!messages.fields.getByName('media_duration')) {
          messages.fields.add(new NumberField({ name: 'media_duration', required: false }))
          modified = true
        }
        if (!messages.fields.getByName('file_name')) {
          messages.fields.add(new TextField({ name: 'file_name', required: false }))
          modified = true
        }
        if (!messages.fields.getByName('file_size')) {
          messages.fields.add(new NumberField({ name: 'file_size', required: false }))
          modified = true
        }

        if (modified) {
          app.save(messages)
        }
      }
    } catch (_) {}

    // 3. app_settings: garantir onboarding_completed e campos zernio
    try {
      const appSettings = app.findCollectionByNameOrId('app_settings')
      if (appSettings) {
        let modified = false

        if (!appSettings.fields.getByName('onboarding_completed')) {
          appSettings.fields.add(new BoolField({ name: 'onboarding_completed', required: false }))
          modified = true
        }
        if (!appSettings.fields.getByName('zernio_api_url')) {
          appSettings.fields.add(new TextField({ name: 'zernio_api_url', required: false }))
          modified = true
        }
        if (!appSettings.fields.getByName('zernio_account_id')) {
          appSettings.fields.add(new TextField({ name: 'zernio_account_id', required: false }))
          modified = true
        }
        if (!appSettings.fields.getByName('zernio_channel_id')) {
          appSettings.fields.add(new TextField({ name: 'zernio_channel_id', required: false }))
          modified = true
        }
        if (!appSettings.fields.getByName('zernio_api_token')) {
          appSettings.fields.add(new TextField({ name: 'zernio_api_token', required: false }))
          modified = true
        }
        if (!appSettings.fields.getByName('zernio_connected')) {
          appSettings.fields.add(new BoolField({ name: 'zernio_connected', required: false }))
          modified = true
        }
        if (!appSettings.fields.getByName('zernio_last_sync')) {
          appSettings.fields.add(new DateField({ name: 'zernio_last_sync', required: false }))
          modified = true
        }
        if (!appSettings.fields.getByName('zernio_webhook_secret')) {
          appSettings.fields.add(new TextField({ name: 'zernio_webhook_secret', required: false }))
          modified = true
        }
        if (!appSettings.fields.getByName('zernio_auto_sync')) {
          appSettings.fields.add(new BoolField({ name: 'zernio_auto_sync', required: false }))
          modified = true
        }
        if (!appSettings.fields.getByName('zernio_sync_interval')) {
          appSettings.fields.add(new NumberField({ name: 'zernio_sync_interval', required: false }))
          modified = true
        }
        if (!appSettings.fields.getByName('zernio_operation_mode')) {
          appSettings.fields.add(
            new SelectField({
              name: 'zernio_operation_mode',
              required: false,
              maxSelect: 1,
              values: ['read_only', 'full'],
            }),
          )
          modified = true
        }

        if (modified) {
          app.save(appSettings)
        }
      }
    } catch (_) {}
  },
  (app) => {
    // Reverter campos se necessário
  },
)
