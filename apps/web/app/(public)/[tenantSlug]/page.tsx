'use client'

import { BookOpen, ExternalLink, Rss } from 'lucide-react'
import Link from 'next/link'
import { trpc } from '@/components/providers'

export default function JournalHomePage({ params }: { params: { tenantSlug: string } }) {
  const { tenantSlug } = params
  const journalQ = trpc.portal.journal.useQuery({ tenantSlug })

  if (journalQ.isLoading) return (
    <div className="flex items-center justify-center py-32">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  )

  if (journalQ.error || !journalQ.data) return (
    <div className="mx-auto max-w-2xl px-6 py-32 text-center">
      <BookOpen size={40} className="mx-auto mb-4 text-gray-300" />
      <p className="text-gray-500">Journal not found.</p>
    </div>
  )

  const tenant = journalQ.data
  const settings = tenant.settings as any

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Hero */}
      <div className="mb-12 text-center">
        {settings?.logoUrl && (
          <img src={settings.logoUrl} alt={tenant.name} className="mx-auto mb-6 h-20 object-contain" />
        )}
        <h1 className="text-4xl font-bold text-gray-900">{tenant.name}</h1>
        <p className="mt-3 text-lg text-gray-500">Open Access Academic Publishing</p>
      </div>

      {/* Publications */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {(tenant.publications as any[]).map((pub: any) => (
          <Link
            key={pub.id}
            href={`/${tenantSlug}/articles?publicationId=${pub.id}`}
            className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-brand-300 hover:shadow-md"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                {pub.type?.replace('_', ' ')}
              </span>
              {pub.issn && (
                <span className="text-xs text-gray-400">ISSN {pub.issn}</span>
              )}
            </div>
            <h2 className="font-semibold text-gray-900 group-hover:text-brand-600">{pub.title}</h2>
            {pub.description && (
              <p className="mt-2 text-sm text-gray-500 line-clamp-2">{pub.description}</p>
            )}
            <p className="mt-4 text-xs text-gray-400">
              {pub._count?.submissions ?? 0} published article{pub._count?.submissions !== 1 ? 's' : ''}
            </p>
          </Link>
        ))}
      </div>

      {/* RSS links */}
      <div className="mt-10 flex items-center justify-center gap-4 text-xs text-gray-400">
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/rss/${tenantSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-brand-600"
        >
          <Rss size={12} /> RSS Feed
        </a>
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/oai?verb=ListRecords&metadataPrefix=oai_dc&set=${tenantSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-brand-600"
        >
          <ExternalLink size={12} /> OAI-PMH
        </a>
      </div>
    </div>
  )
}
