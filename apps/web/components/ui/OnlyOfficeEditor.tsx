'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (containerId: string, config: object) => object
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
      user: {
        id: string
        name: string
        email: string
      }
      customization: {
        autosave: boolean
        forcesave: boolean
        commentAuthorOnly: boolean
      }
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

export function OnlyOfficeEditor({ onlyofficeUrl, config, token }: OnlyOfficeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load OnlyOffice API script
    const scriptId = 'onlyoffice-api'
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = `${onlyofficeUrl}/web-apps/apps/api/documents/api.js`
      script.async = true
      script.onload = () => {
        setIsLoading(false)
        initEditor()
      }
      script.onerror = () => {
        setError('Failed to load OnlyOffice API')
        setIsLoading(false)
        toast.error('Failed to load OnlyOffice editor')
      }
      document.head.appendChild(script)
    } else {
      setIsLoading(false)
      initEditor()
    }
  }, [onlyofficeUrl])

  const initEditor = () => {
    if (!containerRef.current || !window.DocsAPI) return

    try {
      const editorConfig = {
        ...config,
        token,
      }

      new window.DocsAPI.DocEditor('onlyoffice-container', editorConfig)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize editor'
      setError(message)
      toast.error(message)
    }
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-medium">Editor Error</p>
        <p className="text-sm">{error}</p>
        <p className="text-xs mt-2 text-red-600">Make sure OnlyOffice is running at {onlyofficeUrl}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg overflow-hidden shadow">
      {isLoading && (
        <div className="flex items-center justify-center h-96 bg-gray-50">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading editor...</p>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        id="onlyoffice-container"
        className={`flex-1 ${isLoading ? 'hidden' : 'block'}`}
        style={{ minHeight: '600px' }}
      />
    </div>
  )
}
