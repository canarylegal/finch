export const NOTIFICATION_EVENT_IDS = [
  'leaveRequestSubmitted',
  'leaveRequestReviewed',
  'expenseClaimSubmitted',
  'expenseClaimReviewed',
  'probationEnding',
  'documentUpdated',
] as const

export type NotificationEventId = (typeof NOTIFICATION_EVENT_IDS)[number]

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventId, string> = {
  leaveRequestSubmitted: 'Leave request submitted',
  leaveRequestReviewed: 'Leave request approved or declined',
  expenseClaimSubmitted: 'Expense claim submitted',
  expenseClaimReviewed: 'Expense claim approved or declined',
  probationEnding: 'Probation period ending',
  documentUpdated: 'Document uploaded or updated',
}

export type NotificationEvents = Record<NotificationEventId, boolean>

export const DEFAULT_NOTIFICATION_EVENTS: NotificationEvents = {
  leaveRequestSubmitted: true,
  leaveRequestReviewed: true,
  expenseClaimSubmitted: true,
  expenseClaimReviewed: true,
  probationEnding: true,
  documentUpdated: true,
}

export function normalizeNotificationEvents(
  events: Partial<NotificationEvents> | undefined,
): NotificationEvents {
  return {
    ...DEFAULT_NOTIFICATION_EVENTS,
    ...events,
  }
}
