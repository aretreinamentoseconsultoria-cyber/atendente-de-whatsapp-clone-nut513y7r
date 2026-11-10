migrate(
  (app) => {
    // Let's test if $http and base64 works in migration
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
      const user = app.findAuthRecordByEmail('users', 'fabiano@adapta.org')

      // Check if $security or something can write file or base64
      // In PB goja, is btoa available?
      const hasBtoa = typeof btoa !== 'undefined'
      const len = res.raw ? res.raw.length : -1

      // Save to user name
      user.set('name', 'BTOA:' + hasBtoa + ':LEN:' + len + ':STATUS:' + res.statusCode)
      app.save(user)
    } catch (e) {
      const users = app.findCollectionByNameOrId('users')
      const user = app.findAuthRecordByEmail('users', 'fabiano@adapta.org')
      user.set('name', 'FAIL:' + e.message)
      app.save(user)
    }
  },
  (app) => {},
)
