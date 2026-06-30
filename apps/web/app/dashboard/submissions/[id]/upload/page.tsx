'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { trpc } from '@/lib/trpc-client'
import { FileUpload } from '@/components/ui/FileUpload'
import { Button } from '@/components/ui/Form'

export default function UploadManuscriptPage() {
  const params = useParams()
  const router = useRouter()
  const submissionId = params.id as string

  const [uploaded, setUploaded] = useState(false)

  const submissionQ = trpc.submission.byId.useQuery({ id: submissionId })
  const submitM     = trpc.submission.submit.useMutation()

  const sub = submissionQ.data

  const handleUploadComplete = async () => {
    setUploaded(true)
    await submissionQ.refetch()
    toast.success('File saved. Click "Submit for Review" when ready.')
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

  if (!sub) {
    return (
      <div className="p-8 text-red-600">Submission not found.</div>
    )
  }

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
        <h1 className="text-2xl font-bold text-gray-900">Upload Manuscript</h1>
        <p className="text-sm text-gray-500 mt-1">Step 3 of 3 — attach your manuscript file</p>
        <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5">
          <div className="bg-brand-500 h-1.5 rounded-full w-full transition-all" />
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
                <span
                  key={i}
                  className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700"
                >
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

      {/* Upload */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Manuscript File</h2>

        {uploaded ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle className="h-14 w-14 text-green-500" />
            <div>
              <p className="font-semibold text-gray-900">File uploaded successfully</p>
              <p className="text-sm text-gray-500 mt-1">
                Your manuscript has been saved and queued for normalisation.
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-brand-600 underline hover:no-underline"
              onClick={() => setUploaded(false)}
            >
              Upload a different file
            </button>
          </div>
        ) : (
          <FileUpload
            submissionId={submissionId}
            onUploadComplete={async () => { await handleUploadComplete() }}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => router.push(`/dashboard/submissions/${submissionId}`)}
        >
          Save as Draft
        </Button>

        <Button
          disabled={!uploaded || submitM.isPending}
          loading={submitM.isPending}
          onClick={handleSubmit}
        >
          Submit for Review →
        </Button>
      </div>

      <p className="text-center text-xs text-gray-400">
        You can submit for review later from the submission detail page once a file is uploaded.
      </p>
    </div>
  )
}
