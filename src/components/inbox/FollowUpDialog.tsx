import { useEffect, useState } from 'react'
import { AppIcons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { defaultFollowUpDate } from '@/lib/format'
import { useInbox } from '@/contexts/InboxContext'
import type { Conversation } from '@/types/inbox'

interface FollowUpDialogProps {
  conversation: Conversation | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FollowUpDialog({ conversation, open, onOpenChange }: FollowUpDialogProps) {
  const { createFollowUpFor } = useInbox()
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState(defaultFollowUpDate())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(conversation ? `Retomar conversa com ${conversation.name.split(' ')[0]}` : '')
    setDueAt(defaultFollowUpDate())
    setErrors({})
  }, [conversation, open])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!title.trim()) nextErrors.title = 'Informe o título do follow-up.'
    if (!dueAt) nextErrors.dueAt = 'Informe a data e a hora do prazo.'
    else if (new Date(dueAt).getTime() <= Date.now())
      nextErrors.dueAt = 'Escolha um prazo no futuro.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || !conversation) return

    setSubmitting(true)
    try {
      await createFollowUpFor(conversation.id, title.trim(), new Date(dueAt).toISOString())
      onOpenChange(false)
    } catch {
      setErrors({ form: 'Não foi possível criar o follow-up. Tente novamente.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] rounded-2xl border-[#D4DEDF] bg-[#FCFDFD] p-0 shadow-[0_22px_70px_rgba(52,66,78,0.18)]">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-[#E3E9E9] px-6 py-5 text-left">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[#EEF4F2] text-[#52675E]">
              <AppIcons.queueFollowUps className="h-4.5 w-4.5" />
            </div>
            <DialogTitle className="text-xl font-semibold tracking-tight text-[#3D4558]">
              Criar follow-up
            </DialogTitle>
            <DialogDescription className="text-sm leading-5 text-[#858A96]">
              Defina quando a conversa com {conversation?.name ?? 'este lead'} deve voltar à sua
              atenção.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="follow-up-title">Título do follow-up</Label>
              <Input
                id="follow-up-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Retomar proposta"
                autoFocus
                aria-invalid={Boolean(errors.title)}
                className="h-11 bg-white focus-visible:ring-[#57D067]"
              />
              {errors.title && <p className="text-xs text-red-600">{errors.title}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="follow-up-due">Prazo</Label>
              <div className="relative">
                <AppIcons.queueFollowUps className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[#9DA2AD]" />
                <Input
                  id="follow-up-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  aria-invalid={Boolean(errors.dueAt)}
                  className="h-11 bg-white pl-9 focus-visible:ring-[#57D067]"
                />
              </div>
              {errors.dueAt && <p className="text-xs text-red-600">{errors.dueAt}</p>}
            </div>

            {errors.form && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {errors.form}
              </p>
            )}
          </div>

          <DialogFooter className="flex-row justify-end gap-2 border-t border-[#E3E9E9] bg-[#F9FBFB] px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-[#666E7C]"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-[#464B5F] font-semibold text-white hover:bg-[#383E51]"
            >
              {submitting && <AppIcons.spinner className="mr-2 h-4 w-4 animate-spin" />}
              Criar follow-up
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
