'use client';

import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
  wrapperClassName?: string;
}

/**
 * Cross-browser styled select — replaces native <select> which looks broken in Safari.
 * Works as a drop-in: supports {...register()} from react-hook-form via forwardRef,
 * and also works as a plain controlled component with value + onChange.
 */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ children, className = '', wrapperClassName = '', ...props }, ref) => (
    <div className={`relative ${wrapperClassName}`}>
      <select
        ref={ref}
        className={`w-full appearance-none bg-white border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400/20 focus:border-amber-400 cursor-pointer transition-colors hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
    </div>
  ),
);
SelectField.displayName = 'SelectField';
