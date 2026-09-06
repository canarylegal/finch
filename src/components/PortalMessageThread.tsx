import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import type { PortalMessage } from '../domain'
import { formatMessageTimestamp } from '../portalMessages'

type PortalMessageThreadProps = {
  messages: PortalMessage[]
  viewer: 'employee' | 'admin'
  onSend: (body: string) => void
  disabled?: boolean
  placeholder?: string
}

export function PortalMessageThread({
  messages,
  viewer,
  onSend,
  disabled = false,
  placeholder = 'Write a message…',
}: PortalMessageThreadProps) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = () => {
    const body = draft.trim()
    if (!body || disabled) return
    onSend(body)
    setDraft('')
  }

  return (
    <div className="portal-thread">
      <div className="portal-thread-messages" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="portal-thread-empty">
            <strong>No messages yet</strong>
            <span>Start the conversation about this leave request.</span>
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.author === viewer
            return (
              <div
                key={message.id}
                className={`portal-message ${isOwn ? 'portal-message-own' : 'portal-message-other'}`}
              >
                <div className="portal-message-meta">
                  <strong>{message.authorName}</strong>
                  <span>{formatMessageTimestamp(message.createdAt)}</span>
                </div>
                <div className="portal-message-body">{message.body}</div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>
      {!disabled && (
        <div className="portal-thread-compose">
          <textarea
            rows={2}
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            type="button"
            className="button button-primary portal-send-button"
            disabled={!draft.trim()}
            onClick={handleSend}
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
