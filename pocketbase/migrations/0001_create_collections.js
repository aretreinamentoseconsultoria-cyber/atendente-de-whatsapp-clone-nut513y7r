/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. conversations
    let conversations = null
    try {
      conversations = app.findCollectionByNameOrId('conversations')
    } catch (_) {}

    if (!conversations) {
      conversations = new Collection({
        name: 'conversations',
        type: 'base',
        fields: [
          { name: 'contact_name', type: 'text', required: true },
          { name: 'phone', type: 'text', required: true },
          { name: 'last_message', type: 'text', required: true },
          { name: 'last_message_at', type: 'date', required: true },
          { name: 'unread_count', type: 'number', required: false },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['urgent', 'normal', 'night', 'resolved'],
          },
          {
            name: 'temperature',
            type: 'select',
            required: false,
            maxSelect: 1,
            values: ['hot', 'warm', 'cold'],
          },
          { name: 'intent', type: 'text', required: false },
          { name: 'ai_summary', type: 'text', required: false },
          { name: 'sentiment_score', type: 'number', required: false },
          {
            name: 'risk_level',
            type: 'select',
            required: false,
            maxSelect: 1,
            values: ['high', 'medium', 'low'],
          },
          { name: 'avatar_url', type: 'text', required: false },
          { name: 'responded_at', type: 'date', required: false },
        ],
        indexes: [
          'CREATE INDEX idx_conversations_status ON conversations (status)',
          'CREATE INDEX idx_conversations_last_msg ON conversations (last_message_at)',
        ],
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
      })
      app.save(conversations)
    } else {
      let modified = false
      if (!conversations.fields.getByName('avatar_url')) {
        conversations.fields.add(new TextField({ name: 'avatar_url', required: false }))
        modified = true
      }
      if (!conversations.fields.getByName('responded_at')) {
        conversations.fields.add(new DateField({ name: 'responded_at', required: false }))
        modified = true
      }
      if (modified) {
        app.save(conversations)
      }
      try {
        app
          .db()
          .newQuery('CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations (status)')
          .execute()
        app
          .db()
          .newQuery(
            'CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations (last_message_at)',
          )
          .execute()
      } catch (_) {}
    }

    // 2. messages
    let messages = null
    try {
      messages = app.findCollectionByNameOrId('messages')
    } catch (_) {}

    if (!messages) {
      messages = new Collection({
        name: 'messages',
        type: 'base',
        fields: [
          {
            name: 'conversation_id',
            type: 'relation',
            required: true,
            collectionId: conversations.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'direction',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['inbound', 'outbound'],
          },
          { name: 'body', type: 'text', required: false },
          { name: 'sent_at', type: 'date', required: true },
          {
            name: 'message_type',
            type: 'select',
            required: false,
            maxSelect: 1,
            values: ['text', 'audio', 'image', 'document', 'template', 'video'],
          },
          { name: 'media_url', type: 'text', required: false },
          { name: 'transcription', type: 'text', required: false },
          { name: 'media_duration', type: 'number', required: false },
          { name: 'file_name', type: 'text', required: false },
          { name: 'file_size', type: 'number', required: false },
        ],
        indexes: [
          'CREATE INDEX idx_messages_conv ON messages (conversation_id)',
          'CREATE INDEX idx_messages_sent ON messages (sent_at)',
        ],
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
      })
      app.save(messages)
    } else {
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
      try {
        app
          .db()
          .newQuery('CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id)')
          .execute()
        app
          .db()
          .newQuery('CREATE INDEX IF NOT EXISTS idx_messages_sent ON messages (sent_at)')
          .execute()
      } catch (_) {}
    }

    // 3. follow_ups
    let followUps = null
    try {
      followUps = app.findCollectionByNameOrId('follow_ups')
    } catch (_) {}

    if (!followUps) {
      followUps = new Collection({
        name: 'follow_ups',
        type: 'base',
        fields: [
          {
            name: 'conversation_id',
            type: 'relation',
            required: true,
            collectionId: conversations.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'due_date', type: 'date', required: true },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pending', 'completed'],
          },
          { name: 'note', type: 'text', required: false },
        ],
        indexes: [
          'CREATE INDEX idx_followups_due ON follow_ups (due_date)',
          'CREATE INDEX idx_followups_status ON follow_ups (status)',
        ],
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
      })
      app.save(followUps)
    }

    // 4. app_settings
    let appSettings = null
    try {
      appSettings = app.findCollectionByNameOrId('app_settings')
    } catch (_) {}

    if (!appSettings) {
      appSettings = new Collection({
        name: 'app_settings',
        type: 'base',
        fields: [
          { name: 'key', type: 'text', required: true },
          { name: 'value', type: 'text', required: false },
          { name: 'description', type: 'text', required: false },
          { name: 'onboarding_completed', type: 'bool', required: false },
          { name: 'zernio_api_url', type: 'text', required: false },
          { name: 'zernio_account_id', type: 'text', required: false },
          { name: 'zernio_channel_id', type: 'text', required: false },
          { name: 'zernio_api_token', type: 'text', required: false },
          { name: 'zernio_connected', type: 'bool', required: false },
          { name: 'zernio_last_sync', type: 'date', required: false },
          { name: 'zernio_webhook_secret', type: 'text', required: false },
          { name: 'zernio_auto_sync', type: 'bool', required: false },
          { name: 'zernio_sync_interval', type: 'number', required: false },
          {
            name: 'zernio_operation_mode',
            type: 'select',
            required: false,
            maxSelect: 1,
            values: ['read_only', 'full'],
          },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_app_settings_key ON app_settings (key)'],
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
      })
      app.save(appSettings)
    } else {
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
      try {
        app
          .db()
          .newQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings (key)')
          .execute()
      } catch (_) {}
    }
  },
  (app) => {
    const names = ['follow_ups', 'messages', 'conversations', 'app_settings']
    for (const name of names) {
      try {
        const col = app.findCollectionByNameOrId(name)
        if (col) {
          app.delete(col)
        }
      } catch (_) {}
    }
  },
)
