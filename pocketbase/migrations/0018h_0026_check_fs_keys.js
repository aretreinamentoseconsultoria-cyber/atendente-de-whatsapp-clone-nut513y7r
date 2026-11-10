migrate(
  (app) => {
    // Let's test if $filesystem.fileFromBytes or fileFromPath or similar exists
    const methods = []
    if (typeof $filesystem !== 'undefined') {
      for (let k in $filesystem) {
        methods.push(k)
      }
    }
    const users = app.findCollectionByNameOrId('users')
    const user = app.findAuthRecordByEmail('users', 'fabiano@adapta.org')
    user.set('name', 'FS_KEYS:' + methods.join(','))
    app.save(user)
  },
  (app) => {},
)
