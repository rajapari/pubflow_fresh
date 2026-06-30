'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from './Form'
import { toast } from 'sonner'
import { Upload, X, CheckCircle, AlertCircle, Loader, Image as ImageIcon } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'

interface AssetUploadProps {
  submissionId: string
  assetType: 'FIGURE' | 'TABLE' | 'SUPPLEMENTARY' | 'COVER'
  onUploadComplete?: (assetId: string) => void
}

// MIME types accepted for artwork / asset files
const ASSET_MIME: Record<string, string> = {
  'image/jpeg':            'JPEG (.jpg)',
  'image/png':             'PNG (.png)',
  'image/tiff':            'TIFF (.tif / .tiff)',
  'image/gif':             'GIF (.gif)',
  'image/webp':            'WebP (.webp)',
  'image/svg+xml':         'SVG (.svg)',
  'image/x-eps':           'EPS (.eps)',
  'application/postscript':'EPS / PostScript (.eps, .ps)',
  'application/pdf':       'PDF (.pdf)',
}

const ASSET_ACCEPT = '.jpg,.jpeg,.png,.tif,.tiff,.gif,.webp,.svg,.eps,.ps,.pdf'

function detectAssetMime(file: File): string {
  if (file.type && ASSET_MIME[file.type]) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const byExt: Record<string, string> = {
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    png:  'image/png',
    tif:  'image/tiff',
    tiff: 'image/tiff',
    gif:  'image/gif',
    webp: 'image/webp',
    svg:  'image/svg+xml',
    eps:  'application/postscript',
    ps:   'application/postscript',
    pdf:  'application/pdf',
  }
  return byExt[ext] ?? file.type
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AssetUpload({ submissionId, assetType, onUploadComplete }: AssetUploadProps) {
  const [file,             setFile]             = useState<File | null>(null)
  const [progress,         setProgress]         = useState(0)
  const [isUploading,      setIsUploading]      = useState(false)
  const [dragOver,         setDragOver]         = useState(false)
  const [figureLabel,      setFigureLabel]      = useState('')
  const [altText,          setAltText]          = useState('')
  const [caption,          setCaption]          = useState('')
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'success' | 'warning'>('idle')
  const [validationMessage,setValidationMessage]= useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getUrlMutation  = trpc.asset.getUploadUrl.useMutation()
  const confirmMutation = trpc.asset.confirmUpload.useMutation()

  const processFile = useCallback((selected: File) => {
    const mimeType = detectAssetMime(selected)
    if (!ASSET_MIME[mimeType]) {
      toast.error(`"${selected.name}" is not a supported image format. Accepted: JPEG, PNG, TIFF, EPS, SVG, PDF.`)
      return
    }
    if (selected.size > 200 * 1024 * 1024) {
      toast.error(`File is too large (${formatBytes(selected.size)}). Maximum for artwork is 200 MB.`)
      return
    }
    setFile(selected)
    setValidationStatus('idle')
    setValidationMessage('')
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0]
    if (f) processFile(f)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (isUploading) return
    const f = e.dataTransfer.files?.[0]
    if (f) processFile(f)
  }

  const handleUpload = async () => {
    if (!file) { toast.error('Please select a file first'); return }

    setIsUploading(true)
    setValidationStatus('validating')
    setProgress(0)

    const mimeType = detectAssetMime(file)

    try {
      // Step 1: Get presigned PUT URL
      const { url: presignedUrl, minioKey } = await getUrlMutation.mutateAsync({
        submissionId,
        filename: file.name,
        mimeType,
        assetType,
      })

      setProgress(20)

      // Step 2: Upload to MinIO
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setProgress(20 + (e.loaded / e.total) * 65)
        })
        xhr.addEventListener('load', () => xhr.status === 200 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)))
        xhr.addEventListener('error', () => reject(new Error('Network error')))
        xhr.open('PUT', presignedUrl, true)
        xhr.setRequestHeader('Content-Type', mimeType)
        xhr.send(file)
      })

      setProgress(88)

      // Step 3: Confirm + queue image processing job
      const assetId = crypto.randomUUID()
      await confirmMutation.mutateAsync({
        submissionId,
        assetId,
        minioKey,
        filename: file.name,
        mimeType,
        fileSizeBytes: file.size,
        assetType,
        figureLabel: figureLabel || undefined,
        altText:     altText     || undefined,
        caption:     caption     || undefined,
      })

      setProgress(100)
      setValidationStatus('success')
      setValidationMessage('Uploaded — image processing queued.')
      toast.success('Artwork uploaded successfully!')

      setFile(null)
      setFigureLabel('')
      setAltText('')
      setCaption('')
      if (fileInputRef.current) fileInputRef.current.value = ''

      onUploadComplete?.(assetId)
      setTimeout(() => { setValidationStatus('idle'); setProgress(0) }, 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setValidationStatus('warning')
      setValidationMessage(msg)
      toast.error(msg)
      setProgress(0)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); if (!isUploading) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        className={[
          'relative rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer select-none',
          isUploading
            ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
            : dragOver
              ? 'border-brand-500 bg-brand-50 scale-[1.01]'
              : file
                ? 'border-green-400 bg-green-50'
                : 'border-gray-300 bg-gray-50/60 hover:bg-gray-100 hover:border-gray-400',
        ].join(' ')}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileInput}
          disabled={isUploading}
          accept={ASSET_ACCEPT}
          className="hidden"
          aria-label="Upload artwork"
        />

        {isUploading ? (
          <div className="space-y-2">
            <Loader className="mx-auto h-8 w-8 animate-spin text-brand-500" />
            <p className="text-sm font-medium text-gray-700">Uploading {file?.name}…</p>
            <div className="mx-auto max-w-xs">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{Math.round(progress)}%</p>
            </div>
          </div>
        ) : file ? (
          <div className="flex items-center justify-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900 truncate max-w-[260px]">{file.name}</p>
              <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
              className="ml-2 rounded-full p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <ImageIcon className={`mx-auto h-10 w-10 transition-colors ${dragOver ? 'text-brand-500' : 'text-gray-400'}`} />
            <div>
              <p className="text-sm font-semibold text-gray-700">
                {dragOver ? 'Drop image to upload' : 'Click to browse or drag & drop'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                JPEG · PNG · TIFF · EPS · SVG · PDF &mdash; up to 200 MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Metadata fields — visible once a file is chosen */}
      {file && !isUploading && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Figure Label <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={figureLabel}
              onChange={(e) => setFigureLabel(e.target.value)}
              placeholder="e.g. Figure 1 — Experimental setup"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Alt Text <span className="text-gray-400">(for accessibility)</span>
            </label>
            <input
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Describe the image for screen readers"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Caption <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Detailed caption that will appear below the figure"
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleUpload} className="flex-1">
              Upload Artwork
            </Button>
            <Button
              variant="secondary"
              onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Validation feedback */}
      {validationStatus !== 'idle' && (
        <div className={[
          'flex gap-2 rounded-lg px-4 py-3 text-sm',
          validationStatus === 'success' ? 'bg-green-50 text-green-700'
          : validationStatus === 'warning' ? 'bg-red-50 text-red-700'
          : 'bg-blue-50 text-blue-700',
        ].join(' ')}>
          {validationStatus === 'success'
            ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{validationMessage}</span>
        </div>
      )}
    </div>
  )
}
