import {
  formatWorkingWeek,
  normalizeWorkingDays,
  WEEKDAY_LABELS,
  WORKING_WEEK_PRESETS,
} from '../payroll'

export function WorkingDaysPicker({
  value,
  onChange,
}: {
  value: number[]
  onChange: (days: number[]) => void
}) {
  const normalized = normalizeWorkingDays(value)

  const toggleDay = (day: number) => {
    if (normalized.includes(day)) {
      const next = normalized.filter((item) => item !== day)
      if (next.length === 0) return
      onChange(next)
      return
    }
    onChange(normalizeWorkingDays([...normalized, day]))
  }

  return (
    <div className="working-days-field">
      <span className="field-label">Working days</span>
      <p className="field-helper">
        Used for leave requests, absence duration, and payroll working-time calculations.
      </p>
      <div className="working-week-presets">
        {WORKING_WEEK_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`preset-chip ${
              preset.days.join(',') === normalized.join(',') ? 'is-active' : ''
            }`}
            onClick={() => onChange([...preset.days])}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="working-day-toggle-row">
        {WEEKDAY_LABELS.map((label, day) => (
          <button
            key={day}
            type="button"
            className={`working-day-toggle ${normalized.includes(day) ? 'is-active' : ''}`}
            aria-pressed={normalized.includes(day)}
            onClick={() => toggleDay(day)}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="working-week-summary">{formatWorkingWeek(normalized)}</span>
    </div>
  )
}
