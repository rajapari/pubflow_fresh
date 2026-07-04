import { MarketingPage } from '@/components/MarketingPage'

export default function PrivacyPage() {
  return (
    <MarketingPage
      title="Privacy Policy"
      subtitle="How PubFlow collects, uses, and protects personal data across the platform. Last updated: July 2026."
      sections={[
        {
          title: '1. Data We Collect',
          content:
            'Account data: name, email address, and authentication identifiers managed through our identity provider (Keycloak). Publishing data: manuscripts, co-author names, emails, affiliations, and ORCID iDs entered during submission; reviews and editorial decisions; workflow history recording who performed each action and when. Technical data: standard server logs (IP address, user agent, timestamps) kept for security and troubleshooting.',
        },
        {
          title: '2. How We Use It',
          content:
            'We use personal data solely to operate the service: authenticating users, routing manuscripts through review and production, sending workflow notifications and reminders, registering DOIs and distributing published articles at your direction, and producing analytics for your own tenant. We do not sell personal data, serve advertising, or use your content for model training.',
        },
        {
          title: '3. Legal Bases',
          content:
            'Where GDPR applies, we process account and publishing data to perform our contract with your organization, technical logs under our legitimate interest in securing the service, and optional communications (such as product updates) with your consent, which you can withdraw at any time.',
        },
        {
          title: '4. Storage & Security',
          content:
            'Manuscripts and artwork are stored in S3-compatible object storage; metadata lives in PostgreSQL. Each tenant’s data is logically isolated and every API request is scoped to the caller’s tenant. Access is controlled through OpenID Connect single sign-on with role-based permissions, and passwords are handled exclusively by the identity provider — PubFlow never stores them.',
        },
        {
          title: '5. Sharing & Subprocessors',
          content:
            'Data leaves the platform only through channels you explicitly enable: DOI registration sends article metadata to Crossref; PubMed delivery transmits JATS packages by FTP; print-on-demand sends finished files to the fulfilment provider; your public portal, OAI-PMH endpoint, and RSS feed expose the article metadata you choose to publish. Reviewer identities are visible to editors but hidden from authors.',
        },
        {
          title: '6. Retention',
          content:
            'Publishing records are retained for as long as your tenant is active, because the scholarly record depends on workflow provenance. Server logs are kept for 90 days. After account closure we delete tenant data within 90 days, except metadata already distributed to external registries (such as Crossref DOI records), which those registries control.',
        },
        {
          title: '7. Your Rights',
          content:
            'You can access and correct your profile from the dashboard. Depending on your jurisdiction you may have rights to access, rectify, export, restrict, or erase personal data — requests can be made through your organization’s administrator or via the Contact page, and we respond within 30 days. Note that erasing editorial history may be limited where it would falsify the scholarly record.',
        },
        {
          title: '8. Contact',
          content:
            'For privacy questions, data requests, or to report a concern, reach us through the Contact page. If you are in the EU/EEA and believe your rights have been infringed, you may also lodge a complaint with your local supervisory authority.',
        },
      ]}
    />
  )
}
