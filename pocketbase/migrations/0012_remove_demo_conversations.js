/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0012_remove_demo_conversations: garantir remoção de conversas antigas sem usuário ou de demonstração
    try {
      const demoConvs = app.findRecordsByFilter(
        'conversations',
        'user = "" || user = null',
        '',
        200,
      )
      for (const conv of demoConvs) {
        try {
          app.delete(conv)
        } catch (_) {}
      }
    } catch (_) {}
  },
  (app) => {},
)
