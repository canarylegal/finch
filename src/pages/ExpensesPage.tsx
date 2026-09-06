import { Check, Clock3, Plus, Receipt, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import type { Employee, ExpenseClaim } from '../domain'
import { estimateDataUrlSize, formatFileSize } from '../employeeDocuments'
import {
  EXPENSE_CATEGORY_LABELS,
  formatGbp,
  claimsForEmployee,
} from '../expenses'
import { formatDisplayDate } from '../payroll'

type ExpensesPageProps = {
  employee?: Employee
  claims: ExpenseClaim[]
  onSubmitClaim: () => void
  onOpenClaim: (claimId: number) => void
}

export function ExpensesPage({ employee, claims, onSubmitClaim, onOpenClaim }: ExpensesPageProps) {
  const employeeClaims = employee ? claimsForEmployee(claims, employee.id) : []
  const pendingTotal = employeeClaims
    .filter((claim) => claim.status === 'Pending')
    .reduce((sum, claim) => sum + claim.amount, 0)
  const approvedTotal = employeeClaims
    .filter((claim) => claim.status === 'Approved')
    .reduce((sum, claim) => sum + claim.amount, 0)

  if (!employee) return null

  return (
    <div className="page">
      <PageHeader
        eyebrow="Reimbursements"
        title="Expenses"
        description="Submit claims with a receipt. Your employer reviews each one."
        action={
          <button type="button" className="button button-primary" onClick={onSubmitClaim}>
            <Plus size={17} />
            Submit expense
          </button>
        }
      />

      <div className="card full-panel">
        <div className="leave-summary-row">
          <div>
            <span className="card-label">Pending</span>
            <div className="summary-number">{formatGbp(pendingTotal)}</div>
          </div>
          <div>
            <span className="card-label">Approved</span>
            <div className="summary-number">{formatGbp(approvedTotal)}</div>
          </div>
          <div>
            <span className="card-label">Claims</span>
            <div className="summary-number">
              {employeeClaims.length} <span>{employeeClaims.length === 1 ? 'claim' : 'claims'}</span>
            </div>
          </div>
        </div>

        <div className="section-heading leave-history-heading">
          <div>
            <h2>Your claims</h2>
            <p>PDF or image receipts stay on the claim — not in Documents</p>
          </div>
        </div>

        {employeeClaims.length === 0 ? (
          <div className="empty-state compact-empty">
            <Receipt size={22} />
            <strong>No expense claims yet</strong>
            <span>Add the date, amount, and at least one receipt to submit a claim.</span>
          </div>
        ) : (
          employeeClaims.map((claim) => (
            <button
              type="button"
              className="request-row leave-history-row request-row-button"
              key={claim.id}
              onClick={() => onOpenClaim(claim.id)}
            >
              <div
                className={`request-icon ${
                  claim.status === 'Pending'
                    ? 'request-icon-pending'
                    : claim.status === 'Approved'
                      ? 'request-icon-approved'
                      : 'request-icon-declined'
                }`}
              >
                {claim.status === 'Pending' ? (
                  <Clock3 size={16} />
                ) : claim.status === 'Approved' ? (
                  <Check size={16} />
                ) : (
                  <X size={16} />
                )}
              </div>
              <div className="request-copy">
                <strong>
                  {formatGbp(claim.amount)} · {claim.merchant}
                </strong>
                <span>
                  {EXPENSE_CATEGORY_LABELS[claim.category]} · {formatDisplayDate(claim.date)} ·{' '}
                  {claim.receipts.length} {claim.receipts.length === 1 ? 'receipt' : 'receipts'}
                  {claim.receipts[0]
                    ? ` · ${formatFileSize(estimateDataUrlSize(claim.receipts[0].fileDataUrl))}`
                    : ''}
                </span>
              </div>
              <span className={`status ${claim.status.toLowerCase()}`}>{claim.status}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
