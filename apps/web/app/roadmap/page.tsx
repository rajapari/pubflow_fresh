import { MarketingPage } from '@/components/MarketingPage'

export default function RoadmapPage() {
  return (
    <MarketingPage
      title="Roadmap"
      subtitle="Where PubFlow is heading. Priorities shift with customer feedback — tell us what you need via the Contact page."
      sections={[
        {
          title: 'Near Term',
          content:
            'Outbound webhooks for submission, review, and publication events so external systems can react in real time. Reviewer-facing improvements: blinded review options, structured review forms per publication, and reviewer performance metrics for editors. Bulk user invitation with CSV import for onboarding large editorial boards.',
        },
        {
          title: 'In Design',
          content:
            'Similarity checking integration at submission time (Crossref Similarity Check / iThenticate). ORCID login for authors and reviewer auto-matching by publication history. Issue management: assemble accepted articles into numbered issues with tables of contents before batch publication.',
        },
        {
          title: 'Exploring',
          content:
            'AI-assisted desk review triage — flagging scope mismatch, missing sections, and formatting problems before an editor opens the file. LaTeX compilation preview in the browser for math-heavy journals. Multi-language portal themes and right-to-left script support for international publishers.',
        },
        {
          title: 'Recently Shipped',
          content:
            'Revise & resubmit with immutable version history, full-desktop in-browser editing, DOI registration via Crossref, JATS export with PubMed FTP delivery, per-tenant public portals with OAI-PMH and RSS, print-on-demand fulfilment, billing plans, and role-based user management. See the Changelog for details.',
        },
      ]}
      ctaLabel="Request a feature"
      ctaHref="/contact"
    />
  )
}
