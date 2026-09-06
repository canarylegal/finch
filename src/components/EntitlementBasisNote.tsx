import { entitlementBasisLabel, entitlementInputHelper } from '../leaveBalance'

export function EntitlementBasisNote({ includesBankHolidays }: { includesBankHolidays: boolean }) {
  return (
    <p className="field-helper entitlement-basis-note">
      <strong>{entitlementBasisLabel(includesBankHolidays)}.</strong> {entitlementInputHelper(includesBankHolidays)}
    </p>
  )
}
