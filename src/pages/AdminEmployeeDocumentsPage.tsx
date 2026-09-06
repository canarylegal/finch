import { useRef, useState } from 'react'
import {
  ArrowLeft,
  Folder,
  FolderLock,
  FolderOpen,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import {
  categoryBadgeClass,
  documentCountInFolder,
  documentsInFolder,
  EMPLOYEE_DOCUMENT_CATEGORIES,
  EMPLOYEE_DOCUMENT_LABELS,
  estimateDataUrlSize,
  FOLDER_VISIBILITY_LABELS,
  folderIconClass,
  foldersForEmployee,
  formatDocumentDate,
  formatFileSize,
  openEmployeeDocument,
} from '../employeeDocuments'
import type {
  DocumentFolder,
  DocumentFolderVisibility,
  Employee,
  EmployeeDocument,
  EmployeeDocumentCategory,
} from '../domain'

type AdminEmployeeDocumentsPageProps = {
  employee: Employee
  folders: DocumentFolder[]
  documents: EmployeeDocument[]
  onBack: () => void
  onCreateFolder: (name: string, visibility: DocumentFolderVisibility) => void
  onDeleteFolder: (folderId: number) => void
  onUploadDocument: (
    folderId: number,
    payload: {
      title: string
      category: EmployeeDocumentCategory
      fileName: string
      fileType: string
      fileDataUrl: string
      note?: string
    },
  ) => void
  onDeleteDocument: (documentId: number) => void
}

export function AdminEmployeeDocumentsPage({
  employee,
  folders,
  documents,
  onBack,
  onCreateFolder,
  onDeleteFolder,
  onUploadDocument,
  onDeleteDocument,
}: AdminEmployeeDocumentsPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<DocumentFolderVisibility>('shared')
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategory, setUploadCategory] = useState<EmployeeDocumentCategory>('payslip')
  const [uploadNote, setUploadNote] = useState('')

  const tabFolders = foldersForEmployee(folders, employee.id, activeTab)
  const selectedFolder = tabFolders.find((folder) => folder.id === selectedFolderId) ?? null
  const folderDocuments = selectedFolder ? documentsInFolder(documents, selectedFolder.id) : []

  const startUpload = () => {
    if (!selectedFolder) return
    fileInputRef.current?.click()
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedFolder) return

    const reader = new FileReader()
    reader.onload = () => {
      const resolvedTitle =
        uploadTitle.trim() || file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
      onUploadDocument(selectedFolder.id, {
        title: resolvedTitle,
        category: uploadCategory,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileDataUrl: String(reader.result),
        note: uploadNote.trim() || undefined,
      })
      setUploadTitle('')
      setUploadNote('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsDataURL(file)
  }

  const handleCreateFolder = () => {
    const name = newFolderName.trim()
    if (!name) return
    onCreateFolder(name, activeTab)
    setNewFolderName('')
  }

  const switchTab = (visibility: DocumentFolderVisibility) => {
    setActiveTab(visibility)
    setSelectedFolderId(null)
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Employee files"
        title={employee.name}
        description={
          activeTab === 'shared'
            ? `Documents in shared folders are visible to ${employee.name.split(' ')[0]} in My documents.`
            : 'Admin-only folders are never visible to the employee.'
        }
        action={
          <button type="button" className="button button-secondary" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to employees
          </button>
        }
      />

      <div className="document-visibility-tabs">
        <button
          type="button"
          className={`document-visibility-tab ${activeTab === 'shared' ? 'active' : ''}`}
          onClick={() => switchTab('shared')}
        >
          <FolderOpen size={16} />
          Shared with {employee.name.split(' ')[0]}
        </button>
        <button
          type="button"
          className={`document-visibility-tab ${activeTab === 'internal' ? 'active' : ''}`}
          onClick={() => switchTab('internal')}
        >
          <FolderLock size={16} />
          Admin only
        </button>
      </div>

      <div className="document-workspace">
        <div className="card document-folder-panel">
          <div className="section-heading compact-heading">
            <div>
              <h2>Folders</h2>
              <p>{FOLDER_VISIBILITY_LABELS[activeTab]}</p>
            </div>
          </div>

          <div className="folder-create-row">
            <input
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="New folder name"
            />
            <button type="button" className="button button-secondary" onClick={handleCreateFolder}>
              <Plus size={15} />
              Create
            </button>
          </div>

          {tabFolders.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No folders yet</strong>
              <span>Create a folder to start organising files.</span>
            </div>
          ) : (
            <div className="folder-list">
              {tabFolders.map((folder) => {
                const count = documentCountInFolder(documents, folder.id)
                return (
                  <button
                    type="button"
                    key={folder.id}
                    className={`folder-card ${folderIconClass(folder.visibility)} ${
                      selectedFolderId === folder.id ? 'is-selected' : ''
                    }`}
                    onClick={() => setSelectedFolderId(folder.id)}
                  >
                    <div className="folder-card-icon">
                      {folder.visibility === 'shared' ? <FolderOpen size={18} /> : <FolderLock size={18} />}
                    </div>
                    <div className="folder-card-copy">
                      <strong>{folder.name}</strong>
                      <span>
                        {count} {count === 1 ? 'file' : 'files'}
                      </span>
                    </div>
                    {count === 0 && (
                      <button
                        type="button"
                        className="icon-button danger-icon-button folder-delete-button"
                        aria-label={`Delete folder ${folder.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (window.confirm(`Delete empty folder “${folder.name}”?`)) {
                            onDeleteFolder(folder.id)
                            if (selectedFolderId === folder.id) setSelectedFolderId(null)
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card document-folder-panel">
          {!selectedFolder ? (
            <div className="empty-state compact-empty folder-empty-state">
              <Folder size={28} />
              <strong>Select a folder</strong>
              <span>Choose a folder to view files or upload documents.</span>
            </div>
          ) : (
            <>
              <div className="section-heading compact-heading">
                <div>
                  <h2>{selectedFolder.name}</h2>
                  <p>{folderDocuments.length} files in this folder</p>
                </div>
                <button type="button" className="button button-primary" onClick={startUpload}>
                  <Upload size={16} />
                  Upload file
                </button>
              </div>

              <div className="employee-documents-upload card-inset">
                <div className="form-row">
                  <label>
                    Title
                    <input
                      value={uploadTitle}
                      onChange={(event) => setUploadTitle(event.target.value)}
                      placeholder="Auto-filled from filename"
                    />
                  </label>
                  <label>
                    Category
                    <select
                      value={uploadCategory}
                      onChange={(event) =>
                        setUploadCategory(event.target.value as EmployeeDocumentCategory)
                      }
                    >
                      {EMPLOYEE_DOCUMENT_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {EMPLOYEE_DOCUMENT_LABELS[category]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Note <span className="optional">(optional)</span>
                  <input
                    value={uploadNote}
                    onChange={(event) => setUploadNote(event.target.value)}
                    placeholder="e.g. Final signed copy"
                  />
                </label>
                <input ref={fileInputRef} type="file" hidden onChange={handleFileSelect} />
              </div>

              {folderDocuments.length === 0 ? (
                <div className="empty-state compact-empty">
                  <strong>No files in this folder</strong>
                  <span>Upload payslips, contracts, tax forms, and other HR documents.</span>
                </div>
              ) : (
                folderDocuments.map((document) => (
                  <div className="employee-document-row" key={document.id}>
                    <div className="employee-document-copy">
                      <strong>{document.title}</strong>
                      <span>
                        {document.fileName} · {formatFileSize(estimateDataUrlSize(document.fileDataUrl))}
                      </span>
                      <small>
                        {EMPLOYEE_DOCUMENT_LABELS[document.category]} · Uploaded{' '}
                        {formatDocumentDate(document.uploadedAt)}
                        {document.note ? ` · ${document.note}` : ''}
                      </small>
                    </div>
                    <span className={categoryBadgeClass(document.category)}>
                      {EMPLOYEE_DOCUMENT_LABELS[document.category]}
                    </span>
                    <div className="employee-document-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => openEmployeeDocument(document)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="icon-button danger-icon-button"
                        aria-label={`Delete ${document.title}`}
                        onClick={() => {
                          if (window.confirm(`Delete “${document.title}”?`)) {
                            onDeleteDocument(document.id)
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
