'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, Search, Rss } from 'lucide-react'
import { trpc } from '@/components/providers'

export default function ArticleListPage({ params, searchParams }: {
  params: { tenantSlug: string }
  searchParams: { publicationId?: string }
}) {
  const { tenantSlug } = params
  const { publicationId } = searchParams
  const [page, setPage] = useState(1)

  const journalQ  = trpc.portal.journal.useQuery({ tenantSlug })
  const articlesQ = trpc.portal.articles.useQuery({ tenantSlug, publicationId, page, limit: 20 })

  const pub = publicationId
    ? (journalQ.data?.publications as any[])?.find((p: any) => p.id === publicationId)
    : null

  const title = pub?.title ?? journalQ.data?.name ?? tenantSlug
  const pages = Math.ceil((articlesQ.data?.total ?? 0) / 20)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-400">
        <Link href={`/${tenantSlug}`} className="hover:text-brand-600">{journalQ.data?.name ?? tenantSlug}</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-600">{pub ? pub.title : 'All Articles'}</span>
      </nav>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {pub?.description && <p className="mt-1 text-sm text-gray-500">{pub.description}</p>}
          {articlesQ.data && (
            <p className="mt-1 text-xs text-gray-400">{articlesQ.data.total} article{articlesQ.data.total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <a
          href={publicationId ? `${apiUrl}/rss/${tenantSlug}/${publicationId}` : `${apiUrl}/rss/${tenantSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:text-brand-600"
          title="RSS Feed"
        >
          <Rss size={12} /> RSS
        </a>
      </div>

      {articlesQ.isLoading ? (
        <div className="flex justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : !articlesQ.data?.submissions.length ? (
        <div className="flex flex-col items-center py-20">
          <FileText size={40} className="mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">No published articles yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(articlesQ.data.submissions as any[]).map((art: any) => {
            const doiPath = art.doi ? encodeURIComponent(art.doi) : art.id
            return (
              <article key={art.id} className="border-b border-gray-100 pb-6">
                <Link
                  href={`/${tenantSlug}/articles/${doiPath}`}
                  className="group block"
                >
                  <h2 className="text-lg font-semibold text-gray-900 group-hover:text-brand-600">
                    {art.title}
                  </h2>
                </Link>
                <p className="mt-1 text-sm text-gray-500">
                  {art.author.firstName} {art.author.lastName}
                  {art.issue && ` · Vol. ${art.issue.volume ?? '–'} No. ${art.issue.number ?? '–'} (${art.issue.year})`}
                  {art.publication && ` · ${art.publication.title}`}
                </p>
                {art.abstract && (
                  <p className="mt-2 text-sm text-gray-600 line-clamp-3">{art.abstract}</p>
                )}
                {art.doi && (
                  <p className="mt-2 text-xs text-gray-400">
                    DOI: <a href={`https://doi.org/${art.doi}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">{art.doi}</a>
                  </p>
                )}
                {(art.keywords as string[])?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(art.keywords as string[]).map((k: string) => (
                      <span key={k} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{k}</span>
                    ))}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-8 flex items-center justify-between">
          <p className="text-xs text-gray-400">Page {page} of {pages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded border border-gray-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">
              Previous
            </button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
              className="rounded border border-gray-200 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
