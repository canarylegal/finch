import { Download, X } from 'lucide-react'
import type { PolicyDocument } from '../domain'
import { useModalA11y } from '../hooks/useModalA11y'
import { formatPolicyUpdatedAt, policyPreviewKind, readPolicyText } from '../policies'

export function PolicyViewerModal({
  policy,
  onClose,
}: {
  policy: PolicyDocument
  onClose: () => void
}) {
  const kind = policyPreviewKind(policy)
  const text = kind === 'text' ? readPolicyText(policy) : null
  const dialogRef = useModalA11y(onClose)

  const download = () => {
    const link = window.document.createElement('a')
    link.href = policy.fileDataUrl
    link.download = policy.fileName || `${policy.title}.txt`
    window.document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal modal-wide modal-tall policy-viewer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-viewer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">Company policy</span>
            <h2 id="policy-viewer-title">{policy.title}</h2>
            <p className="field-helper">{formatPolicyUpdatedAt(policy.updatedAt)}</p>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="policy-viewer-body">
          {policy.description && <p className="policy-viewer-description">{policy.description}</p>}
          {kind === 'text' && text && <pre className="policy-viewer-text">{text}</pre>}
          {kind === 'image' && (
            <img className="policy-viewer-image" src={policy.fileDataUrl} alt={policy.title} />
          )}
          {kind === 'pdf' && (
            <iframe
              className="policy-viewer-frame"
              title={policy.title}
              src={policy.fileDataUrl}
            />
          )}
          {kind === 'other' && (
            <div className="empty-state compact-empty">
              <strong>Preview not available</strong>
              <span>Download the file to open it outside Finch.</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="button button-secondary" onClick={download}>
            <Download size={15} />
            Download
          </button>
          <button type="button" className="button button-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
