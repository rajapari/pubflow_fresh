'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpc } from '@/lib/trpc-client'
import { FormField, TextArea, Select, Button } from '@/components/ui/Form'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'

const CreateSubmissionSchema = z.object({
  publicationId: z.string().uuid('Please select a publication'),
  title:    z.string().min(10, 'Title must be at least 10 characters').max(500),
  abstract: z.string().min(50, 'Abstract must be at least 50 characters').max(5000).optional(),
  keywords: z.array(z.string().min(2).max(50)).min(1, 'Add at least one keyword').max(10),
  coAuthors: z.array(z.object({
    name:        z.string().min(1, 'Name required'),
    email:       z.string().email('Valid email required'),
    affiliation: z.string().optional(),
    orcid:       z.string().optional(),
  })).default([]),
})

type FormData = z.infer<typeof CreateSubmissionSchema>

// Fields that belong to each step (used for per-step validation)
const STEP_FIELDS: Record<number, (keyof FormData)[]> = {
  1: ['publicationId', 'title'],
  2: ['abstract', 'keywords'],
  3: ['coAuthors'],
}

const STEPS = ['Publication & Title', 'Abstract & Keywords', 'Co-Authors']

export default function NewSubmissionPage() {
  const router  = useRouter()
  const [step, setStep] = useState(1)
  const [keywordInput, setKeywordInput] = useState('')

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(CreateSubmissionSchema),
    defaultValues: {
      publicationId: '',
      title:    '',
      abstract: '',
      keywords: [],
      coAuthors: [],
    },
  })

  const { fields: coAuthorFields, append: addCoAuthor, remove: removeCoAuthor } = useFieldArray({
    control,
    name: 'coAuthors',
  })

  const keywords       = watch('keywords')
  const selectedPubId  = watch('publicationId')
  const publications   = trpc.publication.list.useQuery()
  const selectedPub    = trpc.publication.byId.useQuery(
    { id: selectedPubId },
    { enabled: !!selectedPubId }
  )
  const createSubmission = trpc.submission.create.useMutation()

  // Validate current step's fields before advancing
  const handleNext = async () => {
    const fields = STEP_FIELDS[step]
    const valid  = await trigger(fields as any)
    if (valid) setStep(s => Math.min(3, s + 1))
  }

  const handleAddKeyword = () => {
    const kw = keywordInput.trim()
    if (kw && keywords.length < 10) {
      setValue('keywords', [...keywords, kw], { shouldValidate: true })
      setKeywordInput('')
    }
  }

  const handleRemoveKeyword = (index: number) => {
    setValue('keywords', keywords.filter((_, i) => i !== index), { shouldValidate: true })
  }

  const onSubmit = async (data: FormData) => {
    try {
      const submission = await createSubmission.mutateAsync(data)
      toast.success('Submission created — now upload your manuscript file.')
      router.push(`/dashboard/submissions/${submission.id}/upload`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create submission')
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Progress header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Submit a Manuscript</h1>
        <div className="flex items-center gap-2 mb-3">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={[
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                step > i + 1  ? 'bg-brand-500 text-white'
                : step === i + 1 ? 'bg-brand-500 text-white'
                : 'bg-gray-200 text-gray-500',
              ].join(' ')}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className={`text-xs font-medium ${step === i + 1 ? 'text-gray-900' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < 2 && <span className="text-gray-300 mx-1">›</span>}
            </div>
          ))}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-brand-500 h-1.5 rounded-full transition-all"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 rounded-xl border border-gray-200 bg-white p-6">

        {/* Step 1: Publication & Title */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Publication & Title</h2>
            <Select
              label="Publication"
              {...register('publicationId')}
              options={publications.data?.map((p) => ({ value: p.id, label: p.title })) ?? []}
              error={errors.publicationId?.message}
              disabled={publications.isLoading}
              required
            />
            {/* Submission guidelines for the selected publication */}
            {selectedPubId && (selectedPub.data as any)?.submissionGuidelines && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={14} className="text-amber-600 shrink-0" />
                  <p className="text-xs font-semibold text-amber-800">Submission Guidelines</p>
                </div>
                <pre className="text-xs text-amber-900 whitespace-pre-wrap font-sans leading-relaxed">
                  {(selectedPub.data as any).submissionGuidelines}
                </pre>
                <p className="mt-2 text-xs text-amber-700 font-medium">
                  Please read the guidelines above before continuing.
                </p>
              </div>
            )}

            <FormField
              label="Title"
              {...register('title')}
              placeholder="Enter the full manuscript title (min 10 characters)"
              error={errors.title?.message}
              required
            />
          </div>
        )}

        {/* Step 2: Abstract & Keywords */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-gray-900">Abstract & Keywords</h2>
            <TextArea
              label="Abstract"
              {...register('abstract')}
              placeholder="Summarise your manuscript (50–5000 characters)"
              rows={6}
              error={errors.abstract?.message}
            />

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Keywords <span className="text-gray-400">(1–10 required)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="Type a keyword and press Enter or Add"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAddKeyword() }
                  }}
                />
                <Button type="button" onClick={handleAddKeyword} disabled={!keywordInput.trim() || keywords.length >= 10}>
                  Add
                </Button>
              </div>

              {errors.keywords && (
                <div className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle size={12} />
                  {errors.keywords.message ?? errors.keywords.root?.message}
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-2 min-h-[2rem]">
                {keywords.length === 0 ? (
                  <span className="text-xs text-gray-400 italic">No keywords added yet</span>
                ) : keywords.map((kw, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-800"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(idx)}
                      className="hover:text-red-600 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-400">{keywords.length}/10 keywords added</p>
            </div>
          </div>
        )}

        {/* Step 3: Co-Authors */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Co-Authors</h2>
              <span className="text-xs text-gray-400">Optional</span>
            </div>

            {coAuthorFields.length === 0 && (
              <p className="text-sm text-gray-500">No co-authors added. You can leave this section blank if you are the sole author.</p>
            )}

            {coAuthorFields.map((field, idx) => (
              <div key={field.id} className="rounded-lg border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-800">Co-Author {idx + 1}</h3>
                  <button
                    type="button"
                    onClick={() => removeCoAuthor(idx)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="Full Name"
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
                </div>
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

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t border-gray-100">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            ← Previous
          </Button>

          {step < 3 ? (
            <Button type="button" onClick={handleNext}>
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
