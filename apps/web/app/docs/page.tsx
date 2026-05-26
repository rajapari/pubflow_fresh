import { MarketingPage } from '@/components/MarketingPage'

export default function DocsPage() {
  return (
    <MarketingPage
      title="Documentation & Implementation Guides"
      subtitle="Access the resources you need to integrate PubFlow, understand workflows, and onboard your editorial team quickly."
      sections={[
        {
          title: 'Developer Docs',
          content: 'Find API references, authentication guidance, and integration examples to connect PubFlow with your existing systems.',
        },
        {
          title: 'User Guides',
          content: 'Learn how to configure submissions, manage review cycles, and publish with confidence using our step-by-step tutorials.',
        },
        {
          title: 'Support Resources',
          content: 'Browse FAQs, troubleshooting tips, and operational best practices designed for publishing teams.',
        },
      ]}
      ctaLabel="Read the docs"
      ctaHref="/support"
    />
  )
}
