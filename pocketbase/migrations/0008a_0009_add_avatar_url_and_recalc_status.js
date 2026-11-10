migrate(
  (app) => {
    // 1. Add avatar_url field to conversations collection if it doesn't exist
    const conversationsCol = app.findCollectionByNameOrId('conversations')
    if (!conversationsCol.fields.getByName('avatar_url')) {
      conversationsCol.fields.add(new TextField({ name: 'avatar_url' }))
      app.save(conversationsCol)
    }

    // 2. Recalculate status and last_direction for existing conversations based on their real messages
    // If a conversation has messages, find the message with the latest sent_at
    const convs = app.findRecordsByFilter('conversations', '1=1', '-updated', 200, 0)
    for (let i = 0; i < convs.length; i++) {
      const conv = convs[i]
      try {
        // Find latest message for this conversation
        const msgs = app.findRecordsByFilter(
          'messages',
          "conversation = '" + conv.id + "'",
          '-sent_at',
          1,
          0,
        )
        if (msgs && msgs.length > 0) {
          const lastMsg = msgs[0]
          const dir = lastMsg.getString('direction') || 'in'
          const sentAt = lastMsg.getString('sent_at') || conv.getString('last_message_at')

          conv.set('last_direction', dir)
          if (sentAt) {
            conv.set('last_message_at', sentAt)
          }

          if (dir === 'out') {
            // Outbound message: account owner already responded!
            // Status is acompanhamento with responded_at set to that sent_at
            conv.set('status', 'acompanhamento')
            conv.set('responded_at', sentAt || new Date().toISOString())
          } else {
            // Inbound message from lead:
            // Check if sent during night hours (22h - 6h)
            const dateObj = new Date(sentAt)
            const hour = dateObj.getHours()
            if (hour >= 22 || hour < 6) {
              conv.set('status', 'madrugada')
            } else {
              conv.set('status', 'sem_resposta')
            }
            conv.set('responded_at', '')
          }
          app.save(conv)
        }
      } catch (err) {
        console.log('Erro ao recalcular conversa ' + conv.id + ': ' + err.message)
      }
    }
  },
  (app) => {
    try {
      const conversationsCol = app.findCollectionByNameOrId('conversations')
      if (conversationsCol.fields.getByName('avatar_url')) {
        conversationsCol.fields.removeByName('avatar_url')
        app.save(conversationsCol)
      }
    } catch (_) {}
  },
)
