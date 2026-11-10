import { AppIcons } from '@/lib/icons'

export default function SettingsModal({
  email,
  onClose,
  onLogout,
}: {
  email: string
  onClose: () => void
  onLogout: () => void
}) {
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-card settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close"
          type="button"
          onClick={onClose}
          aria-label="Fechar configurações"
        >
          <AppIcons.close size={18} />
        </button>
        <p className="eyebrow">CONFIGURAÇÕES</p>
        <h2 id="settings-title">Sua conta</h2>
        <div className="settings-account">
          <span>Conta conectada</span>
          <strong>{email}</strong>
          <small>Modo revisão ativo</small>
        </div>
        <button className="logout-button" type="button" onClick={onLogout}>
          <AppIcons.logout size={16} /> Sair da conta
        </button>
      </section>
    </div>
  )
}
