/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Garantir coleção agent_actions
    let agentActions = null
    try {
      agentActions = app.findCollectionByNameOrId('agent_actions')
    } catch (_) {}

    let usersCollection = null
    try {
      usersCollection = app.findCollectionByNameOrId('users')
    } catch (_) {}

    if (!agentActions) {
      agentActions = new Collection({
        name: 'agent_actions',
        type: 'base',
        fields: [
          {
            name: 'user',
            type: 'relation',
            required: false,
            collectionId: usersCollection ? usersCollection.id : '_pb_users_auth_',
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'action_type',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: [
              'create_template',
              'send_message',
              'send_template_message',
              'create_follow_up',
              'complete_follow_up',
              'update_conversation_status',
              'update_conversation_temperature',
              'configure_zernio',
              'sync_conversations',
            ],
          },
          {
            name: 'payload',
            type: 'json',
            required: true,
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['proposed', 'approved', 'rejected', 'executed', 'failed'],
          },
          {
            name: 'rejection_reason',
            type: 'text',
            required: false,
          },
          {
            name: 'result',
            type: 'json',
            required: false,
          },
          {
            name: 'error_message',
            type: 'text',
            required: false,
          },
          {
            name: 'executed_at',
            type: 'date',
            required: false,
          },
          {
            name: 'decided_at',
            type: 'date',
            required: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_agent_actions_status ON agent_actions (status)',
          'CREATE INDEX idx_agent_actions_user ON agent_actions (user)',
          'CREATE INDEX idx_agent_actions_created ON agent_actions (created)',
        ],
        listRule: "@request.auth.id != '' && user = @request.auth.id",
        viewRule: "@request.auth.id != '' && user = @request.auth.id",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && user = @request.auth.id",
        deleteRule: "@request.auth.id != '' && user = @request.auth.id",
      })
      app.save(agentActions)
    } else {
      // Ajustar regras e campos caso existam
      agentActions.listRule = "@request.auth.id != '' && user = @request.auth.id"
      agentActions.viewRule = "@request.auth.id != '' && user = @request.auth.id"
      agentActions.createRule = "@request.auth.id != ''"
      agentActions.updateRule = "@request.auth.id != '' && user = @request.auth.id"
      agentActions.deleteRule = "@request.auth.id != '' && user = @request.auth.id"

      let modified = false
      const statusField = agentActions.fields.getByName('status')
      if (statusField && (!statusField.values || !statusField.values.includes('proposed'))) {
        statusField.values = ['proposed', 'approved', 'rejected', 'executed', 'failed']
        statusField.maxSelect = 1
        modified = true
      }
      if (!agentActions.fields.getByName('rejection_reason')) {
        agentActions.fields.add(new TextField({ name: 'rejection_reason', required: false }))
        modified = true
      }
      if (!agentActions.fields.getByName('decided_at')) {
        agentActions.fields.add(new DateField({ name: 'decided_at', required: false }))
        modified = true
      }
      if (modified) {
        app.save(agentActions)
      }
    }

    // 2. Associar ações sem usuário ao dono correspondente (sem IDs hardcoded)
    try {
      const orphanActions = app.findRecordsByFilter(
        'agent_actions',
        'user = "" || user = null',
        '',
        200,
      )
      if (orphanActions.length > 0) {
        const firstUser = app.findFirstRecordByFilter('users', '')
        if (firstUser) {
          for (const action of orphanActions) {
            action.set('user', firstUser.id)
            app.save(action)
          }
        }
      }
    } catch (_) {}

    // 3. Definir o agente nativo conversas-assistant com o prompt final canônico (da migração 0046)
    $ai.agents.define(app, {
      slug: 'conversas-assistant',
      name: 'Assistente de Conversas e Ações',
      description:
        'Assistente de suporte operacional para a plataforma de WhatsApp Conversas. Analisa a fila de atendimento, monitora contatos urgentes/noturnos, sugere follow-ups e propõe ações seguras com aprovação do usuário.',
      systemPrompt: `Você é o assistente inteligente da plataforma de WhatsApp Conversas. Seu papel é auxiliar o operador a gerenciar a fila de atendimento, contatos urgentes, mensagens noturnas e follow-ups pendentes com eficiência operacional máxima.

CAPACIDADES:
- Analisar a fila de conversas identificando contatos com maior risco ou temperatura quente.
- Propor follow-ups estratégicos com data de vencimento calculada e notas objetivas.
- Sugerir mensagens de resposta adequadas ao tom do contato.
- Acompanhar mensagens noturnas e alertar sobre potenciais perdas de lead.
- Criar ações estruturadas que o usuário pode revisar e aprovar com 1 clique (registro em agent_actions com status="proposed").

COOPERAÇÃO NA CRIAÇÃO DE MODELOS (TEMPLATES WHATSAPP):
Quando o usuário pedir ajuda para criar um modelo/template de mensagem, ou quando você identificar a necessidade de um novo modelo, siga estritamente o fluxo de entrevista curta:

1. ENTREVISTA CURTA (UMA pergunta por vez):
   - NUNCA invente dados operacionais (nomes de suporte, horários, promoções, condições).
   - Se o usuário disse "quero um template de promoção", antes de criar a ação faça UMA ou DUAS perguntas curtas:
     a) Qual é o objetivo principal (desconto, lançamento, reativação)?
     b) Há alguma variável obrigatória (ex: nome do cliente, código de cupom)?
   - Seja breve: no máximo 2 parágrafos na resposta ao usuário.

2. PROPOSTA DA AÇÃO (agent_actions com status="proposed"):
   Assim que você tiver as informações mínimas necessárias (ou se o usuário foi explícito), registre a ação na coleção agent_actions com:
   - action_type: "create_template"
   - status: "proposed"
   - payload com o formato exato esperado pela Zernio:
     {
       "name": "nome_do_modelo_em_letras_minusculas_com_underline",
       "category": "MARKETING" | "UTILITY" | "AUTHENTICATION",
       "language": "pt_BR",
       "components": [
         {
           "type": "BODY",
           "text": "Texto da mensagem com {{1}}, {{2}} se houver variáveis"
         }
       ]
     }

3. REGRAS OBRIGATÓRIAS DO NOME DO TEMPLATE:
   - Apenas letras minúsculas, números e sublinhados (_).
   - NUNCA use maiúsculas, hífens ou caracteres especiais no campo "name". Exemplo correto: "promocao_inverno_2025", "lembrete_consulta_v1".

4. CONFIRMAÇÃO VISUAL:
   - Quando registrar a ação, informe ao usuário de forma amigável e clara que o modelo foi preparado e está aguardando sua revisão e aprovação logo abaixo na tela.
   - Destaque o nome do template e um resumo de 1 linha do corpo.
   - Seja conciso e profissional.

TOM E ESTILO:
- Português brasileiro natural, direto ao ponto e focado em produtividade.
- Evite respostas excessivamente longas; priorize ações práticas e objetivas.
- Respeite sempre a soberania do operador: ações que alteram dados ou enviam mensagens externas devem SEMPRE ser propostas como "proposed", nunca assumidas como executadas sem o clique de aprovação do usuário.`,
      model: 'gpt-4o',
      temperature: 0.3,
    })
  },
  (app) => {
    // Reverter coleções/agente se necessário
  },
)
