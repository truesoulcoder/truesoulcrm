import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Button as HeroButton, type ButtonProps as HeroButtonProps } from '@heroui/react'; // Import HeroUI Button and its props

// Existing DaisyUI based types (can be deprecated or kept for compatibility layer)
type ButtonVariant = 
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'ghost'
  | 'link'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'default'; // Added default to map DaisyUI's plain 'btn'

type ButtonSize = 'lg' | 'md' | 'sm' | 'xs';

interface CustomButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  outline?: boolean;
  active?: boolean; // Will be ignored as HeroUI might not have a direct equivalent
  disabled?: boolean;
  loading?: boolean;
  wide?: boolean;
  circle?: boolean;
  square?: boolean;
  noAnimation?: boolean; // Will be ignored
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, CustomButtonProps>((
  {
    children,
    className = '',
    variant = 'default', // Default to 'default' to map to HeroUI's default button
    size = 'md',
    outline = false,
    active = false, // Ignored
    disabled = false,
    loading = false,
    wide = false,
    circle = false,
    square = false,
    noAnimation = false, // Ignored
    startIcon,
    endIcon,
    ...props
  },
  ref
) => {
    // Map CustomButtonProps to HeroButtonProps
    let heroColor: HeroButtonProps['color'] = 'default';
    let heroVariant: HeroButtonProps['variant'] = 'solid'; // Default HeroUI variant
    let heroSize: HeroButtonProps['size'] = 'md';

    // Map size
    switch (size) {
      case 'lg': heroSize = 'lg'; break;
      case 'md': heroSize = 'md'; break;
      case 'sm': heroSize = 'sm'; break;
      case 'xs': heroSize = 'sm'; break; // Map xs to sm
      default: heroSize = 'md';
    }

    // Map variant and color
    // DaisyUI variant often implies color. 'ghost' and 'link' are more like variants in HeroUI.
    switch (variant) {
      case 'primary': heroColor = 'primary'; break;
      case 'secondary': heroColor = 'secondary'; break;
      case 'accent': heroColor = 'default'; break; // No direct 'accent' in HeroUI, map to default or secondary
      case 'info': heroColor = 'default'; break;    // Assuming 'info' maps to a default/primary style or needs specific color if available
      case 'success': heroColor = 'success'; break;
      case 'warning': heroColor = 'warning'; break;
      case 'error': heroColor = 'danger'; break;   // DaisyUI 'error' maps to HeroUI 'danger'
      case 'ghost': 
        heroVariant = 'ghost'; 
        // For ghost, color can still be applied, e.g. <Button color="primary" variant="ghost">
        // We'll let a subsequent `outline` override this if needed, or specific color can be set.
        // If no specific color is implied by 'ghost' itself, 'default' is fine.
        heroColor = 'default'; // Or allow it to be primary, secondary etc. if desired for ghost buttons
        break;
      case 'link': 
        heroVariant = 'light'; // HeroUI 'light' variant often used for link-like buttons
        heroColor = 'primary'; // Links are often primary colored
        break;
      case 'default':
        heroColor = 'default';
        break;
      default:
        heroColor = 'default';
    }

    // Outline prop overrides variant to 'bordered', color remains as mapped.
    if (outline) {
      heroVariant = 'bordered';
      // If variant was 'ghost' or 'link', 'bordered' takes precedence.
      // Color should still be applied, e.g., primary bordered button.
    }
    
    // Combine incoming className with w-full if wide is true
    const combinedClassName = wide ? `w-full ${className}`.trim() : className;

    return (
      <HeroButton
        ref={ref}
        color={heroColor}
        variant={heroVariant}
        size={heroSize}
        isDisabled={disabled || loading} // HeroUI uses isDisabled
        isLoading={loading}
        isIconOnly={circle || square}
        startContent={startIcon} // HeroUI uses startContent
        endContent={endIcon}     // HeroUI uses endContent
        className={combinedClassName}
        {...props}
      >
        {children}
      </HeroButton>
    );
  }
);

Button.displayName = 'Button';

export { Button };
export type { CustomButtonProps as ButtonProps, ButtonVariant, ButtonSize }; // Export original types for compatibility
