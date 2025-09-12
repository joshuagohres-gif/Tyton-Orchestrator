'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base styles
  `
    inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium 
    transition-all duration-[var(--transition-duration)] focus-visible:outline-none 
    focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none 
    disabled:opacity-50 active:translate-y-[1px]
  `,
  {
    variants: {
      variant: {
        default: `
          bg-gradient-surface border border-border text-text 
          hover:border-accent hover:shadow-glow hover:bg-gradient-gold hover:text-accent-contrast
        `,
        primary: `
          bg-gradient-gold border border-accent text-accent-contrast 
          hover:shadow-glow hover:brightness-110
        `,
        secondary: `
          bg-surface border border-border text-text 
          hover:border-accent hover:bg-bg-elev
        `,
        outline: `
          border-2 border-accent bg-transparent text-accent 
          hover:bg-accent hover:text-accent-contrast hover:shadow-glow
        `,
        ghost: `
          text-text hover:bg-bg-elev hover:text-accent
        `,
        danger: `
          bg-red-600 border border-red-500 text-white 
          hover:bg-red-700 hover:shadow-[0_0_24px_rgba(239,68,68,0.16)]
        `,
      },
      size: {
        default: 'h-10 px-4 py-2 text-sm',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-12 rounded-2xl px-8 text-base',
        xl: 'h-14 rounded-2xl px-10 text-lg',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };