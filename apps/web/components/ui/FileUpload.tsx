'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from './Form'
import { Upload, FileText, AlertCircle } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'

interface FileUploadProps {
  onUploadComplete: (file: File, minioKey: string, manuscriptId: string) => Promise<void>
  submissionId: string
  acceptedFormats?: string[]
  maxSize?: number
  disabled?: boolean
}

const ACCEPTED_FORMATS = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/x-tex': 'LaTeX',
  'text/markdown': 'Markdown',
  'text/plain': 'Text',
  'application/vnd.oasis.opendocument.text': 'ODT',
}

export function FileUpload({
  onUploadComplete,
  submissionId,
  maxSize = 500 * 1024 * 1024, // 500MB
  disabled = false,
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getUrlMutation = trpc.submission.getUploadUrl.useMutation()
  const confirmMutation = trpc.submission.confirmUpload.useMutation()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0]
    if (!file) return

    // Validate file
    if (!ACCEPTED_FORMATS[file.type as keyof typeof ACCEPTED_FORMATS]) {
      toast.error(`File type not supported. Accepted: ${Object.values(ACCEPTED_FORMATS).join(', ')}`)
      return
    }

    if (file.size > maxSize) {
      toast.error(`File too large. Max size: ${(maxSize / 1024 / 1024).toFixed(0)}MB`)
      return
    }

    try {
      setIsUploading(true)
      setProgress(0)

      // Step 1: Get presigned URL from API
      const { uploadUrl, key, manuscriptId } = await getUrlMutation.mutateAsync({
        submissionId,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      })

      setProgress(30)

      // Step 2: Upload directly to MinIO using presigned URL
      const xhr = new XMLHttpRequest()
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 70
          setProgress(30 + percentComplete)
        }
      })

      await new Promise<void>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            setProgress(95)
            resolve()
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        })
        xhr.addEventListener('error', () => reject(new Error('Upload failed')))

        xhr.open('PUT', uploadUrl, true)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      // Step 3: Confirm upload with API
      await confirmMutation.mutateAsync({
        submissionId,
        manuscriptId,
        minioKey: key,
      })

      setProgress(100)
      toast.success('Manuscript uploaded successfully!')
      
      // Call completion callback
      await onUploadComplete(file, key, manuscriptId)

      // Reset
      if (fileInputRef.current) fileInputRef.current.value = ''
      setProgress(0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      toast.error(message)
      setProgress(0)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div
        onClick={() => !isUploading && !disabled && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isUploading || disabled
            ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
            : 'border-blue-300 bg-blue-50 hover:bg-blue-100'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          disabled={isUploading || disabled}
          accept=".docx,.tex,.md,.txt,.odt"
          className="hidden"
          aria-label="Upload manuscript"
        />

        {!isUploading ? (
          <div className="space-y-2">
            <Upload className="mx-auto h-10 w-10 text-blue-600" />
            <div className="text-sm text-gray-700">
              <p className="font-medium">Click to upload or drag and drop</p>
              <p className="text-xs text-gray-600">DOCX, LaTeX, Markdown, ODT (max 500MB)</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <FileText className="mx-auto h-10 w-10 text-blue-600 animate-pulse" />
            <div>
              <p className="text-sm font-medium text-gray-700">Uploading...</p>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 mt-1">{Math.round(progress)}%</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded p-3 flex gap-2 text-sm text-blue-800">
        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <p>
          Your manuscript will be normalized to a standard format for compatibility across the review process.
        </p>
      </div>
    </div>
  )
}
