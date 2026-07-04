import { MarketingPage } from '@/components/MarketingPage'

export default function DocsPage() {
  return (
    <MarketingPage
      title="Documentation"
      subtitle="Everything you need to run your journal or press on PubFlow — from first login to your first published DOI."
      sections={[
        {
          title: 'Getting Started',
          content:
            'Create your organization from the signup page — your workspace, publication catalogue, and owner account are provisioned automatically. Invite your editorial board from Settings → Users and assign roles: Editor-in-Chief, Section Editor, Copy Editor, Artwork Editor, Typesetter, Peer Reviewer, Author, or Reader. Each role sees only the queues and actions that belong to it.',
        },
        {
          title: 'For Authors',
          content:
            'Submit in three steps: pick the target publication, enter the title and abstract, add keywords and co-authors (with ORCID and affiliation). Then either upload your manuscript — DOCX, LaTeX, Markdown, ODT, RTF, PDF, or a ZIP with supplementary files — or click “Create in Editor” to write directly in the browser. Until an editor picks up your submission, you can reopen it, revise, and resubmit; every round is preserved as a numbered version.',
        },
        {
          title: 'For Editors',
          content:
            'The editorial dashboard shows every submission by workflow stage. Move manuscripts from desk review into peer review, assign reviewers and track their invitations, then record a decision — accept, minor or major revision, reject, or desk reject. Decisions notify the author automatically and revision rounds re-enter the same tracked workflow. The complete audit trail for any manuscript is one click away.',
        },
        {
          title: 'For Production Staff',
          content:
            'Accepted manuscripts flow through copy editing (with built-in grammar checking), artwork processing, typesetting, and proof review. Each stage has its own queue page, and the manuscript opens in the full browser editor with editing rights scoped to the current stage — a typesetter cannot accidentally edit during proof review, and vice versa.',
        },
        {
          title: 'Publishing & Distribution',
          content:
            'Approving the final proof unlocks publishing: PubFlow generates JATS XML, registers the DOI with Crossref using your prefix (Settings → Publication), renders the article to your public portal at your tenant URL, and updates your OAI-PMH endpoint and RSS feed. Optional channels include PubMed FTP delivery and Lulu print-on-demand for finished issues.',
        },
        {
          title: 'Self-Hosting & Operations',
          content:
            'PubFlow ships as a pnpm/Turborepo monorepo: a Next.js web app, a Fastify API, and worker processes, backed by PostgreSQL, Redis, Keycloak, MinIO, and an OnlyOffice document server — all defined in the included Docker Compose and Kubernetes manifests. See the repository README for environment variables, seeding, and deployment guides.',
        },
      ]}
      ctaLabel="Create your account"
      ctaHref="/signup"
    />
  )
}
