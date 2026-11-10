migrate(
  (app) => {
    const conversations = app.findCollectionByNameOrId('conversations')

    if (!conversations.fields.getByName('responded_at')) {
      conversations.fields.add(
        new DateField({
          name: 'responded_at',
          required: false,
        }),
      )
    }

    conversations.addIndex('idx_conversations_responded_at', false, 'responded_at', '')
    app.save(conversations)
  },
  (app) => {
    const conversations = app.findCollectionByNameOrId('conversations')
    conversations.removeIndex('idx_conversations_responded_at')
    if (conversations.fields.getByName('responded_at')) {
      conversations.fields.removeByName('responded_at')
    }
    app.save(conversations)
  },
)
