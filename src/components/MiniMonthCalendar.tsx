import { useMemo } from 'react'
import type { AbsenceRecord, BankHoliday } from '../payroll'
import { buildMonthGrid, dateInRange, formatMonthYear, toIsoDate } from '../calendarUtils'

type EmployeeColor = {
  id: number
  name: string
  color: string
}

type MiniMonthCalendarProps = {
  viewDate: Date
  today: Date
  absences: AbsenceRecord[]
  bankHolidays: BankHoliday[]
  employees: EmployeeColor[]
}

export function MiniMonthCalendar({
  viewDate,
  today,
  absences,
  bankHolidays,
  employees,
}: MiniMonthCalendarProps) {
  const cells = useMemo(() => buildMonthGrid(viewDate), [viewDate])
  const bankHolidayDates = useMemo(
    () => new Set(bankHolidays.map((holiday) => holiday.date)),
    [bankHolidays],
  )

  const leaveDayIndexes = useMemo(() => {
    const indexes = new Set<number>()
    cells.forEach((cell, index) => {
      if (!cell.inMonth) return
      const hasLeave = absences.some((record) =>
        record.type === 'annual_leave' && dateInRange(cell.date, record.start, record.end),
      )
      if (hasLeave) indexes.add(index)
    })
    return indexes
  }, [absences, cells])

  const legendEmployees = useMemo(() => {
    const ids = new Set(
      absences
        .filter((record) => record.type === 'annual_leave')
        .map((record) => record.employeeId),
    )
    return employees.filter((employee) => ids.has(employee.id)).slice(0, 3)
  }, [absences, employees])

  return (
    <>
      <div className="calendar-week">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="calendar-days">
        {cells.map((cell, index) => {
          const iso = toIsoDate(cell.date)
          const isToday = iso === toIsoDate(today)
          const hasLeave = leaveDayIndexes.has(index)
          const hasBankHoliday = bankHolidayDates.has(iso)
          return (
            <span
              key={`${iso}-${index}`}
              className={`${!cell.inMonth ? 'outside' : ''} ${hasLeave ? 'has-leave' : ''} ${hasBankHoliday ? 'has-bank-holiday-day' : ''} ${isToday ? 'today' : ''}`}
              title={hasBankHoliday ? bankHolidays.find((item) => item.date === iso)?.name : undefined}
            >
              {cell.day}
            </span>
          )
        })}
      </div>
      <div className="calendar-legend">
        {legendEmployees.map((employee) => (
          <span key={employee.id}>
            <i className={`legend-dot ${employee.color}-dot`} />
            {employee.name.split(' ')[0]}
          </span>
        ))}
        {bankHolidays.some((holiday) => holiday.date.startsWith(String(viewDate.getFullYear()))) && (
          <span>
            <i className="legend-dot yellow-dot" />
            Bank holiday
          </span>
        )}
      </div>
    </>
  )
}

export { formatMonthYear }
