import { MarketingPage } from '@/components/MarketingPage'

export default function ContactPage() {
  return (
    <MarketingPage
      title="Contact PubFlow"
      subtitle="Reach out to our team to discuss your publishing workflows, integration requirements, or support needs."
      sections={[
        {
          title: 'Sales & Demos',
          content: 'Schedule a personalized walkthrough of PubFlow, or ask about pricing and enterprise deployment options.',
        },
        {
          title: 'Support Inquiries',
          content: 'Need help during onboarding or production? Our support team is ready to assist with technical and workflow questions.',
        },
        {
          title: 'Partnerships',
          content: 'Interested in integrating publishing services or reselling PubFlow? Let’s discuss how we can work together.',
        },
      ]}
      ctaLabel="Send us a message"
      ctaHref="/support"
    />
  )
}
