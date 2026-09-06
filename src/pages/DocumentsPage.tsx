import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, FolderOpen } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import {
  categoryBadgeClass,
  documentCountInFolder,
  documentsInFolder,
  EMPLOYEE_DOCUMENT_CATEGORIES,
  EMPLOYEE_DOCUMENT_LABELS,
  estimateDataUrlSize,
  formatDocumentDate,
  formatFileSize,
  openEmployeeDocument,
  sharedFoldersForEmployee,
} from '../employeeDocuments'
import type {
  DocumentFolder,
  Employee,
  EmployeeDocument,
  EmployeeDocumentCategory,
} from '../domain'

type DocumentsProps = {
  employee?: Employee
  folders: DocumentFolder[]
  documents: EmployeeDocument[]
}

export function Documents({ employee, folders, documents }: DocumentsProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [activeCategory, setActiveCategory] = useState<EmployeeDocumentCategory | 'all'>('all')

  const sharedFolders = useMemo(
    () => (employee ? sharedFoldersForEmployee(folders, employee.id) : []),
    [employee, folders],
  )

  const selectedFolder = sharedFolders.find((folder) => folder.id === selectedFolderId) ?? null

  const folderDocuments = useMemo(() => {
    if (!selectedFolder) return []
    return documentsInFolder(documents, selectedFolder.id)
  }, [documents, selectedFolder])

  const filteredDocuments = useMemo(() => {
    if (activeCategory === 'all') return folderDocuments
    return folderDocuments.filter((document) => document.category === activeCategory)
  }, [activeCategory, folderDocuments])

  const totalSharedFiles = useMemo(
    () =>
      sharedFolders.reduce(
        (total, folder) => total + documentCountInFolder(documents, folder.id),
        0,
      ),
    [documents, sharedFolders],
  )

  if (!employee) {
    return null
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Your HR files"
        title="My documents"
        description="Folders your employer has shared with you — payslips, contracts, tax forms, and more."
      />

      <div className="document-hero employee-document-hero">
        <div className="policy-hero-icon">
          <FolderOpen size={22} />
        </div>
        <div>
          <span className="eyebrow">Shared with you</span>
          <h2>
            {sharedFolders.length} {sharedFolders.length === 1 ? 'folder' : 'folders'} ·{' '}
            {totalSharedFiles} {totalSharedFiles === 1 ? 'file' : 'files'}
          </h2>
          <p>
            Company policies live under Policies. Internal HR notes are never shown here — only
            folders explicitly shared with you.
          </p>
        </div>
      </div>

      {!selectedFolder ? (
        <div className="folder-grid">
          {sharedFolders.length === 0 ? (
            <div className="card full-panel">
              <div className="empty-state compact-empty">
                <strong>No shared folders yet</strong>
                <span>Your employer can create shared folders and upload documents for you.</span>
              </div>
            </div>
          ) : (
            sharedFolders.map((folder) => {
              const count = documentCountInFolder(documents, folder.id)
              return (
                <button
                  type="button"
                  key={folder.id}
                  className="folder-card folder-card-shared folder-grid-card"
                  onClick={() => {
                    setSelectedFolderId(folder.id)
                    setActiveCategory('all')
                  }}
                >
                  <div className="folder-card-icon">
                    <FolderOpen size={22} />
                  </div>
                  <div className="folder-card-copy">
                    <strong>{folder.name}</strong>
                    <span>
                      {count} {count === 1 ? 'file' : 'files'}
                    </span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              )
            })
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            className="folder-back-button"
            onClick={() => setSelectedFolderId(null)}
          >
            <ChevronLeft size={16} />
            All folders
          </button>

          <div className="document-category-tabs">
            <button
              type="button"
              className={`preset-chip ${activeCategory === 'all' ? 'is-active' : ''}`}
              onClick={() => setActiveCategory('all')}
            >
              All ({folderDocuments.length})
            </button>
            {EMPLOYEE_DOCUMENT_CATEGORIES.map((category) => {
              const count = folderDocuments.filter((document) => document.category === category).length
              if (count === 0) return null
              return (
                <button
                  type="button"
                  key={category}
                  className={`preset-chip ${activeCategory === category ? 'is-active' : ''}`}
                  onClick={() => setActiveCategory(category)}
                >
                  {EMPLOYEE_DOCUMENT_LABELS[category]} ({count})
                </button>
              )
            })}
          </div>

          <div className="card full-panel">
            <div className="section-heading leave-history-heading">
              <div>
                <h2>{selectedFolder.name}</h2>
                <p>{filteredDocuments.length} documents</p>
              </div>
            </div>

            {filteredDocuments.length === 0 ? (
              <div className="empty-state compact-empty">
                <strong>No documents in this folder</strong>
                <span>Files your employer adds will appear here.</span>
              </div>
            ) : (
              <>
                <div className="document-list-heading">
                  <span>Document</span>
                  <span>Uploaded</span>
                  <span />
                </div>
                {filteredDocuments.map((document) => (
                  <button
                    type="button"
                    className="document-list-row"
                    key={document.id}
                    onClick={() => openEmployeeDocument(document)}
                  >
                    <div className="document-list-title">
                      <div className="document-icon">
                        <FileText size={17} />
                      </div>
                      <div>
                        <strong>{document.title}</strong>
                        <span className={categoryBadgeClass(document.category)}>
                          {EMPLOYEE_DOCUMENT_LABELS[document.category]}
                        </span>
                      </div>
                    </div>
                    <span>
                      {formatDocumentDate(document.uploadedAt)}
                      <small>{formatFileSize(estimateDataUrlSize(document.fileDataUrl))}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
