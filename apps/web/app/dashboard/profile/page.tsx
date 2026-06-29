'use client'

import { useState, useEffect } from 'react'
import { User, Mail, Award, Building2, Calendar, Shield, Save, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc-client'
import { useAuth } from '@/hooks/useAuth'

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:     'Super Admin',
  EDITOR_IN_CHIEF: 'Editor in Chief',
  SECTION_EDITOR:  'Section Editor',
  COPY_EDITOR:     'Copy Editor',
  ARTWORK_EDITOR:  'Artwork Editor',
  TYPESETTER:      'Typesetter',
  PEER_REVIEWER:   'Peer Reviewer',
  AUTHOR:          'Author',
  READER:          'Reader',
}

export default function ProfilePage() {
  const { user: authUser } = useAuth()
  const profileQ   = trpc.user.me.useQuery()
  const updateM    = trpc.user.updateProfile.useMutation()

  const profile = profileQ.data

  const [form, setForm] = useState({
    firstName:   '',
    lastName:    '',
    orcid:       '',
    affiliation: '',
  })
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (profile) {
      setForm({
        firstName:   profile.firstName   ?? '',
        lastName:    profile.lastName    ?? '',
        orcid:       profile.orcid       ?? '',
        affiliation: profile.affiliation ?? '',
      })
    }
  }, [profile])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setDirty(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateM.mutateAsync({
        firstName:   form.firstName   || undefined,
        lastName:    form.lastName    || undefined,
        orcid:       form.orcid       || null,
        affiliation: form.affiliation || null,
      })
      toast.success('Profile updated')
      setDirty(false)
      profileQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save profile')
    }
  }

  function handleChangePassword() {
    const kcUrl   = process.env.NEXT_PUBLIC_KEYCLOAK_URL    ?? 'http://localhost:8080'
    const realm   = process.env.NEXT_PUBLIC_KEYCLOAK_REALM  ?? 'pubflow'
    const client  = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'pubflow-web'
    const redirect = encodeURIComponent(`${window.location.origin}/auth/callback`)
    window.location.href = `${kcUrl}/realms/${realm}/protocol/openid-connect/auth?client_id=${client}&redirect_uri=${redirect}&response_type=code&kc_action=UPDATE_PASSWORD`
  }

  const initials = profile
    ? (profile.firstName?.[0] ?? profile.email[0]).toUpperCase()
    : (authUser?.email?.[0] ?? '?').toUpperCase()

  const displayName = profile?.firstName
    ? `${profile.firstName} ${profile.lastName ?? ''}`.trim()
    : profile?.email ?? ''

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">My Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your personal information and preferences</p>
      </div>

      {/* Avatar + summary card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 flex items-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-600 shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          {profileQ.isLoading ? (
            <div className="space-y-2">
              <div className="h-5 w-40 rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-56 rounded bg-gray-100 animate-pulse" />
            </div>
          ) : (
            <>
              <p className="text-lg font-semibold text-gray-900 truncate">{displayName}</p>
              <p className="text-sm text-gray-500 truncate">{profile?.email}</p>
              <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                <Shield size={11} />
                {ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-900">Personal Information</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              <User size={12} className="inline mr-1" />First Name
            </label>
            <input
              name="firstName"
              value={form.firstName}
              onChange={handleChange}
              placeholder="First name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Last Name</label>
            <input
              name="lastName"
              value={form.lastName}
              onChange={handleChange}
              placeholder="Last name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            <Mail size={12} className="inline mr-1" />Email Address
          </label>
          <input
            value={profile?.email ?? authUser?.email ?? ''}
            disabled
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-gray-400">Email cannot be changed here. Contact your administrator.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            <Award size={12} className="inline mr-1" />ORCID iD
          </label>
          <input
            name="orcid"
            value={form.orcid}
            onChange={handleChange}
            placeholder="0000-0000-0000-0000"
            pattern="^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-gray-400">Your persistent digital identifier as a researcher.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            <Building2 size={12} className="inline mr-1" />Affiliation
          </label>
          <input
            name="affiliation"
            value={form.affiliation}
            onChange={handleChange}
            placeholder="University or institution"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button
            type="submit"
            disabled={!dirty || updateM.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={14} />
            {updateM.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Account info */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Account</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Password</p>
            <p className="text-xs text-gray-400">Change your account password via the identity provider</p>
          </div>
          <button
            onClick={handleChangePassword}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <KeyRound size={14} />
            Change Password
          </button>
        </div>
        {profile?.createdAt && (
          <div className="flex items-center gap-2 text-xs text-gray-400 pt-1 border-t border-gray-100">
            <Calendar size={12} />
            Member since {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
        )}
      </div>
    </div>
  )
}
