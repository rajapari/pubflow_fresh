import { MarketingPage } from '@/components/MarketingPage'

export default function PrivacyPage() {
  return (
    <MarketingPage
      title="Privacy Policy"
      subtitle="Learn how PubFlow protects your data, handles personal information, and maintains secure operations."
      sections={[
        {
          title: 'Data Protection',
          content: 'We use encryption, access controls, and secure infrastructure to protect author, reviewer, and publication data.',
        },
        {
          title: 'Usage Information',
          content: 'We collect only the information required to operate your account and deliver the publishing workflows you rely on.',
        },
        {
          title: 'Your Rights',
          content: 'You can request access, correction, or deletion of your personal data in accordance with applicable privacy regulations.',
        },
      ]}
    />
  )
}
