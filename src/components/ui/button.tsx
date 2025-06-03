import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'ghost'
  | 'link'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';

type ButtonSize = 'lg' | 'md' | 'sm' | 'xs';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  outline?: boolean;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  wide?: boolean;
  circle?: boolean;
  square?: boolean;
  noAnimation?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>((
  {
    children,
    className = '',
    variant = 'primary',
    size = 'md',
    outline = false,
    active = false,
    disabled = false,
    loading = false,
    wide = false,
    circle = false,
    square = false,
    noAnimation = false,
    startIcon,
    endIcon,
    ...props
  },
  ref
) => {
    const classes = [
      'btn',
      `btn-${variant}`,
      `btn-${size}`,
      outline && 'btn-outline',
      active && 'btn-active',
      disabled && 'btn-disabled',
      loading && 'loading',
      wide && 'btn-wide',
      circle && 'btn-circle',
      square && 'btn-square',
      noAnimation && 'no-animation',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button className={classes} disabled={disabled || loading} ref={ref} {...props}>
        {startIcon && <span className="mr-2">{startIcon}</span>}
        {children}
        {endIcon && <span className="ml-2">{endIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
export type { ButtonProps, ButtonVariant, ButtonSize };
