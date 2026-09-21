import { useMemo, useRef, useState } from 'react'
import { Download, FileText, Plus, Trash2, Upload, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { toIsoDate } from '../calendarUtils'
import { appToday } from '../domain'
import { estimateDataUrlSize, formatFileSize } from '../employeeDocuments'
import {
  ACCEPTED_RECEIPT_ACCEPT,
  isImageReceipt,
  isPdfReceipt,
  openReceipt,
} from '../expenses'
import { useModalA11y } from '../hooks/useModalA11y'
import {
  VAT_RECEIPT_DISCLAIMER,
  downloadTextFile,
  formatDisplayDate,
  formatGbp,
  nextVatReceiptId,
  parseAmountInput,
  prepareVatReceiptFile,
  receiptsInPeriod,
  sumVatInPeriod,
  vatReceiptsToCsv,
  type VatReceipt,
} from '../vatReceipts'

type PendingFile = {
  fileName: string
  fileType: string
  fileDataUrl: string
}

export function VatReceiptsPage({
  receipts,
  uploadedBy,
  onChange,
  onNotify,
}: {
  receipts: VatReceipt[]
  uploadedBy: string
  onChange: (next: VatReceipt[]) => void
  onNotify: (message: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [year, setYear] = useState(appToday().getFullYear())
  const [month, setMonth] = useState(appToday().getMonth())
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)

  const periodStart = toIsoDate(new Date(year, month, 1))
  const periodEnd = toIsoDate(new Date(year, month + 1, 0))
  const periodReceipts = useMemo(
    () => receiptsInPeriod(receipts, periodStart, periodEnd),
    [receipts, periodStart, periodEnd],
  )
  const vatTotal = useMemo(
    () => sumVatInPeriod(receipts, periodStart, periodEnd),
    [receipts, periodStart, periodEnd],
  )
  const active = periodReceipts.find((item) => item.id === activeId) ?? null

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return
    setBusy(true)
    const file = fileList[0]
    const result = await prepareVatReceiptFile(file)
    setBusy(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if ('error' in result) {
      onNotify(result.error)
      return
    }
    setPendingFile(result.file)
  }

  const saveConfirmed = (payload: {
    invoiceDate: string
    vatAmount: number
    netAmount?: number
    grossAmount?: number
    supplier?: string
    note?: string
  }) => {
    if (!pendingFile) return
    const next: VatReceipt = {
      id: nextVatReceiptId(receipts),
      invoiceDate: payload.invoiceDate,
      vatAmount: payload.vatAmount,
      netAmount: payload.netAmount,
      grossAmount: payload.grossAmount,
      supplier: payload.supplier,
      note: payload.note,
      fileName: pendingFile.fileName,
      fileType: pendingFile.fileType,
      fileDataUrl: pendingFile.fileDataUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy,
    }
    onChange([next, ...receipts])
    setPendingFile(null)
    setActiveId(next.id)
    onNotify('VAT receipt saved')
  }

  const removeReceipt = (id: number) => {
    if (!window.confirm('Remove this VAT receipt?')) return
    onChange(receipts.filter((item) => item.id !== id))
    if (activeId === id) setActiveId(null)
    onNotify('VAT receipt removed')
  }

  const exportCsv = () => {
    const csv = vatReceiptsToCsv(periodReceipts)
    downloadTextFile(`finch-vat-${periodStart}.csv`, csv)
    onNotify('VAT receipt report downloaded')
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Accountant pack"
        title="VAT receipts"
        description="Upload purchase receipts and confirm invoice date and VAT for your accountant."
        action={
          <div className="header-actions">
            <button type="button" className="button button-secondary" onClick={exportCsv}>
              <Download size={17} />
              Export CSV
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={17} />
              {busy ? 'Reading…' : 'Upload receipt'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept={ACCEPTED_RECEIPT_ACCEPT}
              onChange={(event) => void addFiles(event.target.files)}
            />
          </div>
        }
      />

      <div className="payroll-notice">{VAT_RECEIPT_DISCLAIMER}</div>

      <div className="card full-panel">
        <div className="report-controls">
          <label>
            Invoice month
            <div className="form-row">
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                {[
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
                ].map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
              <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {[2024, 2025, 2026, 2027, 2028].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <span className="field-helper">
              {formatDisplayDate(periodStart)} – {formatDisplayDate(periodEnd)} ·{' '}
              {periodReceipts.length} receipt{periodReceipts.length === 1 ? '' : 's'} · VAT{' '}
              {formatGbp(vatTotal)}
            </span>
          </label>
        </div>

        {periodReceipts.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>No VAT receipts in this month</strong>
            <span>Upload a PDF or image, then confirm the invoice date and VAT amount.</span>
          </div>
        ) : (
          <div className="vat-receipt-layout">
            <div className="vat-receipt-list">
              {periodReceipts.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`vat-receipt-row ${activeId === item.id ? 'is-selected' : ''}`}
                  onClick={() => setActiveId(item.id)}
                >
                  <div>
                    <strong>{item.supplier?.trim() || item.fileName}</strong>
                    <span>
                      {formatDisplayDate(item.invoiceDate)} · VAT {formatGbp(item.vatAmount)}
                      {item.netAmount != null ? ` · net ${formatGbp(item.netAmount)}` : ''}
                    </span>
                  </div>
                  <span className="vat-receipt-filehint">
                    {formatFileSize(estimateDataUrlSize(item.fileDataUrl))}
                  </span>
                </button>
              ))}
            </div>

            {active && (
              <div className="vat-receipt-detail">
                <div className="vat-receipt-detail-header">
                  <div>
                    <strong>{active.supplier?.trim() || active.fileName}</strong>
                    <span>
                      Invoice {formatDisplayDate(active.invoiceDate)} · VAT{' '}
                      {formatGbp(active.vatAmount)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => removeReceipt(active.id)}
                  >
                    <Trash2 size={15} />
                    Remove
                  </button>
                </div>
                <dl className="vat-receipt-meta">
                  <div>
                    <dt>Supplier</dt>
                    <dd>{active.supplier?.trim() || '—'}</dd>
                  </div>
                  <div>
                    <dt>Net</dt>
                    <dd>{active.netAmount != null ? formatGbp(active.netAmount) : '—'}</dd>
                  </div>
                  <div>
                    <dt>VAT</dt>
                    <dd>{formatGbp(active.vatAmount)}</dd>
                  </div>
                  <div>
                    <dt>Gross</dt>
                    <dd>{active.grossAmount != null ? formatGbp(active.grossAmount) : '—'}</dd>
                  </div>
                </dl>
                {active.note && <p className="expense-detail-note">{active.note}</p>}
                <div className="receipt-preview-stage">
                  {isImageReceipt(active.fileType) ? (
                    <button
                      type="button"
                      className="receipt-stage-button"
                      onClick={() =>
                        openReceipt({
                          id: 1,
                          fileName: active.fileName,
                          fileType: active.fileType,
                          fileDataUrl: active.fileDataUrl,
                        })
                      }
                    >
                      <img src={active.fileDataUrl} alt={active.fileName} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="receipt-stage-file"
                      onClick={() =>
                        openReceipt({
                          id: 1,
                          fileName: active.fileName,
                          fileType: active.fileType,
                          fileDataUrl: active.fileDataUrl,
                        })
                      }
                    >
                      <FileText size={28} />
                      <span>
                        {active.fileName}
                        {isPdfReceipt(active.fileType, active.fileName) ? ' (PDF)' : ''}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {pendingFile && (
        <ConfirmVatReceiptModal
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={saveConfirmed}
        />
      )}
    </div>
  )
}

function ConfirmVatReceiptModal({
  file,
  onCancel,
  onConfirm,
}: {
  file: PendingFile
  onCancel: () => void
  onConfirm: (payload: {
    invoiceDate: string
    vatAmount: number
    netAmount?: number
    grossAmount?: number
    supplier?: string
    note?: string
  }) => void
}) {
  const dialogRef = useModalA11y(onCancel)
  const [invoiceDate, setInvoiceDate] = useState(toIsoDate(appToday()))
  const [vatAmount, setVatAmount] = useState('')
  const [netAmount, setNetAmount] = useState('')
  const [grossAmount, setGrossAmount] = useState('')
  const [supplier, setSupplier] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const vat = parseAmountInput(vatAmount)
    if (!invoiceDate) {
      setError('Confirm the invoice date')
      return
    }
    if (vat === null) {
      setError('Enter the VAT amount')
      return
    }
    const net = netAmount.trim() ? parseAmountInput(netAmount) : undefined
    if (netAmount.trim() && net === null) {
      setError('Net amount looks invalid')
      return
    }
    const gross = grossAmount.trim() ? parseAmountInput(grossAmount) : undefined
    if (grossAmount.trim() && gross === null) {
      setError('Gross amount looks invalid')
      return
    }
    onConfirm({
      invoiceDate,
      vatAmount: vat,
      netAmount: net ?? undefined,
      grossAmount: gross ?? undefined,
      supplier: supplier.trim() || undefined,
      note: note.trim() || undefined,
    })
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vat-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Confirm details</span>
            <h2 id="vat-confirm-title">VAT receipt</h2>
          </div>
          <button type="button" className="close-button" aria-label="Cancel" onClick={onCancel}>
            <X size={15} />
          </button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <p className="field-helper">
            Check the receipt and confirm the invoice date and VAT amount before saving.
          </p>
          <div className="receipt-preview-stage vat-confirm-preview">
            {isImageReceipt(file.fileType) ? (
              <img src={file.fileDataUrl} alt={file.fileName} />
            ) : (
              <div className="receipt-stage-file static">
                <FileText size={28} />
                <span>{file.fileName}</span>
              </div>
            )}
          </div>
          <div className="form-row">
            <label>
              Invoice date
              <input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                required
              />
            </label>
            <label>
              VAT amount (GBP)
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={vatAmount}
                onChange={(event) => setVatAmount(event.target.value)}
                required
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Net amount (optional)
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={netAmount}
                onChange={(event) => setNetAmount(event.target.value)}
              />
            </label>
            <label>
              Gross amount (optional)
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={grossAmount}
                onChange={(event) => setGrossAmount(event.target.value)}
              />
            </label>
          </div>
          <label>
            Supplier (optional)
            <input
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
              placeholder="e.g. Office supplies Ltd"
            />
          </label>
          <label>
            Note (optional)
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {error && <p className="login-error">{error}</p>}
          <div className="modal-footer">
            <button type="button" className="button button-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="button button-primary">
              <Plus size={15} />
              Save receipt
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
