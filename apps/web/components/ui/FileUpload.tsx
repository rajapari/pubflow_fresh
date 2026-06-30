'use client'

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from './Form'
import { Upload, FileText, AlertCircle, CheckCircle, X } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'

interface FileUploadProps {
  onUploadComplete: (file: File, minioKey: string, manuscriptId: string) => Promise<void>
  submissionId: string
  maxSize?: number
  disabled?: boolean
}

// All MIME types accepted as manuscript input for e-publishing
const ACCEPTED_MIME: Record<string, string> = {
  // Word / Office
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (.docx)',
  'application/msword':                              'Word (.doc)',
  // OpenDocument
  'application/vnd.oasis.opendocument.text':         'OpenDocument (.odt)',
  // Rich Text
  'application/rtf':                                 'Rich Text (.rtf)',
  'text/rtf':                                        'Rich Text (.rtf)',
  // LaTeX
  'application/x-tex':                               'LaTeX (.tex)',
  'application/x-latex':                             'LaTeX (.tex)',
  'text/x-tex':                                      'LaTeX (.tex)',
  // Markdown / plain text
  'text/markdown':                                   'Markdown (.md)',
  'text/x-markdown':                                 'Markdown (.md)',
  'text/plain':                                      'Plain Text (.txt)',
  // PDF
  'application/pdf':                                 'PDF (.pdf)',
  // Archives (LaTeX bundles, supplementary packages)
  'application/zip':                                 'ZIP archive (.zip)',
  'application/x-zip-compressed':                    'ZIP archive (.zip)',
  'application/x-zip':                               'ZIP archive (.zip)',
  'application/x-7z-compressed':                     '7-Zip archive (.7z)',
}

const ACCEPT_EXTENSIONS = '.docx,.doc,.odt,.rtf,.tex,.latex,.ltx,.md,.markdown,.txt,.pdf,.zip,.7z'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function detectMime(file: File): string {
  // Browser may not set MIME for .tex, .rtf, .md — fall back by extension
  if (file.type && ACCEPTED_MIME[file.type]) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const byExt: Record<string, string> = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc:  'application/msword',
    odt:  'application/vnd.oasis.opendocument.text',
    rtf:  'application/rtf',
    tex:  'application/x-tex',
    latex:'application/x-tex',
    ltx:  'application/x-tex',
    md:       'text/markdown',
    markdown: 'text/markdown',
    txt:      'text/plain',
    pdf:      'application/pdf',
    zip:      'application/zip',
    '7z':     'application/x-7z-compressed',
  }
  return byExt[ext] ?? file.type
}

export function FileUpload({
  onUploadComplete,
  submissionId,
  maxSize = 500 * 1024 * 1024,
  disabled = false,
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [progress,    setProgress]    = useState(0)
  const [dragOver,    setDragOver]    = useState(false)
  const [selected,    setSelected]    = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getUrlMutation  = trpc.submission.getUploadUrl.useMutation()
  const confirmMutation = trpc.submission.confirmUpload.useMutation()

  const processFile = useCallback(async (file: File) => {
    const mimeType = detectMime(file)

    if (!ACCEPTED_MIME[mimeType]) {
      toast.error(`"${file.name}" is not a supported format. Accepted: DOCX, ODT, RTF, LaTeX, Markdown, plain text.`)
      return
    }
    if (file.size > maxSize) {
      toast.error(`File is too large (${formatBytes(file.size)}). Maximum is ${formatBytes(maxSize)}.`)
      return
    }

    setSelected(file)
    setIsUploading(true)
    setProgress(0)

    try {
      // Step 1: Get presigned PUT URL from API
      const { uploadUrl, key, manuscriptId } = await getUrlMutation.mutateAsync({
        submissionId,
        filename: file.name,
        mimeType,
        size: file.size,
      })

      setProgress(20)

      // Step 2: Upload file directly to MinIO via presigned URL
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setProgress(20 + (e.loaded / e.total) * 70)
        })
        xhr.addEventListener('load', () => {
          xhr.status === 200 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status})`))
        })
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
        xhr.open('PUT', uploadUrl, true)
        xhr.setRequestHeader('Content-Type', mimeType)
        xhr.send(file)
      })

      setProgress(92)

      // Step 3: Confirm upload and queue normalisation job
      await confirmMutation.mutateAsync({ submissionId, manuscriptId, minioKey: key })

      setProgress(100)
      toast.success('Manuscript uploaded successfully!')
      await onUploadComplete(file, key, manuscriptId)

      if (fileInputRef.current) fileInputRef.current.value = ''
      setProgress(0)
      setSelected(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
      setProgress(0)
      setSelected(null)
    } finally {
      setIsUploading(false)
    }
  }, [submissionId, maxSize, getUrlMutation, confirmMutation, onUploadComplete])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (isUploading || disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!isUploading && !disabled) setDragOver(true)
  }

  return (
    <div className="space-y-4">
      <div
        onClick={() => !isUploading && !disabled && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        className={[
          'relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer select-none',
          isUploading || disabled
            ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
            : dragOver
              ? 'border-blue-500 bg-blue-50 scale-[1.01]'
              : 'border-blue-300 bg-blue-50/60 hover:bg-blue-100 hover:border-blue-400',
        ].join(' ')}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          disabled={isUploading || disabled}
          accept={ACCEPT_EXTENSIONS}
          className="hidden"
          aria-label="Upload manuscript"
        />

        {isUploading ? (
          <div className="space-y-3">
            <FileText className="mx-auto h-10 w-10 text-blue-500 animate-pulse" />
            <p className="text-sm font-medium text-gray-700">
              Uploading {selected?.name}…
            </p>
            <div className="mx-auto max-w-xs">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{Math.round(progress)}%</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className={`mx-auto h-10 w-10 transition-colors ${dragOver ? 'text-blue-600' : 'text-blue-400'}`} />
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {dragOver ? 'Drop to upload' : 'Click to upload or drag & drop'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                DOCX · ODT · RTF · LaTeX · PDF · ZIP/7Z · Markdown · plain text &mdash; up to {formatBytes(maxSize)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Format reference */}
      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700 select-none">
          Supported formats
        </summary>
        <ul className="mt-2 ml-4 space-y-0.5 list-disc">
          {Object.entries({
            'Word':         '.docx, .doc',
            'OpenDocument': '.odt',
            'Rich Text':    '.rtf',
            'LaTeX':        '.tex, .latex, .ltx',
            'Markdown':     '.md, .markdown',
            'Plain text':   '.txt',
            'PDF':          '.pdf',
            'Archive':      '.zip, .7z (e.g. LaTeX bundle with assets)',
          }).map(([fmt, exts]) => (
            <li key={fmt}><span className="font-medium">{fmt}</span> — {exts}</li>
          ))}
        </ul>
      </details>

      <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-blue-800">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>Your manuscript will be normalised to a standard format to ensure compatibility across the review pipeline.</span>
      </div>
    </div>
  )
}
