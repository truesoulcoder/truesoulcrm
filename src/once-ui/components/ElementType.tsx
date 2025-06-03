// src/once-ui/components/ElementType.tsx
import React, { forwardRef, HTMLAttributes } from 'react';

export interface ElementTypeProps extends HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  children?: React.ReactNode;
  href?: string;
  // Explicitly type common event handlers and attributes if needed,
  // otherwise rely on React.HTMLAttributes<HTMLElement> for broader coverage.
  // For example:
  // onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  // className?: string;
  // style?: React.CSSProperties;
}

const ElementType = forwardRef<HTMLElement, ElementTypeProps>(
  ({ as, children, href, ...props }, ref) => {
    // Infer the element type
    // If 'as' is provided, use it. If 'href' is present, default to 'a'. Otherwise, 'div'.
    const Component = as || (href ? 'a' : 'div');

    // Cast props to 'any' for now to simplify spreading onto various element types.
    // A more robust solution might involve conditional props based on 'as'.
    return (
      <Component ref={ref} href={href} {...(props as any)}>
        {children}
      </Component>
    );
  }
);

ElementType.displayName = 'ElementType';

export { ElementType };
// Removed 'export type { ElementTypeProps };' as it's already exported with 'export interface ElementTypeProps'
