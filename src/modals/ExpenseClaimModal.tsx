import { useRef, useState } from 'react'
import { FileText, Plus, Trash2, Upload, X } from 'lucide-react'
import { toIsoDate } from '../calendarUtils'
import { appToday, type ExpenseCategory, type ExpenseReceipt } from '../domain'
import { estimateDataUrlSize, formatFileSize } from '../employeeDocuments'
import {
  ACCEPTED_RECEIPT_ACCEPT,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  MAX_RECEIPTS_PER_CLAIM,
  isImageReceipt,
  parseAmountInput,
  prepareReceiptFile,
} from '../expenses'

type ExpenseClaimModalProps = {
  onClose: () => void
  onSubmit: (payload: {
    date: string
    amount: number
    merchant: string
    category: ExpenseCategory
    note?: string
    receipts: Omit<ExpenseReceipt, 'id'>[]
  }) => boolean | void
}

export function ExpenseClaimModal({ onClose, onSubmit }: ExpenseClaimModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState(toIsoDate(appToday()))
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('travel')
  const [note, setNote] = useState('')
  const [receipts, setReceipts] = useState<Omit<ExpenseReceipt, 'id'>[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return
    setBusy(true)
    setError('')
    const next = [...receipts]
    for (const file of Array.from(fileList)) {
      if (next.length >= MAX_RECEIPTS_PER_CLAIM) {
        setError(`You can attach up to ${MAX_RECEIPTS_PER_CLAIM} receipts`)
        break
      }
      const result = await prepareReceiptFile(file)
      if ('error' in result) {
        setError(result.error)
        break
      }
      next.push(result.receipt)
    }
    setReceipts(next)
    setBusy(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const parsedAmount = parseAmountInput(amount)
    if (!date) {
      setError('Choose the date of the expense')
      return
    }
    if (parsedAmount === null) {
      setError('Enter an amount greater than zero')
      return
    }
    if (!merchant.trim()) {
      setError('Add the merchant or supplier')
      return
    }
    if (receipts.length === 0) {
      setError('Attach at least one receipt')
      return
    }
    const ok = onSubmit({
      date,
      amount: parsedAmount,
      merchant: merchant.trim(),
      category,
      note: note.trim() || undefined,
      receipts,
    })
    if (ok === false) return
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Expenses</span>
            <h2 id="expense-title">Submit expense</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Date
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label>
              Amount (GBP)
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
          </div>
          <label>
            Merchant
            <input
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
              placeholder="e.g. Trainline"
            />
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {EXPENSE_CATEGORY_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note <span className="optional">(optional)</span>
            <textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What was this for?"
            />
          </label>

          <div className="receipt-upload">
            <div className="section-heading compact-heading">
              <div>
                <h2>Receipts</h2>
                <p>PDF, JPEG, PNG, or WebP · 1.5 MB each · up to {MAX_RECEIPTS_PER_CLAIM}</p>
              </div>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy || receipts.length >= MAX_RECEIPTS_PER_CLAIM}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={15} />
                {busy ? 'Adding…' : 'Add files'}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              multiple
              accept={ACCEPTED_RECEIPT_ACCEPT}
              onChange={(event) => addFiles(event.target.files)}
            />
            {receipts.length === 0 ? (
              <button
                type="button"
                className="receipt-drop-hint"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={16} />
                Attach a receipt to continue
              </button>
            ) : (
              <div className="receipt-preview-list">
                {receipts.map((receipt, index) => (
                  <div className="receipt-preview-item" key={`${receipt.fileName}-${index}`}>
                    {isImageReceipt(receipt.fileType) ? (
                      <img src={receipt.fileDataUrl} alt="" className="receipt-thumb" />
                    ) : (
                      <div className="receipt-thumb receipt-thumb-file">
                        <FileText size={18} />
                      </div>
                    )}
                    <div className="receipt-preview-copy">
                      <strong>{receipt.fileName}</strong>
                      <span>{formatFileSize(estimateDataUrlSize(receipt.fileDataUrl))}</span>
                    </div>
                    <button
                      type="button"
                      className="icon-button danger-icon-button"
                      aria-label={`Remove ${receipt.fileName}`}
                      onClick={() =>
                        setReceipts((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="field-error">{error}</p>}

          <div className="modal-footer">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={busy}>
              Submit claim
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
