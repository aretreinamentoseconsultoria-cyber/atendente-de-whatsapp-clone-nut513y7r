migrate(
  (app) => {
    // Recalcular status e direção de todas as conversas existentes com base na última mensagem real
    const convs = app.findRecordsByFilter('conversations', '1=1', '-updated', 500, 0)
    for (let i = 0; i < convs.length; i++) {
      const conv = convs[i]
      try {
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
            // Outbound message: última mensagem foi enviada pelo atendente/dono da conta!
            // Não está aguardando resposta -> Em acompanhamento
            conv.set('status', 'acompanhamento')
            conv.set('responded_at', sentAt || new Date().toISOString())
          } else {
            // Inbound: última mensagem foi recebida do lead
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
        console.log('Erro ao atualizar status da conversa ' + conv.id + ': ' + err.message)
      }
    }
  },
  (app) => {
    // no-op revert
  },
)
