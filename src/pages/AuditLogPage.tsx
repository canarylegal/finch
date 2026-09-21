import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import {
  auditActionLabel,
  formatAuditWhen,
  type AuditEvent,
} from '../auditLog'

export function AuditLogPage({
  events,
  onOpen,
}: {
  events: AuditEvent[]
  onOpen?: () => void
}) {
  useEffect(() => {
    onOpen?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh once when opening the page
  }, [])

  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return events
    return events.filter((event) => {
      const haystack = [
        event.summary,
        event.actorName,
        event.action,
        auditActionLabel(event.action),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [events, query])

  return (
    <div className="page">
      <PageHeader
        eyebrow="Admin"
        title="Audit log"
        description="Recent security and approval activity across Finch."
      />

      <div className="card full-panel">
        <div className="report-controls">
          <label>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Actor, action, or summary"
            />
          </label>
          <span className="field-helper">
            Showing {filtered.length} of {events.length} event{events.length === 1 ? '' : 's'}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>{events.length === 0 ? 'No audit events yet' : 'No matching events'}</strong>
            <span>
              {events.length === 0
                ? 'Approvals, settings changes, and 2FA activity will appear here.'
                : 'Try a different search.'}
            </span>
          </div>
        ) : (
          <ul className="audit-log-list">
            {filtered.map((event) => (
              <li key={event.id} className="audit-log-row">
                <div className="audit-log-when">{formatAuditWhen(event.at)}</div>
                <div className="audit-log-body">
                  <strong>{auditActionLabel(event.action)}</strong>
                  <span>{event.summary}</span>
                  <span className="audit-log-actor">{event.actorName}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
