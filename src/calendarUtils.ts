const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function formatMonthYear(date: Date) {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
}

/** e.g. Sunday, 20 September 2026 */
export function formatLongWeekdayDate(date: Date) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildMonthGrid(viewDate: Date) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let startPad = firstDay.getDay() - 1
  if (startPad < 0) startPad = 6

  const cells: { day: number; inMonth: boolean; date: Date }[] = []

  for (let index = startPad - 1; index >= 0; index -= 1) {
    const date = new Date(year, month, -index)
    cells.push({ day: date.getDate(), inMonth: false, date })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, inMonth: true, date: new Date(year, month, day) })
  }

  while (cells.length % 7 !== 0 || cells.length < 35) {
    const nextDay = cells.length - startPad - daysInMonth + 1
    cells.push({
      day: nextDay,
      inMonth: false,
      date: new Date(year, month + 1, nextDay),
    })
  }

  return cells
}

export function dateInRange(date: Date, start: string, end: string) {
  const value = toIsoDate(date)
  return value >= start && value <= end
}
