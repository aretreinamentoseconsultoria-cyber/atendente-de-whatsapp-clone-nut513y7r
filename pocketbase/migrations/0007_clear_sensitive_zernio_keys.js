/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0007_clear_sensitive_zernio_keys: garantir que tokens mocados sejam limpos de app_settings
    try {
      const records = app.findRecordsByFilter(
        'app_settings',
        'key = "zernio_api_token" || key = "zernio_webhook_secret"',
        '',
        100,
      )
      for (const r of records) {
        const val = r.getString('value') || ''
        if (val.includes('demo') || val.includes('test') || val.startsWith('mock_')) {
          r.set('value', '')
          app.save(r)
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
