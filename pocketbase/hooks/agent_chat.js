routerAdd(
  'POST',
  '/backend/v1/agent/chat',
  (e) => {
    let reqBody = {}
    try {
      reqBody = e.requestInfo().body || {}
    } catch (_) {}

    // 1. Identificar usuário autenticado estritamente por requisição (SEM NENHUM GLOBAL)
    let authUser = e.auth
    let authUserId = authUser ? authUser.id : ''

    // Se e.auth ainda não estiver populado pelo middleware, extrair e validar token do header ou body
    if (!authUserId) {
      let queryToken = ''

      // Checar se o token veio explicitamente no body JSON
      if (
        reqBody &&
        typeof reqBody === 'object' &&
        reqBody.token &&
        typeof reqBody.token === 'string'
      ) {
        queryToken = reqBody.token.trim()
      }

      // Checar header Authorization via e.requestInfo().headers
      if (!queryToken) {
        try {
          const qInfo = (typeof e.requestInfo === 'function' ? e.requestInfo() : null) || {}
          if (qInfo.headers && typeof qInfo.headers === 'object') {
            const authHdr = qInfo.headers.authorization || qInfo.headers.Authorization || ''
            if (
              authHdr &&
              typeof authHdr === 'string' &&
              authHdr.toLowerCase().startsWith('bearer ')
            ) {
              queryToken = authHdr.slice(7).trim()
            }
          }
        } catch (_) {}
      }

      // Checar header Authorization via e.request.header.get
      if (
        !queryToken &&
        e.request &&
        e.request.header &&
        typeof e.request.header.get === 'function'
      ) {
        try {
          const hVal =
            e.request.header.get('Authorization') || e.request.header.get('authorization') || ''
          if (hVal && hVal.toLowerCase().startsWith('bearer ')) {
            queryToken = hVal.slice(7).trim()
          }
        } catch (_) {}
      }

      if (queryToken) {
        try {
          const userRec = $app.findAuthRecordByToken(queryToken, 'auth')
          if (userRec && userRec.id) {
            authUser = userRec
            authUserId = userRec.id
          }
        } catch (_) {}
        if (!authUserId) {
          try {
            const userRec = $app.findAuthRecordByToken(queryToken)
            if (userRec && userRec.id) {
              authUser = userRec
              authUserId = userRec.id
            }
          } catch (_) {}
        }
      }
    }

    // Se mesmo após validar o token não identificamos usuário válido, RECUSAR imediatamente.
    // NUNCA adivinhar e NUNCA consultar variáveis globais.
    if (!authUserId) {
      return e.json(401, { error: 'Autenticação necessária para conversar com o Agente.' })
    }

    // Verificar se o ID realmente existe na coleção users
    try {
      const verifiedUser = $app.findRecordById('users', authUserId)
      if (!verifiedUser || !verifiedUser.id) {
        return e.json(401, { error: 'Usuário autenticado inválido.' })
      }
    } catch (_) {
      return e.json(401, { error: 'Usuário autenticado não encontrado.' })
    }

    const message = (reqBody.message || '').trim()
    const conversationId = reqBody.conversation_id || null
    const stream = Boolean(reqBody.stream)

    if (!message) {
      return e.json(400, { error: 'O campo message é obrigatório.' })
    }

    // Injetar no prompt do usuário diretriz explícita com o user_id autenticado e validado desta requisição específica
    const enrichedMessage =
      '[Contexto de Sessão Autenticada: Seu user_id autenticado nesta sessão é "' +
      authUserId +
      '". QUALQUER registro criado em agent_actions DEVE ter user="' +
      authUserId +
      '". NUNCA use outro user_id nem reutilize IDs de exemplos antigos.]\n\n' +
      message

    try {
      const agent = $ai.agent('conversas-assistant')

      // Função de fallback para auto-criação de proposta:
      // SÓ DEVE DISPARAR se o usuário aprovar explicitamente no chat ("manda pra meta", "aprovo", "pode mandar")
      // OU se o assistente disse que criou o card mas não chamou a ferramenta de fato.
      // NUNCA disparar na fase de entrevista ou apresentação inicial de rascunho!
      const runProposalFallback = (userPrompt, replyText, uid) => {
        if (!replyText || !uid) return
        const pLower = (userPrompt || '').toLowerCase().trim()
        const rLower = (replyText || '').toLowerCase()

        // 1. Identificar se o usuário deu consentimento explícito para submeter / mandar pra Meta
        const isUserExplicitApproval =
          pLower.includes('manda pra meta') ||
          pLower.includes('manda para a meta') ||
          pLower.includes('manda para meta') ||
          pLower.includes('manda pra zernio') ||
          pLower.includes('envia pra meta') ||
          pLower.includes('pode mandar') ||
          pLower.includes('manda bala') ||
          pLower.includes('aprovo o template') ||
          pLower.includes('aprovo o rascunho') ||
          pLower === 'manda' ||
          pLower === 'aprovo' ||
          pLower === 'pode criar' ||
          pLower === 'submete'

        // 2. Ou se o assistente afirmou no texto que gerou/criou a proposta/card mas esqueceu de chamar a tool
        const assistantClaimsCreated =
          (rLower.includes('criei a proposta') ||
            rLower.includes('proposta foi gerada') ||
            rLower.includes('card de proposta abaixo') ||
            rLower.includes('card abaixo aguardando')) &&
          !rLower.includes('manda pra meta') // se ele está apenas instruindo as opções do rascunho, não é claim

        if (!isUserExplicitApproval && !assistantClaimsCreated) {
          // Estamos na fase de entrevista ou rascunho: NÃO criar proposta em agent_actions!
          return
        }

        // Checar se já existe uma ação pending_approval criada recentemente nos últimos 20 segundos
        try {
          const recentActions = $app.findRecordsByFilter(
            'agent_actions',
            "user = '" + uid + "' && status = 'pending_approval'",
            '-created',
            1,
            0,
          )
          if (recentActions && recentActions.length > 0) {
            const recTime = new Date(recentActions[0].getString('created')).getTime()
            if (Date.now() - recTime < 25000) {
              return // Ação já existe, não duplicar
            }
          }
        } catch (_) {}

        // Extrair dados do template a partir do texto do assistente
        try {
          let tName = ''
          const nameMatch =
            userPrompt.match(/template\s+`?([a-z0-9_]+)`?/i) ||
            replyText.match(/nome\s*(?:técnico)?\s*[:=]\s*`?([a-z0-9_]+)`?/i) ||
            replyText.match(/name["':\s]+([a-z0-9_]+)/i) ||
            replyText.match(/template\s+`([a-z0-9_]+)`/i) ||
            userPrompt.match(/nome\s*(?:é|de)?\s*`?([a-z0-9_]+)`?/i)
          if (nameMatch && nameMatch[1]) {
            tName = nameMatch[1]
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9_]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_+|_+$/g, '')
              .slice(0, 512)
          }
          if (!tName) {
            tName = 'template_' + Date.now().toString(36)
          }

          let category = 'UTILITY'
          if (rLower.includes('marketing') || pLower.includes('marketing')) category = 'MARKETING'

          // Extrair corpo limpo (ignorando títulos, numerações, instruções de markdown)
          const isInstructionOrHeading = (str) => {
            const s = (str || '').toLowerCase().trim()
            if (!s) return true
            if (s.includes('corpo da mensagem') || s.includes('corpo do template')) return true
            if (s.includes('variáveis') || s.includes('variaveis')) return true
            if (s.includes('use variáveis') || s.includes('use variaveis')) return true
            if (s.includes('exemplo preenchido') || s.includes('como vai ficar')) return true
            if (s.includes('etapa ') || s.includes('passo ')) return true
            if (/^\d+[\.\)]\s*\*\*/.test(s)) return true
            if (/^#+\s/.test(s)) return true
            return false
          }

          let bodyText = ''
          const codeBlockMatch = replyText.match(
            /```(?:whatsapp|text|markdown)?\s*\n?([\s\S]*?)```/,
          )
          if (codeBlockMatch && codeBlockMatch[1]) {
            const rawBlock = codeBlockMatch[1].trim()
            if (!isInstructionOrHeading(rawBlock)) {
              bodyText = rawBlock
            }
          }

          if (!bodyText) {
            const lines = replyText.split('\n')
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]
                .trim()
                .replace(/^[-*•>]\s*/, '')
                .replace(/^"|"$/g, '')
                .trim()
              if (!line) continue
              if (isInstructionOrHeading(line)) continue
              if (line.includes('{{1}}') || (line.includes('{{') && line.includes('}}'))) {
                bodyText = line
                break
              }
            }
          }

          if (!bodyText) {
            bodyText = 'Olá {{1}}, tudo bem? Estamos entrando em contato sobre {{2}}.'
          }

          let headerText = ''
          let footerText = ''
          const buttons = []

          const headerMatch = bodyText.match(/^([^\n]+)\n+([\s\S]+)$/)
          if (headerMatch && !headerMatch[1].includes('{{') && headerMatch[1].length < 60) {
            headerText = headerMatch[1].trim()
            bodyText = headerMatch[2].trim()
          }

          if (bodyText.includes('[Botões:') || bodyText.includes('[Botoes:')) {
            buttons.push({ type: 'QUICK_REPLY', text: 'SIM' })
            buttons.push({ type: 'QUICK_REPLY', text: 'NÃO' })
            bodyText = bodyText.replace(/\[Bot[oõ]es:.*?\]/gi, '').trim()
          }

          const examples = {
            1: 'Carlos',
            2: 'sua solicitação',
            3: 'informações adicionais',
          }

          const col = $app.findCollectionByNameOrId('agent_actions')
          const rec = new Record(col)
          rec.set('user', uid)
          rec.set('action_type', 'create_zernio_template')
          rec.set('status', 'pending_approval')
          rec.set('params', {
            name: tName,
            category: category,
            language: 'pt_BR',
            header_text: headerText || undefined,
            footer_text: footerText || undefined,
            body: bodyText,
            examples: examples,
            buttons: buttons.length > 0 ? buttons : undefined,
          })
          $app.save(rec)
          console.log('[agent_chat] Fallback executado com sucesso: ação criada ID=' + rec.id)
        } catch (fbErr) {
          console.log('[agent_chat] Erro no fallback de proposta: ' + fbErr.message)
        }
      }

      if (stream) {
        const conv = agent.getOrCreateConversation({
          user_id: authUserId,
          id: conversationId,
        })

        const iter = agent.chat({
          user_id: authUserId,
          conversation_id: conv.id,
          message: enrichedMessage,
          stream: true,
        })

        e.response.header().set('Content-Type', 'text/event-stream')
        e.response.header().set('Cache-Control', 'no-cache')
        e.response.header().set('X-Conversation-Id', conv.id)
        $response.stream(e, iter)

        // Pós-stream: verificar se precisamos rodar o fallback caso a LLM não tenha chamado a tool
        try {
          const lastMsgs = agent.listMessages({
            conversation_id: conv.id,
            user_id: authUserId,
            limit: 2,
          })
          const msgsList = Array.isArray(lastMsgs) ? lastMsgs : lastMsgs?.messages || []
          const lastAssistant = msgsList.filter((m) => m.role === 'assistant').pop()
          if (lastAssistant && lastAssistant.content) {
            runProposalFallback(message, lastAssistant.content, authUserId)
          }
        } catch (_) {}

        return
      }

      const result = agent.chat({
        user_id: authUserId,
        conversation_id: conversationId,
        message: enrichedMessage,
      })

      if (result && result.content) {
        runProposalFallback(message, result.content, authUserId)
      }

      return e.json(200, {
        conversation_id: result.conversation_id,
        content: result.content,
        citations: result.citations,
        message_id: result.message_id,
      })
    } catch (err) {
      if (err instanceof SkipAiConfigError) {
        return e.json(503, { error: 'IA temporariamente indisponível no Skip Cloud.' })
      }
      if (err instanceof SkipAiAgentsError) {
        const status = err.status || 500
        return e.json(status, {
          error: status >= 500 ? 'Falha no processamento do agente.' : err.message,
        })
      }
      if (err instanceof SkipAiError) {
        const status = err.status || 502
        return e.json(status, {
          error: status >= 500 ? 'Serviço de IA indisponível.' : err.message,
        })
      }
      console.log('Erro no chat do agente: ' + err.message)
      return e.json(500, { error: 'Erro interno ao consultar o Agente: ' + err.message })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/agent/conversations',
  (e) => {
    let authUser = e.auth
    let authUserId = authUser ? authUser.id : ''

    if (!authUserId) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }

    const limit = parseInt(e.requestInfo().query?.limit || '20', 10) || 20

    try {
      const agent = $ai.agent('conversas-assistant')
      const convs = agent.listConversations({ user_id: authUserId, limit: limit })
      return e.json(200, convs)
    } catch (err) {
      console.log('Erro ao listar conversas do agente: ' + err.message)
      return e.json(500, { error: 'Falha ao buscar histórico de conversas do Agente.' })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/agent/conversations/{conversationId}/messages',
  (e) => {
    let authUser = e.auth
    let authUserId = authUser ? authUser.id : ''

    if (!authUserId) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }

    const convId = e.request.pathValue('conversationId')
    if (!convId) {
      return e.json(400, { error: 'conversationId não informado.' })
    }

    try {
      const agent = $ai.agent('conversas-assistant')
      const msgs = agent.listMessages({
        conversation_id: convId,
        user_id: authUserId,
      })
      return e.json(200, msgs)
    } catch (err) {
      if (err instanceof SkipAiAgentsError) {
        const status = err.status || 500
        return e.json(status, { error: status >= 500 ? 'Conversa não encontrada.' : err.message })
      }
      console.log('Erro ao buscar mensagens do agente: ' + err.message)
      return e.json(500, { error: 'Falha ao buscar mensagens da conversa.' })
    }
  },
  $apis.requireAuth(),
)
