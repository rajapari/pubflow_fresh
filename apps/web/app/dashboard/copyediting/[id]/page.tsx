'use client'

import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/Form'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { toast } from 'sonner'
import { Upload, CheckCircle, ArrowLeft, Download, RefreshCw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function CopyEditTaskPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { user } = useAuth()
  const isEditor = user?.role === 'EDITOR_IN_CHIEF' || user?.role === 'SECTION_EDITOR'

  const { data: ce, isLoading, refetch } = trpc.copyEdit.byId.useQuery({ id })

  const [file, setFile]           = React.useState<File | null>(null)
  const [comments, setComments]   = React.useState('')
  const [revNotes, setRevNotes]   = React.useState('')
  const [uploading, setUploading] = React.useState(false)

  const getUrlM       = trpc.copyEdit.getUploadUrl.useMutation()
  const submitM       = trpc.copyEdit.submitEdited.useMutation()
  const approveM      = trpc.copyEdit.approve.useMutation()
  const requestRevM   = trpc.copyEdit.requestRevision.useMutation()

  const handleUploadAndSubmit = async () => {
    if (!file) return
    setUploading(true)
    try {
      const { uploadUrl, minioKey } = await getUrlM.mutateAsync({
        id,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      })

      const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
      if (!res.ok) throw new Error('Upload failed')

      await submitM.mutateAsync({ id, minioKey, comments: comments || undefined })
      toast.success('Edited manuscript submitted')
      refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Submission failed')
    } finally {
      setUploading(false)
    }
  }

  const handleApprove = async () => {
    try {
      await approveM.mutateAsync({ id })
      toast.success('Copy edit approved — submission moved to Artwork Processing')
      refetch()
    } catch (err: any) { toast.error(err.message ?? 'Failed to approve') }
  }

  const handleRequestRevision = async () => {
    try {
      await requestRevM.mutateAsync({ id, notes: revNotes || undefined })
      toast.success('Revision requested')
      setRevNotes('')
      refetch()
    } catch (err: any) { toast.error(err.message ?? 'Failed to request revision') }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    )
  }

  if (!ce) return <p className="text-gray-500 py-8">Copy edit task not found.</p>

  const manuscript = ce.submission.manuscripts?.[0]
  const canSubmit  = (ce.status === 'IN_PROGRESS' || ce.status === 'REVISION_REQUESTED') && !isEditor
  const canReview  = ce.status === 'SUBMITTED' && isEditor

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 leading-tight">
              {ce.submission.title}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{ce.submission.publication?.title}</p>
          </div>
          <StatusBadge status={ce.status} />
        </div>
      </div>

      {/* Submission info */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Author</p>
          <p className="font-medium">{ce.submission.author.firstName} {ce.submission.author.lastName}</p>
        </div>
        {isEditor && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Assigned to</p>
            <p className="font-medium">{ce.editor.firstName} {ce.editor.lastName}</p>
          </div>
        )}
        {ce.submittedAt && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Submitted at</p>
            <p className="font-medium">{new Date(ce.submittedAt).toLocaleDateString()}</p>
          </div>
        )}
        {ce.approvedAt && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Approved at</p>
            <p className="font-medium">{new Date(ce.approvedAt).toLocaleDateString()}</p>
          </div>
        )}
      </div>

      {/* Original manuscript download */}
      {manuscript && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Original Manuscript</h2>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="text-sm">
              <p className="font-medium text-gray-800">Version {manuscript.version}</p>
              <p className="text-xs text-gray-500 mt-0.5">{manuscript.format} · {(manuscript.fileSizeBytes / 1024).toFixed(0)} KB</p>
            </div>
            <a
              href={`/api/download?key=${encodeURIComponent(manuscript.minioKey)}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <Download size={13} /> Download
            </a>
          </div>
        </div>
      )}

      {/* Editor's notes from revision request */}
      {ce.status === 'REVISION_REQUESTED' && ce.editorNotes && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 mb-2 text-orange-700">
            <RefreshCw size={14} />
            <span className="text-sm font-semibold">Revision Requested</span>
          </div>
          <p className="text-sm text-orange-800">{ce.editorNotes}</p>
        </div>
      )}

      {/* Copy editor's submitted comments (visible to editor after submission) */}
      {isEditor && ce.comments && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">Copy Editor Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{ce.comments}</p>
        </div>
      )}

      {/* COPY_EDITOR upload section */}
      {canSubmit && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Upload Edited Manuscript</h2>

          <label className={[
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors',
            file ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-gray-400',
          ].join(' ')}>
            <Upload size={24} className={file ? 'text-brand-500' : 'text-gray-400'} aria-hidden="true" />
            {file ? (
              <span className="text-sm font-medium text-brand-700">{file.name}</span>
            ) : (
              <span className="text-sm text-gray-500">Click or drag to upload the edited manuscript</span>
            )}
            <input
              type="file"
              className="sr-only"
              accept=".docx,.doc,.odt,.rtf,.tex,.latex,.ltx,.md,.markdown,.txt,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes for editor (optional)</label>
            <textarea
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Describe the changes you made..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none resize-none"
            />
          </div>

          <Button
            onClick={handleUploadAndSubmit}
            disabled={!file || uploading}
            loading={uploading}
            className="w-full justify-center"
          >
            <CheckCircle size={15} className="mr-1.5" />
            Submit Edited Manuscript
          </Button>
        </div>
      )}

      {/* EDITOR review section */}
      {canReview && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Review Copy Edit</h2>

          {/* Download edited file */}
          {ce.editedKey && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-800">Edited manuscript</p>
              <a
                href={`/api/download?key=${encodeURIComponent(ce.editedKey)}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Download size={13} /> Download
              </a>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              className="flex-1 justify-center"
              onClick={handleApprove}
              loading={approveM.isPending}
            >
              <CheckCircle size={15} className="mr-1.5" />
              Approve
            </Button>

            <div className="flex-1 space-y-2">
              <textarea
                rows={2}
                value={revNotes}
                onChange={(e) => setRevNotes(e.target.value)}
                placeholder="Notes for the copy editor..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none resize-none"
              />
              <Button
                variant="secondary"
                className="w-full justify-center"
                onClick={handleRequestRevision}
                loading={requestRevM.isPending}
              >
                <RefreshCw size={15} className="mr-1.5" />
                Request Revision
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Approved state */}
      {ce.status === 'APPROVED' && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-green-700">
          <CheckCircle size={16} />
          <span className="text-sm font-medium">Copy edit approved. Submission is now in Artwork Processing.</span>
        </div>
      )}
    </div>
  )
}
