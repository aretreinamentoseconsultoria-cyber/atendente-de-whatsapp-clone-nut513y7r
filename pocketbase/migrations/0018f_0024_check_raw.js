migrate(
  (app) => {
    // Let's test how goja encodes binary data or if we can write to public or to a record
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

      // In Goja, res.raw is string or byte array?
      // Let's check typeof res.raw
      const t = typeof res.raw
      // Can we chunk it into an array of base64 or hex?
      // In JS, charCodeAt
      let hexSample = ''
      if (res.raw && res.raw.length > 0) {
        for (let i = 0; i < Math.min(16, res.raw.length); i++) {
          let code = res.raw.charCodeAt(i)
          hexSample += (code < 16 ? '0' : '') + code.toString(16) + ' '
        }
      }

      user.set(
        'name',
        'T:' + t + ':L:' + (res.raw ? res.raw.length : 0) + ':HEX:' + hexSample.trim(),
      )
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
