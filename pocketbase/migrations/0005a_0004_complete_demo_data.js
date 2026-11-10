migrate(
  (app) => {
    const conversations = app.findCollectionByNameOrId('conversations')
    const messages = app.findCollectionByNameOrId('messages')
    const followUps = app.findCollectionByNameOrId('follow_ups')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'fabiano@adapta.org')
    } catch (_) {
      const user = new Record(users)
      user.setEmail('fabiano@adapta.org')
      user.setPassword('Skip@Pass')
      user.setVerified(true)
      user.set('name', 'Fabiano')
      app.save(user)
    }

    let lead
    try {
      lead = app.findFirstRecordByData('conversations', 'phone', '+55 11 98888-4040')
    } catch (_) {
      lead = new Record(conversations)
      lead.set('name', 'Renata Azevedo')
      lead.set('phone', '+55 11 98888-4040')
      lead.set('status', 'acompanhamento')
      lead.set('last_message_at', new Date(Date.now() - 18 * 60000).toISOString())
      lead.set('last_direction', 'out')
      lead.set(
        'summary',
        'Recebeu uma resposta sobre o plano para a equipe e agora está avaliando internamente.',
      )
      lead.set('intent', 'Avaliar plano para equipe')
      lead.set('temperature', 'morno')
      lead.set('next_action', 'Aguardar o retorno sem pressionar e acompanhar amanhã.')
      lead.set('responded_at', new Date(Date.now() - 18 * 60000).toISOString())
      app.save(lead)

      const incoming = new Record(messages)
      incoming.set('conversation', lead.id)
      incoming.set('direction', 'in')
      incoming.set('body', 'O plano funciona bem para uma equipe de seis pessoas?')
      incoming.set('sent_at', new Date(Date.now() - 42 * 60000).toISOString())
      app.save(incoming)

      const outgoing = new Record(messages)
      outgoing.set('conversation', lead.id)
      outgoing.set('direction', 'out')
      outgoing.set(
        'body',
        'Sim, Renata. Vocês conseguem organizar a fila e acompanhar os retornos das seis pessoas no mesmo painel.',
      )
      outgoing.set('sent_at', new Date(Date.now() - 18 * 60000).toISOString())
      app.save(outgoing)
    }

    try {
      app.findFirstRecordByData('follow_ups', 'title', 'Confirmar avaliação do plano')
    } catch (_) {
      const follow = new Record(followUps)
      follow.set('conversation', lead.id)
      follow.set('title', 'Confirmar avaliação do plano')
      follow.set('due_at', new Date(Date.now() + 22 * 60 * 60000).toISOString())
      follow.set('done', false)
      app.save(follow)
    }
  },
  (app) => {
    try {
      const follow = app.findFirstRecordByData(
        'follow_ups',
        'title',
        'Confirmar avaliação do plano',
      )
      app.delete(follow)
    } catch (_) {}
    try {
      const lead = app.findFirstRecordByData('conversations', 'phone', '+55 11 98888-4040')
      app.delete(lead)
    } catch (_) {}
  },
)
