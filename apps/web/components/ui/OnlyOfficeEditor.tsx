'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (containerId: string, config: object) => {
        destroyEditor?: () => void
      }
    }
  }
}

interface OnlyOfficeEditorProps {
  onlyofficeUrl: string
  config: {
    document: {
      fileType: string
      key: string
      title: string
      url: string
    }
    editorConfig: {
      callbackUrl: string
      user: { id: string; name: string; email: string }
      customization: { autosave: boolean; forcesave: boolean; commentAuthorOnly: boolean }
    }
    permissions: {
      comment: boolean
      download: boolean
      edit: boolean
      print: boolean
      review: boolean
    }
  }
  token: string
}

const CONTAINER_ID = 'onlyoffice-container'

export function OnlyOfficeEditor({ onlyofficeUrl, config, token }: OnlyOfficeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef    = useRef<{ destroyEditor?: () => void } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    const containerId = CONTAINER_ID

    function initEditor() {
      if (!containerRef.current || !window.DocsAPI) return
      try {
        editorRef.current = new window.DocsAPI.DocEditor(containerId, { ...config, token })
        setIsLoading(false)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to initialize editor'
        setError(msg)
        setIsLoading(false)
        toast.error(msg)
      }
    }

    const scriptId = 'onlyoffice-api'
    const existing = document.getElementById(scriptId)

    if (existing) {
      // Script tag already in DOM — DocsAPI may already be available
      if (window.DocsAPI) {
        initEditor()
      } else {
        existing.addEventListener('load', initEditor, { once: true })
      }
    } else {
      const script   = document.createElement('script')
      script.id      = scriptId
      script.src     = `${onlyofficeUrl}/web-apps/apps/api/documents/api.js`
      script.async   = true
      script.onload  = initEditor
      script.onerror = () => {
        setError('Failed to load OnlyOffice API. Is OnlyOffice running?')
        setIsLoading(false)
        toast.error('Failed to load OnlyOffice editor')
      }
      document.head.appendChild(script)
    }

    return () => {
      try { editorRef.current?.destroyEditor?.() } catch { /* ignore */ }
      editorRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // config/token are stable for the lifetime of this editor instance

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        <p className="font-medium">Editor Error</p>
        <p className="text-sm">{error}</p>
        <p className="mt-2 text-xs text-red-600">
          Make sure OnlyOffice is running at {onlyofficeUrl}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg overflow-hidden shadow">
      {isLoading && (
        <div className="flex items-center justify-center h-96 bg-gray-50">
          <div className="text-center">
            <div className="inline-block h-10 w-10 animate-spin rounded-full border-b-2 border-brand-500" />
            <p className="mt-4 text-sm text-gray-600">Loading editor…</p>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        id={CONTAINER_ID}
        className={isLoading ? 'hidden' : 'flex-1'}
        style={{ minHeight: '600px' }}
      />
    </div>
  )
}
