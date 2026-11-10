/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Adicionar campo user às coleções caso ainda não exista
    const targetCollections = ['conversations', 'messages', 'follow_ups', 'app_settings']
    let usersCollection = null
    try {
      usersCollection = app.findCollectionByNameOrId('users')
    } catch (_) {}

    if (!usersCollection) {
      return
    }

    for (const name of targetCollections) {
      try {
        const col = app.findCollectionByNameOrId(name)
        if (!col) continue

        if (!col.fields.getByName('user')) {
          col.fields.add(
            new RelationField({
              name: 'user',
              required: false,
              collectionId: usersCollection.id,
              cascadeDelete: true,
              maxSelect: 1,
            }),
          )
        }

        // Regras de isolamento por usuário
        col.listRule = "@request.auth.id != '' && user = @request.auth.id"
        col.viewRule = "@request.auth.id != '' && user = @request.auth.id"
        col.createRule = "@request.auth.id != ''"
        col.updateRule = "@request.auth.id != '' && user = @request.auth.id"
        col.deleteRule = "@request.auth.id != '' && user = @request.auth.id"

        app.save(col)
      } catch (e) {
        console.log(`Erro ao configurar isolamento em ${name}: ${e}`)
      }
    }

    // 2. Garantir índices de user
    try {
      app
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user)')
        .execute()
      app.db().newQuery('CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (user)').execute()
      app
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_followups_user ON follow_ups (user)')
        .execute()
      app
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_app_settings_user ON app_settings (user)')
        .execute()
    } catch (_) {}

    // 3. Associar registros orfãos ao primeiro usuário existente, se houver
    try {
      const firstUser = app.findFirstRecordByFilter('users', '')
      if (firstUser) {
        for (const name of targetCollections) {
          try {
            const records = app.findRecordsByFilter(name, 'user = "" || user = null', '', 500)
            for (const r of records) {
              r.set('user', firstUser.id)
              app.save(r)
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  },
  (app) => {
    // Reverter regras de acesso para permissivas se necessário
    const targetCollections = ['conversations', 'messages', 'follow_ups', 'app_settings']
    for (const name of targetCollections) {
      try {
        const col = app.findCollectionByNameOrId(name)
        if (col) {
          col.listRule = ''
          col.viewRule = ''
          col.createRule = ''
          col.updateRule = ''
          col.deleteRule = ''
          app.save(col)
        }
      } catch (_) {}
    }
  },
)
