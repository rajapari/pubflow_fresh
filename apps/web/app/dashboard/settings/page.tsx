'use client'

import { useState, useEffect } from 'react'
import { Settings, Save } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/components/providers'

const CITATION_STYLES = [
  { value: 'apa',       label: 'APA (7th edition)' },
  { value: 'mla',       label: 'MLA' },
  { value: 'chicago',   label: 'Chicago 17th' },
  { value: 'vancouver', label: 'Vancouver' },
  { value: 'harvard',   label: 'Harvard' },
  { value: 'ieee',      label: 'IEEE' },
]

const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter', PROFESSIONAL: 'Professional', ENTERPRISE: 'Enterprise',
}

export default function SettingsPage() {
  const tenantQ   = trpc.tenant.current.useQuery()
  const updateM   = trpc.tenant.updateSettings.useMutation()

  const settings = tenantQ.data?.settings

  const [form, setForm] = useState({
    primaryColor:          '#534AB7',
    defaultCitationStyle:  'apa',
    enablePeerReview:      true,
    enableDoiRegistration: false,
    doiPrefix:             '',
  })

  useEffect(() => {
    if (settings) {
      setForm({
        primaryColor:          settings.primaryColor          ?? '#534AB7',
        defaultCitationStyle:  settings.defaultCitationStyle  ?? 'apa',
        enablePeerReview:      settings.enablePeerReview      ?? true,
        enableDoiRegistration: settings.enableDoiRegistration ?? false,
        doiPrefix:             settings.doiPrefix             ?? '',
      })
    }
  }, [settings])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateM.mutateAsync({
        primaryColor:          form.primaryColor,
        defaultCitationStyle:  form.defaultCitationStyle,
        enablePeerReview:      form.enablePeerReview,
        enableDoiRegistration: form.enableDoiRegistration,
        doiPrefix:             form.doiPrefix || undefined,
      })
      toast.success('Settings saved')
      tenantQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save settings')
    }
  }

  const tenant = tenantQ.data

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Configure your organisation's publishing preferences</p>
      </div>

      {/* Tenant info */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Organisation</h2>
        {tenantQ.isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : tenantQ.error ? (
          <p className="text-sm text-red-600">Could not load organisation info.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Name</dt>
              <dd className="mt-0.5 font-medium text-gray-900">{tenant?.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Slug</dt>
              <dd className="mt-0.5 font-medium text-gray-900">{tenant?.slug}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Plan</dt>
              <dd className="mt-0.5">
                <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                  {PLAN_LABELS[tenant?.plan ?? ''] ?? tenant?.plan}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Status</dt>
              <dd className="mt-0.5">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  tenant?.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {tenant?.status}
                </span>
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Settings form */}
      <form onSubmit={handleSave} className="rounded-xl border border-gray-200 bg-white p-5 space-y-6">
        <h2 className="text-sm font-semibold text-gray-900">Publishing Preferences</h2>

        {/* Branding */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Branding</h3>
          <div className="flex items-center gap-4">
            <label className="block text-sm font-medium text-gray-700 w-40">Brand colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.primaryColor}
                onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                className="h-9 w-16 rounded-lg border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={form.primaryColor}
                onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                pattern="^#[0-9a-fA-F]{6}$"
                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Citations */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Citations</h3>
          <div className="flex items-center gap-4">
            <label className="block text-sm font-medium text-gray-700 w-40">Default citation style</label>
            <select
              value={form.defaultCitationStyle}
              onChange={e => setForm(f => ({ ...f, defaultCitationStyle: e.target.value }))}
              className="flex-1 max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {CITATION_STYLES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Peer review */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Peer Review</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enablePeerReview}
              onChange={e => setForm(f => ({ ...f, enablePeerReview: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Enable peer review</span>
              <p className="text-xs text-gray-500">Allow editors to assign peer reviewers to submissions</p>
            </div>
          </label>
        </div>

        {/* DOI */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">DOI Registration</h3>
          <label className="flex items-center gap-3 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enableDoiRegistration}
              onChange={e => setForm(f => ({ ...f, enableDoiRegistration: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Enable DOI registration via CrossRef</span>
              <p className="text-xs text-gray-500">Requires CrossRef credentials (set in environment variables)</p>
            </div>
          </label>

          {form.enableDoiRegistration && (
            <div className="flex items-center gap-4 ml-7">
              <label className="block text-sm font-medium text-gray-700 w-32">DOI prefix</label>
              <input
                value={form.doiPrefix}
                onChange={e => setForm(f => ({ ...f, doiPrefix: e.target.value }))}
                placeholder="10.12345"
                className="flex-1 max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              />
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-gray-200">
          <button
            type="submit"
            disabled={updateM.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            <Save size={15} />
            {updateM.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
