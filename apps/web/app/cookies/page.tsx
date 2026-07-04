import { MarketingPage } from '@/components/MarketingPage'

export default function CookiesPage() {
  return (
    <MarketingPage
      title="Cookie Policy"
      subtitle="PubFlow uses a minimal set of cookies and browser storage — only what the application needs to work. Last updated: July 2026."
      sections={[
        {
          title: 'Strictly Necessary',
          content:
            'pubflow_token — your session credential, set after sign-in and required for every authenticated request; it expires automatically and is removed on logout. Keycloak, our identity provider, sets its own session cookies on the auth domain to keep single sign-on working. Without these, you cannot stay signed in.',
        },
        {
          title: 'Local Storage',
          content:
            'The application keeps your session token and refresh token in browser local storage so the dashboard can silently renew your session instead of logging you out mid-task. These values never leave your browser except as credentials on requests to our own API and identity provider.',
        },
        {
          title: 'What We Don’t Use',
          content:
            'PubFlow sets no advertising cookies, no cross-site trackers, and no third-party analytics cookies on the marketing or application pages. Embedded editing sessions run against our own document server and do not introduce third-party tracking.',
        },
        {
          title: 'Managing Cookies',
          content:
            'You can clear cookies and site data from your browser settings at any time — doing so signs you out of PubFlow. Because we only use strictly necessary storage, there is no consent banner and nothing further to opt out of.',
        },
      ]}
    />
  )
}
