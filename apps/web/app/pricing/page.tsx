import Link from 'next/link'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Check } from 'lucide-react'

// Keep in sync with apps/web/app/dashboard/settings/billing/page.tsx
const PLANS = [
  {
    name: 'Starter',
    price: 'Free',
    period: 'forever',
    tagline: 'For independent journals and small editorial teams getting started.',
    features: [
      '1 publication',
      'Up to 50 submissions per year',
      'Full peer review workflow',
      'In-browser manuscript editing (DOCX, ODT, RTF, PDF)',
      'Manuscript version history',
      'Basic typesetting',
      'Author & reviewer accounts included',
    ],
    cta: 'Start free',
    href: '/signup',
    highlight: false,
  },
  {
    name: 'Professional',
    price: '$149',
    period: 'per month',
    tagline: 'For active publishers who need automation, DOIs, and insight.',
    features: [
      'Unlimited publications',
      'Unlimited submissions',
      'DOI registration (Crossref)',
      'JATS XML export & PubMed delivery',
      'Public journal portal with OAI-PMH & RSS',
      'Advanced analytics dashboard',
      'Grammar & language checking',
      'Priority support',
    ],
    cta: 'Start 14-day trial',
    href: '/signup',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '$499',
    period: 'per month',
    tagline: 'For publishing houses and institutions with compliance needs.',
    features: [
      'Everything in Professional',
      'Custom branding on your portal',
      'SSO / SAML integration',
      'Multi-tenant administration',
      'Print-on-demand distribution',
      'Dedicated support manager',
      'SLA guarantee',
    ],
    cta: 'Talk to sales',
    href: '/contact',
    highlight: false,
  },
]

const FAQS = [
  {
    q: 'Can I try PubFlow before paying?',
    a: 'Yes. Every account starts on the free Starter plan with the full peer review workflow included — no credit card required. Upgrade only when you need more publications, DOI registration, or advanced production tools.',
  },
  {
    q: 'What counts as a submission?',
    a: 'A submission is one manuscript entering your editorial workflow, regardless of how many revision rounds or manuscript versions it goes through. Rejected and withdrawn manuscripts still count toward the yearly limit on Starter.',
  },
  {
    q: 'Do authors and reviewers need paid seats?',
    a: 'No. Authors, peer reviewers, and read-only users are always free and unlimited on every plan. Pricing is per organization, not per user.',
  },
  {
    q: 'Can I change plans later?',
    a: 'You can upgrade or downgrade at any time from Settings → Billing. Upgrades take effect immediately; downgrades apply at the end of the current billing period.',
  },
  {
    q: 'Where is my data stored?',
    a: 'Manuscripts and artwork are stored in S3-compatible object storage with per-tenant isolation. You can export your full submission archive, including JATS XML and workflow history, at any time.',
  },
]

export default function PricingPage() {
  return (
    <>
      <Header isAuthenticated={false} />
      <main className="min-h-screen bg-slate-50 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 space-y-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Pricing</p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Simple pricing that scales with your publishing
            </h1>
            <p className="mx-auto max-w-3xl text-lg leading-8 text-slate-600">
              Every plan includes the complete editorial workflow — submission intake, peer review,
              in-browser editing, and production. Pay only for the scale and distribution features you need.
            </p>
          </div>

          {/* Plan cards */}
          <div className="grid gap-8 lg:grid-cols-3">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-3xl bg-white p-8 shadow-xl shadow-slate-200/50 ${
                  plan.highlight ? 'ring-2 ring-blue-600' : 'border border-slate-200'
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-1 text-xs font-semibold text-white">
                    Most popular
                  </span>
                )}
                <h2 className="text-xl font-semibold text-slate-900">{plan.name}</h2>
                <p className="mt-2 text-sm text-slate-600">{plan.tagline}</p>
                <p className="mt-6">
                  <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                  <span className="ml-2 text-sm text-slate-500">{plan.period}</span>
                </p>
                <ul className="mt-8 flex-1 space-y-3">
                  {plan.features.map(f => (
                    <li key={f} className="flex gap-3 text-sm text-slate-700">
                      <Check className="h-5 w-5 flex-shrink-0 text-green-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`mt-8 inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 ${
                    plan.highlight
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20'
                      : 'border-2 border-slate-300 text-slate-700 hover:border-slate-400'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <div className="mx-auto mt-20 max-w-3xl">
            <h2 className="text-center text-3xl font-bold text-slate-900">Pricing questions</h2>
            <div className="mt-10 space-y-6">
              {FAQS.map(faq => (
                <div key={faq.q} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h3 className="font-semibold text-slate-900">{faq.q}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
