import { useState } from 'react'
import { Check, FileText, X } from 'lucide-react'
import type { ExpenseClaim } from '../domain'
import { estimateDataUrlSize, formatFileSize } from '../employeeDocuments'
import {
  EXPENSE_CATEGORY_LABELS,
  formatGbp,
  isImageReceipt,
  isPdfReceipt,
  openReceipt,
  type ExpenseReviewStatus,
} from '../expenses'
import { formatDisplayDate } from '../payroll'

type ExpenseClaimDetailModalProps = {
  claim: ExpenseClaim
  viewer: 'employee' | 'admin'
  onClose: () => void
  onReview?: (status: ExpenseReviewStatus, reviewNote?: string) => void
}

export function ExpenseClaimDetailModal({
  claim,
  viewer,
  onClose,
  onReview,
}: ExpenseClaimDetailModalProps) {
  const [reviewNote, setReviewNote] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(claim.receipts[0] ?? null)

  const handleDecline = () => {
    if (!reviewNote.trim()) {
      setError('Add a short reason when declining')
      return
    }
    onReview?.('Declined', reviewNote.trim())
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">
              {viewer === 'admin' ? claim.name : 'Your claim'}
            </span>
            <h2 id="expense-detail-title">{formatGbp(claim.amount)}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <div className="expense-detail-meta">
            <div>
              <span>Merchant</span>
              <strong>{claim.merchant}</strong>
            </div>
            <div>
              <span>Date</span>
              <strong>{formatDisplayDate(claim.date)}</strong>
            </div>
            <div>
              <span>Category</span>
              <strong>{EXPENSE_CATEGORY_LABELS[claim.category]}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong className={`status ${claim.status.toLowerCase()}`}>{claim.status}</strong>
            </div>
          </div>

          {claim.note && <p className="expense-detail-note">{claim.note}</p>}
          {claim.reviewNote && (
            <p className="expense-detail-review">
              Employer note: {claim.reviewNote}
            </p>
          )}

          <div className="receipt-preview-stage">
            {preview && isImageReceipt(preview.fileType) ? (
              <button type="button" className="receipt-stage-button" onClick={() => openReceipt(preview)}>
                <img src={preview.fileDataUrl} alt={preview.fileName} />
              </button>
            ) : preview ? (
              <button type="button" className="receipt-stage-file" onClick={() => openReceipt(preview)}>
                <FileText size={28} />
                <strong>{preview.fileName}</strong>
                <span>
                  {isPdfReceipt(preview.fileType, preview.fileName) ? 'Open PDF' : 'Open file'} ·{' '}
                  {formatFileSize(estimateDataUrlSize(preview.fileDataUrl))}
                </span>
              </button>
            ) : (
              <p>No receipts attached.</p>
            )}
          </div>

          {claim.receipts.length > 1 && (
            <div className="receipt-thumb-row">
              {claim.receipts.map((receipt) => (
                <button
                  type="button"
                  key={receipt.id}
                  className={`receipt-mini ${preview?.id === receipt.id ? 'is-selected' : ''}`}
                  onClick={() => setPreview(receipt)}
                >
                  {isImageReceipt(receipt.fileType) ? (
                    <img src={receipt.fileDataUrl} alt={receipt.fileName} />
                  ) : (
                    <FileText size={16} />
                  )}
                </button>
              ))}
            </div>
          )}

          {viewer === 'admin' && claim.status === 'Pending' && onReview && (
            <>
              <label>
                Note if declining
                <textarea
                  rows={2}
                  value={reviewNote}
                  onChange={(event) => {
                    setReviewNote(event.target.value)
                    setError('')
                  }}
                  placeholder="Shown to the employee"
                />
              </label>
              {error && <p className="field-error">{error}</p>}
              <div className="modal-footer">
                <button type="button" className="decline-button" onClick={handleDecline}>
                  <X size={15} />
                  Decline
                </button>
                <button type="button" className="approve-button" onClick={() => onReview('Approved')}>
                  <Check size={15} />
                  Approve
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
