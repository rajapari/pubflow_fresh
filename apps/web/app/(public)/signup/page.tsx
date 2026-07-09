'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BookMarked, CheckCircle } from 'lucide-react'
import { trpc } from '@/components/providers'

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
}

export default function SignupPage() {
  const registerM = trpc.tenant.register.useMutation()

  const [form, setForm] = useState({
    orgName:   '',
    slug:      '',
    firstName: '',
    lastName:  '',
    email:     '',
    plan:      'STARTER' as 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE',
  })
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError]           = useState('')
  const [done, setDone]             = useState(false)

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => {
      const next = { ...f, [key]: value }
      if (key === 'orgName' && !slugEdited) {
        next.slug = slugify(value as string)
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await registerM.mutateAsync(form)
      setDone(true)
    } catch (err: any) {
      setError(err.message ?? 'Registration failed. Please try again.')
    }
  }

  if (done) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="text-center max-w-md">
          <CheckCircle className="mx-auto mb-4 text-green-500" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">You&apos;re all set!</h1>
          <p className="mt-3 text-gray-500">
            Check your email — we&apos;ve sent you a link to set your password and activate your account.
          </p>
          <Link href="/dashboard" className="mt-6 inline-block rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-600">
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500">
          <BookMarked size={24} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Create your organisation</h1>
        <p className="mt-2 text-sm text-gray-500">
          Start publishing open-access journals and books with PubFlow.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        {/* Organisation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Organisation name <span className="text-red-500">*</span>
          </label>
          <input
            required
            value={form.orgName}
            onChange={e => set('orgName', e.target.value)}
            placeholder="University Press"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL slug <span className="text-red-500">*</span>
          </label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
            <span className="flex items-center bg-gray-50 px-3 text-xs text-gray-400 border-r border-gray-300">
              pubflow.io/
            </span>
            <input
              required
              pattern="[a-z0-9-]+"
              value={form.slug}
              onChange={e => { setSlugEdited(true); set('slug', e.target.value) }}
              placeholder="university-press"
              className="flex-1 px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">Lowercase letters, numbers and hyphens only. Cannot be changed later.</p>
        </div>

        <hr className="border-gray-100" />

        {/* Account */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First name <span className="text-red-500">*</span></label>
            <input
              required
              value={form.firstName}
              onChange={e => set('firstName', e.target.value)}
              placeholder="Jane"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last name <span className="text-red-500">*</span></label>
            <input
              required
              value={form.lastName}
              onChange={e => set('lastName', e.target.value)}
              placeholder="Smith"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Work email <span className="text-red-500">*</span></label>
          <input
            required
            type="email"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="jane@university.edu"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
          <select
            value={form.plan}
            onChange={e => set('plan', e.target.value as typeof form.plan)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="STARTER">Starter — Free</option>
            <option value="PROFESSIONAL">Professional — $149/mo</option>
            <option value="ENTERPRISE">Enterprise — $499/mo</option>
          </select>
          {form.plan !== 'STARTER' && (
            <p className="mt-1 text-xs text-gray-400">
              You will be asked for payment details after creating your account.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={registerM.isPending}
          className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {registerM.isPending ? 'Creating your organisation…' : 'Create Organisation'}
        </button>

        <p className="text-center text-xs text-gray-400">
          Already have an account?{' '}
          <Link href="/dashboard" className="text-brand-600 hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
