import { toIsoDate } from './calendarUtils'
import type { Employee } from './domain'
import { formatDisplayDate, parseIsoDate } from './payroll'

export const DEFAULT_PROBATION_MONTHS = 6
export const TASK_LOOKAHEAD_DAYS = 60
export const TASK_OVERDUE_LOOKBACK_DAYS = 45
export const TASK_SNOOZE_DAYS = 7

export type TaskDismissalStatus = 'completed' | 'snoozed'

export type TaskDismissal = {
  taskKey: string
  status: TaskDismissalStatus
  snoozedUntil?: string
  updatedAt: string
}

export type HrTaskUrgency = 'overdue' | 'soon' | 'upcoming'

export type HrTask = {
  key: string
  type: 'probation_ending'
  employeeId: number
  employeeName: string
  dueDate: string
  title: string
  detail: string
  urgency: HrTaskUrgency
}

export function addMonthsIso(iso: string, months: number) {
  const date = parseIsoDate(iso)
  const day = date.getDate()
  date.setMonth(date.getMonth() + months)
  // Keep end-of-month dates from overflowing (e.g. 31 Mar + 1 month).
  if (date.getDate() < day) {
    date.setDate(0)
  }
  return toIsoDate(date)
}

export function addDaysIso(iso: string, days: number) {
  const date = parseIsoDate(iso)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

export function daysBetweenIso(from: string, to: string) {
  const start = parseIsoDate(from)
  const end = parseIsoDate(to)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

export function defaultProbationEndDate(startDate: string, months = DEFAULT_PROBATION_MONTHS) {
  return addMonthsIso(startDate, months)
}

export function probationTaskKey(employeeId: number, probationEndDate: string) {
  return `probation:${employeeId}:${probationEndDate}`
}

function isDismissalActive(dismissal: TaskDismissal | undefined, today: string) {
  if (!dismissal) return false
  if (dismissal.status === 'completed') return true
  if (dismissal.status === 'snoozed' && dismissal.snoozedUntil) {
    return today < dismissal.snoozedUntil
  }
  return false
}

function urgencyForDueDate(dueDate: string, today: string): HrTaskUrgency {
  const days = daysBetweenIso(today, dueDate)
  if (days < 0) return 'overdue'
  if (days <= 14) return 'soon'
  return 'upcoming'
}

function detailForProbation(dueDate: string, today: string) {
  const days = daysBetweenIso(today, dueDate)
  if (days < 0) {
    const overdue = Math.abs(days)
    return `Overdue by ${overdue} ${overdue === 1 ? 'day' : 'days'} · Schedule their review`
  }
  if (days === 0) return 'Ends today · Schedule their review'
  return `In ${days} ${days === 1 ? 'day' : 'days'} · Schedule their review`
}

export function buildProbationTasks(
  employees: Employee[],
  dismissals: TaskDismissal[],
  today: string,
): HrTask[] {
  const dismissalByKey = new Map(dismissals.map((item) => [item.taskKey, item]))
  const tasks: HrTask[] = []

  for (const employee of employees) {
    if (employee.status !== 'Active' || !employee.probationEndDate) continue

    const dueDate = employee.probationEndDate
    const daysUntil = daysBetweenIso(today, dueDate)
    if (daysUntil > TASK_LOOKAHEAD_DAYS) continue
    if (daysUntil < -TASK_OVERDUE_LOOKBACK_DAYS) continue

    const key = probationTaskKey(employee.id, dueDate)
    if (isDismissalActive(dismissalByKey.get(key), today)) continue

    const urgency = urgencyForDueDate(dueDate, today)
    tasks.push({
      key,
      type: 'probation_ending',
      employeeId: employee.id,
      employeeName: employee.name,
      dueDate,
      title: `${employee.name}’s probation ends`,
      detail: `${detailForProbation(dueDate, today)} · ${formatDisplayDate(dueDate)}`,
      urgency,
    })
  }

  return tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title))
}

export function completeTask(dismissals: TaskDismissal[], taskKey: string): TaskDismissal[] {
  const updatedAt = new Date().toISOString()
  const next = dismissals.filter((item) => item.taskKey !== taskKey)
  return [...next, { taskKey, status: 'completed', updatedAt }]
}

export function snoozeTask(
  dismissals: TaskDismissal[],
  taskKey: string,
  today: string,
  days = TASK_SNOOZE_DAYS,
): TaskDismissal[] {
  const updatedAt = new Date().toISOString()
  const next = dismissals.filter((item) => item.taskKey !== taskKey)
  return [
    ...next,
    {
      taskKey,
      status: 'snoozed',
      snoozedUntil: addDaysIso(today, days),
      updatedAt,
    },
  ]
}

export function urgencyLabel(urgency: HrTaskUrgency) {
  if (urgency === 'overdue') return 'Overdue'
  if (urgency === 'soon') return 'Soon'
  return 'Upcoming'
}

/** Demo / migration defaults when stored employees lack employment dates. */
export function withEmploymentDates(
  employee: Omit<Employee, 'startDate' | 'probationEndDate'> & {
    startDate?: string
    probationEndDate?: string | null
  },
): Employee {
  if (employee.startDate) {
    return {
      ...employee,
      startDate: employee.startDate,
      probationEndDate:
        employee.probationEndDate === undefined
          ? defaultProbationEndDate(employee.startDate)
          : employee.probationEndDate,
    }
  }

  const defaults: Record<number, { startDate: string; probationEndDate: string | null }> = {
    1: { startDate: '2024-01-15', probationEndDate: '2024-07-15' },
    2: { startDate: '2026-03-15', probationEndDate: '2026-09-15' },
    3: { startDate: '2025-10-01', probationEndDate: '2026-04-01' },
    4: { startDate: '2026-06-01', probationEndDate: '2026-12-01' },
  }

  const fallback = defaults[employee.id] ?? {
    startDate: '2026-01-01',
    probationEndDate: defaultProbationEndDate('2026-01-01'),
  }

  return {
    ...employee,
    startDate: fallback.startDate,
    probationEndDate:
      employee.probationEndDate === undefined ? fallback.probationEndDate : employee.probationEndDate,
  }
}
