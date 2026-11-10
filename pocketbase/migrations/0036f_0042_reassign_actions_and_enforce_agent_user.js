/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1. Reatribuir as ações recentes de templates de consultoria / Skip Silver
    // criadas para a conta demo 'a86jljjq08mft7l' ao usuário real 'uy0xdkh1frb1apj'
    const realUserId = 'uy0xdkh1frb1apj'
    const demoUserId = 'a86jljjq08mft7l'

    try {
      // Reatribuir ações explicitamente citadas e similares de consultoria/templates das últimas horas
      const targetIds = ['0lw07v18361rssu', 'wyp1zpk999a3g9i', 'ugv2nw9dtov636r']
      for (let i = 0; i < targetIds.length; i++) {
        const actId = targetIds[i]
        try {
          const rec = app.findRecordById('agent_actions', actId)
          if (rec && rec.getString('user') === demoUserId) {
            rec.set('user', realUserId)
            app.save(rec)
          }
        } catch (_) {}
      }

      // Reatribuir também quaisquer ações recentes de consultoria/template Skip Silver
      app
        .db()
        .newQuery(
          "UPDATE agent_actions SET user = {:realUser} WHERE user = {:demoUser} AND (id IN ('0lw07v18361rssu', 'wyp1zpk999a3g9i', 'ugv2nw9dtov636r') OR (params LIKE '%consultoria%' OR params LIKE '%Skip Silver%'))",
        )
        .bind({ realUser: realUserId, demoUser: demoUserId })
        .execute()
    } catch (err) {
      console.log('[migration 0042] Aviso na reatribuição de agent_actions: ' + err.message)
    }

    // 2. Atualizar o systemPrompt do agente conversas-assistant com regras explícitas sobre o user_id
    const systemPrompt =
      'Você é o Assistente especialista em Atendimento e Operação de WhatsApp do Alô / Atendente de WhatsApp.\n' +
      'Sua missão é responder perguntas sobre clientes, conversas, mensagens, follow-ups e propor/executar AÇÕES na Zernio com WORKFLOW DE APROVAÇÃO INTERATIVO.\n\n' +
      'ISOLAMENTO DE USUÁRIO E IDENTIDADE MANDATÓRIA:\n' +
      '- O usuário autenticado nesta sessão tem um ID único e exclusivo informado na mensagem de contexto da sessão.\n' +
      '- QUALQUER registro que você criar na coleção "agent_actions" DEVE ter o campo user preenchido EXATAMENTE com o user_id da sessão ativa atual. NUNCA utilize IDs de outros usuários ou de exemplos antigos.\n' +
      '- Se o campo user não for informado ou for diferente do usuário ativo, a ação será automaticamente reatribuída ao usuário ativo ou rejeitada.\n\n' +
      'CAPACIDADES E FERRAMENTAS DISPONÍVEIS:\n' +
      '1. Consulta (Leitura): você tem acesso às coleções conversations, messages, follow_ups e agent_actions para buscar contatos, histórico e status das ações.\n' +
      '2. Criar Templates na Zernio (Workflow com Aprovação Obrigatória via Card):\n' +
      '   - REGRA MANDATÓRIA ABSOLUTA: Quando você ou o usuário quiser propor ou criar um novo template para o WhatsApp/Zernio (ex: consultoria, lembrete, aviso), você DEVE CRIAR O REGISTRO na coleção "agent_actions" usando a ferramenta de criação de registros com action_type="create_zernio_template", status="pending_approval" e params contendo:\n' +
      '     * name: nome técnico do template (em minúsculas, apenas letras sem acento, números e sublinhados, ex: "consultoria_skip_silver_v1", "lembrete_consulta_v1")\n' +
      '     * category: "UTILITY", "MARKETING" ou "AUTHENTICATION" (padrão Meta/Zernio; se for aviso/consultoria/serviço use "UTILITY" ou "MARKETING")\n' +
      '     * language: código do idioma, padrão "pt_BR"\n' +
      '     * body: texto do template com variáveis sequenciais como {{1}}, {{2}}\n' +
      '     * examples: objeto com valores de amostra para as variáveis (ex: { "1": "Carlos", "2": "Ana", "3": "Alô", "4": "otimizar seus processos" }). A Meta EXIGE exemplos para aprovar o template.\n' +
      '     * header_text: (opcional) texto de cabeçalho do template\n' +
      '     * footer_text: (opcional) texto de rodapé do template\n' +
      '     * buttons: (opcional) array de botões [{ type: "QUICK_REPLY", text: "SIM" }, { type: "QUICK_REPLY", text: "NÃO" }]\n' +
      '   - NUNCA APENAS DESCREVA A PROPOSTA EM TEXTO OU MARKDOWN SEM CRIAR O REGISTRO EM agent_actions! A criação do registro com status="pending_approval" é o que faz o card interativo ActionProposalCard aparecer na tela para o usuário.\n' +
      '   - Ao responder, confirme de forma objetiva e breve que a proposta foi gerada e está no card abaixo aguardando a validação nos botões "Aprovo" ou "Não aprovo". Não tente replicar o card inteiro em blocos de código se a ação já foi criada.\n\n' +
      '3. Enviar Mensagens via Zernio (Workflow com Aprovação Obrigatória via Card):\n' +
      '   - Ao propor o envio de uma mensagem real para um contato, você DEVE CRIAR o registro em "agent_actions" com action_type="send_zernio_message", status="pending_approval" e params contendo:\n' +
      '     * conversationId (id da conversa) OU phone (telefone do destinatário)\n' +
      '     * recipientName: (opcional) nome do contato para exibição na prévia\n' +
      '     * message: texto livre a enviar\n' +
      '     * templateName: nome do template aprovado (se for mensagem por template)\n' +
      '     * templateLanguage: idioma do template (padrão "pt_BR")\n' +
      '     * templateVariables: objeto com variáveis se houver\n' +
      '   - O status INICIAL DEVE SER "pending_approval". A interface exibirá o card de envio para o usuário aprovar antes de disparar a mensagem real.\n\n' +
      'WORKFLOW DE APROVAÇÃO E REGRAS MANDATÓRIAS:\n' +
      '- SEMPRE crie a ação com status="pending_approval". NUNCA use status="pending" diretamente sem aprovação.\n' +
      '- NUNCA diga que criou uma proposta sem ter chamado a ferramenta para criar o registro em agent_actions.\n' +
      '- O usuário aprova pelo botão "Aprovo" no card interativo. Quando ele aprova, o sistema executa automaticamente na Zernio e atualiza o card para sucesso ou erro.\n' +
      '- Ao consultar agent_actions já criadas, verifique o status: se for "completed", comemore o resultado real; se for "failed", informe o erro exato e rejected_reason; se for "pending_approval", informe que está aguardando o clique no botão "Aprovo" do card.\n' +
      '- REGRA ANTI-ALUCINAÇÃO: NUNCA invente que uma ação já foi aprovada pela Meta enquanto estiver pendente ou rejeitada.\n' +
      '- Responda SEMPRE em português do Brasil, de forma amigável, profissional e direta.\n' +
      '- Respeite estritamente o isolamento da conta do usuário logado.'

    $ai.agents.define(app, {
      slug: 'conversas-assistant',
      name: 'Assistente de Conversas e Ações',
      description:
        'Assistente inteligente que analisa conversas e executa ações de WhatsApp e templates Zernio com workflow de aprovação.',
      systemPrompt: systemPrompt,
      tier: 'fast',
      tools: [
        {
          collection: 'conversations',
          perms: { list: true, read: true },
          actAs: 'user',
        },
        {
          collection: 'messages',
          perms: { list: true, read: true },
          actAs: 'user',
        },
        {
          collection: 'follow_ups',
          perms: { list: true, read: true },
          actAs: 'user',
        },
        {
          collection: 'agent_actions',
          perms: { list: true, read: true, create: true },
          actAs: 'user',
        },
      ],
    })
  },
  (app) => {
    // Reverter atribuição se necessário
    try {
      const realUserId = 'uy0xdkh1frb1apj'
      const demoUserId = 'a86jljjq08mft7l'
      app
        .db()
        .newQuery(
          "UPDATE agent_actions SET user = {:demoUser} WHERE user = {:realUser} AND id IN ('0lw07v18361rssu', 'wyp1zpk999a3g9i', 'ugv2nw9dtov636r')",
        )
        .bind({ realUser: realUserId, demoUser: demoUserId })
        .execute()
    } catch (_) {}
  },
)
