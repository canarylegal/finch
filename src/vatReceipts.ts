import type { ExpenseReceipt } from './domain'
import { formatGbp, parseAmountInput, prepareReceiptFile } from './expenses'
import { formatDisplayDate } from './payroll'

export type VatReceipt = {
  id: number
  invoiceDate: string
  vatAmount: number
  netAmount?: number
  grossAmount?: number
  supplier?: string
  note?: string
  fileName: string
  fileType: string
  fileDataUrl: string
  uploadedAt: string
  uploadedBy: string
}

export const VAT_RECEIPT_DISCLAIMER =
  'Accountant notice: Finch stores purchase receipts and the VAT figures you confirm. It does not calculate VAT returns, partial exemption, or HMRC filings.'

export function nextVatReceiptId(receipts: VatReceipt[]) {
  return Math.max(0, ...receipts.map((item) => item.id)) + 1
}

export function receiptsInPeriod(receipts: VatReceipt[], periodStart: string, periodEnd: string) {
  return receipts
    .filter((item) => item.invoiceDate >= periodStart && item.invoiceDate <= periodEnd)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.id - a.id)
}

export function sumVatInPeriod(receipts: VatReceipt[], periodStart: string, periodEnd: string) {
  return receiptsInPeriod(receipts, periodStart, periodEnd).reduce(
    (total, item) => total + item.vatAmount,
    0,
  )
}

export function vatReceiptsToCsv(receipts: VatReceipt[]) {
  const headers = [
    'Invoice date',
    'Supplier',
    'Net',
    'VAT',
    'Gross',
    'File name',
    'Note',
    'Uploaded at',
    'Uploaded by',
  ]
  const lines = receipts.map((item) =>
    [
      item.invoiceDate,
      csvEscape(item.supplier ?? ''),
      item.netAmount ?? '',
      item.vatAmount,
      item.grossAmount ?? '',
      csvEscape(item.fileName),
      csvEscape(item.note ?? ''),
      item.uploadedAt,
      csvEscape(item.uploadedBy),
    ].join(','),
  )
  return [VAT_RECEIPT_DISCLAIMER, '', headers.join(','), ...lines].join('\n')
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  window.document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function prepareVatReceiptFile(file: File) {
  const result = await prepareReceiptFile(file)
  if ('error' in result) return result
  return {
    file: {
      fileName: result.receipt.fileName,
      fileType: result.receipt.fileType,
      fileDataUrl: result.receipt.fileDataUrl,
    } satisfies Omit<ExpenseReceipt, 'id'>,
  }
}

export { formatGbp, parseAmountInput, formatDisplayDate }
