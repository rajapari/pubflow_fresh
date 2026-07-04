import { MarketingPage } from '@/components/MarketingPage'

export default function TermsPage() {
  return (
    <MarketingPage
      title="Terms of Service"
      subtitle="These terms govern your use of PubFlow, the publishing workflow platform. By creating an account or using the service, you agree to them. Last updated: July 2026."
      sections={[
        {
          title: '1. The Service',
          content:
            'PubFlow provides manuscript submission, peer review, editorial workflow, in-browser document editing, production, and publishing tools delivered as a hosted software service. Your organization (the “tenant”) receives an isolated workspace covering its publications, submissions, users, and files. Features available to you depend on your subscription plan (Starter, Professional, or Enterprise) as described on the Pricing page.',
        },
        {
          title: '2. Accounts & Responsibilities',
          content:
            'You must provide accurate registration information and keep your credentials confidential. You are responsible for all activity under your account and for the users you invite to your tenant. Organization owners control member roles — from read-only access to full administration — and are responsible for granting them appropriately. Notify us promptly of any suspected unauthorized access.',
        },
        {
          title: '3. Your Content',
          content:
            'Manuscripts, artwork, reviews, and metadata you upload remain yours. You grant PubFlow only the rights needed to operate the service: storing files, converting formats for editing and typesetting, generating JATS XML and DOIs at your direction, and distributing published articles through the channels you enable (public portal, OAI-PMH, RSS, PubMed, print-on-demand). We never sell your content or use it to train machine-learning models.',
        },
        {
          title: '4. Acceptable Use',
          content:
            'You agree not to use PubFlow to store or distribute unlawful material, infringe intellectual-property rights, attempt to breach tenant isolation or platform security, resell the service without an agreement, or interfere with other tenants’ use of the platform. We may suspend accounts that violate these rules, and will contact you first except in cases of active harm.',
        },
        {
          title: '5. Payment & Plan Changes',
          content:
            'Paid plans are billed monthly in advance. You can upgrade at any time (effective immediately, prorated) or downgrade (effective at the end of the current billing period). If payment fails, we retain your data for at least 60 days and downgrade the tenant to Starter limits before any restriction of service.',
        },
        {
          title: '6. Availability & Support',
          content:
            'We target high availability but the service is provided without a guaranteed uptime commitment except where an Enterprise SLA applies. Scheduled maintenance is announced in advance. Support is provided via the Support page, with priority response for Professional and dedicated support for Enterprise customers.',
        },
        {
          title: '7. Termination & Data Export',
          content:
            'You may cancel at any time. On cancellation you can export your submissions, manuscript files, and workflow history. We delete tenant data 90 days after account closure, except where retention is required by law. We may terminate accounts for material breach of these terms with 30 days’ notice where practicable.',
        },
        {
          title: '8. Warranty Disclaimer & Liability',
          content:
            'The service is provided “as is” without warranties of merchantability, fitness for a particular purpose, or non-infringement. To the maximum extent permitted by law, PubFlow’s aggregate liability for any claim is limited to the amount you paid for the service in the twelve months preceding the claim. Neither party is liable for indirect, incidental, or consequential damages.',
        },
        {
          title: '9. Changes to These Terms',
          content:
            'We may update these terms as the product evolves. Material changes will be announced by email and in-app at least 30 days before they take effect. Continued use of the service after the effective date constitutes acceptance. Questions about these terms can be sent via the Contact page.',
        },
      ]}
    />
  )
}
