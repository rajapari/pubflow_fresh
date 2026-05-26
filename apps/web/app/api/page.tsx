import { MarketingPage } from '@/components/MarketingPage'

export default function ApiPage() {
  return (
    <MarketingPage
      title="API & Integration Resources"
      subtitle="Everything developers need to connect PubFlow with publishing systems, data pipelines, and third-party services."
      sections={[
        {
          title: 'REST & GraphQL',
          content: 'Explore endpoint documentation, authentication flows, and example requests to integrate submissions, users, and publication workflows.',
        },
        {
          title: 'Webhooks & Events',
          content: 'Receive real-time notifications for submission status changes, review completions, and publication events.',
        },
        {
          title: 'Developer Support',
          content: 'Get started quickly with sample code, SDK guidance, and integration best practices built for publishing teams.',
        },
      ]}
      ctaLabel="Contact our integration team"
      ctaHref="/contact"
    />
  )
}
