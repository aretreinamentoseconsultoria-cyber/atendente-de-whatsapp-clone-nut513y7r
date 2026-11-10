/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0030_fix_user_display_names: sanitizar nomes de usuários sem IDs hardcoded
    try {
      const users = app.findRecordsByFilter('users', '', '', 100)
      for (const u of users) {
        let name = u.getString('name') || ''
        const email = u.getString('email') || ''
        if (!name && email) {
          name = email.split('@')[0]
          u.set('name', name)
          app.save(u)
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
