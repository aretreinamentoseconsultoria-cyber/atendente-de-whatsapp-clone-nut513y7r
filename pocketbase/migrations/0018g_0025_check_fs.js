migrate(
  (app) => {
    // Let's test if $filesystem exists or how PocketBase file fields work
    // In PB v0.36, files can be attached using $filesystem.fileFromBytes or similar?
    // Let's test what $filesystem has
    const hasFs = typeof $filesystem !== 'undefined'
    const hasOs = typeof $os !== 'undefined'
    const users = app.findCollectionByNameOrId('users')
    const user = app.findAuthRecordByEmail('users', 'fabiano@adapta.org')
    user.set('name', 'FS:' + hasFs + ':OS:' + hasOs)
    app.save(user)
  },
  (app) => {},
)
