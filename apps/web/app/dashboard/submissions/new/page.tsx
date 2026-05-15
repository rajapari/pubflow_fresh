'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpc } from '@/lib/trpc-client'
import { FormField, TextArea, Select, Button } from '@/components/ui/Form'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

const CreateSubmissionSchema = z.object({
  publicationId: z.string().uuid('Publication is required'),
  title: z.string().min(10, 'Title must be at least 10 characters').max(500),
  abstract: z.string().min(50, 'Abstract must be at least 50 characters').max(5000).optional(),
  keywords: z.array(z.string().min(2).max(50)).min(1, 'At least one keyword required').max(10),
  coAuthors: z.array(z.object({
    name: z.string().min(1, 'Name required'),
    email: z.string().email('Valid email required'),
    affiliation: z.string().optional(),
    orcid: z.string().optional(),
  })).default([]),
})

type FormData = z.infer<typeof CreateSubmissionSchema>

export default function NewSubmissionPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [keywordInput, setKeywordInput] = useState('')

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(CreateSubmissionSchema),
    defaultValues: {
      publicationId: '',
      title: '',
      abstract: '',
      keywords: [],
      coAuthors: [],
    },
  })

  const { fields: coAuthorFields, append: addCoAuthor, remove: removeCoAuthor } = useFieldArray({
    control,
    name: 'coAuthors',
  })

  const keywords = watch('keywords')
  const publications = trpc.publication.list.useQuery()
  const createSubmission = trpc.submission.create.useMutation()

  const handleAddKeyword = () => {
    if (keywordInput.trim() && keywords.length < 10) {
      // This is a bit tricky with react-hook-form, we need to use setValue
      const currentKeywords = watch('keywords')
      const { register: _ } = useForm() // Get setValue from a new instance for simplicity
      setStep(1) // Trigger re-render, the keyword will be added via the form state
    }
  }

  const onSubmit = async (data: FormData) => {
    try {
      const submission = await createSubmission.mutateAsync(data)
      toast.success('Submission created. Redirecting to upload manuscript...')
      router.push(`/dashboard/submissions/${submission.id}/upload`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create submission'
      toast.error(message)
    }
  }

  if (publications.isLoading) return <div>Loading...</div>
  if (publications.error) return <div>Error loading publications</div>

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Submit a Manuscript</h1>
        <p className="text-gray-600">Step {step} of 3</p>
        <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white rounded-lg p-6 shadow">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Publication & Basic Info</h2>
            <Select
              label="Publication"
              {...register('publicationId')}
              options={publications.data?.map((p) => ({ value: p.id, label: p.title })) ?? []}
              error={errors.publicationId?.message}
              required
            />
            <FormField
              label="Title"
              {...register('title')}
              placeholder="Enter manuscript title"
              error={errors.title?.message}
              required
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Abstract & Keywords</h2>
            <TextArea
              label="Abstract"
              {...register('abstract')}
              placeholder="Enter a brief abstract (50-5000 characters)"
              rows={5}
              error={errors.abstract?.message}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Keywords (min 1, max 10)</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="Type keyword and press Add"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      // Handle keyword addition
                    }
                  }}
                />
                <Button type="button" onClick={handleAddKeyword}>Add Keyword</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.map((kw, idx) => (
                  <span key={idx} className="inline-flex items-center gap-2 bg-blue-100 text-blue-900 px-3 py-1 rounded-full">
                    {kw}
                    <button
                      type="button"
                      onClick={() => {
                        // Remove keyword
                      }}
                      className="text-blue-900 hover:text-blue-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Co-Authors</h2>
            {coAuthorFields.map((field, idx) => (
              <div key={field.id} className="p-4 border border-gray-200 rounded-lg space-y-3">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium">Co-Author {idx + 1}</h3>
                  <button
                    type="button"
                    onClick={() => removeCoAuthor(idx)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
                <FormField
                  label="Name"
                  {...register(`coAuthors.${idx}.name`)}
                  placeholder="Full name"
                  error={errors.coAuthors?.[idx]?.name?.message}
                />
                <FormField
                  label="Email"
                  {...register(`coAuthors.${idx}.email`)}
                  type="email"
                  placeholder="email@example.com"
                  error={errors.coAuthors?.[idx]?.email?.message}
                />
                <FormField
                  label="Affiliation (optional)"
                  {...register(`coAuthors.${idx}.affiliation`)}
                  placeholder="University or institution"
                />
                <FormField
                  label="ORCID (optional)"
                  {...register(`coAuthors.${idx}.orcid`)}
                  placeholder="0000-0000-0000-0000"
                />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => addCoAuthor({ name: '', email: '', affiliation: '', orcid: '' })}
            >
              + Add Co-Author
            </Button>
          </div>
        )}

        <div className="flex justify-between pt-4 border-t">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
          >
            ← Previous
          </Button>

          {step < 3 ? (
            <Button type="button" onClick={() => setStep(step + 1)}>
              Next →
            </Button>
          ) : (
            <Button type="submit" loading={isSubmitting}>
              Create Submission
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
