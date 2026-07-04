import { MarketingPage } from '@/components/MarketingPage'

export default function DemoPage() {
  return (
    <MarketingPage
      title="See PubFlow in Action"
      subtitle="The fastest way to evaluate PubFlow is to run a manuscript through it yourself — it takes about fifteen minutes."
      sections={[
        {
          title: 'Try It Self-Serve',
          content:
            'Create a free account and you get a complete workspace immediately: a publication catalogue, the submission wizard, the in-browser editor, and the full editorial workflow. Submit a test manuscript as an author, then use Settings → Users to add a second account with the Editor-in-Chief role and process your own submission end to end — desk review, reviewer assignment, decision, production, publish.',
        },
        {
          title: 'A Suggested Walkthrough',
          content:
            'Start on the dashboard and create a new submission (three steps, two minutes). Choose “Create in Editor” to write in the browser — note the track changes and comments in the toolbar. Submit for review, then reopen it with “Revise & Resubmit” to see version history in action. Finally, open the submission’s history tab: every action you took is in the audit trail, attributed and timestamped.',
        },
        {
          title: 'Guided Demo for Teams',
          content:
            'Rolling out to an editorial board? We’ll run a live session tailored to your workflow — migrating from OJS or email-based review, mapping your existing roles onto PubFlow’s, and setting up DOI registration and your public portal. Request a slot through the Contact page with a couple of preferred times.',
        },
        {
          title: 'What to Evaluate',
          content:
            'Publishers usually judge us on four things: how little training authors need (the three-step wizard), whether reviewers actually engage (invitation and structured review flow), production quality (the full word processor with workflow-scoped permissions), and distribution reach (DOIs, JATS, OAI-PMH, PubMed, print-on-demand). Test all four before you decide.',
        },
      ]}
      ctaLabel="Create a free account now"
      ctaHref="/signup"
    />
  )
}
