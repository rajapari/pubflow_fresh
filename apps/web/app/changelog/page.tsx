import { MarketingPage } from '@/components/MarketingPage'

export default function ChangelogPage() {
  return (
    <MarketingPage
      title="Release Notes & Changelog"
      subtitle="Review the latest updates, feature launches, and platform improvements we’ve delivered for PubFlow."
      sections={[
        {
          title: 'New Features',
          content: 'Track the newest capabilities for editorial collaboration, automated processing, and proof review in every release.',
        },
        {
          title: 'Enhancements',
          content: 'See performance and usability upgrades that make the PubFlow experience faster and more intuitive.',
        },
        {
          title: 'Reliability',
          content: 'We continuously improve platform stability, security, and API reliability so your publishing workflows stay uninterrupted.',
        },
      ]}
      ctaLabel="View latest updates"
      ctaHref="/support"
    />
  )
}
