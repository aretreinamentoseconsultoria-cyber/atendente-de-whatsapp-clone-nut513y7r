migrate(
  (app) => {
    // Let's test how fileFromBytes works
    // $filesystem.fileFromBytes(bytes, filename)
    try {
      const f = $filesystem.fileFromBytes('test content', 'hello.txt')
      const users = app.findCollectionByNameOrId('users')
      const user = app.findAuthRecordByEmail('users', 'fabiano@adapta.org')
      user.set('name', 'FFB_OBJ:' + typeof f + ':' + (f ? f.name : 'null'))
      app.save(user)
    } catch (err) {
      const users = app.findCollectionByNameOrId('users')
      const user = app.findAuthRecordByEmail('users', 'fabiano@adapta.org')
      user.set('name', 'FFB_ERR:' + err.message)
      app.save(user)
    }
  },
  (app) => {},
)
