'use client'

import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpc } from '@/lib/trpc-client'
import { FormField, TextArea, Button } from '@/components/ui/Form'
import { OnlyOfficeEditor } from '@/components/ui/OnlyOfficeEditor'
import { toast } from 'sonner'

const UpdateSubmissionSchema = z.object({
  title: z.string().min(10).max(500).optional(),
  abstract: z.string().min(50).max(5000).optional(),
  keywords: z.array(z.string().min(2).max(50)).min(1).max(10).optional(),
  coAuthors: z.array(z.object({
    name: z.string(),
    email: z.string().email(),
    affiliation: z.string().optional(),
    orcid: z.string().optional(),
  })).optional(),
})

type FormData = z.infer<typeof UpdateSubmissionSchema>

export default function EditSubmissionPage() {
  const params = useParams()
  const router = useRouter()
  const submissionId = params.id as string
  const [activeTab, setActiveTab] = React.useState<'editor' | 'metadata'>('editor')

  const utils         = trpc.useUtils()
  const submission    = trpc.submission.byId.useQuery({ id: submissionId })
  const editorConfig  = trpc.submission.getManuscriptEditorUrl.useQuery({ submissionId })
  const downloadQ     = trpc.submission.getManuscriptDownloadUrl.useQuery({ submissionId }, { enabled: false })
  const updateMutation = trpc.submission.updateDraft.useMutation()
  const deleteMutation = trpc.submission.deleteDraft.useMutation()
  const submitM        = trpc.submission.submit.useMutation()
  const reopenM        = trpc.submission.reopenForRevision.useMutation()
  const submissionData = submission.data as any

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(UpdateSubmissionSchema),
  })

  const { fields: coAuthorFields, append: addCoAuthor, remove: removeCoAuthor } = useFieldArray({
    control,
    name: 'coAuthors',
  })

  React.useEffect(() => {
    if (submissionData) {
      reset({
        title: submissionData.title,
        abstract: submissionData.abstract ?? '',
        keywords: submissionData.keywords ?? [],
        coAuthors: submissionData.coAuthors ?? [],
      })
    }
  }, [submissionId, submissionData, reset])

  const onSubmit = async (data: any) => {
    try {
      await updateMutation.mutateAsync({ id: submissionId, ...data })
      toast.success('Submission updated!')
      router.push(`/dashboard/submissions/${submissionId}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update'
      toast.error(message)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure? This cannot be undone.')) return
    try {
      await deleteMutation.mutateAsync({ id: submissionId })
      toast.success('Submission deleted')
      router.push('/dashboard/submissions')
    } catch (err) {
      toast.error('Failed to delete')
    }
  }

  const canEdit    = editorConfig.data?.canEdit ?? false
  const format     = editorConfig.data?.format ?? ''
  const isEditorFormat = ['DOCX', 'ODT', 'RTF', 'PDF', 'MARKDOWN'].includes(format)
  const isDraft    = submissionData?.status === 'DRAFT'
  const isRevision = submissionData?.status === 'REVISION_REQUIRED'
  const isSubmitted = submissionData?.status === 'SUBMITTED'
  const hasManuscript = !!editorConfig.data
  // Authors see SUBMITTED docs read-only; offer to reopen for revision.
  // Editors already have edit rights at this stage, so they never see this.
  const canReopen = isSubmitted && !canEdit && hasManuscript

  const handleDownload = async () => {
    const result = await downloadQ.refetch()
    if (result.data?.url) window.open(result.data.url, '_blank')
  }

  const handleSubmitForReview = async () => {
    if (!confirm('Submit this manuscript for editorial review? You will not be able to edit it until revisions are requested.')) return
    try {
      await submitM.mutateAsync({ id: submissionId })
      toast.success('Manuscript submitted for review!')
      router.push(`/dashboard/submissions/${submissionId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit')
    }
  }

  const handleReopenForRevision = async () => {
    if (!confirm(
      'Reopen this submission for revision?\n\n' +
      'The submitted file is kept as a version in the history, and your edits go to a new copy. ' +
      'The submission returns to Draft — submit it again when you are done.'
    )) return
    try {
      await reopenM.mutateAsync({ id: submissionId })
      toast.success('Reopened for revision — you can edit the document now')
      // Refetch both the submission (status → DRAFT) and the editor config
      // (new manuscript version → new document key, edit mode enabled)
      await Promise.all([
        utils.submission.byId.invalidate({ id: submissionId }),
        utils.submission.getManuscriptEditorUrl.invalidate({ submissionId }),
      ])
      // OnlyOffice caches the editor instance per document key — reload to remount cleanly
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reopen submission')
    }
  }

  if (submission.isLoading || editorConfig.isLoading) return <div className="p-8">Loading...</div>

  if (editorConfig.error && !editorConfig.data) {
    const msg = (editorConfig.error as any)?.message ?? ''
    const isNoManuscript = msg.includes('No manuscript') || (editorConfig.error as any)?.data?.code === 'NOT_FOUND'
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-700">
          <p className="font-medium">{isNoManuscript ? 'No Manuscript Uploaded' : 'Editor Unavailable'}</p>
          <p className="text-sm mt-1">
            {isNoManuscript
              ? 'Upload a manuscript file first from the submission page.'
              : 'Unable to open the document editor. Check that OnlyOffice is running.'}
          </p>
          <div className="flex gap-2 mt-4">
            <Button onClick={() => router.back()}>Go Back</Button>
            {!isNoManuscript && (
              <Button variant="secondary" onClick={handleDownload} loading={downloadQ.isFetching}>
                Download File
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    // Editor tab uses the full browser width so OnlyOffice gets a desktop-sized
    // workspace; the metadata form stays in a comfortable centered column.
    <div className={activeTab === 'editor' ? 'w-full py-2' : 'max-w-6xl mx-auto py-8'}>
      <h1 className="text-2xl font-bold text-gray-900 mb-3">Edit Manuscript</h1>

      <div className="flex gap-2 mb-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'editor'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setActiveTab('metadata')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'metadata'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Metadata
        </button>
      </div>

      {activeTab === 'editor' && editorConfig.data && (
        <div className="space-y-3">
          {/* Status bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {canEdit
                ? <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Editing enabled</span>
                : <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">View only — editing not available at this workflow stage</span>
              }
              <span className="text-xs text-gray-400">{format}</span>
            </div>
            <div className="flex items-center gap-2">
              {(isDraft || isRevision) && hasManuscript && (
                <Button size="sm" onClick={handleSubmitForReview} loading={submitM.isPending}>
                  {isRevision ? 'Resubmit Revision' : 'Submit for Review'}
                </Button>
              )}
              {canReopen && (
                <Button size="sm" onClick={handleReopenForRevision} loading={reopenM.isPending}>
                  Revise &amp; Resubmit
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={handleDownload} loading={downloadQ.isFetching}>
                ↓ Download
              </Button>
            </div>
          </div>

          {isEditorFormat ? (
            // Viewport-based height: everything above (TopBar, heading, tabs,
            // status bar) adds up to roughly 15rem; the editor gets the rest.
            <div className="h-[calc(100vh-15rem)] min-h-[520px]">
              <OnlyOfficeEditor
                onlyofficeUrl={editorConfig.data.onlyofficeUrl}
                config={editorConfig.data.config}
                token={editorConfig.data.token}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
              <p className="font-medium text-amber-800">Browser editor not available for {format} files</p>
              <p className="text-sm text-amber-700 mt-1">Download the file to open it in a desktop application.</p>
              <Button className="mt-4" onClick={handleDownload} loading={downloadQ.isFetching}>
                Download {format} File
              </Button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'metadata' && (
        <div className="bg-white rounded-lg p-6 shadow">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              label="Title"
              {...register('title')}
              defaultValue={submission.data?.title}
              error={errors.title?.message}
            />

            <TextArea
              label="Abstract"
              {...register('abstract')}
              rows={5}
              defaultValue={submission.data?.abstract ?? ''}
              error={errors.abstract?.message}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Keywords</label>
              <p className="text-xs text-gray-500 mb-2">Edit keywords directly in this list</p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Co-Authors</h3>
              {coAuthorFields.map((field, idx) => (
                <div key={field.id} className="p-4 border border-gray-200 rounded-lg space-y-3 mb-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Co-Author {idx + 1}</h4>
                    <button
                      type="button"
                      onClick={() => removeCoAuthor(idx)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  <FormField
                    label="Name"
                    {...register(`coAuthors.${idx}.name`)}
                    error={errors.coAuthors?.[idx]?.name?.message}
                  />
                  <FormField
                    label="Email"
                    {...register(`coAuthors.${idx}.email`)}
                    type="email"
                    error={errors.coAuthors?.[idx]?.email?.message}
                  />
                  <FormField
                    label="Affiliation (optional)"
                    {...register(`coAuthors.${idx}.affiliation`)}
                  />
                  <FormField
                    label="ORCID (optional)"
                    {...register(`coAuthors.${idx}.orcid`)}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() => addCoAuthor({ name: '', email: '', affiliation: '', orcid: '' })}
                className="mt-2"
              >
                + Add Co-Author
              </Button>
            </div>

            <div className="flex gap-3 pt-6 border-t">
              <Button type="submit" loading={isSubmitting}>
                Save Changes
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="ml-auto"
              >
                Delete Submission
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
