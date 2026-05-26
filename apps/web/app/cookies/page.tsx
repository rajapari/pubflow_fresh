import { MarketingPage } from '@/components/MarketingPage'

export default function CookiesPage() {
  return (
    <MarketingPage
      title="Cookie Policy"
      subtitle="Understand how PubFlow uses cookies, local storage, and similar technologies to improve your experience and preserve session state."
      sections={[
        {
          title: 'Essential Cookies',
          content: 'These are required for security, authentication, and basic site functionality during your session.',
        },
        {
          title: 'Performance Cookies',
          content: 'We use non-identifying performance cookies to understand how visitors interact with PubFlow and to improve the experience.',
        },
        {
          title: 'Managing Preferences',
          content: 'You can control cookie preferences through your browser settings and choose how much data is stored while using the platform.',
        },
      ]}
    />
  )
}
