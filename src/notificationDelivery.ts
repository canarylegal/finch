import type { CompanySettings } from './domain'
import type { NotificationEventId } from './notifications'

export function shouldNotify(company: CompanySettings, eventId: NotificationEventId) {
  return company.emailNotifications && company.notificationEvents[eventId]
}

export function leaveSubmittedNotification(employeeName: string, dates: string) {
  return `Email queued: leave request from ${employeeName} (${dates})`
}

export function leaveReviewedNotification(employeeName: string, status: 'Approved' | 'Declined', dates: string) {
  const verb = status === 'Approved' ? 'approved' : 'declined'
  return `Email queued: ${employeeName}'s leave (${dates}) ${verb}`
}

export function expenseSubmittedNotification(employeeName: string, amountLabel: string) {
  return `Email queued: expense claim from ${employeeName} (${amountLabel})`
}

export function expenseReviewedNotification(
  employeeName: string,
  status: 'Approved' | 'Declined',
  amountLabel: string,
) {
  const verb = status === 'Approved' ? 'approved' : 'declined'
  return `Email queued: ${employeeName}'s expense (${amountLabel}) ${verb}`
}
