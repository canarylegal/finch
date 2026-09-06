import { useMemo, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { formatMonthYear } from '../components/MiniMonthCalendar'
import { buildMonthGrid, dateInRange, toIsoDate } from '../calendarUtils'
import { APP_TODAY, type Employee } from '../domain'
import {
  ABSENCE_TYPE_LABELS,
  absenceTypeColor,
  parseIsoDate,
  type AbsenceRecord,
  type BankHoliday,
} from '../payroll'

type TeamCalendarProps = {
  employees: Employee[]
  absences: AbsenceRecord[]
  bankHolidays: BankHoliday[]
  onAddLeave: () => void
  onNotify: (message: string) => void
}

export function TeamCalendar({
  employees,
  absences,
  bankHolidays,
  onAddLeave,
  onNotify,
}: TeamCalendarProps) {
  const [viewDate, setViewDate] = useState(new Date(2026, 8, 1))
  const today = APP_TODAY
  const cells = useMemo(() => buildMonthGrid(viewDate), [viewDate])
  const bankHolidayByDate = useMemo(() => {
    const map = new Map<string, BankHoliday>()
    for (const holiday of bankHolidays) {
      map.set(holiday.date, holiday)
    }
    return map
  }, [bankHolidays])

  const eventsForDay = (date: Date) =>
    absences.filter((record) => dateInRange(date, record.start, record.end))

  const bankHolidayForDay = (date: Date) => bankHolidayByDate.get(toIsoDate(date))

  const bankHolidaysInView = useMemo(
    () =>
      bankHolidays.filter((holiday) => {
        const holidayDate = parseIsoDate(holiday.date)
        return (
          holidayDate.getFullYear() === viewDate.getFullYear() &&
          holidayDate.getMonth() === viewDate.getMonth()
        )
      }),
    [bankHolidays, viewDate],
  )

  return (
    <div className="page">
      <PageHeader
        eyebrow="Team visibility"
        title="Team calendar"
        description="See leave across your company at a glance."
        action={
          <button type="button" className="button button-primary" onClick={onAddLeave}>
            <Plus size={17} />
            Add leave
          </button>
        }
      />
      <div className="card calendar-large">
        <div className="calendar-large-header">
          <button
            type="button"
            className="circle-button"
            aria-label="Previous month"
            onClick={() =>
              setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
            }
          >
            ‹
          </button>
          <h2>{formatMonthYear(viewDate)}</h2>
          <button
            type="button"
            className="circle-button"
            aria-label="Next month"
            onClick={() =>
              setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
            }
          >
            ›
          </button>
        </div>
        <div className="large-calendar-grid">
          <div className="large-calendar-days">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <strong key={day}>{day}</strong>
            ))}
            {cells.map((cell) => {
              const dayEvents = eventsForDay(cell.date)
              const bankHoliday = bankHolidayForDay(cell.date)
              const isToday = toIsoDate(cell.date) === toIsoDate(today)
              const iso = toIsoDate(cell.date)
              return (
                <div
                  className={`large-day ${!cell.inMonth ? 'outside-month' : ''} ${isToday ? 'today-cell' : ''} ${bankHoliday ? 'has-bank-holiday' : ''}`}
                  key={iso}
                >
                  <span>{cell.day}</span>
                  {bankHoliday && (
                    <em
                      className="calendar-event yellow-event calendar-event-holiday"
                      title={bankHoliday.name}
                    >
                      Bank holiday · {bankHoliday.name}
                    </em>
                  )}
                  {dayEvents.map((event) => {
                    const employee = employees.find((item) => item.id === event.employeeId)
                    const label = ABSENCE_TYPE_LABELS[event.type]
                    const color = absenceTypeColor(event.type)
                    return (
                      <em
                        key={event.id}
                        className={`calendar-event ${color}-event`}
                        title={`${employee?.name ?? 'Employee'} · ${label}`}
                      >
                        {employee?.name.split(' ')[0] ?? 'Team'} · {label}
                      </em>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
        <div className="calendar-legend calendar-legend-large">
          <span>
            <i className="legend-dot yellow-dot" />
            Bank holiday
          </span>
          <span>
            <i className="legend-dot coral-dot" />
            Annual leave
          </span>
          <span>
            <i className="legend-dot lavender-dot" />
            Sick leave
          </span>
        </div>
        <div className="calendar-footer-note">
          <span>
            {absences.length} absence entries · {bankHolidaysInView.length} bank{' '}
            {bankHolidaysInView.length === 1 ? 'holiday' : 'holidays'} this month
          </span>
          <button type="button" className="text-button" onClick={() => onNotify('Showing all leave entries')}>
            View list <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
