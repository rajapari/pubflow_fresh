'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { CreditCard, CheckCircle, ArrowUpRight, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/components/providers'

const PLANS = [
  {
    key: 'STARTER',
    label: 'Starter',
    price: 'Free',
    features: ['1 publication', 'Up to 50 submissions/yr', 'Peer review workflow', 'Basic typesetting'],
    highlight: false,
  },
  {
    key: 'PROFESSIONAL',
    label: 'Professional',
    price: '$149/mo',
    features: ['Unlimited publications', 'Unlimited submissions', 'DOI registration', 'Advanced analytics', 'Priority support'],
    highlight: true,
  },
  {
    key: 'ENTERPRISE',
    label: 'Enterprise',
    price: '$499/mo',
    features: ['Everything in Professional', 'Custom branding', 'SSO / SAML', 'Dedicated support', 'SLA guarantee'],
    highlight: false,
  },
] as const

export default function BillingPage() {
  const searchParams   = useSearchParams()
  const planQ          = trpc.billing.getCurrentPlan.useQuery()
  const checkoutM      = trpc.billing.createCheckoutSession.useMutation()
  const portalM        = trpc.billing.getPortalUrl.useMutation()

  useEffect(() => {
    if (searchParams.get('success') === '1') toast.success('Subscription activated! Welcome to your new plan.')
    if (searchParams.get('cancelled') === '1') toast.info('Checkout cancelled — your plan was not changed.')
  }, [searchParams])

  const currentPlan = planQ.data?.plan ?? 'STARTER'
  const sub         = planQ.data?.subscription as any

  async function handleUpgrade(plan: 'PROFESSIONAL' | 'ENTERPRISE') {
    try {
      const res = await checkoutM.mutateAsync({ plan })
      if (res.url) window.location.href = res.url
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to start checkout')
    }
  }

  async function handleManage() {
    try {
      const res = await portalM.mutateAsync()
      if (res.url) window.location.href = res.url
    } catch (err: any) {
      toast.error(err.message ?? 'Billing portal unavailable — check Stripe configuration')
    }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Billing & Plan</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your subscription and usage</p>
      </div>

      {/* Current plan banner */}
      {sub && (
        <div className={`rounded-xl p-4 border flex items-center gap-4 ${
          sub.status === 'ACTIVE' ? 'bg-green-50 border-green-200' :
          sub.status === 'PAST_DUE' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
        }`}>
          {sub.status === 'ACTIVE' ? <CheckCircle size={20} className="text-green-500 shrink-0" /> :
           sub.status === 'PAST_DUE' ? <AlertCircle size={20} className="text-amber-500 shrink-0" /> :
           <AlertCircle size={20} className="text-gray-400 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {currentPlan} plan — {sub.status}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Renews {new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', { year:'numeric', month:'long', day:'numeric' })}
              {sub.cancelAtPeriodEnd && ' · Cancels at period end'}
            </p>
          </div>
          <button onClick={handleManage} disabled={portalM.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 shrink-0">
            <ArrowUpRight size={12} /> Manage
          </button>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid gap-5 sm:grid-cols-3">
        {PLANS.map(plan => {
          const isCurrent = currentPlan === plan.key
          return (
            <div key={plan.key} className={`rounded-xl border p-6 flex flex-col ${
              plan.highlight ? 'border-brand-300 ring-1 ring-brand-200 bg-brand-50' : 'border-gray-200 bg-white'
            }`}>
              {plan.highlight && (
                <span className="mb-3 self-start rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-medium text-white">Most popular</span>
              )}
              <h2 className="text-lg font-semibold text-gray-900">{plan.label}</h2>
              <p className="mt-1 text-2xl font-bold text-gray-900">{plan.price}</p>

              <ul className="mt-4 flex-1 space-y-2">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle size={14} className="text-brand-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <div className="rounded-lg border border-gray-200 px-4 py-2 text-center text-sm text-gray-400">
                    Current plan
                  </div>
                ) : plan.key === 'STARTER' ? (
                  <div className="rounded-lg border border-gray-200 px-4 py-2 text-center text-sm text-gray-400">
                    {currentPlan !== 'STARTER' ? 'Manage plan to downgrade' : 'Free tier'}
                  </div>
                ) : (
                  <button
                    onClick={() => handleUpgrade(plan.key as 'PROFESSIONAL' | 'ENTERPRISE')}
                    disabled={checkoutM.isPending}
                    className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                      plan.highlight
                        ? 'bg-brand-500 text-white hover:bg-brand-600'
                        : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {checkoutM.isPending ? 'Redirecting…' : `Upgrade to ${plan.label}`}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Billing portal link */}
      {sub && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Billing Portal</h2>
          <p className="text-sm text-gray-500 mb-4">
            Manage payment methods, download invoices, and update billing details.
          </p>
          <button onClick={handleManage} disabled={portalM.isPending}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <CreditCard size={14} /> {portalM.isPending ? 'Opening…' : 'Open Billing Portal'}
          </button>
        </div>
      )}
    </div>
  )
}
