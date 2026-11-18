import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-signal text-signal-ink hover:bg-signal-hover active:translate-y-px disabled:bg-line disabled:text-faint font-medium',
  secondary: 'bg-overlay text-fg hairline hover:bg-hover active:translate-y-px disabled:text-faint',
  ghost: 'text-muted hover:text-fg hover:bg-overlay disabled:text-faint disabled:hover:bg-transparent',
  danger: 'text-danger hover:bg-danger/10',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'size-10 rounded-xl justify-center',
  'icon-sm': 'size-8 rounded-lg justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center whitespace-nowrap transition-[background-color,color,transform,box-shadow] duration-150',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      <span className={cn('inline-flex items-center gap-[inherit]', loading && 'opacity-0')}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        </span>
      )}
    </button>
  );
});
