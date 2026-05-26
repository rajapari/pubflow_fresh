import { MarketingPage } from '@/components/MarketingPage'

export default function DemoPage() {
  return (
    <MarketingPage
      title="Book a PubFlow Demo"
      subtitle="See PubFlow in action with a guided demonstration tailored to your publishing workflow."
      sections={[
        {
          title: 'Live Walkthrough',
          content: 'Watch how submissions, reviews, proofing, and publication workflows come together in a single platform.',
        },
        {
          title: 'Implementation Planning',
          content: 'Discuss your existing processes and let our team recommend the best way to deploy PubFlow at your organization.',
        },
        {
          title: 'Custom Use Cases',
          content: 'We can demonstrate features for academic journals, book publishers, or enterprise content operations.',
        },
      ]}
      ctaLabel="Request a demo"
      ctaHref="/contact"
    />
  )
}
