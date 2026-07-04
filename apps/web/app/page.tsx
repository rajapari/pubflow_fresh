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
      title: 'In-Browser Editing',
      description: 'A full word processor in the manuscript page — track changes, comments, autosave, and version history.',
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
      title: 'Publish & Distribute',
      description: 'DOI registration, JATS XML, public portal, OAI-PMH, RSS, PubMed delivery, and print-on-demand.',
    },
  ]

  const workflow = [
    { step: '01', title: 'Submit',  description: 'Authors submit through a three-step wizard — publication, metadata, co-authors — then upload a manuscript or write directly in the browser.' },
    { step: '02', title: 'Review',  description: 'Editors run desk review, assign peer reviewers, and record decisions. Authors revise and resubmit with every round preserved as a version.' },
    { step: '03', title: 'Produce', description: 'Accepted manuscripts move through copy editing, artwork, typesetting, and proof review — each stage with its own queue and permissions.' },
    { step: '04', title: 'Publish', description: 'One action registers the DOI, generates JATS XML, and pushes the article to your public portal, OAI-PMH endpoint, and RSS feed.' },
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

            {/* Workflow strip */}
            <div className="mt-16 rounded-xl border border-gray-200 bg-white p-8 shadow-2xl">
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium">
                {['Draft', 'Submitted', 'Peer Review', 'Revision', 'Accepted', 'Copy Editing', 'Typesetting', 'Proof Review', 'Published'].map((stage, i, arr) => (
                  <span key={stage} className="flex items-center gap-2">
                    <span className={`rounded-full px-4 py-1.5 ${i === arr.length - 1 ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                      {stage}
                    </span>
                    {i < arr.length - 1 && <ArrowRight className="h-4 w-4 text-gray-300" />}
                  </span>
                ))}
              </div>
              <p className="mt-6 text-center text-sm text-gray-500">
                Fifteen enforced workflow states with a complete audit trail — every manuscript accounted for, from first draft to registered DOI.
              </p>
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

        {/* How it works */}
        <section className="bg-gray-50 px-4 py-20 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              From Submission to DOI in Four Stages
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-xl text-gray-600">
              One platform owns the entire manuscript lifecycle — no spreadsheets, no email attachments, no lost files.
            </p>

            <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {workflow.map(item => (
                <div key={item.step} className="rounded-xl bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
                  <span className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    {item.step}
                  </span>
                  <h3 className="mt-4 mb-2 text-xl font-semibold text-gray-900">{item.title}</h3>
                  <p className="text-gray-600 text-sm leading-6">{item.description}</p>
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
