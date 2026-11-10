import React, { memo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface AgentMarkdownProps {
  content: string
}

/**
 * Renderizador de Markdown personalizado para mensagens do Agente IA.
 * Suporta GFM (GitHub Flavored Markdown), com destaque para:
 * - Tabelas elegantes e responsivas (bordas suaves, cabeçalho sutil, zebra striping)
 * - Cabeçalhos proporcionais ao chat
 * - Listas com espaçamento e marcadores
 * - Citações / Blockquotes com barra lateral em tom suave
 * - Código inline e blocos de código com fundo sutil
 * - Links estilizados com a cor de destaque
 */
export const AgentMarkdown = memo(function AgentMarkdown({ content }: AgentMarkdownProps) {
  if (!content) return null

  return (
    <div className="agent-markdown text-xs text-[#353B47] leading-relaxed break-words space-y-2.5 max-w-full min-w-0 overflow-hidden">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Tabelas elegantes com scroll horizontal para não quebrar o layout da bolha
          table: ({ children }) => (
            <div className="my-2.5 w-full overflow-x-auto rounded-xl border border-[#DCE4E4] bg-white shadow-2xs">
              <table className="w-full min-w-full border-collapse text-left text-[11px] leading-normal">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-[#DCE4E4] bg-[#F4F7F8] text-[#464B5F] font-semibold">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#EBF0F1] bg-white text-[#353B47]">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="transition-colors hover:bg-[#F8FAFA] even:bg-[#FAFCFC]/70">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-[#464B5F] whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 align-middle text-[#464B5F]">{children}</td>
          ),

          // Cabeçalhos proporcionais à bolha do chat
          h1: ({ children }) => (
            <h1 className="mt-3 mb-1.5 text-sm font-bold text-[#1E2530] first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-2.5 mb-1 text-[13px] font-bold text-[#1E2530] first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 mb-1 text-xs font-semibold text-[#1E2530] first:mt-0">
              {children}
            </h3>
          ),

          // Parágrafos
          p: ({ children }) => (
            <p className="leading-relaxed [&:not(:first-child)]:mt-2">{children}</p>
          ),

          // Listas
          ul: ({ children }) => (
            <ul className="my-2 ml-4 list-disc space-y-1 marker:text-[#8B5CF6]">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-4 list-decimal space-y-1 marker:font-semibold marker:text-[#8B5CF6]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,

          // Citações (Blockquotes, ex: `> **Observação:** ...`)
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 rounded-r-xl border-l-3 border-[#8B5CF6] bg-[#F8F7FF] px-3 py-2 text-[11px] text-[#4A5568] italic [&>p]:m-0">
              {children}
            </blockquote>
          ),

          // Destaque forte e itálico
          strong: ({ children }) => (
            <strong className="font-semibold text-[#1F2937]">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#7C3AED] underline underline-offset-2 hover:text-[#6366F1] transition-colors"
            >
              {children}
            </a>
          ),

          // Código inline e blocos de código
          code: ({ className, children, ...props }) => {
            const isCodeBlock = Boolean(className)
            if (isCodeBlock) {
              return (
                <code
                  className={`block overflow-x-auto rounded-lg bg-[#272B35] p-3 text-[11px] font-mono text-[#E2E8F0] ${className || ''}`}
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <code
                className="rounded-md bg-[#EEF2F6] px-1.5 py-0.5 font-mono text-[11px] text-[#5B21B6] border border-[#E2E8F0]"
                {...props}
              >
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-xl bg-[#1E2530] text-slate-100 shadow-2xs">
              {children}
            </pre>
          ),

          // Separador horizontal
          hr: () => <hr className="my-3 border-t border-[#E2E8F0]" />,
        }}
      >
        {content}
      </Markdown>
    </div>
  )
})
