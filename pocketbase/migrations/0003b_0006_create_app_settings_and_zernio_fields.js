migrate(
  (app) => {
    const authRule = "@request.auth.id != ''"

    // 1. Create app_settings collection to store Zernio configuration & operation mode
    const appSettings = new Collection({
      name: 'app_settings',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        { name: 'key', type: 'text', required: true },
        { name: 'zernio_api_key', type: 'text' },
        { name: 'zernio_account_id', type: 'text' },
        { name: 'zernio_phone_number_id', type: 'text' },
        { name: 'zernio_webhook_secret', type: 'text' },
        {
          name: 'operation_mode',
          type: 'select',
          values: ['read_only', 'read_write'],
          maxSelect: 1,
        },
        { name: 'is_connected', type: 'bool' },
        { name: 'last_tested_at', type: 'date' },
        { name: 'last_synced_at', type: 'date' },
        { name: 'test_status_message', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_app_settings_key ON app_settings (key)'],
    })
    app.save(appSettings)

    // Seed default settings row if not present
    try {
      app.findFirstRecordByData('app_settings', 'key', 'whatsapp_zernio')
    } catch (_) {
      const defaultSettings = new Record(appSettings)
      defaultSettings.set('key', 'whatsapp_zernio')
      defaultSettings.set('operation_mode', 'read_only')
      defaultSettings.set('is_connected', false)
      defaultSettings.set('zernio_api_key', '')
      defaultSettings.set('zernio_account_id', '')
      defaultSettings.set('zernio_phone_number_id', '')
      defaultSettings.set('zernio_webhook_secret', '')
      defaultSettings.set('test_status_message', 'Aguardando configuração de chave')
      app.save(defaultSettings)
    }

    // 2. Add zernio_id and zernio_account_id to conversations
    const conversations = app.findCollectionByNameOrId('conversations')
    if (!conversations.fields.getByName('zernio_id')) {
      conversations.fields.add(new TextField({ name: 'zernio_id' }))
    }
    if (!conversations.fields.getByName('zernio_account_id')) {
      conversations.fields.add(new TextField({ name: 'zernio_account_id' }))
    }
    app.save(conversations)

    // Add index on conversations.zernio_id
    conversations.addIndex('idx_conversations_zernio_id', false, 'zernio_id', '')
    app.save(conversations)

    // 3. Add zernio_id to messages
    const messages = app.findCollectionByNameOrId('messages')
    if (!messages.fields.getByName('zernio_id')) {
      messages.fields.add(new TextField({ name: 'zernio_id' }))
    }
    app.save(messages)

    messages.addIndex('idx_messages_zernio_id', false, 'zernio_id', '')
    app.save(messages)
  },
  (app) => {
    try {
      const messages = app.findCollectionByNameOrId('messages')
      messages.removeIndex('idx_messages_zernio_id')
      if (messages.fields.getByName('zernio_id')) {
        messages.fields.removeByName('zernio_id')
      }
      app.save(messages)
    } catch (_) {}

    try {
      const conversations = app.findCollectionByNameOrId('conversations')
      conversations.removeIndex('idx_conversations_zernio_id')
      if (conversations.fields.getByName('zernio_id')) {
        conversations.fields.removeByName('zernio_id')
      }
      if (conversations.fields.getByName('zernio_account_id')) {
        conversations.fields.removeByName('zernio_account_id')
      }
      app.save(conversations)
    } catch (_) {}

    try {
      const appSettings = app.findCollectionByNameOrId('app_settings')
      app.delete(appSettings)
    } catch (_) {}
  },
)
