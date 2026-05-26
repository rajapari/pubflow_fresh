import { MarketingPage } from '@/components/MarketingPage'

export default function TermsPage() {
  return (
    <MarketingPage
      title="Terms of Service"
      subtitle="Review the terms that govern use of PubFlow, including license rights, responsibilities, and acceptable use."
      sections={[
        {
          title: 'Account Use',
          content: 'Users are responsible for maintaining account security and using PubFlow in compliance with applicable laws and our acceptable use standards.',
        },
        {
          title: 'Service Availability',
          content: 'We strive for high availability and reliability while reserving the right to make updates, maintenance changes, and improvements over time.',
        },
        {
          title: 'Liability & Warranty',
          content: 'PubFlow is provided as-is, with limitations on service commitments and liability as described in the terms.',
        },
      ]}
    />
  )
}
