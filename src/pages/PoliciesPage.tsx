import { useRef, useState } from 'react'
import { BookOpen, ChevronRight, FileText, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { MoreMenu } from '../components/MoreMenu'
import { PageHeader } from '../components/PageHeader'
import type { PolicyDocument } from '../domain'
import {
  ACCEPTED_POLICY_ACCEPT,
  formatPolicyUpdatedAt,
  preparePolicyFile,
  sortedPolicies,
} from '../policies'
import { PolicyViewerModal } from '../modals/PolicyViewerModal'

type PoliciesProps = {
  policies: PolicyDocument[]
  isAdmin: boolean
  onNotify: (message: string) => void
  onAddPolicy: (payload: {
    title: string
    description: string
    fileName: string
    fileType: string
    fileDataUrl: string
  }) => boolean | void
  onUpdatePolicy: (
    id: number,
    payload: {
      title: string
      description: string
      fileName?: string
      fileType?: string
      fileDataUrl?: string
    },
  ) => boolean | void
  onDeletePolicy: (id: number) => void
}

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; policy: PolicyDocument }
  | null

export function Policies({
  policies,
  isAdmin,
  onNotify,
  onAddPolicy,
  onUpdatePolicy,
  onDeletePolicy,
}: PoliciesProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editor, setEditor] = useState<EditorState>(null)
  const [viewing, setViewing] = useState<PolicyDocument | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [fileMeta, setFileMeta] = useState<{
    fileName: string
    fileType: string
    fileDataUrl: string
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const rows = sortedPolicies(policies)

  const openCreate = () => {
    setEditor({ mode: 'create' })
    setTitle('')
    setDescription('')
    setFileMeta(null)
    setError('')
  }

  const openEdit = (policy: PolicyDocument) => {
    setEditor({ mode: 'edit', policy })
    setTitle(policy.title)
    setDescription(policy.description)
    setFileMeta(null)
    setError('')
  }

  const closeEditor = () => {
    setEditor(null)
    setError('')
    setBusy(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFile = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    const result = await preparePolicyFile(file)
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setFileMeta(result)
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Add a policy title')
      return
    }
    if (editor?.mode === 'create') {
      if (!fileMeta) {
        setError('Attach a policy file')
        return
      }
      const ok = onAddPolicy({
        title: trimmedTitle,
        description: description.trim(),
        ...fileMeta,
      })
      if (ok === false) return
      closeEditor()
      return
    }
    if (editor?.mode === 'edit') {
      const ok = onUpdatePolicy(editor.policy.id, {
        title: trimmedTitle,
        description: description.trim(),
        ...(fileMeta ?? {}),
      })
      if (ok === false) return
      closeEditor()
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Company library"
        title="Policies"
        description="A shared home for the guidance that keeps everyone aligned."
        action={
          isAdmin ? (
            <button type="button" className="button button-primary" onClick={openCreate}>
              <Plus size={17} />
              Add policy
            </button>
          ) : undefined
        }
      />
      <div className="policy-hero">
        <div className="policy-hero-icon">
          <BookOpen size={22} />
        </div>
        <div>
          <span className="eyebrow">For everyone</span>
          <h2>Policies, all in one place</h2>
          <p>
            {isAdmin
              ? 'Upload, rename, or retire guidance your team can open anytime.'
              : 'Keep up with the latest company guidance and ways of working.'}
          </p>
        </div>
        <div className="policy-hero-lines">
          <i />
          <i />
          <i />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card full-panel">
          <div className="empty-state compact-empty">
            <BookOpen size={22} />
            <strong>No policies yet</strong>
            <span>
              {isAdmin
                ? 'Add your first company policy to share it with the team.'
                : 'Your employer hasn’t published any policies yet.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="document-grid">
          {rows.map((policy) => (
            <div className="document-card policy-card" key={policy.id}>
              <button
                type="button"
                className="policy-card-main"
                onClick={() => {
                  setViewing(policy)
                  onNotify(`Viewing ${policy.title}`)
                }}
              >
                <div className={`document-large-icon ${policy.accent}`}>
                  <FileText size={21} />
                </div>
                <div>
                  <h3>{policy.title}</h3>
                  <p>{policy.description || 'No description'}</p>
                  <span>
                    {formatPolicyUpdatedAt(policy.updatedAt)} <ChevronRight size={14} />
                  </span>
                </div>
              </button>
              {isAdmin && (
                <div className="policy-card-menu">
                  <MoreMenu
                    label={`Actions for ${policy.title}`}
                    items={[
                      { label: 'Edit details', onClick: () => openEdit(policy) },
                      {
                        label: 'Delete policy',
                        danger: true,
                        onClick: () => {
                          if (window.confirm(`Delete “${policy.title}”?`)) {
                            onDeletePolicy(policy.id)
                          }
                        },
                      },
                    ]}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editor && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeEditor}>
          <div
            className="modal modal-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="policy-editor-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">Policies</span>
                <h2 id="policy-editor-title">
                  {editor.mode === 'create' ? 'Add policy' : 'Edit policy'}
                </h2>
              </div>
              <button type="button" className="close-button" onClick={closeEditor} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-form">
              <label>
                Title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Hybrid working"
                />
              </label>
              <label>
                Description <span className="optional">(optional)</span>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Short summary shown on the policies page"
                />
              </label>
              <div className="receipt-upload">
                <div className="section-heading compact-heading">
                  <div>
                    <h2>File</h2>
                    <p>PDF, image, or plain text · 1.5 MB max</p>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={15} />
                    {busy ? 'Reading…' : editor.mode === 'edit' ? 'Replace file' : 'Choose file'}
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept={ACCEPTED_POLICY_ACCEPT}
                  onChange={(event) => handleFile(event.target.files)}
                />
                {(fileMeta || editor.mode === 'edit') && (
                  <div className="receipt-preview-item">
                    <div className="receipt-thumb receipt-thumb-file">
                      <FileText size={18} />
                    </div>
                    <div className="receipt-preview-copy">
                      <strong>
                        {fileMeta?.fileName ??
                          (editor.mode === 'edit' ? editor.policy.fileName : 'No file')}
                      </strong>
                      <span>
                        {fileMeta
                          ? 'Ready to save'
                          : editor.mode === 'edit'
                            ? 'Current file kept unless you replace it'
                            : ''}
                      </span>
                    </div>
                    {fileMeta && (
                      <button
                        type="button"
                        className="icon-button danger-icon-button"
                        aria-label="Remove selected file"
                        onClick={() => setFileMeta(null)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {error && <p className="field-error">{error}</p>}
              <div className="modal-footer">
                <button type="button" className="button button-secondary" onClick={closeEditor}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busy}
                  onClick={handleSave}
                >
                  {editor.mode === 'create' ? (
                    <>
                      <Plus size={15} />
                      Add policy
                    </>
                  ) : (
                    <>
                      <Pencil size={15} />
                      Save changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {viewing && <PolicyViewerModal policy={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
