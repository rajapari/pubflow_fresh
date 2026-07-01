import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { template: '%s | PubFlow Reader', default: 'PubFlow Reader' },
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-xs font-bold text-white">P</span>
            PubFlow
          </a>
          <a href="/dashboard" className="text-sm text-brand-600 hover:underline">Editorial Dashboard →</a>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mt-16 border-t border-gray-100 py-8 text-center text-xs text-gray-400">
        Powered by <a href="/" className="hover:underline">PubFlow</a>
      </footer>
    </div>
  )
}
