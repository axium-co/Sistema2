'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary:
    'bg-elevated text-fg border border-white/10 hover:bg-white/10 hover:border-white/20',
  secondary: 'bg-transparent text-fg border border-white/10 hover:bg-white/5',
  ghost: 'bg-transparent text-muted hover:text-fg hover:bg-white/5 border border-transparent',
  danger: 'bg-transparent text-danger border border-danger/30 hover:bg-danger/10',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[11px]',
  md: 'h-10 px-5 text-xs',
  lg: 'h-12 px-7 text-sm',
  icon: 'h-9 w-9',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  uppercase?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', uppercase = true, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-bold tracking-wide transition-all duration-150',
        'disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        variants[variant],
        sizes[size],
        uppercase && 'uppercase',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
