import { MarketingPage } from '@/components/MarketingPage'

export default function PricingPage() {
  return (
    <MarketingPage
      title="Transparent Pricing for Every Publisher"
      subtitle="PubFlow offers flexible plans designed to scale with your publishing needs, from single imprints to enterprise operations."
      sections={[
        {
          title: 'Starter',
          content: 'Ideal for small teams and independent publishers. Includes submission tracking, review workflows, and basic analytics.',
        },
        {
          title: 'Professional',
          content: 'Recommended for growing publishers that need automation, collaborative proofreading, and enhanced reporting.',
        },
        {
          title: 'Enterprise',
          content: 'Custom pricing for large publishers with advanced security, integration support, and multi-tenant publishing operations.',
        },
      ]}
      ctaLabel="Choose a plan"
      ctaHref="/signup"
    />
  )
}
