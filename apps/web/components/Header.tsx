'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Menu, X, LogOut, User } from 'lucide-react'

interface HeaderProps {
  isAuthenticated?: boolean
  userName?: string
  onLogout?: () => void
}

export function Header({ isAuthenticated = false, userName, onLogout }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const router = useRouter()

  const handleLogout = () => {
    onLogout?.()
    router.push('/')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
              <span className="font-bold text-white">PF</span>
            </div>
            <span className="hidden font-bold text-gray-900 sm:inline">PubFlow</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden gap-8 md:flex">
            {!isAuthenticated && (
              <>
                <Link href="/features" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                  Features
                </Link>
                <Link href="/pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                  Pricing
                </Link>
                <Link href="/docs" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                  Docs
                </Link>
              </>
            )}
            {isAuthenticated && (
              <Link href="/dashboard" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Dashboard
              </Link>
            )}
          </nav>

          {/* Auth Actions */}
          <div className="hidden items-center gap-4 md:flex">
            {isAuthenticated ? (
              <div className="flex items-center gap-3 border-l border-gray-200 pl-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{userName || 'User'}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium text-white hover:shadow-lg transition-shadow"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden rounded-lg p-2 text-gray-600 hover:bg-gray-100"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <nav className="border-t border-gray-200 pb-4 md:hidden">
            <div className="space-y-3 pt-4">
              {!isAuthenticated && (
                <>
                  <Link href="/features" className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                    Features
                  </Link>
                  <Link href="/pricing" className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                    Pricing
                  </Link>
                  <Link href="/docs" className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                    Docs
                  </Link>
                  <div className="flex gap-2 border-t border-gray-200 pt-3">
                    <Link
                      href="/login"
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Login
                    </Link>
                    <Link
                      href="/signup"
                      className="flex-1 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-3 py-2 text-center text-sm font-medium text-white"
                    >
                      Sign Up
                    </Link>
                  </div>
                </>
              )}
              {isAuthenticated && (
                <>
                  <Link href="/dashboard" className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                    Dashboard
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Logout
                  </button>
                </>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}
