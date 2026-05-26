import { MarketingPage } from '@/components/MarketingPage'

export default function SupportPage() {
  return (
    <MarketingPage
      title="Support & Customer Success"
      subtitle="Get fast support for onboarding, production issues, and platform questions so your team can stay productive."
      sections={[
        {
          title: 'Help Center',
          content: 'Access FAQs, step-by-step setup articles, and troubleshooting guides for common publishing workflows.',
        },
        {
          title: 'Enterprise Support',
          content: 'Choose priority support plans with dedicated onboarding, account review, and escalation support.',
        },
        {
          title: 'Contact Options',
          content: 'Reach out via email or schedule a call with our team to discuss your publishing workflow and deployment needs.',
        },
      ]}
      ctaLabel="Reach support"
      ctaHref="/contact"
    />
  )
}
