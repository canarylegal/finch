import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export function WorkspaceSwitcher({
  companyName,
  companyAvatar,
  logoUrl,
  isAdmin,
  onOpenSettings,
  onSwitchView,
  onNotify,
}: {
  companyName: string
  companyAvatar: string
  logoUrl: string | null
  isAdmin: boolean
  onOpenSettings: () => void
  onSwitchView: () => void
  onNotify: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="workspace-switcher-wrap" ref={wrapRef}>
      <button
        type="button"
        className="workspace-switcher"
        aria-label="Switch workspace"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        {logoUrl ? (
          <img className="company-logo" src={logoUrl} alt="" />
        ) : (
          <div className="company-avatar">{companyAvatar}</div>
        )}
        <div>
          <strong>{companyName}</strong>
          <span>Personal workspace</span>
        </div>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="action-menu workspace-menu" role="menu">
          <div className="workspace-menu-current">
            <strong>{companyName}</strong>
            <span>Current workspace</span>
          </div>
          {isAdmin ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenSettings()
                setOpen(false)
              }}
            >
              Workspace settings
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => onNotify('Only admins can change workspace settings')}
            >
              Workspace settings
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSwitchView()
              setOpen(false)
            }}
          >
            Switch to {isAdmin ? 'employee' : 'admin'} view
          </button>
        </div>
      )}
    </div>
  )
}
