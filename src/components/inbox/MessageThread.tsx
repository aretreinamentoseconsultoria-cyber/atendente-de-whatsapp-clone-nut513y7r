import { avatarColors, initials } from '@/components/inbox/avatar'
import { dateTimeLabel, isNightMessage } from '@/components/inbox/format'
import { parseSharedContact } from '@/lib/contactCard'
import { SharedContactCard } from '@/components/inbox/SharedContactCard'
import { AudioPlayer } from '@/components/inbox/AudioPlayer'
import { DocumentCard } from '@/components/inbox/DocumentCard'
import { ImageMessage } from '@/components/inbox/ImageMessage'
import type { Conversation, Message } from '@/types/inbox'

export default function MessageThread({
  conversation,
  messages,
}: {
  conversation: Conversation
  messages: Message[]
}) {
  return (
    <div className="message-thread">
      {messages.length === 0 && (
        <p className="thread-empty">Ainda não há mensagens nesta conversa.</p>
      )}
      {messages.map((message) => {
        const incoming = message.direction === 'in'
        const sender = incoming ? conversation.name : 'Você'
        return (
          <article className="message-entry" key={message.id}>
            {incoming && conversation.avatar_url ? (
              <img
                src={conversation.avatar_url}
                alt={conversation.name}
                className="message-avatar h-8 w-8 rounded-full object-cover border border-[#CBD6D7]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                className="message-avatar"
                style={
                  incoming
                    ? avatarColors(conversation.name)
                    : { backgroundColor: '#EAF8ED', color: '#438A51' }
                }
              >
                {incoming ? initials(conversation.name) : 'FB'}
              </span>
            )}
            <div className="message-card">
              <header>
                <strong>{sender}</strong>
                <span>{dateTimeLabel(message.sent_at)}</span>
                {isNightMessage(message) && <em>Madrugada</em>}
              </header>
              {(() => {
                const contactData = parseSharedContact(message.body)
                if (contactData) {
                  return (
                    <div className="mt-1">
                      <SharedContactCard
                        contact={contactData}
                        isOutgoing={!incoming}
                        formattedTime={dateTimeLabel(message.sent_at)}
                      />
                    </div>
                  )
                }
                const isAudio =
                  message.media_type === 'audio' ||
                  Boolean(message.media_url && message.body && message.body.includes('🎵'))
                if (isAudio) {
                  return (
                    <div className="mt-1">
                      <AudioPlayer
                        messageId={message.id}
                        mediaUrl={message.media_url}
                        transcription={message.transcription}
                        direction={incoming ? 'in' : 'out'}
                      />
                    </div>
                  )
                }
                const isDocument =
                  message.media_type === 'file' ||
                  Boolean(message.body && message.body.trim().toLowerCase().endsWith('.pdf'))
                if (isDocument) {
                  return (
                    <div className="mt-1">
                      <DocumentCard
                        messageId={message.id}
                        mediaUrl={message.media_url}
                        fileName={message.body}
                        direction={incoming ? 'in' : 'out'}
                      />
                    </div>
                  )
                }
                const isImage = message.media_type === 'image'
                if (isImage) {
                  return (
                    <div className="mt-1">
                      <ImageMessage
                        messageId={message.id}
                        mediaUrl={message.media_url}
                        caption={message.body}
                        direction={incoming ? 'in' : 'out'}
                      />
                    </div>
                  )
                }
                return <p className="whitespace-pre-wrap break-words">{message.body}</p>
              })()}
            </div>
          </article>
        )
      })}
    </div>
  )
}
