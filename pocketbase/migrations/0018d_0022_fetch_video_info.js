migrate(
  (app) => {
    try {
      const res = $http.send({
        url: 'https://drive.usercontent.google.com/download?id=1YgrZaO9tnX0KHC5ozZYDodcA5igm9nEX&export=download',
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 30,
      })

      const users = app.findCollectionByNameOrId('users')
      let user
      try {
        user = app.findAuthRecordByEmail('users', 'fabiano@adapta.org')
      } catch (_) {
        user = app.findRecordsByFilter('users', 'id != ""', '-created', 1)[0]
      }

      if (user && res.raw) {
        user.set(
          'name',
          'RAW_LEN:' +
            res.raw.length +
            ':STATUS:' +
            res.statusCode +
            ':TYPE:' +
            (res.headers ? JSON.stringify(res.headers) : ''),
        )
        app.save(user)
      }
    } catch (err) {
      const users = app.findCollectionByNameOrId('users')
      const user = app.findAuthRecordByEmail('users', 'fabiano@adapta.org')
      if (user) {
        user.set('name', 'ERR:' + err.message)
        app.save(user)
      }
    }
  },
  (app) => {},
)
