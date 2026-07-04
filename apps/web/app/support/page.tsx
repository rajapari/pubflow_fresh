import { MarketingPage } from '@/components/MarketingPage'

export default function SupportPage() {
  return (
    <MarketingPage
      title="Support"
      subtitle="Stuck on something? Here’s how to get unstuck fast — and what to check first."
      sections={[
        {
          title: 'Common Questions',
          content:
            'Can’t sign in? Use “Forgot password” on the login page — reset links arrive by email and expire after 24 hours. Publication dropdown empty? Your organization’s catalogue is seeded automatically on first login; if you still see nothing, sign out and back in. Document won’t open in the editor? LaTeX and ZIP sources can’t be edited in the browser — use the Download button and work locally, then upload the revised file as a new version.',
        },
        {
          title: 'Editor & Document Issues',
          content:
            'The in-browser editor requires the document server to be reachable — if you see “Editor Unavailable,” try again in a minute, then contact your administrator. Your work autosaves continuously while editing; closing the tab never loses changes. Editing rights depend on the manuscript’s workflow stage: if the editor opens read-only, check the status badge — authors edit drafts and revisions, production roles edit during their stage.',
        },
        {
          title: 'Workflow Questions',
          content:
            'A manuscript can only move along valid workflow transitions — the full map is Draft → Submitted → Desk Review → Peer Review → Decision → Production → Published. If a button you expect is missing, the manuscript is usually in a stage owned by another role. Every transition is recorded in the submission’s history tab, so you can always see exactly where a manuscript is and who moved it there.',
        },
        {
          title: 'Reporting a Problem',
          content:
            'Reach us through the Contact page with: what you were doing, the submission ID (visible in the page URL), your role, and a screenshot if possible. Starter plans receive support on a best-effort basis; Professional gets priority response within one business day; Enterprise customers have a dedicated support contact and SLA.',
        },
        {
          title: 'For Administrators',
          content:
            'Organization owners manage members and roles under Settings → Users, branding and publication defaults under Settings, and subscription changes under Settings → Billing. Self-hosted deployments should check service health (PostgreSQL, Redis, Keycloak, MinIO, document server) before filing platform issues — the API exposes a /health endpoint reporting service status.',
        },
      ]}
      ctaLabel="Contact support"
      ctaHref="/contact"
    />
  )
}
