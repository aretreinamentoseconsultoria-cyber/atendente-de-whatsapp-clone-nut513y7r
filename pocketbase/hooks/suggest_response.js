routerAdd(
  'POST',
  '/backend/v1/conversations/{id}/suggest',
  (e) => {
    const conversationId = e.request.pathValue('id')
    let conversation
    try {
      conversation = $app.findRecordById('conversations', conversationId)
    } catch (_) {
      return e.notFoundError('Conversa não encontrada.')
    }

    const messages = $app
      .findRecordsByFilter('messages', "conversation = '" + conversationId + "'", '-sent_at', 15, 0)
      .reverse()

    const thread = messages
      .map((message) => {
        const author =
          message.getString('direction') === 'in' ? conversation.getString('name') : 'Atendente'
        return author + ': ' + message.getString('body')
      })
      .join('\n')

    const context = [
      'Você é o assistente inteligente de WhatsApp da empresa.',
      'Sua tarefa é formular a melhor resposta contextual para o cliente, pronta para envio.',
      'Escreva apenas a resposta sugerida, em português do Brasil, amigável, direta e natural.',
      'Mantenha o texto curto, adequado ao WhatsApp, sem markdown e sem explicações sobre o processo.',
      'Nome do contato: ' + conversation.getString('name'),
      'Resumo: ' + conversation.getString('summary'),
      'Intenção: ' + conversation.getString('intent'),
      'Temperatura: ' + conversation.getString('temperature'),
      'Próxima ação recomendada: ' + conversation.getString('next_action'),
      'Conversa:\n' + thread,
    ].join('\n\n')

    try {
      const response = $ai.chat({
        model: 'fast',
        messages: [
          {
            role: 'system',
            content:
              'Você redige respostas comerciais curtas e humanas para WhatsApp em português do Brasil.',
          },
          { role: 'user', content: context },
        ],
      })
      const draft =
        response && response.choices && response.choices[0] && response.choices[0].message
          ? String(response.choices[0].message.content || '').trim()
          : ''
      if (!draft) return e.internalServerError('Não foi possível gerar o rascunho.')
      return e.json(200, { draft: draft })
    } catch (error) {
      console.log('Falha ao sugerir resposta para ' + conversationId + ': ' + error.message)
      return e.internalServerError('Não foi possível gerar o rascunho agora. Tente novamente.')
    }
  },
  $apis.requireAuth(),
)
