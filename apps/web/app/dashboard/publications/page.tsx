'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Plus, XCircle, Archive, BookMarked } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/components/providers'
import { useAuth } from '@/hooks/useAuth'
import { hasMinRole, type UserRole } from '@pubflow/types'

const TYPE_LABELS: Record<string, string> = {
  JOURNAL: 'Journal', BOOK: 'Book', BOOK_SERIES: 'Book Series', PROCEEDINGS: 'Proceedings',
}

export default function PublicationsPage() {
  const router = useRouter()
  const { user } = useAuth()
  // publication.create/archive/update are chiefEditorProcedure (rank >=
  // EDITOR_IN_CHIEF) — hide the actions for lower roles instead of
  // show-then-403.
  const canManage = !!user && hasMinRole(user.role as UserRole, 'EDITOR_IN_CHIEF')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', type: 'JOURNAL' as const, issn: '', isbn: '', description: '' })

  const pubsQ   = trpc.publication.list.useQuery()
  const createM = trpc.publication.create.useMutation()
  const archiveM = trpc.publication.archive.useMutation()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createM.mutateAsync({
        title: form.title,
        type: form.type as any,
        issn: form.issn || undefined,
        isbn: form.isbn || undefined,
        description: form.description || undefined,
      })
      toast.success('Publication created')
      setShowCreate(false)
      setForm({ title: '', type: 'JOURNAL', issn: '', isbn: '', description: '' })
      pubsQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create publication')
    }
  }

  async function handleArchive(id: string) {
    if (!confirm('Archive this publication? It will no longer accept new submissions.')) return
    try {
      await archiveM.mutateAsync({ id })
      toast.success('Publication archived')
      pubsQ.refetch()
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to archive publication')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Publications</h1>
          <p className="mt-1 text-sm text-gray-500">Manage journals, books, and proceedings</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
          >
            <Plus size={16} /> New Publication
          </button>
        )}
      </div>

      {pubsQ.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : !pubsQ.data?.length ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 py-16">
          <BookOpen size={40} className="text-gray-300 mb-3" />
          <p className="text-sm text-gray-500 mb-2">No publications yet</p>
          {canManage && (
            <button onClick={() => setShowCreate(true)} className="text-sm text-brand-600 hover:underline">
              Create your first publication →
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pubsQ.data.map((pub: any) => (
            <div key={pub.id} className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                  <BookOpen size={20} className="text-brand-600" />
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {TYPE_LABELS[pub.type] ?? pub.type}
                </span>
              </div>

              <h2 className="text-base font-semibold text-gray-900 mb-1">{pub.title}</h2>

              {pub.issn && <p className="text-xs text-gray-500">ISSN: {pub.issn}</p>}
              {pub.isbn && <p className="text-xs text-gray-500">ISBN: {pub.isbn}</p>}
              {pub.description && (
                <p className="mt-2 text-sm text-gray-600 line-clamp-2">{pub.description}</p>
              )}

              <div className="mt-auto pt-4 flex items-center justify-between border-t border-gray-100 text-xs text-gray-400">
                <button
                  onClick={() => router.push(`/dashboard/publications/${pub.id}`)}
                  className="flex items-center gap-1 text-brand-600 hover:text-brand-800 font-medium transition-colors"
                >
                  <BookMarked size={12} /> Manage Issues
                </button>
                {canManage && (
                  <button
                    onClick={() => handleArchive(pub.id)}
                    disabled={archiveM.isPending}
                    className="flex items-center gap-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Archive size={12} /> Archive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">New Publication</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Journal of Computational Science"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="JOURNAL">Journal</option>
                  <option value="BOOK">Book</option>
                  <option value="BOOK_SERIES">Book Series</option>
                  <option value="PROCEEDINGS">Proceedings</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ISSN</label>
                  <input
                    value={form.issn}
                    onChange={e => setForm(f => ({ ...f, issn: e.target.value }))}
                    placeholder="0000-0000"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ISBN</label>
                  <input
                    value={form.isbn}
                    onChange={e => setForm(f => ({ ...f, isbn: e.target.value }))}
                    placeholder="978-0-000-00000-0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Brief description of this publication…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={createM.isPending}
                  className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
                >
                  {createM.isPending ? 'Creating…' : 'Create Publication'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
