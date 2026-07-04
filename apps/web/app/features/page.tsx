import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import Link from 'next/link'
import {
  FileText, Edit3, Users, GitBranch, Palette, Printer,
  Globe, BarChart3, Shield, Bell, BookOpen, Zap,
} from 'lucide-react'

const FEATURE_GROUPS = [
  {
    heading: 'Submission & Intake',
    features: [
      {
        icon: FileText,
        title: 'Guided submission wizard',
        description:
          'Authors submit in three steps: choose the publication, add title and abstract, tag keywords, and list co-authors with ORCID and affiliation. Validation catches missing metadata before it reaches your desk.',
      },
      {
        icon: Edit3,
        title: 'Upload or write in the browser',
        description:
          'Accept DOCX, LaTeX, Markdown, ODT, RTF, PDF, and ZIP uploads — or let authors start a blank manuscript and write directly in the built-in editor with autosave. No template downloads, no email attachments.',
      },
      {
        icon: GitBranch,
        title: 'Version history built in',
        description:
          'Every upload, revision, and editorial pass becomes a numbered manuscript version. Authors can reopen a submission before review starts, revise, and resubmit — the original stays untouched in the history.',
      },
    ],
  },
  {
    heading: 'Editorial & Peer Review',
    features: [
      {
        icon: Users,
        title: 'Complete peer review workflow',
        description:
          'Assign reviewers, send invitations they can accept or decline, and collect structured reviews. Editors record decisions — accept, minor or major revision, reject, desk reject — and authors are notified automatically.',
      },
      {
        icon: BookOpen,
        title: 'Full-featured document editing',
        description:
          'Manuscripts open in a complete word processor in the browser — track changes, comments, formatting, tables, figures. Editing rights follow the workflow: authors edit drafts and revisions, copy editors edit in production, everyone else gets read-only.',
      },
      {
        icon: Bell,
        title: 'Enforced workflow with audit trail',
        description:
          'Fifteen workflow states from Draft to Published, with every transition validated and logged — who moved the manuscript, when, and why. Overdue reviews trigger automatic reminders.',
      },
    ],
  },
  {
    heading: 'Production & Publishing',
    features: [
      {
        icon: Palette,
        title: 'Production pipeline',
        description:
          'Dedicated stages and dashboards for copy editing, artwork processing, typesetting, and proof review — with per-role queues so production staff see exactly what is waiting on them.',
      },
      {
        icon: Globe,
        title: 'Publish and distribute everywhere',
        description:
          'One-click publishing generates JATS XML, registers DOIs via Crossref, pushes article HTML to your public journal portal, exposes OAI-PMH for harvesters and RSS for readers, and can deliver packages to PubMed by FTP.',
      },
      {
        icon: Printer,
        title: 'Print-on-demand',
        description:
          'Send finished issues to print-on-demand fulfilment (Lulu) without leaving the platform — ideal for society journals and small presses that still ship physical copies.',
      },
    ],
  },
  {
    heading: 'Platform & Operations',
    features: [
      {
        icon: Shield,
        title: 'Enterprise-grade security',
        description:
          'OpenID Connect single sign-on backed by Keycloak, nine granular roles from Reader to Super Admin, per-tenant data isolation, and S3-compatible encrypted object storage for every file.',
      },
      {
        icon: BarChart3,
        title: 'Analytics that answer questions',
        description:
          'Track submission volume, acceptance rates, time-in-stage, and reviewer turnaround from the analytics dashboard — the numbers editorial boards actually ask for.',
      },
      {
        icon: Zap,
        title: 'Grammar & language checking',
        description:
          'Built-in LanguageTool integration flags grammar, spelling, and style issues during copy editing, so more problems are caught before typesetting.',
      },
    ],
  },
]

export default function FeaturesPage() {
  return (
    <>
      <Header isAuthenticated={false} />
      <main className="min-h-screen bg-slate-50 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 space-y-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Features</p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Everything between “submit” and “published”
            </h1>
            <p className="mx-auto max-w-3xl text-lg leading-8 text-slate-600">
              PubFlow covers the full lifecycle of a manuscript — intake, peer review, revision,
              production, and distribution — in one platform, so nothing lives in spreadsheets
              or email threads.
            </p>
          </div>

          <div className="space-y-16">
            {FEATURE_GROUPS.map(group => (
              <section key={group.heading}>
                <h2 className="mb-8 text-2xl font-bold text-slate-900">{group.heading}</h2>
                <div className="grid gap-6 md:grid-cols-3">
                  {group.features.map(f => {
                    const Icon = f.icon
                    return (
                      <div
                        key={f.title}
                        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="mb-4 inline-flex rounded-lg bg-blue-100 p-3">
                          <Icon className="h-6 w-6 text-blue-600" />
                        </div>
                        <h3 className="mb-2 font-semibold text-slate-900">{f.title}</h3>
                        <p className="text-sm leading-6 text-slate-600">{f.description}</p>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-20 rounded-3xl bg-gradient-to-r from-blue-600 to-purple-600 p-12 text-center">
            <h2 className="text-3xl font-bold text-white">See it with your own manuscripts</h2>
            <p className="mx-auto mt-4 max-w-2xl text-blue-100">
              The free Starter plan includes the complete workflow — create a publication,
              invite your board, and run a real submission end to end.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-8 py-4 text-sm font-semibold text-blue-600 shadow-lg transition-all hover:-translate-y-0.5"
            >
              Create your free account
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
