migrate(
  (app) => {
    // Rotina de backfill para garantir que as conversas já sincronizadas tenham o status recalculado
    // Se o sync for chamado pela interface, o hook zernio_sync enriquecerá com as fotos da Zernio.
    const conversationsCol = app.findCollectionByNameOrId('conversations')
    if (!conversationsCol.fields.getByName('avatar_url')) {
      conversationsCol.fields.add(new TextField({ name: 'avatar_url' }))
      app.save(conversationsCol)
    }
  },
  (app) => {},
)
