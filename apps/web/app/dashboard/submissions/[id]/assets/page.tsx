'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { AssetUpload } from '@/components/ui/AssetUpload'
import { Button } from '@/components/ui/Form'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Loader, AlertCircle, CheckCircle, X } from 'lucide-react'

export default function AssetsPage() {
  const params = useParams()
  const submissionId = params.id as string
  const [activeTab, setActiveTab] = useState<'upload' | 'manage'>('upload')

  const assetsQuery = trpc.asset.listForSubmission.useQuery({ submissionId })
  const approveMutation = trpc.asset.approve.useMutation()
  const rejectMutation = trpc.asset.reject.useMutation()
  const deleteMutation = trpc.asset.delete.useMutation()

  const handleApprove = async (assetId: string) => {
    try {
      await approveMutation.mutateAsync({ id: assetId })
      assetsQuery.refetch()
    } catch (err) {
      console.error('Failed to approve asset:', err)
    }
  }

  const handleReject = async (assetId: string) => {
    const reason = prompt('Please enter reason for rejection:')
    if (!reason) return

    try {
      await rejectMutation.mutateAsync({ id: assetId, reason })
      assetsQuery.refetch()
    } catch (err) {
      console.error('Failed to reject asset:', err)
    }
  }

  const handleDelete = async (assetId: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) return

    try {
      await deleteMutation.mutateAsync({ id: assetId })
      assetsQuery.refetch()
    } catch (err) {
      console.error('Failed to delete asset:', err)
    }
  }

  const assetTypeLabels: Record<string, string> = {
    FIGURE: '📊 Figure',
    TABLE: '📋 Table',
    SUPPLEMENTARY: '📎 Supplementary',
    COVER: '🎨 Cover',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Artwork Management</h1>
        <p className="text-gray-600 mt-2">Upload and manage figures, tables, and other assets for your submission</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'upload'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Upload Asset
        </button>
        <button
          onClick={() => setActiveTab('manage')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'manage'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Manage Assets {assetsQuery.data && `(${assetsQuery.data.length})`}
        </button>
      </div>

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="mb-6 space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Select Asset Type</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(
                [
                  { type: 'FIGURE', label: 'Figure' },
                  { type: 'TABLE', label: 'Table' },
                  { type: 'SUPPLEMENTARY', label: 'Supplementary' },
                  { type: 'COVER', label: 'Cover' },
                ] as const
              ).map(({ type, label }) => (
                <button
                  key={type}
                  className="p-3 rounded-lg border-2 border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  {assetTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>

          <AssetUpload
            submissionId={submissionId}
            assetType="FIGURE"
            onUploadComplete={() => {
              assetsQuery.refetch()
              setActiveTab('manage')
            }}
          />
        </div>
      )}

      {/* Manage Tab */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          {assetsQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : assetsQuery.data && assetsQuery.data.length > 0 ? (
            (assetsQuery.data as any[]).map((asset: any) => (
              <div key={asset.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{asset.filename}</h3>
                      <StatusBadge status={asset.status} />
                    </div>
                    <p className="text-sm text-gray-600">{assetTypeLabels[asset.assetType]}</p>
                    {asset.figureLabel && (
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Label:</span> {asset.figureLabel}
                      </p>
                    )}
                    {asset.caption && (
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Caption:</span> {asset.caption}
                      </p>
                    )}
                    <div className="flex gap-4 text-xs text-gray-500 mt-2">
                      <span>Size: {(asset.fileSizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                      {asset.dpi && <span>DPI: {asset.dpi}</span>}
                      {asset.width && asset.height && (
                        <span>
                          Dimensions: {asset.width}×{asset.height}px
                        </span>
                      )}
                    </div>
                  </div>

                  {asset.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <Button onClick={() => handleApprove(asset.id)} variant="outline" size="sm">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button onClick={() => handleReject(asset.id)} variant="outline" size="sm">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button onClick={() => handleDelete(asset.id)} variant="outline" size="sm">
                        <X className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  )}

                  {asset.status === 'NEEDS_REVISION' && (
                    <div className="space-y-2">
                      <p className="text-sm text-yellow-700 font-medium">Revision requested</p>
                      {asset.metadata &&
                        typeof asset.metadata === 'object' &&
                        'rejectionReason' in asset.metadata && (
                          <p className="text-xs text-yellow-600">
                            {String((asset.metadata as Record<string, unknown>).rejectionReason)}
                          </p>
                        )}
                      <Button onClick={() => handleDelete(asset.id)} variant="outline" size="sm">
                        Remove & Re-upload
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No assets uploaded yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
