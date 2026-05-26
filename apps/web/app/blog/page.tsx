import { MarketingPage } from '@/components/MarketingPage'

export default function BlogPage() {
  return (
    <MarketingPage
      title="Publishing Insights & News"
      subtitle="Read the latest articles on editorial automation, publishing operations, and the future of digital content production."
      sections={[
        {
          title: 'Industry Stories',
          content: 'Learn how publishers are using automation and better workflows to bring content to market faster and with higher quality.',
        },
        {
          title: 'Product Updates',
          content: 'Stay current with new PubFlow features, release notes, and success stories from our publishing partners.',
        },
        {
          title: 'Best Practices',
          content: 'Discover practical guidance for managing review cycles, proofing workflows, and editorial team collaboration.',
        },
      ]}
      ctaLabel="Subscribe for updates"
      ctaHref="/contact"
    />
  )
}
