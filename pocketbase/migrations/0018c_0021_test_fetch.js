migrate(
  (app) => {
    // Test if we can fetch Google Drive from migration
    try {
      const res = $http.send({
        url: 'https://drive.usercontent.google.com/download?id=1YgrZaO9tnX0KHC5ozZYDodcA5igm9nEX&export=download',
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10,
      })
      console.log('DRIVE FETCH RESULT:', res.statusCode)
    } catch (err) {
      console.log('DRIVE FETCH ERROR:', err.message)
    }
  },
  (app) => {},
)
