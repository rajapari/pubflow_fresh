import { MarketingPage } from '@/components/MarketingPage'

export default function FeaturesPage() {
  return (
    <MarketingPage
      title="Feature-rich Publishing Software"
      subtitle="Discover the core capabilities that make PubFlow a modern publishing platform for editorial teams, production staff, and publishers."
      sections={[
        {
          title: 'Submission & Intake',
          content: 'Capture manuscripts, author details, and publication preferences through a polished intake workflow. Each submission is tracked and categorized automatically for faster processing.',
        },
        {
          title: 'Review & Collaboration',
          content: 'Assign reviewers, share annotations, and keep feedback in one place so your editorial team can work together with clarity and speed.',
        },
        {
          title: 'Proofing & Approval',
          content: 'Use proof review tools to mark changes, approve layouts, and move content through quality checks before publishing.',
        },
      ]}
      ctaLabel="Start your free trial"
      ctaHref="/signup"
    />
  )
}
