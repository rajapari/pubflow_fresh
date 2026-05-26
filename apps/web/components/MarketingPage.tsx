import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'

interface Section {
  title: string
  content: string
}

interface MarketingPageProps {
  title: string
  subtitle: string
  sections: Section[]
  ctaLabel?: string
  ctaHref?: string
}

export function MarketingPage({ title, subtitle, sections, ctaLabel, ctaHref }: MarketingPageProps) {
  return (
    <>
      <Header isAuthenticated={false} />
      <main className="min-h-screen bg-slate-50 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl bg-white p-10 shadow-xl shadow-slate-200/50">
          <div className="mb-10 space-y-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">PubFlow</p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">{title}</h1>
            <p className="mx-auto max-w-3xl text-lg leading-8 text-slate-600">{subtitle}</p>
          </div>

          <div className="space-y-10">
            {sections.map((section) => (
              <div key={section.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-8">
                <h2 className="text-2xl font-semibold text-slate-900">{section.title}</h2>
                <p className="mt-4 text-slate-600 leading-7">{section.content}</p>
              </div>
            ))}
          </div>

          {ctaLabel && ctaHref ? (
            <div className="mt-12 text-center">
              <Link
                href={ctaHref}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5"
              >
                {ctaLabel}
              </Link>
            </div>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  )
}
