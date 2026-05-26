'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { ArrowRight, Mail, Lock, User, Check } from 'lucide-react'
import { toast } from 'sonner'

export default function SignupPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    agree: false,
  })
  const [isLoading, setIsLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validation
    if (!formData.name.trim()) {
      toast.error('Please enter your name')
      return
    }
    if (!formData.email.includes('@')) {
      toast.error('Please enter a valid email')
      return
    }
    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (!formData.agree) {
      toast.error('Please accept the terms and conditions')
      return
    }

    setIsLoading(true)
    try {
      // Simulate signup
      toast.success('Account created successfully!')
      // Store demo token
      localStorage.setItem('pubflow_token', 'demo-token-' + Date.now())
      router.push('/dashboard')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthSignup = (provider: 'keycloak' | 'google' | 'github') => {
    setIsLoading(true)
    // In production, this would redirect to Keycloak OAuth endpoint
    const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080'
    const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'pubflow'
    const redirectUri = `${window.location.origin}/auth/callback`
    
    const oauthUrl = `${keycloakUrl}/realms/master/protocol/openid-connect/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid&kc_action=register`
    window.location.href = oauthUrl
  }

  return (
    <>
      <Header isAuthenticated={false} />
      
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Signup Card */}
          <div className="rounded-2xl bg-white p-8 shadow-xl">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-gray-900">Create Account</h1>
              <p className="mt-2 text-gray-600">Join PubFlow and streamline your publishing</p>
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleOAuthSignup('keycloak')}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z" />
                </svg>
                Sign up with SSO
              </button>
            </div>

            {/* Divider */}
            <div className="mb-6 flex items-center">
              <div className="flex-1 border-t border-gray-200" />
              <span className="px-3 text-sm text-gray-500">Or sign up with email</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            {/* Signup Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    id="name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="John Doe"
                    className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">At least 8 characters</p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    id="confirmPassword"
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
                    required
                  />
                </div>
              </div>

              <div className="flex items-start gap-2">
                <input
                  id="agree"
                  type="checkbox"
                  name="agree"
                  checked={formData.agree}
                  onChange={handleChange}
                  className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  required
                />
                <label htmlFor="agree" className="text-sm text-gray-600 cursor-pointer">
                  I agree to the{' '}
                  <Link href="/terms" className="font-medium text-blue-600 hover:text-blue-700">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="font-medium text-blue-600 hover:text-blue-700">
                    Privacy Policy
                  </Link>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2.5 font-medium text-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
              >
                {isLoading ? 'Creating account...' : 'Create Account'}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            {/* Sign In Link */}
            <div className="mt-6 text-center">
              <p className="text-gray-600">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          {/* Feature Highlight */}
          <div className="mt-8 rounded-lg bg-white bg-opacity-60 backdrop-blur p-4">
            <div className="space-y-2">
              <div className="flex gap-2 text-sm text-gray-700">
                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span>14-day free trial. No credit card required.</span>
              </div>
              <div className="flex gap-2 text-sm text-gray-700">
                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span>Access all features from day one</span>
              </div>
              <div className="flex gap-2 text-sm text-gray-700">
                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}
