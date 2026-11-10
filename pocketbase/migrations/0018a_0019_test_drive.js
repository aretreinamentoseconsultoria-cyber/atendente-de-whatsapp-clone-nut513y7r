migrate(
  (app) => {
    try {
      const fileId = '1YgrZaO9tnX0KHC5ozZYDodcA5igm9nEX'
      console.log('Migration 0019 testing check: ' + fileId)
    } catch (e) {
      console.log('Migration test error: ' + e)
    }
  },
  (app) => {},
)
