import { toIsoDate } from './calendarUtils'
import { APP_TODAY } from './domain'
import type { PortalMessage } from './domain'

export const ADMIN_DISPLAY_NAME = 'Alex Morgan'

export function nextPortalMessageId(messages: PortalMessage[]) {
  return Math.max(0, ...messages.map((message) => message.id)) + 1
}

export function messagesForRequest(messages: PortalMessage[], requestId: number) {
  return messages
    .filter((message) => message.requestId === requestId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function messagesForEmployee(messages: PortalMessage[], employeeId: number) {
  return messages
    .filter((message) => message.employeeId === employeeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function unreadCountForRequest(messages: PortalMessage[], requestId: number, viewer: 'employee' | 'admin') {
  const otherAuthor = viewer === 'admin' ? 'employee' : 'admin'
  return messagesForRequest(messages, requestId).filter((message) => message.author === otherAuthor).length
}

export function createPortalMessage(
  messages: PortalMessage[],
  payload: Omit<PortalMessage, 'id' | 'createdAt'>,
  at: Date = APP_TODAY,
): PortalMessage {
  // Keep demo timestamps aligned with APP_TODAY (noon UTC on that calendar day).
  const createdAt = `${toIsoDate(at)}T12:00:00.000Z`
  return {
    ...payload,
    id: nextPortalMessageId(messages),
    createdAt,
  }
}

export function formatMessageTimestamp(iso: string) {
  const date = new Date(iso)
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatMessageDay(iso: string) {
  return toIsoDate(new Date(iso))
}
