import type { CompanySettings } from './domain'
import type { NotificationEventId } from './notifications'
import { dispatchNotificationRequest } from './api'

export function shouldNotify(company: CompanySettings, eventId: NotificationEventId) {
  return company.emailNotifications && company.notificationEvents[eventId]
}

export type NotificationDispatchDetails = {
  employeeName?: string
  dates?: string
  amountLabel?: string
  status?: string
  documentTitle?: string
  probationDate?: string
}

export async function dispatchNotificationEmail(
  eventId: NotificationEventId,
  options: {
    employeeId?: number | null
    details?: NotificationDispatchDetails
  } = {},
): Promise<string> {
  const result = await dispatchNotificationRequest({
    eventId,
    employeeId: options.employeeId ?? null,
    details: options.details ?? {},
  })
  if (!result.ok) {
    return result.error || 'Email failed to send'
  }
  if (result.data.sent) {
    const count = result.data.recipients ?? 0
    return count > 0
      ? `Email sent (${count} recipient${count === 1 ? '' : 's'})`
      : 'Email sent'
  }
  return result.data.message || 'Email skipped'
}
