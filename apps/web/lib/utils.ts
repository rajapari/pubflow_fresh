import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function formatDate(d: Date | string) {
  return new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short', year:'numeric' }).format(new Date(d))
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const k = 1024, s = ['B','KB','MB','GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT:'Draft', SUBMITTED:'Submitted', DESK_REVIEW:'Desk Review',
  PEER_REVIEW:'Peer Review', REVISION_REQUIRED:'Revision Required',
  REVISED:'Revised', ACCEPTED:'Accepted', COPY_EDITING:'Copy Editing',
  ARTWORK_PROCESSING:'Artwork Processing', TYPESETTING:'Typesetting',
  PROOF_REVIEW:'Proof Review', APPROVED:'Approved',
  PUBLISHED:'Published', REJECTED:'Rejected', WITHDRAWN:'Withdrawn',
}

export const STATUS_COLORS: Record<string, string> = {
  DRAFT:'bg-gray-100 text-gray-600', SUBMITTED:'bg-blue-100 text-blue-700',
  DESK_REVIEW:'bg-yellow-100 text-yellow-700', PEER_REVIEW:'bg-purple-100 text-purple-700',
  REVISION_REQUIRED:'bg-orange-100 text-orange-700', REVISED:'bg-cyan-100 text-cyan-700',
  ACCEPTED:'bg-green-100 text-green-700', COPY_EDITING:'bg-teal-100 text-teal-700',
  ARTWORK_PROCESSING:'bg-pink-100 text-pink-700', TYPESETTING:'bg-indigo-100 text-indigo-700',
  PROOF_REVIEW:'bg-violet-100 text-violet-700', APPROVED:'bg-emerald-100 text-emerald-700',
  PUBLISHED:'bg-green-200 text-green-800', REJECTED:'bg-red-100 text-red-700',
  WITHDRAWN:'bg-gray-100 text-gray-400',
}
