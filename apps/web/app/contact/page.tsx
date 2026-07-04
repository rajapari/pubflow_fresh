import { MarketingPage } from '@/components/MarketingPage'

export default function ContactPage() {
  return (
    <MarketingPage
      title="Contact PubFlow"
      subtitle="Sales, support, partnerships, or privacy — pick the right channel and we’ll get back to you quickly."
      sections={[
        {
          title: 'Sales & Demos',
          content:
            'Evaluating PubFlow for your journal, society, or press? Email sales@pubflow.io with your publication count and current workflow, and we’ll schedule a walkthrough using your real use case — academic journals, book programs, or institutional publishing. Enterprise procurement questions (security reviews, DPAs, custom terms) go to the same address.',
        },
        {
          title: 'Technical Support',
          content:
            'Existing customers reach support at support@pubflow.io. Include the submission ID from the page URL, your role, and what you expected to happen. Professional-plan tickets are answered within one business day; Enterprise customers should use their dedicated support channel for SLA-covered response times.',
        },
        {
          title: 'Privacy & Data Requests',
          content:
            'Data access, correction, export, or deletion requests — for yourself or on behalf of your organization — go to privacy@pubflow.io. We respond to verified requests within 30 days, as described in our Privacy Policy.',
        },
        {
          title: 'Partnerships & Integrations',
          content:
            'Building a service for publishers, or want PubFlow to talk to your platform? We integrate with DOI registries, indexing services, and print fulfilment today, and we’re open to more. Write to partners@pubflow.io with what you have in mind.',
        },
      ]}
      ctaLabel="Start your free account instead"
      ctaHref="/signup"
    />
  )
}
