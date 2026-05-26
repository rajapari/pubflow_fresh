import Link from 'next/link'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { ArrowRight, BookOpen, Zap, Shield, Users, TrendingUp, CheckCircle } from 'lucide-react'

export default function LandingPage() {
  const features = [
    {
      icon: BookOpen,
      title: 'Manuscript Management',
      description: 'Streamlined submission, review, and revision workflows with full audit trails.',
    },
    {
      icon: Zap,
      title: 'Automated Processing',
      description: 'AI-powered content conversion, image processing, and typesetting automation.',
    },
    {
      icon: Users,
      title: 'Collaborative Reviews',
      description: 'Multi-reviewer workflows, annotation tools, and real-time feedback systems.',
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Role-based access, OAuth2/OIDC, encrypted storage, and compliance ready.',
    },
    {
      icon: TrendingUp,
      title: 'Analytics Dashboard',
      description: 'Track submissions, review cycles, and publication metrics in real-time.',
    },
    {
      icon: CheckCircle,
      title: 'Quality Assurance',
      description: 'Proof review, annotation, and approval workflows before publication.',
    },
  ]

  const testimonials = [
    {
      name: 'Dr. Sarah Chen',
      role: 'Editor-in-Chief, Academic Press',
      quote: 'PubFlow transformed our editorial workflow. Submission-to-publication time dropped by 40%.',
      initials: 'SC',
    },
    {
      name: 'James Miller',
      role: 'Publishing Director, Global Books',
      quote: 'The automation features saved us hundreds of hours monthly. Highly recommend for any publisher.',
      initials: 'JM',
    },
    {
      name: 'Prof. Maria Rodriguez',
      role: 'Journal Publisher, Science Today',
      quote: 'Best investment we made. Reviewers love the interface, and our authors report fewer errors.',
      initials: 'MR',
    },
  ]

  return (
    <>
      <Header isAuthenticated={false} />
      
      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50 px-4 py-20 sm:py-32 lg:px-8">
          <div className="absolute inset-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
            <div
              className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-blue-200 to-purple-200 opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
              style={{
                clipPath:
                  'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
              }}
            />
          </div>

          <div className="mx-auto max-w-7xl">
            <div className="text-center">
              <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-7xl">
                Modern Publishing,{' '}
                <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Simplified
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-xl text-gray-600">
                PubFlow streamlines the entire publishing workflow — from manuscript submission through proof review. 
                Designed for publishers who demand efficiency, quality, and collaboration.
              </p>
              <div className="mt-10 flex items-center justify-center gap-4">
                <Link
                  href="/login?demo=true"
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-4 font-semibold text-white shadow-lg hover:shadow-xl transition-shadow"
                >
                  Try Demo <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-300 px-8 py-4 font-semibold text-gray-700 hover:border-gray-400 transition-colors"
                >
                  Start Free Trial
                </Link>
              </div>
              <p className="mt-4 text-sm text-gray-600">
                No credit card required. 14-day free trial. All features included.
              </p>
            </div>

            {/* Hero Screenshot Placeholder */}
            <div className="mt-16 rounded-xl border border-gray-200 bg-white p-2 shadow-2xl">
              <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-50 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="text-gray-400">
                    <svg className="h-16 w-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <p className="text-gray-500 font-medium">Dashboard Preview</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="px-4 py-20 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="text-center">
              <h2 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                Built for Modern Publishers
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-xl text-gray-600">
                Everything you need to manage your publishing workflow efficiently and professionally.
              </p>
            </div>

            <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, idx) => {
                const Icon = feature.icon
                return (
                  <div
                    key={idx}
                    className="group rounded-xl border border-gray-200 bg-white p-8 hover:border-blue-200 hover:shadow-lg transition-all"
                  >
                    <div className="mb-4 inline-flex rounded-lg bg-blue-100 p-3 group-hover:bg-purple-100 transition-colors">
                      <Icon className="h-6 w-6 text-blue-600 group-hover:text-purple-600 transition-colors" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold text-gray-900">{feature.title}</h3>
                    <p className="text-gray-600">{feature.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="bg-gray-50 px-4 py-20 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Loved by Publishers Worldwide
            </h2>

            <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((testimonial, idx) => (
                <div key={idx} className="rounded-xl bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
                  <div className="mb-4 flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className="text-yellow-400">★</span>
                    ))}
                  </div>
                  <p className="mb-6 text-gray-600 italic">&quot;{testimonial.quote}&quot;</p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-400 font-semibold text-white">
                      {testimonial.initials}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{testimonial.name}</p>
                      <p className="text-sm text-gray-600">{testimonial.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-20 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-4xl font-bold text-white sm:text-5xl">
              Ready to Transform Your Publishing Workflow?
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-xl text-blue-100">
              Join leading publishers using PubFlow to streamline their editorial process and reduce time-to-publication.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-8 py-4 font-semibold text-blue-600 shadow-lg hover:shadow-xl transition-shadow"
              >
                Get Started Free <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 rounded-lg border-2 border-white px-8 py-4 font-semibold text-white hover:bg-white hover:bg-opacity-10 transition-colors"
              >
                Schedule Demo
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
