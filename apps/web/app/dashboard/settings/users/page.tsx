'use client'

import { useState } from 'react'
import { UserPlus, Trash2, RefreshCw, ChevronDown, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/components/providers'

const ROLE_OPTIONS = [
  { value: 'SECTION_EDITOR',  label: 'Section Editor' },
  { value: 'COPY_EDITOR',     label: 'Copy Editor' },
  { value: 'ARTWORK_EDITOR',  label: 'Artwork Editor' },
  { value: 'TYPESETTER',      label: 'Typesetter' },
  { value: 'PROOF_READER',    label: 'Proof Reader' },
  { value: 'PEER_REVIEWER',   label: 'Peer Reviewer' },
  { value: 'AUTHOR',          label: 'Author' },
] as const

const ALL_ROLES = [
  { value: 'SUPER_ADMIN',     label: 'Super Admin' },
  { value: 'EDITOR_IN_CHIEF', label: 'Editor in Chief' },
  { value: 'SECTION_EDITOR',  label: 'Section Editor' },
  { value: 'COPY_EDITOR',     label: 'Copy Editor' },
  { value: 'ARTWORK_EDITOR',  label: 'Artwork Editor' },
  { value: 'TYPESETTER',      label: 'Typesetter' },
  { value: 'PROOF_READER',    label: 'Proof Reader' },
  { value: 'PEER_REVIEWER',   label: 'Peer Reviewer' },
  { value: 'AUTHOR',          label: 'Author' },
  { value: 'READER',          label: 'Reader' },
] as const

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  INVITED:   'bg-yellow-100 text-yellow-700',
  SUSPENDED: 'bg-red-100 text-red-600',
}

type InvitableRole = typeof ROLE_OPTIONS[number]['value']

export default function UsersPage() {
  const usersQ      = trpc.tenant.listUsers.useQuery({ status: undefined })
  const inviteM     = trpc.tenant.inviteUser.useMutation()
  const updateRoleM = trpc.tenant.updateUserRole.useMutation()
  const removeM     = trpc.tenant.removeUser.useMutation()
  const resendM     = trpc.tenant.resendInvite.useMutation()

  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'AUTHOR' as InvitableRole, firstName: '', lastName: '' })

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    try {
      await inviteM.mutateAsync({
        email:     inviteForm.email,
        role:      inviteForm.role,
        firstName: inviteForm.firstName || undefined,
        lastName:  inviteForm.lastName  || undefined,
      })
      toast.success(`Invitation sent to ${inviteForm.email}`)
      setInviteForm({ email: '', role: 'AUTHOR', firstName: '', lastName: '' })
      setShowInvite(false)
      usersQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to send invitation')
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      await updateRoleM.mutateAsync({ userId, role: role as any })
      toast.success('Role updated')
      usersQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update role')
    }
  }

  async function handleRemove(userId: string, email: string) {
    if (!confirm(`Remove ${email} from the organisation?`)) return
    try {
      await removeM.mutateAsync({ userId })
      toast.success('User removed')
      usersQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to remove user')
    }
  }

  async function handleResend(userId: string) {
    try {
      await resendM.mutateAsync({ userId })
      toast.success('Invitation resent')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to resend invitation')
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Team Members</h1>
          <p className="mt-1 text-sm text-gray-500">Manage who has access to your organisation</p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          <UserPlus size={15} /> Invite User
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <form onSubmit={handleInvite} className="rounded-xl border border-brand-200 bg-brand-50 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-brand-900">Invite a new team member</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First name</label>
              <input value={inviteForm.firstName} onChange={e => setInviteForm(f => ({ ...f, firstName: e.target.value }))}
                placeholder="Jane" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last name</label>
              <input value={inviteForm.lastName} onChange={e => setInviteForm(f => ({ ...f, lastName: e.target.value }))}
                placeholder="Smith" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email address <span className="text-red-500">*</span></label>
            <input required type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jane@university.edu" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role <span className="text-red-500">*</span></label>
            <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as InvitableRole }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={inviteM.isPending}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
              <Mail size={14} /> {inviteM.isPending ? 'Sending…' : 'Send Invitation'}
            </button>
            <button type="button" onClick={() => setShowInvite(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* User table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {usersQ.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : !usersQ.data?.length ? (
          <div className="py-12 text-center text-sm text-gray-400">No users found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Name / Email</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500">Role</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(usersQ.data as any[]).map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-600">
                        {u.firstName?.[0]?.toUpperCase() ?? u.email[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {u.firstName || u.lastName ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '—'}
                        </p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[u.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={e => handleRoleChange(u.id, e.target.value)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {u.status === 'INVITED' && (
                        <button
                          onClick={() => handleResend(u.id)}
                          disabled={resendM.isPending}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600"
                          title="Resend invitation"
                        >
                          <RefreshCw size={12} /> Resend
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(u.id, u.email)}
                        className="text-gray-300 hover:text-red-500"
                        title="Remove user"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
