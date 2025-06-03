'use client';

import { type ReactNode, useState, useRef, useEffect } from 'react';

import { cn } from '@/lib/utils';

type DropdownPosition = 'top' | 'bottom' | 'left' | 'right';
type DropdownAlign = 'start' | 'center' | 'end';
type DropdownHover = boolean | 'click' | 'hover';

interface DropdownProps {
  /** The trigger element that opens the dropdown */
  trigger: ReactNode;
  /** Dropdown menu items */
  children: ReactNode;
  /** Position of the dropdown menu */
  position?: DropdownPosition;
  /** Alignment of the dropdown menu */
  align?: DropdownAlign;
  /** Whether to show dropdown on hover instead of click */
  hover?: DropdownHover;
  /** Additional class name for the dropdown */
  className?: string;
  /** Additional class name for the dropdown content */
  contentClassName?: string;
  /** Whether the dropdown is open by default */
  defaultOpen?: boolean;
  /** Callback when dropdown open state changes */
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A flexible dropdown component that supports different triggers and positions.
 * Uses DaisyUI dropdown classes under the hood.
 */
export function Dropdown({
  trigger,
  children,
  position = 'bottom',
  align = 'start',
  hover = 'click',
  className = '',
  contentClassName = '',
  defaultOpen = false,
  onOpenChange,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        onOpenChange?.(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onOpenChange]);

  const toggleDropdown = () => {
    if (hover === 'click') {
      const newState = !isOpen;
      setIsOpen(newState);
      onOpenChange?.(newState);
    }
  };

  // Generate DaisyUI dropdown classes
  const dropdownClasses = [
    'dropdown',
    `dropdown-${position}`,
    `dropdown-${align}`,
    { 'dropdown-hover': hover === 'hover' },
    { 'dropdown-open': isOpen },
    className,
  ];

  const contentClasses = [
    'dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52',
    contentClassName,
  ];

  return (
    <div 
      ref={dropdownRef}
      className={cn(dropdownClasses)}
      onMouseEnter={hover === 'hover' ? () => setIsOpen(true) : undefined}
      onMouseLeave={hover === 'hover' ? () => setIsOpen(false) : undefined}
    >
      <div 
        tabIndex={0} 
        role="button" 
        className="w-full"
        onClick={toggleDropdown}
      >
        {trigger}
      </div>
      
      {isOpen && (
        <div 
          className={cn(contentClasses)}
          tabIndex={0}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Dropdown item component
 */
interface DropdownItemProps extends React.LiHTMLAttributes<HTMLLIElement> {
  /** Whether the item is active */
  active?: boolean;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Optional icon to display before the text */
  icon?: ReactNode;
  /** Optional badge to display after the text */
  badge?: ReactNode;
  /** Optional submenu items */
  submenu?: ReactNode;
}

export function DropdownItem({
  children,
  className = '',
  active = false,
  disabled = false,
  icon,
  badge,
  submenu,
  ...props
}: DropdownItemProps) {
  const itemClasses = [
    'flex items-center justify-between gap-2',
    { active },
    { disabled },
    className,
  ];

  return (
    <li {...props}>
      <a className={cn(itemClasses)}>
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          <span>{children}</span>
        </div>
        {badge && <span className="badge">{badge}</span>}
      </a>
      {submenu && (
        <ul className="p-2 bg-base-100 rounded-box">
          {submenu}
        </ul>
      )}
    </li>
  );
}

/**
 * Dropdown divider component
 */
export function DropdownDivider() {
  return <div className="divider my-1"></div>;
}

/**
 * Dropdown header component
 */
export function DropdownHeader({ children }: { children: ReactNode }) {
  return <li className="menu-title">{children}</li>;
}

// Re-export all components
const DropdownNamespace = {
  Root: Dropdown, // Renaming Dropdown to DropdownNamespace.Root to avoid naming conflict
  Item: DropdownItem,
  Divider: DropdownDivider,
  Header: DropdownHeader,
};

export default DropdownNamespace;
