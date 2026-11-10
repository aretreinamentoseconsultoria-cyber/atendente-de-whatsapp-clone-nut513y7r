/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0015_deduplicate_messages: deduplica mensagens com mesmo corpo/áudio na mesma conversa em janela curta
    try {
      const messages = app.findRecordsByFilter('messages', '', '-sent_at', 1000)
      const seen = new Set()
      for (const m of messages) {
        const key = `${m.getString('conversation_id')}_${m.getString('direction')}_${m.getString('body')}_${m.getString('media_url')}`
        if (seen.has(key)) {
          try {
            app.delete(m)
          } catch (_) {}
        } else {
          seen.add(key)
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
