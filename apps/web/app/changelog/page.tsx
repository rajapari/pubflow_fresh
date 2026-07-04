import { MarketingPage } from '@/components/MarketingPage'

export default function ChangelogPage() {
  return (
    <MarketingPage
      title="Changelog"
      subtitle="What’s new in PubFlow, most recent first."
      sections={[
        {
          title: 'July 2026 — Revise & Resubmit, Editor Improvements',
          content:
            'Authors can now reopen a submitted manuscript before editorial review begins: the submitted file is preserved as a version and edits go to a fresh copy. The in-browser editor now opens in full desktop view with the complete toolbar, track changes, and review tools. Session handling gained silent token refresh — long editing sessions no longer log you out mid-save.',
        },
        {
          title: 'June 2026 — Publication Catalogue & Onboarding',
          content:
            'New organizations start with a seeded catalogue of publications so the submission wizard works from the first minute. Signup, login, and password reset flows were rebuilt with password visibility toggles and a proper email-based reset. Duplicate-prevention constraints were added to the publication catalogue.',
        },
        {
          title: 'Phase 4 — Distribution & Operations',
          content:
            'Publishing gained its distribution layer: JATS XML export, Crossref DOI registration, per-tenant public portals with article pages, OAI-PMH harvesting endpoint, RSS feeds, PubMed FTP delivery, and Lulu print-on-demand. Also added: billing with three plans, user management with role assignment, grammar checking via LanguageTool, email reminders for overdue reviews, and Kubernetes deployment manifests.',
        },
        {
          title: 'Phase 3 — Production Pipeline',
          content:
            'Accepted manuscripts now flow through dedicated production stages — copy editing, artwork processing, typesetting, and proof review — each with its own queue dashboard and stage-scoped editing permissions. Proof review supports annotations and approval before publishing.',
        },
        {
          title: 'Phase 2 — Editorial Core',
          content:
            'The heart of the platform: the three-step submission wizard, manuscript upload for seven formats plus create-in-browser, the OnlyOffice-powered editor with autosave and versioning, peer review with invitations and structured reviews, editorial decisions, and the fifteen-state enforced workflow with a full audit trail.',
        },
      ]}
      ctaLabel="See what’s next"
      ctaHref="/roadmap"
    />
  )
}
