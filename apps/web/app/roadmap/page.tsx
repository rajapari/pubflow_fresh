import { MarketingPage } from '@/components/MarketingPage'

export default function RoadmapPage() {
  return (
    <MarketingPage
      title="Product Roadmap"
      subtitle="See where PubFlow is headed and how future releases will support your publishing operations with automation, collaboration, and compliance."
      sections={[
        {
          title: 'Upcoming Releases',
          content: 'Expect enhanced proofing workflows, expanded file type support, and deeper editorial metadata for faster review cycles.',
        },
        {
          title: 'Integration Priorities',
          content: 'We are focused on improving onboarding with OAuth, richer API endpoints, and stronger downstream publishing connectors.',
        },
        {
          title: 'Customer-driven innovation',
          content: 'Your feedback guides our roadmap, so we prioritize the features that matter most to publishing teams and content operations.',
        },
      ]}
      ctaLabel="Share your feedback"
      ctaHref="/contact"
    />
  )
}
