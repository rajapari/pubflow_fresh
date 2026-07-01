'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Download, ExternalLink, FileText, RefreshCw } from 'lucide-react'
import { trpc } from '@/components/providers'

const FORMAT_LABEL: Record<string, string> = {
  PDF_PRINT: 'PDF (Print)',
  PDF_WEB:   'PDF (Web)',
  EPUB:      'EPUB',
  HTML:      'HTML',
  JATS_XML:  'JATS XML',
}

function OutputDownload({ tenantSlug, outputId, format }: { tenantSlug: string; outputId: string; format: string }) {
  const [enabled, setEnabled] = useState(false)
  const urlQ = trpc.portal.outputDownloadUrl.useQuery({ tenantSlug, outputId }, { enabled })

  // Open URL when it arrives
  if (urlQ.data?.url && enabled) {
    window.open(urlQ.data.url, '_blank')
    setEnabled(false)
  }

  return (
    <button
      onClick={() => setEnabled(true)}
      disabled={urlQ.isLoading}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
    >
      {urlQ.isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
      {FORMAT_LABEL[format] ?? format}
    </button>
  )
}

export default function ArticlePage({ params }: { params: { tenantSlug: string; doi: string[] } }) {
  const { tenantSlug } = params
  // Reconstruct DOI from path segments (DOI contains a slash)
  const doi = params.doi.join('/')

  const articleQ = trpc.portal.article.useQuery({ tenantSlug, doi })

  if (articleQ.isLoading) return (
    <div className="flex justify-center py-32">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  )

  if (articleQ.error || !articleQ.data) return (
    <div className="mx-auto max-w-2xl px-6 py-32 text-center">
      <FileText size={40} className="mx-auto mb-4 text-gray-300" />
      <p className="text-gray-500">Article not found.</p>
      <Link href={`/${tenantSlug}/articles`} className="mt-4 inline-block text-sm text-brand-600 hover:underline">
        ← Back to articles
      </Link>
    </div>
  )

  const art     = articleQ.data as any
  const outputs = (art.outputs as any[]) ?? []
  const coAuthors = (art.coAuthors as any[]) ?? []

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-400">
        <Link href={`/${tenantSlug}`} className="hover:text-brand-600">{tenantSlug}</Link>
        <span className="mx-2">/</span>
        <Link href={`/${tenantSlug}/articles`} className="hover:text-brand-600">Articles</Link>
        <span className="mx-2">/</span>
        <span className="truncate text-gray-600">{art.title.slice(0, 40)}{art.title.length > 40 ? '…' : ''}</span>
      </nav>

      <article>
        {/* Publication + issue badge */}
        {art.publication && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Link href={`/${tenantSlug}/articles?publicationId=${art.publication.id}`}
              className="text-sm font-medium text-brand-600 hover:underline">
              {art.publication.title}
            </Link>
            {art.issue && (
              <span className="text-sm text-gray-400">
                Vol. {art.issue.volume ?? '–'} No. {art.issue.number ?? '–'} ({art.issue.year})
              </span>
            )}
            {art.publication.issn && (
              <span className="text-xs text-gray-400">ISSN {art.publication.issn}</span>
            )}
          </div>
        )}

        <h1 className="text-3xl font-bold leading-tight text-gray-900">{art.title}</h1>

        {/* Authors */}
        <div className="mt-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
            <span>
              {art.author.firstName} {art.author.lastName}
              {art.author.affiliation && <span className="text-gray-400"> ({art.author.affiliation})</span>}
              {art.author.orcid && (
                <a href={`https://orcid.org/${art.author.orcid}`} target="_blank" rel="noopener noreferrer"
                  className="ml-1 text-xs text-green-600 hover:underline">ORCID</a>
              )}
            </span>
            {coAuthors.map((co: any, i: number) => (
              <span key={i}>
                {co.name}
                {co.affiliation && <span className="text-gray-400"> ({co.affiliation})</span>}
                {co.orcid && (
                  <a href={`https://orcid.org/${co.orcid}`} target="_blank" rel="noopener noreferrer"
                    className="ml-1 text-xs text-green-600 hover:underline">ORCID</a>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Published date + DOI */}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
          {art.issue?.publishedAt && (
            <span>Published {new Date(art.issue.publishedAt).toLocaleDateString('en-GB', { year:'numeric', month:'long', day:'numeric' })}</span>
          )}
          {art.doi && (
            <a href={`https://doi.org/${art.doi}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-brand-600">
              <ExternalLink size={11} />
              {art.doi}
            </a>
          )}
        </div>

        {/* Keywords */}
        {(art.keywords as string[])?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {(art.keywords as string[]).map((k: string) => (
              <span key={k} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">{k}</span>
            ))}
          </div>
        )}

        {/* Abstract */}
        {art.abstract && (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Abstract</h2>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 text-sm leading-relaxed text-gray-700">
              {art.abstract}
            </div>
          </section>
        )}

        {/* Downloads */}
        {outputs.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Download</h2>
            <div className="flex flex-wrap gap-2">
              {outputs.map((out: any) => (
                <OutputDownload
                  key={out.id}
                  tenantSlug={tenantSlug}
                  outputId={out.id}
                  format={out.format}
                />
              ))}
            </div>
          </section>
        )}
      </article>

      <div className="mt-12 pt-6 border-t border-gray-100">
        <Link href={`/${tenantSlug}/articles`} className="text-sm text-brand-600 hover:underline">
          ← Back to articles
        </Link>
      </div>
    </div>
  )
}
