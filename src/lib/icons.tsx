import React from 'react'
import type { IconType } from 'react-icons'
import {
  PiTray, // Módulo Inbox (caixa/bandeja postal)
  PiBell, // Módulo Follow-ups / Notificações
  PiGearSix, // Módulo Configurações / Ajustes
  PiLightning, // Fila "Responder agora" (urgente, ação imediata - elimina duplicação com PiTray)
  PiMoonStars, // Fila "Madrugada" (noite / mensagens fora de hora)
  PiClockCountdown, // Fila "Em acompanhamento" (espera / tempo de resposta)
  PiChatCircleDots, // Fila "Todas as conversas" / WhatsApp threads
  PiChats, // Mensagens gerais / Chat geral
  PiPushPinFill, // Pin fixado (vinho #7B2D3B)
  PiPushPinSlash, // Pin desafixado
  PiPushPin, // Pin vazado (para hover ou neutro)
  PiMagnifyingGlass, // Busca / Pesquisa
  PiArrowsClockwise, // Sincronização / Atualizar / Refresh
  PiPaperPlaneRight, // Enviar mensagem / Modo envio WhatsApp
  PiEye, // Modo revisão / Visualizar
  PiShieldCheck, // Proteção / Meta 24h aberta / Conexão segura
  PiWarningCircle, // Alerta / Atenção / Meta 24h fechada / Janela expirada
  PiWarningDiamond, // Alerta crítico / Risco
  PiSparkle, // Sugestão IA / Assistente
  PiSparkleFill, // Sugestão IA ativa
  PiCopy, // Copiar rascunho / Clipboard
  PiCheck, // Concluído / Checkmark
  PiCheckCircle, // Respondida / Sucesso
  PiXCircle, // Cancelado / Erro
  PiX, // Fechar / Dismiss
  PiCalendarCheck, // Follow-up agendado / Agenda
  PiCalendarPlus, // Criar follow-up
  PiGlobeSimple, // Zernio API / Status da conexão externa
  PiDeviceMobileCamera, // Número WhatsApp / Smartphone
  PiUsersThree, // Todos os perfis / Equipe
  PiUser, // Perfil de contato individual
  PiSignOut, // Sair / Logout
  PiList, // Menu mobile / Gaveta
  PiSlidersHorizontal, // Filtros / Fila priorizada
  PiFlame, // Lead quente / Tempo sem resposta
  PiThermometerCold, // Lead frio
  PiThermometerSimple, // Lead morno / Temperatura
  PiTarget, // Intenção do lead (semântica própria!)
  PiArticle, // Resumo da conversa (semântica própria!)
  PiLightbulbFilament, // Próxima melhor ação / Insight (semântica própria!)
  PiSidebarSimple, // Abrir/fechar painel lateral
  PiCaretDown, // Chevron baixo
  PiCaretLeft, // Chevron esquerda / Voltar
  PiCaretRight, // Chevron direita / Próximo
  PiLockKey, // Segredo / Chave criptográfica
  PiKey, // API Key
  PiArrowSquareOut, // Link externo
  PiInfo, // Informação
  PiArrowRight, // Seta seguir
  PiArrowUpRight, // Seta diagonal
  PiDotsThreeOutline, // Menu mais opções
  PiQuestion, // Ajuda
  PiEnvelopeSimple, // E-mail
  PiEyeSlash, // Senha oculta
  PiSpinner, // Carregando
  PiAddressBook, // Cartão de contato / Contato compartilhado vCard
  PiPhone, // Telefone / Ligar
  PiPlus, // Adicionar / Criar
  PiTrash, // Excluir / Remover
} from 'react-icons/pi'

/**
 * Registro Central de Ícones Semânticos — Fernand WhatsApp CRM
 *
 * Princípio chave:
 * Cada conceito do sistema possui um ícone Phosphor DISTINTO para eliminar
 * qualquer duplicação confusa (ex: "Responder agora" usa PiLightning em vez de PiTray).
 * Conceitos iguais em telas diferentes compartilham exatamente o mesmo componente.
 */

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  className?: string
  color?: string
}

function wrap(Icon: IconType, defaultClass = '') {
  return function FernandIcon({ className, size, color, ...props }: IconProps) {
    const combinedClass = defaultClass
      ? className
        ? `${defaultClass} ${className}`
        : defaultClass
      : className
    return <Icon className={combinedClass} size={size} color={color} {...props} />
  }
}

// 1. Módulos do Sistema & Navegação Primária
export const AppIcons = {
  // Chat & Brand
  chatBubble: wrap(PiChatCircleDots), // Fernand Brand / Chat
  messageMore: wrap(PiChats), // Múltiplas conversas
  clock: wrap(PiClockCountdown), // Tempo decorrido / Relógio

  // Módulos
  moduleInbox: wrap(PiTray), // Módulo Inbox (azul #3B82F6)
  moduleFollowUps: wrap(PiBell, 'icon-hover-bell'), // Módulo Follow-ups (laranja #F97316) - sino balança no hover
  moduleSettings: wrap(PiGearSix), // Módulo Configurações (roxo #8B5CF6)

  // Filas de Atendimento (DISTINTAS — sem repetição de inbox!)
  // Ícones das filas: leve escala (1 -> ~1.1) no hover, traço ganha intensidade da cor de identidade
  queueUrgent: wrap(PiLightning, 'icon-hover-queue queue-urgent-icon'), // "Responder agora" (vermelho #EF4444)
  queueFollowUps: wrap(PiCalendarCheck, 'icon-hover-queue queue-followups-icon'), // "Follow-ups" (laranja #F97316)
  queueNight: wrap(PiMoonStars, 'icon-hover-queue queue-night-icon'), // "Madrugada" (roxo #8B5CF6)
  queueTracking: wrap(PiClockCountdown, 'icon-hover-queue queue-tracking-icon'), // "Em acompanhamento" (verde #10B981)
  queueAll: wrap(PiChatCircleDots, 'icon-hover-queue queue-all-icon'), // "Todas as conversas" (azul #3B82F6)

  // Ações de Fixação / Pin (vinho #7B2D3B)
  // Pin: wiggle / rotação leve no hover convidando ao clique
  pinFilled: wrap(PiPushPinFill, 'icon-hover-pin'), // Fixado no seletor ou no rail
  pinSlash: wrap(PiPushPinSlash, 'icon-hover-pin'), // Desafixar
  pinOutline: wrap(PiPushPin, 'icon-hover-pin'), // Pin vazado

  // Modos de Operação & Segurança
  modeReadOnly: wrap(PiEye), // Modo revisão (cinza/azul)
  modeReadWrite: wrap(PiPaperPlaneRight, 'icon-hover-send'), // Modo envio assistido
  shieldSafe: wrap(PiShieldCheck), // Segurança / Meta 24h aprovada
  shieldAlert: wrap(PiWarningDiamond), // Janela Meta 24h fechada / Aviso de risco
  warningCircle: wrap(PiWarningCircle), // Aviso moderado / Alerta

  // Inteligência do Lead (DISTINTOS para cada conceito!)
  intent: wrap(PiTarget), // Intenção detectada (alvo/mira - não duplica com usuário)
  summary: wrap(PiArticle), // Resumo da conversa (documento/artigo)
  nextAction: wrap(PiLightbulbFilament), // Próxima melhor ação (lâmpada de ideia)
  aiSparkle: wrap(PiSparkle), // Sugestão IA gerando
  aiSparkleFilled: wrap(PiSparkleFill), // Sugestão IA
  moduleAgent: wrap(PiSparkle), // Módulo Agente Conversacional
  template: wrap(PiArticle), // Templates de Mensagem
  plus: wrap(PiPlus), // Adicionar
  trash: wrap(PiTrash), // Deletar

  // Temperatura do Lead
  tempHot: wrap(PiFlame), // Lead quente (fogo)
  tempWarm: wrap(PiThermometerSimple), // Lead morno (termômetro neutro)
  tempCold: wrap(PiThermometerCold), // Lead frio (termômetro frio)

  // Ações de Mensagens & Composer
  copy: wrap(PiCopy, 'icon-hover-copy'), // Copiar para área de transferência - micro pulo pra cima no hover
  send: wrap(PiPaperPlaneRight, 'icon-hover-send'), // Enviar via Zernio WhatsApp - desliza pra frente no hover
  check: wrap(PiCheck), // Check simples
  checkCircle: wrap(PiCheckCircle), // Marcar como respondida / Concluído
  close: wrap(PiX), // Fechar modal / dismiss
  closeCircle: wrap(PiXCircle), // Cancelar / Desconectar
  sync: wrap(PiArrowsClockwise, 'icon-hover-sync'), // Sincronizar conversas - rotação suave no hover

  // Perfis & Contas WhatsApp
  allProfiles: wrap(PiUsersThree), // Todos os perfis / unificado
  singleProfile: wrap(PiUser), // Perfil único / contato
  contactCard: wrap(PiAddressBook), // Contato compartilhado WhatsApp / vCard
  phone: wrap(PiPhone), // Telefone de contato
  phoneDevice: wrap(PiDeviceMobileCamera), // Aparelho conectado
  zernioGlobe: wrap(PiGlobeSimple), // Status da API Zernio

  // Utilitários de Interface
  search: wrap(PiMagnifyingGlass), // Busca na barra superior / listas
  bell: wrap(PiBell, 'icon-hover-bell'), // Notificações / Sino da barra - balança no hover
  menu: wrap(PiList), // Gaveta / Menu hambúrguer
  filterQueue: wrap(PiSlidersHorizontal), // "Fila prioritizada" / Sliders
  panelToggle: wrap(PiSidebarSimple), // Abrir/fechar painel lateral
  logout: wrap(PiSignOut), // Deslogar
  lock: wrap(PiLockKey), // Credenciais criptografadas
  key: wrap(PiKey), // Chave de API
  externalLink: wrap(PiArrowSquareOut), // Link para dashboard externo
  info: wrap(PiInfo), // Informação
  dotsHorizontal: wrap(PiDotsThreeOutline), // Mais opções
  help: wrap(PiQuestion), // Ajuda
  email: wrap(PiEnvelopeSimple), // E-mail
  eyeOff: wrap(PiEyeSlash), // Ocultar senha
  spinner: wrap(PiSpinner), // Spinner de carregamento

  // Setas e Navegação
  arrowLeft: wrap(PiCaretLeft), // Voltar
  arrowRight: wrap(PiCaretRight), // Próximo
  arrowNavRight: wrap(PiArrowRight), // Seta direta
  arrowUpRight: wrap(PiArrowUpRight), // Ação recomendada
  chevronDown: wrap(PiCaretDown), // Dropdown indicador
}

export default AppIcons
