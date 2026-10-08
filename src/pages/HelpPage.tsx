import { Mail, BookOpen } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'

const SUPPORT_EMAIL = 'colin@canarylegalsoftware.co.uk'

export function HelpPage({ onOpenPolicies }: { onOpenPolicies: () => void }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Support"
        title="Help centre"
        description="A short guide to getting started with Finch, plus how to reach us."
      />

      <div className="card full-panel help-panel">
        <section className="help-section">
          <h2>Getting started</h2>
          <ol className="help-steps">
            <li>
              <strong>Confirm your leave year</strong> in Settings → Leave (admins), so balances and
              requests charge the right period.
            </li>
            <li>
              <strong>Invite people</strong> from People → Add employee with their work email. They
              receive a link to set their own password.
            </li>
            <li>
              <strong>Book leave</strong> from My leave — including half-days (morning or afternoon)
              on the first or last day of a request.
            </li>
            <li>
              <strong>Submit expenses</strong> with a receipt photo or PDF. Images are compressed
              automatically before upload.
            </li>
            <li>
              <strong>Company policies</strong> live under Policies — share contracts, handbooks, and
              leave rules with the team.
            </li>
          </ol>
        </section>

        <section className="help-section">
          <h2>Leave balances</h2>
          <p>
            <strong>Taken</strong> is leave already used. <strong>Booked</strong> is approved leave
            still upcoming. <strong>Pending</strong> awaits approval.{' '}
            <strong>Available</strong> is what you can still request.
          </p>
        </section>

        <section className="help-section help-contact">
          <h2>Contact</h2>
          <p>Questions, onboarding help, or something that looks wrong — email us.</p>
          <a className="button button-primary" href={`mailto:${SUPPORT_EMAIL}`}>
            <Mail size={16} />
            {SUPPORT_EMAIL}
          </a>
          <button type="button" className="button button-secondary" onClick={onOpenPolicies}>
            <BookOpen size={16} />
            Open company policies
          </button>
        </section>
      </div>
    </div>
  )
}
