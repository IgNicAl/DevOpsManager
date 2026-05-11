import type { ReactNode } from 'react';

interface Props {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}

export default function FormField({ label, htmlFor, error, hint, children }: Props) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1 mb-3 text-on-surface">
      <span className="text-label-xs text-on-surface-variant">{label}</span>
      {children}
      {error && <span className="text-label-xs text-error">{error}</span>}
      {hint && !error && <span className="text-label-xs text-on-surface-variant/70">{hint}</span>}
    </label>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function TextInput({ error, className = '', ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`bg-surface-container-low border ${error ? 'border-error' : 'border-outline-variant'} px-3 py-1.5 text-data-md text-on-surface focus:outline-none focus:border-primary rounded-sm ${className}`}
    />
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export function Select({ error, className = '', children, ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={`bg-surface-container-low border ${error ? 'border-error' : 'border-outline-variant'} px-3 py-1.5 text-data-md text-on-surface focus:outline-none focus:border-primary rounded-sm ${className}`}
    >
      {children}
    </select>
  );
}
