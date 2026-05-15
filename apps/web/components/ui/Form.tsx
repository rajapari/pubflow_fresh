import React from 'react'
import { cn } from '@/lib/utils'

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  helperText?: string
}

export function FormField({ label, error, helperText, className, ...props }: FormFieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {props.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        {...props}
        className={cn(
          'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
          error ? 'border-red-500 bg-red-50' : 'border-gray-300',
          className,
        )}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
    </div>
  )
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
  helperText?: string
}

export function TextArea({ label, error, helperText, className, ...props }: TextAreaProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {props.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        {...props}
        className={cn(
          'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
          error ? 'border-red-500 bg-red-50' : 'border-gray-300',
          className,
        )}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  options: Array<{ value: string; label: string }>
}

export function Select({ label, error, options, className, ...props }: SelectProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {props.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        {...props}
        className={cn(
          'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
          error ? 'border-red-500 bg-red-50' : 'border-gray-300',
          className,
        )}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  loading?: boolean
}

export function Button({ variant = 'primary', loading, children, className, ...props }: ButtonProps) {
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={cn(
        'px-4 py-2 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors',
        variantClasses[variant],
        loading || props.disabled ? 'opacity-50 cursor-not-allowed' : '',
        className,
      )}
    >
      {loading ? <span className="inline-block animate-spin mr-2">⟳</span> : null}
      {children}
    </button>
  )
}
