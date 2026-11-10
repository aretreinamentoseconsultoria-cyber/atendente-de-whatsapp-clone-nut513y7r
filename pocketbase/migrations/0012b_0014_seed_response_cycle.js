migrate(
  (app) => {
    const now = Date.now()
    const isoAgo = (minutes) => new Date(now - minutes * 60 * 1000).toISOString()
    const isoAhead = (minutes) => new Date(now + minutes * 60 * 1000).toISOString()

    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'fabiano@adapta.org')
    } catch (_) {
      const user = new Record(users)
      user.setEmail('fabiano@adapta.org')
      user.setPassword('Skip@Pass')
      user.setVerified(true)
      user.set('name', 'Fabiano')
      user.set('risk_acknowledged', false)
      app.save(user)
    }

    const conversations = app.findCollectionByNameOrId('conversations')
    const messages = app.findCollectionByNameOrId('messages')
    const followUps = app.findCollectionByNameOrId('follow_ups')

    const ensureConversation = (data) => {
      try {
        return app.findFirstRecordByData('conversations', 'phone', data.phone)
      } catch (_) {
        const record = new Record(conversations)
        record.set('name', data.name)
        record.set('phone', data.phone)
        record.set('status', data.status)
        record.set('last_message_at', data.last_message_at)
        record.set('last_direction', data.last_direction)
        record.set('summary', data.summary)
        record.set('intent', data.intent)
        record.set('temperature', data.temperature)
        record.set('next_action', data.next_action)
        if (data.responded_at) record.set('responded_at', data.responded_at)
        app.save(record)
        return record
      }
    }

    const ensureMessage = (conversation, direction, body, sentAt) => {
      try {
        app.findFirstRecordByData('messages', 'body', body)
      } catch (_) {
        const record = new Record(messages)
        record.set('conversation', conversation.id)
        record.set('direction', direction)
        record.set('body', body)
        record.set('sent_at', sentAt)
        app.save(record)
      }
    }

    const ensureFollowUp = (conversation, title, dueAt) => {
      try {
        app.findFirstRecordByData('follow_ups', 'title', title)
      } catch (_) {
        const record = new Record(followUps)
        record.set('conversation', conversation.id)
        record.set('title', title)
        record.set('due_at', dueAt)
        record.set('done', false)
        app.save(record)
      }
    }

    const marina = ensureConversation({
      name: 'Marina Costa',
      phone: '+55 11 99999-1001',
      status: 'sem_resposta',
      last_message_at: isoAgo(28 * 60),
      last_direction: 'in',
      summary:
        'Gestora de uma clínica com três unidades. Pediu condições para contratar ainda nesta semana.',
      intent: 'Contratar o plano Pro',
      temperature: 'quente',
      next_action: 'Responder com condições comerciais e sugerir uma demonstração hoje.',
    })
    ensureMessage(
      marina,
      'in',
      'Olá! Vi a apresentação e quero entender se o plano Pro atende três unidades.',
      isoAgo(28 * 60 + 8),
    )
    ensureMessage(
      marina,
      'in',
      'Se conseguirmos fechar ainda esta semana, existe alguma condição especial?',
      isoAgo(28 * 60),
    )

    const gustavo = ensureConversation({
      name: 'Gustavo Almeida',
      phone: '+55 21 98888-1002',
      status: 'madrugada',
      last_message_at: isoAgo(7 * 60),
      last_direction: 'in',
      summary: 'Chegou durante a madrugada por indicação e quer integrar o atendimento da equipe.',
      intent: 'Conhecer integrações',
      temperature: 'morno',
      next_action: 'Explicar a integração e perguntar quantas pessoas atendem no WhatsApp.',
    })
    ensureMessage(
      gustavo,
      'in',
      'Oi, cheguei por indicação da Renata. Vocês integram com o CRM que já usamos?',
      isoAgo(7 * 60),
    )

    const camila = ensureConversation({
      name: 'Camila Nogueira',
      phone: '+55 31 97777-1003',
      status: 'followup',
      last_message_at: isoAgo(110),
      last_direction: 'in',
      summary: 'Responsável comercial avaliando a ferramenta para uma equipe de oito atendentes.',
      intent: 'Validar orçamento com a diretoria',
      temperature: 'quente',
      next_action: 'Retomar com o comparativo enviado e confirmar a reunião com a diretoria.',
    })
    ensureMessage(
      camila,
      'out',
      'Enviei o comparativo dos planos. Posso reservar um horário para tirarmos as dúvidas?',
      isoAgo(180),
    )
    ensureMessage(
      camila,
      'in',
      'Ótimo. Vou validar com a diretoria e te retorno, mas pode me lembrar amanhã?',
      isoAgo(110),
    )
    ensureFollowUp(camila, 'Retomar proposta com a diretoria', isoAhead(26 * 60))

    const ricardo = ensureConversation({
      name: 'Ricardo Menezes',
      phone: '+55 41 96666-1004',
      status: 'followup',
      last_message_at: isoAgo(5 * 60),
      last_direction: 'in',
      summary: 'Dono de e-commerce aguardando retorno sobre migração de número e histórico.',
      intent: 'Confirmar viabilidade da migração',
      temperature: 'morno',
      next_action: 'Dar retorno sobre a migração e reagendar a conversa perdida.',
    })
    ensureMessage(
      ricardo,
      'in',
      'Ficou de me confirmar ontem se consigo manter meu número e o histórico. Alguma novidade?',
      isoAgo(5 * 60),
    )
    ensureFollowUp(ricardo, 'Confirmar migração do número', isoAgo(3 * 60))

    const lucas = ensureConversation({
      name: 'Lucas Ferreira',
      phone: '+55 51 95555-1005',
      status: 'acompanhamento',
      last_message_at: isoAgo(14),
      last_direction: 'out',
      responded_at: isoAgo(14),
      summary: 'Recebeu a resposta sobre implantação e está analisando os próximos passos.',
      intent: 'Planejar implantação',
      temperature: 'morno',
      next_action: 'Aguardar o retorno do lead e acompanhar sem pressionar.',
    })
    ensureMessage(
      lucas,
      'in',
      'Quanto tempo costuma levar para colocar tudo em funcionamento?',
      isoAgo(32),
    )
    ensureMessage(
      lucas,
      'out',
      'Em geral, deixamos a operação pronta em até dois dias úteis. Te enviei o passo a passo.',
      isoAgo(14),
    )

    const paula = ensureConversation({
      name: 'Paula Souza',
      phone: '+55 61 94444-1006',
      status: 'sem_resposta',
      last_message_at: isoAgo(4),
      last_direction: 'in',
      summary: 'Voltou com uma nova dúvida depois de já ter recebido uma resposta sobre segurança.',
      intent: 'Esclarecer segurança dos dados',
      temperature: 'quente',
      next_action: 'Responder a nova dúvida; esta conversa voltou automaticamente ao topo da fila.',
    })
    ensureMessage(paula, 'in', 'Os dados das conversas ficam seguros?', isoAgo(52))
    ensureMessage(
      paula,
      'out',
      'Sim. O acesso é controlado e o produto opera somente em modo de leitura.',
      isoAgo(41),
    )
    ensureMessage(
      paula,
      'in',
      'Entendi! E consigo limitar o acesso por pessoa da equipe?',
      isoAgo(4),
    )
  },
  (app) => {
    // Dados demonstrativos são preservados ao reverter para não apagar interações do usuário.
  },
)
