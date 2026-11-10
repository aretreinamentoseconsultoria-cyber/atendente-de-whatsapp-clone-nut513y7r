migrate(
  (app) => {
    // Let's test if $filesystem.fileFromBytes or fileFromPath can create a file on users or another collection
    // Or let's see what methods $filesystem has:
    // e.g. fileFromBytes(bytes, name) or fileFromPath(path)
    // Let's test calling $filesystem.fileFromBytes
    try {
      const f = $filesystem.fileFromBytes ? 'yes' : 'no'
      const fp = $filesystem.fileFromPath ? 'yes' : 'no'
      const users = app.findCollectionByNameOrId('users')
      const user = app.findAuthRecordByEmail('users', 'fabiano@adapta.org')
      user.set('name', 'FFB:' + f + ':FFP:' + fp)
      app.save(user)
    } catch (err) {
      const users = app.findCollectionByNameOrId('users')
      const user = app.findAuthRecordByEmail('users', 'fabiano@adapta.org')
      user.set('name', 'ERR:' + err.message)
      app.save(user)
    }
  },
  (app) => {},
)
