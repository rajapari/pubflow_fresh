import React from 'react'
import { cn } from '@/lib/utils'

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  helperText?: string
}

export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, helperText, className, ...props }, ref) => (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {props.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        {...props}
        ref={ref}
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
)
FormField.displayName = 'FormField'

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
  helperText?: string
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, helperText, className, ...props }, ref) => (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {props.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        {...props}
        ref={ref}
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
)
TextArea.displayName = 'TextArea'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  options: Array<{ value: string; label: string }>
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className, ...props }, ref) => (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {props.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        {...props}
        ref={ref}
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
)
Select.displayName = 'Select'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, children, className, ...props }: ButtonProps) {
  const variantClasses = {
    primary:   'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
    danger:    'bg-red-600 text-white hover:bg-red-700',
    outline:   'border-2 border-gray-300 text-gray-900 hover:bg-gray-50',
  }

  const sizeClasses = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  }

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={cn(
        'rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors',
        variantClasses[variant],
        sizeClasses[size],
        loading || props.disabled ? 'opacity-50 cursor-not-allowed' : '',
        className,
      )}
    >
      {loading ? <span className="inline-block animate-spin mr-2">⟳</span> : null}
      {children}
    </button>
  )
}
