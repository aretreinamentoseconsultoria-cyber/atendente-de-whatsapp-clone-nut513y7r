migrate((app) => {
  const url =
    'https://drive.usercontent.google.com/download?id=1YgrZaO9tnX0KHC5ozZYDodcA5igm9nEX&export=download&confirm=t'
  // Just testing if $http is available or fails
  try {
    const res = $http.send({ url: url, method: 'GET' })
    console.log('Migration HTTP Status:', res.statusCode)
  } catch (e) {
    console.log('Migration HTTP Error:', e.message)
  }
})
