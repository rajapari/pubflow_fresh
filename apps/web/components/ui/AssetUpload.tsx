'use client'

import { useState } from 'react'
import { Button } from './Form'
import { toast } from 'sonner'
import { Upload, X, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'

interface AssetUploadProps {
  submissionId: string
  assetType: 'FIGURE' | 'TABLE' | 'SUPPLEMENTARY' | 'COVER'
  onUploadComplete?: (assetId: string) => void
}

export function AssetUpload({ submissionId, assetType, onUploadComplete }: AssetUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [figureLabel, setFigureLabel] = useState('')
  const [altText, setAltText] = useState('')
  const [caption, setCaption] = useState('')
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'success' | 'warning'>('idle')
  const [validationMessage, setValidationMessage] = useState('')

  const getUrlMutation = trpc.asset.getUploadUrl.useMutation()
  const confirmMutation = trpc.asset.confirmUpload.useMutation()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/tiff', 'application/pdf']
    if (!validTypes.includes(selectedFile.type)) {
      toast.error('Invalid file type. Allowed: JPEG, PNG, TIFF, PDF')
      return
    }

    // Validate file size (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error('File too large. Maximum 50MB allowed')
      return
    }

    setFile(selectedFile)
  }

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file')
      return
    }

    setIsUploading(true)
    setValidationStatus('validating')
    setProgress(0)

    try {
      // Step 1: Get presigned upload URL via tRPC
      const { url: presignedUrl, minioKey } = await getUrlMutation.mutateAsync({
        submissionId,
        filename: file.name,
        mimeType: file.type,
        assetType,
      })

      // Step 2: Upload file to MinIO via presigned URL
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 80))
        }
      })

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) resolve(null)
          else reject(new Error(`Upload failed: ${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.open('PUT', presignedUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      setProgress(85)

      // Step 3: Confirm upload and queue processing via tRPC
      const assetId = crypto.randomUUID()
      await confirmMutation.mutateAsync({
        submissionId,
        assetId,
        minioKey,
        filename: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        assetType,
        figureLabel: figureLabel || undefined,
        altText: altText || undefined,
        caption: caption || undefined,
      })

      setValidationStatus('success')
      setValidationMessage('Upload successful. Processing started.')
      toast.success('Asset uploaded and queued for processing')

      // Reset form
      setFile(null)
      setFigureLabel('')
      setAltText('')
      setCaption('')
      setProgress(0)

      onUploadComplete?.(assetId)

      // Clear success message after 3 seconds
      setTimeout(() => {
        setValidationStatus('idle')
        setValidationMessage('')
      }, 3000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed'
      setValidationStatus('warning')
      setValidationMessage(errorMsg)
      toast.error(errorMsg)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-6">
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">
            {file ? file.name : 'Click to select or drag and drop'}
          </p>
          <p className="text-xs text-gray-500">JPEG, PNG, TIFF, or PDF up to 50MB</p>
        </div>
        <input
          type="file"
          onChange={handleFileSelect}
          disabled={isUploading}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          accept=".jpg,.jpeg,.png,.tiff,.pdf"
        />
      </div>

      {file && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Figure Label
            </label>
            <input
              type="text"
              value={figureLabel}
              onChange={(e) => setFigureLabel(e.target.value)}
              placeholder="e.g., Figure 1: Experimental setup"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alt Text (for accessibility)
            </label>
            <input
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Describe the image for screen readers"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isUploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Caption
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Optional: Detailed caption for the figure"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              disabled={isUploading}
            />
          </div>

          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {validationStatus !== 'idle' && (
            <div
              className={`flex gap-2 rounded-lg px-4 py-3 text-sm ${
                validationStatus === 'success'
                  ? 'bg-green-50 text-green-700'
                  : validationStatus === 'warning'
                    ? 'bg-yellow-50 text-yellow-700'
                    : 'bg-blue-50 text-blue-700'
              }`}
            >
              {validationStatus === 'success' ? (
                <CheckCircle className="h-5 w-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
              )}
              <span>{validationMessage}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleUpload}
              disabled={isUploading}
              className="flex-1"
            >
              {isUploading ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  Uploading
                </>
              ) : (
                'Upload Asset'
              )}
            </Button>
            <Button
              onClick={() => {
                setFile(null)
                setFigureLabel('')
                setAltText('')
                setCaption('')
                setValidationStatus('idle')
              }}
              variant="outline"
              disabled={isUploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
