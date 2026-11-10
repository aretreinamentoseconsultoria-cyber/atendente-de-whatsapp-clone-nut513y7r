migrate(
  (app) => {
    // Lista de IDs das mensagens que foram incorretamente salvas na conversa demo (xhj196h6i13xsle)
    // do usuário demo (a86jljjq08mft7l) em vez de irem para a conversa correta do usuário real (uy0xdkh1frb1apj).
    //
    // Como a sincronização (sync) já recriou com sucesso todas essas mensagens na conversa correta
    // 86fpyr7t22mok0d pertencente a uy0xdkh1frb1apj (inclusive com o body extraído corretamente para os PDFs),
    // podemos remover as 7 mensagens vazadas/duplicadas da conversa demo, garantindo total isolamento multi-tenant.
    const leakedMsgIds = [
      '4txkumkynhttcmv', // PDF recebido às 02:13
      'k0jkudht294g2ei', // Imagem recebida às 02:12
      'b21sz9ij5s3c3wx', // PDF recebido às 01:57
      'w2jr1mmiglb74kd', // Áudio recebido às 01:43
      '05oss37z0myyr0y', // Áudio recebido às 01:23
      'm1aylzwptwlh1vz', // Texto/número recebido às 22:32
      'spv2k7t0vu8hido', // Áudio recebido às 21:55
    ]

    for (let i = 0; i < leakedMsgIds.length; i++) {
      try {
        const msg = app.findRecordById('messages', leakedMsgIds[i])
        if (msg) {
          app.delete(msg)
        }
      } catch (_) {}
    }

    // Atualizar summary e last_message_at da conversa demo xhj196h6i13xsle para a mensagem mais recente legítima anterior
    try {
      const demoConv = app.findRecordById('conversations', 'xhj196h6i13xsle')
      if (demoConv) {
        // Buscar última mensagem restante da conversa
        const remaining = app.findRecordsByFilter(
          'messages',
          "conversation = 'xhj196h6i13xsle'",
          '-sent_at',
          1,
          0,
        )
        if (remaining && remaining.length > 0) {
          const lastRem = remaining[0]
          demoConv.set('summary', lastRem.getString('body') || 'Conversa iniciada')
          demoConv.set(
            'last_message_at',
            lastRem.getString('sent_at') || lastRem.getString('created'),
          )
          demoConv.set('last_direction', lastRem.getString('direction') || 'in')
        }
        app.save(demoConv)
      }
    } catch (_) {}
  },
  (app) => {
    // Revert: Nenhuma ação necessária em rollback de limpeza de duplicatas
  },
)
