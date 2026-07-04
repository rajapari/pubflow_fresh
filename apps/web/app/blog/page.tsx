import { MarketingPage } from '@/components/MarketingPage'

export default function BlogPage() {
  return (
    <MarketingPage
      title="Publishing Insights"
      subtitle="Notes from building PubFlow, and practical guidance for teams who run journals and presses."
      sections={[
        {
          title: 'Why We Built the Editor into the Browser',
          content:
            'Half of every editorial delay we studied was file round-trips: download the DOCX, edit, re-upload, repeat. Moving the full word processor into the manuscript page — with track changes, comments, and stage-scoped permissions — removed the round-trip entirely. Authors revise where editors comment, and every save lands in the same version history.',
        },
        {
          title: 'The Case for Enforced Workflow States',
          content:
            'Spreadsheet-tracked pipelines fail silently: a manuscript sits in “with reviewer” for months because nobody owns the reminder. PubFlow’s fifteen workflow states with validated transitions mean a manuscript can’t skip peer review, can’t be edited during proofing, and can’t get lost — the audit trail always answers “where is it and who has it.”',
        },
        {
          title: 'Getting DOIs Right from Day One',
          content:
            'Registering DOIs at publication time — not weeks later in a batch — keeps your Crossref metadata consistent with your published HTML and your JATS archive. PubFlow generates all three from the same source at the moment you publish, so the scholarly record never drifts.',
        },
        {
          title: 'Versioning Is an Editorial Feature, Not a Technical One',
          content:
            'When an author revises after peer review, editors need to compare rounds, and the submitted version must remain immutable. That’s why every revision in PubFlow is a new numbered version with its own stored file — reviewers see what they reviewed, and the final published version has a clean provenance chain.',
        },
        {
          title: 'More Coming',
          content:
            'We publish product updates on the Changelog page and upcoming work on the Roadmap page. For questions this blog hasn’t answered, the Docs page covers the full workflow role by role.',
        },
      ]}
      ctaLabel="Read the docs"
      ctaHref="/docs"
    />
  )
}
