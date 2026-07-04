'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, ChevronDown, ChevronUp, Upload, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { trpc } from '@/lib/trpc-client'
import { FileUpload } from '@/components/ui/FileUpload'
import { AssetUpload } from '@/components/ui/AssetUpload'
import { Button } from '@/components/ui/Form'

type AssetType = 'FIGURE' | 'TABLE' | 'SUPPLEMENTARY' | 'COVER'
type ManuscriptMode = 'upload' | 'editor'

const ASSET_TYPES: { type: AssetType; label: string; description: string }[] = [
  { type: 'FIGURE',        label: 'Figure',        description: 'Charts, graphs, photographs, diagrams' },
  { type: 'TABLE',         label: 'Table',         description: 'Data tables as image or PDF' },
  { type: 'SUPPLEMENTARY', label: 'Supplementary', description: 'Additional files, datasets, appendices' },
  { type: 'COVER',         label: 'Cover Art',     description: 'Journal cover image or book cover' },
]

export default function UploadManuscriptPage() {
  const params = useParams()
  const router = useRouter()
  const submissionId = params.id as string

  const [mode,              setMode]              = useState<ManuscriptMode>('upload')
  const [manuscriptReady,   setManuscriptReady]   = useState(false)
  const [artworkOpen,       setArtworkOpen]       = useState(false)
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType>('FIGURE')
  const [assetCount,        setAssetCount]        = useState(0)

  const submissionQ        = trpc.submission.byId.useQuery({ id: submissionId })
  const submitM            = trpc.submission.submit.useMutation()
  const createBlankM       = trpc.submission.createBlankManuscript.useMutation()

  const sub = submissionQ.data

  const handleManuscriptComplete = async () => {
    setManuscriptReady(true)
    setArtworkOpen(true)
    await submissionQ.refetch()
    toast.success('Manuscript saved. You can optionally upload artwork below.')
  }

  const handleOpenEditor = async () => {
    try {
      await createBlankM.mutateAsync({ submissionId })
      toast.success('Blank document created — opening editor…')
      router.push(`/dashboard/submissions/${submissionId}/edit`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create blank document')
    }
  }

  const handleAssetComplete = () => {
    setAssetCount(c => c + 1)
    toast.success(`Artwork uploaded (${assetCount + 1} file${assetCount + 1 > 1 ? 's' : ''} added)`)
  }

  const handleSubmit = async () => {
    try {
      await submitM.mutateAsync({ id: submissionId })
      toast.success('Submission sent to editorial team!')
      router.push(`/dashboard/submissions/${submissionId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit')
    }
  }

  if (submissionQ.isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-4">
        <div className="h-5 w-48 rounded bg-gray-200 animate-pulse" />
        <div className="h-4 w-80 rounded bg-gray-100 animate-pulse" />
        <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  if (!sub) return <div className="p-8 text-red-600">Submission not found.</div>

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/submissions"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft size={14} /> All submissions
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Attach Manuscript</h1>
        <p className="text-sm text-gray-500 mt-1">Step 3 of 3 — upload a file or write directly in the editor</p>
        <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5">
          <div className="bg-brand-500 h-1.5 rounded-full w-full" />
        </div>
      </div>

      {/* Submission summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Submission summary</h2>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Title</p>
          <p className="text-sm font-semibold text-gray-900">{sub.title}</p>
        </div>
        {sub.abstract && (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Abstract</p>
            <p className="text-sm text-gray-700 line-clamp-3">{sub.abstract}</p>
          </div>
        )}
        {(sub.keywords as string[]).length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {(sub.keywords as string[]).map((kw, i) => (
                <span key={i} className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-500">Publication</p>
          <p className="text-sm text-gray-700">{(sub as any).publication?.title ?? '—'}</p>
        </div>
      </div>

      {/* ── Section 1: Manuscript ── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Section header */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-4">
          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${manuscriptReady ? 'bg-green-500 text-white' : 'bg-brand-500 text-white'}`}>
            {manuscriptReady ? '✓' : '1'}
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Manuscript</h2>
          <span className="ml-auto text-xs text-gray-400">Required</span>
        </div>

        {manuscriptReady ? (
          <div className="px-6 pb-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <div>
              <p className="font-semibold text-gray-900">Manuscript ready</p>
              <p className="text-sm text-gray-500 mt-1">
                {mode === 'upload' ? 'Queued for normalisation processing.' : 'Open the editor to continue writing.'}
              </p>
            </div>
            <div className="flex gap-2">
              {mode === 'editor' && (
                <Button size="sm" onClick={() => router.push(`/dashboard/submissions/${submissionId}/edit`)}>
                  Continue in Editor
                </Button>
              )}
              <button
                type="button"
                className="text-xs text-brand-600 underline hover:no-underline"
                onClick={() => { setManuscriptReady(false) }}
              >
                Replace manuscript
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mode tabs */}
            <div className="flex border-b border-gray-100 px-6">
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={[
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                  mode === 'upload'
                    ? 'border-brand-500 text-brand-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                <Upload size={14} />
                Upload a File
              </button>
              <button
                type="button"
                onClick={() => setMode('editor')}
                className={[
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                  mode === 'editor'
                    ? 'border-brand-500 text-brand-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                <PenLine size={14} />
                Create in Editor
              </button>
            </div>

            {/* Upload mode */}
            {mode === 'upload' && (
              <div className="px-6 pb-6 pt-5">
                <FileUpload
                  submissionId={submissionId}
                  onUploadComplete={async () => { await handleManuscriptComplete() }}
                />
              </div>
            )}

            {/* Create-in-editor mode */}
            {mode === 'editor' && (
              <div className="px-6 pb-6 pt-5 space-y-5">
                <div className="rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-8 text-center space-y-3">
                  <div className="mx-auto h-14 w-14 rounded-full bg-brand-100 flex items-center justify-center">
                    <PenLine className="h-7 w-7 text-brand-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Write directly in OnlyOffice</p>
                    <p className="text-sm text-gray-500 mt-1">
                      A blank Word-compatible document opens in the browser editor.
                      Your work is auto-saved and stored securely.
                    </p>
                  </div>
                  <Button
                    onClick={handleOpenEditor}
                    loading={createBlankM.isPending}
                    disabled={createBlankM.isPending}
                  >
                    Open OnlyOffice Editor
                  </Button>
                </div>

                <ul className="space-y-1.5 text-xs text-gray-500">
                  <li className="flex items-start gap-2"><span className="text-brand-500 font-bold mt-0.5">✓</span>Auto-saves as you type — no data loss on browser close</li>
                  <li className="flex items-start gap-2"><span className="text-brand-500 font-bold mt-0.5">✓</span>Full DOCX compatibility — download at any time</li>
                  <li className="flex items-start gap-2"><span className="text-brand-500 font-bold mt-0.5">✓</span>Return here when finished to submit for review</li>
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Section 2: Artwork (collapsible) ── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setArtworkOpen(o => !o)}
          className="flex w-full items-center gap-2 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
        >
          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${assetCount > 0 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {assetCount > 0 ? assetCount : '2'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Artwork &amp; Supplementary Files</p>
            <p className="text-xs text-gray-400">
              {assetCount > 0 ? `${assetCount} file${assetCount > 1 ? 's' : ''} added` : 'JPEG · PNG · TIFF · EPS · SVG · PDF — optional'}
            </p>
          </div>
          <span className="text-xs text-gray-400 mr-1">Optional</span>
          {artworkOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        {artworkOpen && (
          <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Asset type</p>
              <div className="grid grid-cols-2 gap-2">
                {ASSET_TYPES.map(({ type, label, description }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedAssetType(type)}
                    className={[
                      'rounded-lg border-2 px-3 py-2.5 text-left text-sm transition-colors',
                      selectedAssetType === type
                        ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <span className="font-medium">{label}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            <AssetUpload
              submissionId={submissionId}
              assetType={selectedAssetType}
              onUploadComplete={() => handleAssetComplete()}
            />

            {assetCount > 0 && (
              <p className="text-xs text-gray-500 text-center">
                {assetCount} artwork file{assetCount > 1 ? 's' : ''} added.{' '}
                <Link href={`/dashboard/submissions/${submissionId}/assets`} className="text-brand-600 underline hover:no-underline">
                  Manage all artwork →
                </Link>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => router.push(`/dashboard/submissions/${submissionId}`)}
        >
          Save as Draft
        </Button>

        <Button
          disabled={!manuscriptReady || submitM.isPending}
          loading={submitM.isPending}
          onClick={handleSubmit}
        >
          Submit for Review →
        </Button>
      </div>

      <p className="text-center text-xs text-gray-400">
        {mode === 'editor'
          ? 'Write in the editor, then return here to submit. Artwork can be added later.'
          : 'Artwork can also be uploaded later from the submission detail page.'}
        {' '}A manuscript is required before submitting.
      </p>
    </div>
  )
}
