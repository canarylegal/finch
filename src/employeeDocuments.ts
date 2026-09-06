import type {
  DocumentFolder,
  DocumentFolderVisibility,
  EmployeeDocument,
  EmployeeDocumentCategory,
} from './domain'

export const EMPLOYEE_DOCUMENT_CATEGORIES: EmployeeDocumentCategory[] = [
  'contract',
  'payslip',
  'tax',
  'identity',
  'other',
]

export const EMPLOYEE_DOCUMENT_LABELS: Record<EmployeeDocumentCategory, string> = {
  contract: 'Contract & terms',
  payslip: 'Payslip',
  tax: 'Tax & payroll',
  identity: 'Identity & right to work',
  other: 'Other',
}

export const DEFAULT_SHARED_FOLDER_NAME = 'Employment documents'
export const DEFAULT_INTERNAL_FOLDER_NAME = 'HR file'

export const FOLDER_VISIBILITY_LABELS: Record<DocumentFolderVisibility, string> = {
  shared: 'Shared with employee',
  internal: 'Admin only',
}

export function nextDocumentFolderId(folders: DocumentFolder[]) {
  return Math.max(0, ...folders.map((folder) => folder.id)) + 1
}

export function nextEmployeeDocumentId(documents: EmployeeDocument[]) {
  return Math.max(0, ...documents.map((document) => document.id)) + 1
}

export function foldersForEmployee(
  folders: DocumentFolder[],
  employeeId: number,
  visibility?: DocumentFolderVisibility,
) {
  return folders
    .filter(
      (folder) =>
        folder.employeeId === employeeId && (visibility ? folder.visibility === visibility : true),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function sharedFoldersForEmployee(folders: DocumentFolder[], employeeId: number) {
  return foldersForEmployee(folders, employeeId, 'shared')
}

export function documentsInFolder(documents: EmployeeDocument[], folderId: number) {
  return documents
    .filter((document) => document.folderId === folderId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
}

export function documentCountInFolder(documents: EmployeeDocument[], folderId: number) {
  return documents.filter((document) => document.folderId === folderId).length
}

export function createDefaultFoldersForEmployee(
  employeeId: number,
  folders: DocumentFolder[],
): DocumentFolder[] {
  const existing = foldersForEmployee(folders, employeeId)
  if (existing.length > 0) return []

  const nextId = nextDocumentFolderId(folders)
  const createdAt = new Date().toISOString()
  return [
    {
      id: nextId,
      employeeId,
      name: DEFAULT_SHARED_FOLDER_NAME,
      visibility: 'shared',
      createdAt,
    },
    {
      id: nextId + 1,
      employeeId,
      name: DEFAULT_INTERNAL_FOLDER_NAME,
      visibility: 'internal',
      createdAt,
    },
  ]
}

export function migrateDocumentsToFolders(
  employees: { id: number }[],
  folders: DocumentFolder[],
  documents: Array<Omit<EmployeeDocument, 'folderId'> & { folderId?: number }>,
): { folders: DocumentFolder[]; documents: EmployeeDocument[] } {
  let nextFolders = [...folders]
  let nextDocuments = documents.map((document) => ({ ...document }))

  for (const employee of employees) {
    if (!nextFolders.some((folder) => folder.employeeId === employee.id)) {
      nextFolders = [...nextFolders, ...createDefaultFoldersForEmployee(employee.id, nextFolders)]
    }
  }

  nextDocuments = nextDocuments.map((document) => {
    if (document.folderId) return document as EmployeeDocument
    const sharedFolder = sharedFoldersForEmployee(nextFolders, document.employeeId)[0]
    if (!sharedFolder) return document as EmployeeDocument
    return { ...document, folderId: sharedFolder.id }
  })

  return { folders: nextFolders, documents: nextDocuments as EmployeeDocument[] }
}

export function formatDocumentDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function estimateDataUrlSize(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] ?? ''
  return Math.round((base64.length * 3) / 4)
}

export function openEmployeeDocument(document: EmployeeDocument) {
  const link = window.document.createElement('a')
  link.href = document.fileDataUrl
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  if (document.fileName) {
    link.download = document.fileName
  }
  window.document.body.appendChild(link)
  link.click()
  link.remove()
}

export function categoryBadgeClass(category: EmployeeDocumentCategory) {
  return `document-category document-category-${category}`
}

export function folderIconClass(visibility: DocumentFolderVisibility) {
  return visibility === 'shared' ? 'folder-card-shared' : 'folder-card-internal'
}
