/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0016_add_onboarding_completed: garantir campo onboarding_completed em app_settings se ainda faltar
    try {
      const appSettings = app.findCollectionByNameOrId('app_settings')
      if (appSettings) {
        if (!appSettings.fields.getByName('onboarding_completed')) {
          appSettings.fields.add(
            new BoolField({
              name: 'onboarding_completed',
              required: false,
            }),
          )
          app.save(appSettings)
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
