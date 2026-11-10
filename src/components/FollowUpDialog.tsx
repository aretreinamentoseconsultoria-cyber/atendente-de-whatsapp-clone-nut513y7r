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
import { useCrm } from '@/contexts/CrmContext'

export default function FollowUpDialog({
  conversationId,
  name,
  open,
  onOpenChange,
  conversationsList,
}: {
  conversationId?: string
  name?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationsList?: Array<{ id: string; name: string; phone?: string }>
}) {
  const { createFollowUp } = useCrm()
  const [selectedConvoId, setSelectedConvoId] = useState(conversationId || '')
  const [title, setTitle] = useState('Retomar conversa')
  const [dueAt, setDueAt] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (conversationId) {
      setSelectedConvoId(conversationId)
    } else if (conversationsList && conversationsList.length > 0 && !selectedConvoId) {
      setSelectedConvoId(conversationsList[0].id)
    }
  }, [conversationId, conversationsList, selectedConvoId])

  useEffect(() => {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
    date.setMinutes(0, 0, 0)
    setDueAt(date.toISOString().slice(0, 16))
  }, [open])

  const targetName =
    name || conversationsList?.find((c) => c.id === selectedConvoId)?.name || 'conversa'

  async function submit() {
    const targetId = conversationId || selectedConvoId
    if (!targetId) return
    setBusy(true)
    try {
      await createFollowUp(targetId, title, new Date(dueAt).toISOString())
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#CBD6D7] sm:max-w-md bg-white">
        <DialogHeader>
          <div className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-orange-50 text-[#EA580C] border border-orange-200/80">
            <AppIcons.queueFollowUps className="h-4 w-4" />
          </div>
          <DialogTitle className="text-sm font-bold text-[#353B47]">Criar follow-up</DialogTitle>
          <DialogDescription className="text-xs text-[#7A838D]">
            Programe uma retomada para {targetName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {conversationsList && conversationsList.length > 0 && !conversationId && (
            <div>
              <Label htmlFor="follow-conversation" className="text-xs font-semibold text-[#464B5F]">
                Conversa do WhatsApp
              </Label>
              <select
                id="follow-conversation"
                value={selectedConvoId}
                onChange={(e) => setSelectedConvoId(e.target.value)}
                className="mt-1.5 h-10 md:h-9 w-full rounded-lg border border-[#CBD6D7] bg-white px-3 text-base md:text-xs text-[#353B47] outline-none focus:ring-1 focus:ring-[#CBD6D7]"
              >
                {conversationsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label htmlFor="follow-title" className="text-xs font-semibold text-[#464B5F]">
              Título da tarefa / motivo
            </Label>
            <Input
              id="follow-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex: Enviar proposta, tirar dúvidas..."
              className="mt-1.5 h-10 md:h-9 rounded-lg border-[#CBD6D7] text-base md:text-xs text-[#353B47] focus:ring-1 focus:ring-[#CBD6D7]"
            />
          </div>

          <div>
            <Label htmlFor="follow-date" className="text-xs font-semibold text-[#464B5F]">
              Data e hora do prazo
            </Label>
            <Input
              id="follow-date"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="mt-1.5 h-10 md:h-9 rounded-lg border-[#CBD6D7] text-base md:text-xs text-[#353B47] focus:ring-1 focus:ring-[#CBD6D7]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="min-h-[44px] md:min-h-[36px] text-xs text-[#68717E] hover:text-[#353B47] touch-manipulation"
          >
            Cancelar
          </Button>
          <Button
            disabled={busy || !title || !dueAt || (!conversationId && !selectedConvoId)}
            onClick={() => void submit()}
            className="min-h-[44px] md:min-h-[36px] bg-[#464B5F] text-xs text-white hover:bg-[#373C4F] touch-manipulation"
          >
            {busy ? 'Criando...' : 'Criar follow-up'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
