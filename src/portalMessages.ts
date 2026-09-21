import { toIsoDate } from './calendarUtils'
import type { PortalMessage } from './domain'

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

export function unreadCountForRequest(
  messages: PortalMessage[],
  requestId: number,
  viewer: 'employee' | 'admin',
) {
  const otherAuthor = viewer === 'admin' ? 'employee' : 'admin'
  return messagesForRequest(messages, requestId).filter((message) => message.author === otherAuthor)
    .length
}

export function createPortalMessage(
  messages: PortalMessage[],
  payload: Omit<PortalMessage, 'id' | 'createdAt'>,
  at: Date = new Date(),
): PortalMessage {
  return {
    ...payload,
    id: nextPortalMessageId(messages),
    createdAt: at.toISOString(),
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
