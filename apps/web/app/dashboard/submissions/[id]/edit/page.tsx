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

  const submission = trpc.submission.byId.useQuery({ id: submissionId })
  const editorConfig = trpc.submission.getManuscriptEditorUrl.useQuery({ submissionId })
  const updateMutation = trpc.submission.updateDraft.useMutation()
  const deleteMutation = trpc.submission.deleteDraft.useMutation()

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

  // Initialize form with submission data
  React.useEffect(() => {
    if (submission.data) {
      reset({
        title: submission.data.title,
        abstract: submission.data.abstract ?? '',
        keywords: submission.data.keywords ?? [],
        coAuthors: (submission.data.coAuthors as any) ?? [],
      })
    }
  }, [submission.data, reset])

  const onSubmit = async (data: FormData) => {
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

  if (submission.isLoading || editorConfig.isLoading) return <div className="p-8">Loading...</div>
  if (submission.data?.status !== 'DRAFT') {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">This submission cannot be edited (status: {submission.data?.status})</p>
        <Button onClick={() => router.back()} className="mt-4">Go Back</Button>
      </div>
    )
  }
  if (editorConfig.error && !editorConfig.data) {
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-700">
          <p className="font-medium">Editor Unavailable</p>
          <p className="text-sm">Please upload a manuscript first or check your OnlyOffice setup.</p>
          <Button onClick={() => router.back()} className="mt-4">Go Back</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit Manuscript</h1>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
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
        <div className="min-h-[600px] mb-8">
          <OnlyOfficeEditor
            onlyofficeUrl={editorConfig.data.onlyofficeUrl}
            config={editorConfig.data.config}
            token={editorConfig.data.token}
          />
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
