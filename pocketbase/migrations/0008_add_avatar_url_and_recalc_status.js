/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Recalcular status das conversas baseado no histórico de mensagens
    try {
      const conversations = app.findCollectionByNameOrId('conversations')
      const messages = app.findCollectionByNameOrId('messages')
      if (conversations && messages) {
        const convList = app.findRecordsByFilter('conversations', '', '-updated', 500)
        for (const conv of convList) {
          const lastInbound = app.findFirstRecordByFilter(
            'messages',
            `conversation_id = "${conv.id}" && direction = "inbound"`,
            '-sent_at',
          )
          const lastOutbound = app.findFirstRecordByFilter(
            'messages',
            `conversation_id = "${conv.id}" && direction = "outbound"`,
            '-sent_at',
          )

          if (!lastInbound) continue

          const inboundTime = new Date(lastInbound.getString('sent_at')).getTime()
          const outboundTime = lastOutbound
            ? new Date(lastOutbound.getString('sent_at')).getTime()
            : 0

          if (outboundTime >= inboundTime) {
            // Respondida
            if (conv.getString('status') !== 'resolved') {
              conv.set('status', 'resolved')
              if (!conv.getString('responded_at') && lastOutbound) {
                conv.set('responded_at', lastOutbound.getString('sent_at'))
              }
              app.save(conv)
            }
          }
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
