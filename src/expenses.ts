import type { ExpenseCategory, ExpenseClaim, ExpenseReceipt, ExpenseStatus } from './domain'
import { estimateDataUrlSize } from './employeeDocuments'

export const MAX_RECEIPT_BYTES = Math.floor(1.5 * 1024 * 1024)
export const MAX_RECEIPTS_PER_CLAIM = 5
export const ACCEPTED_RECEIPT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp'

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'travel',
  'meals',
  'equipment',
  'software',
  'other',
]

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  travel: 'Travel',
  meals: 'Meals',
  equipment: 'Equipment',
  software: 'Software',
  other: 'Other',
}

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAA8CAYAAAD6n1xPAAAAhUlEQVR4nO3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBvAq8AAaS0N1sAAAAASUVORK5CYII='

export function formatGbp(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

export function nextExpenseClaimId(claims: ExpenseClaim[]) {
  return Math.max(0, ...claims.map((claim) => claim.id)) + 1
}

export function nextReceiptId(receipts: ExpenseReceipt[]) {
  return Math.max(0, ...receipts.map((receipt) => receipt.id)) + 1
}

export function claimsForEmployee(claims: ExpenseClaim[], employeeId: number) {
  return claims
    .filter((claim) => claim.employeeId === employeeId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.date.localeCompare(a.date))
}

export function pendingExpenseCount(claims: ExpenseClaim[]) {
  return claims.filter((claim) => claim.status === 'Pending').length
}

export function isImageReceipt(fileType: string) {
  return fileType.startsWith('image/')
}

export function isPdfReceipt(fileType: string, fileName: string) {
  return fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')
}

export function isAcceptedReceiptFile(file: File) {
  if (['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return true
  }
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.pdf') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp')
  )
}

export function openReceipt(receipt: ExpenseReceipt) {
  const link = window.document.createElement('a')
  link.href = receipt.fileDataUrl
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  if (isPdfReceipt(receipt.fileType, receipt.fileName) || !isImageReceipt(receipt.fileType)) {
    link.download = receipt.fileName
  }
  window.document.body.appendChild(link)
  link.click()
  link.remove()
}

function dataUrlTooLarge(dataUrl: string) {
  return estimateDataUrlSize(dataUrl) > MAX_RECEIPT_BYTES
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read image'))
    image.src = dataUrl
  })
}

function canvasToJpeg(image: HTMLImageElement, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = window.document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not compress image')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

async function compressImageDataUrl(dataUrl: string) {
  const image = await loadImage(dataUrl)
  const attempts: Array<{ edge: number; quality: number }> = [
    { edge: 1600, quality: 0.72 },
    { edge: 1280, quality: 0.62 },
    { edge: 1024, quality: 0.52 },
    { edge: 800, quality: 0.42 },
  ]
  let best = dataUrl
  for (const attempt of attempts) {
    const next = canvasToJpeg(image, attempt.edge, attempt.quality)
    best = next
    if (!dataUrlTooLarge(next)) return next
  }
  return best
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export async function prepareReceiptFile(
  file: File,
): Promise<{ receipt: Omit<ExpenseReceipt, 'id'> } | { error: string }> {
  if (!isAcceptedReceiptFile(file)) {
    return { error: 'Use a PDF, JPEG, PNG, or WebP file' }
  }

  const isPdf = isPdfReceipt(file.type, file.name)
  if (isPdf && file.size > MAX_RECEIPT_BYTES) {
    return { error: 'Each receipt must be 1.5 MB or smaller' }
  }

  try {
    const original = await readFileAsDataUrl(file)
    if (isPdf) {
      if (dataUrlTooLarge(original)) {
        return { error: 'Each receipt must be 1.5 MB or smaller' }
      }
      return {
        receipt: {
          fileName: file.name,
          fileType: 'application/pdf',
          fileDataUrl: original,
        },
      }
    }

    let dataUrl = original
    let fileType = file.type || 'image/jpeg'
    if (dataUrlTooLarge(dataUrl) || file.size > 400 * 1024) {
      dataUrl = await compressImageDataUrl(original)
      fileType = 'image/jpeg'
    }
    if (dataUrlTooLarge(dataUrl)) {
      return { error: 'This image is still too large after compressing. Try a smaller photo.' }
    }

    const fileName =
      fileType === 'image/jpeg' && !file.name.toLowerCase().match(/\.jpe?g$/)
        ? file.name.replace(/\.[^.]+$/, '') + '.jpg'
        : file.name

    return {
      receipt: {
        fileName,
        fileType,
        fileDataUrl: dataUrl,
      },
    }
  } catch {
    return { error: 'Could not read that file' }
  }
}

export const initialExpenseClaims: ExpenseClaim[] = [
  {
    id: 1,
    employeeId: 1,
    name: 'Sophie Carter',
    initials: 'SC',
    color: 'sage',
    date: '2026-08-18',
    amount: 42.8,
    merchant: 'Uber',
    category: 'travel',
    note: 'Client workshop in Shoreditch',
    receipts: [
      {
        id: 1,
        fileName: 'uber-aug-18.png',
        fileType: 'image/png',
        fileDataUrl: TINY_PNG,
      },
    ],
    status: 'Pending',
    submittedAt: '2026-08-18T18:12:00.000Z',
  },
  {
    id: 2,
    employeeId: 2,
    name: 'Jamie Wilson',
    initials: 'JW',
    color: 'peach',
    date: '2026-08-12',
    amount: 18.5,
    merchant: 'Pret A Manger',
    category: 'meals',
    receipts: [
      {
        id: 1,
        fileName: 'pret-lunch.png',
        fileType: 'image/png',
        fileDataUrl: TINY_PNG,
      },
    ],
    status: 'Approved',
    submittedAt: '2026-08-12T13:40:00.000Z',
    reviewedAt: '2026-08-13T09:10:00.000Z',
  },
  {
    id: 3,
    employeeId: 1,
    name: 'Sophie Carter',
    initials: 'SC',
    color: 'sage',
    date: '2026-07-22',
    amount: 129,
    merchant: 'Amazon',
    category: 'equipment',
    note: 'Monitor stand for home office',
    receipts: [
      {
        id: 1,
        fileName: 'amazon-order.png',
        fileType: 'image/png',
        fileDataUrl: TINY_PNG,
      },
    ],
    status: 'Declined',
    submittedAt: '2026-07-22T16:05:00.000Z',
    reviewedAt: '2026-07-23T11:20:00.000Z',
    reviewNote: 'Home office furniture is not reimbursable under the current policy.',
  },
]

export function parseAmountInput(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed * 100) / 100
}

export type ExpenseReviewStatus = Extract<ExpenseStatus, 'Approved' | 'Declined'>
