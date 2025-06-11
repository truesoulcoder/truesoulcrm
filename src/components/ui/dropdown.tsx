'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { 
    Dropdown as HeroDropdown, 
    DropdownTrigger, 
    DropdownMenu, 
    DropdownItem as HeroDropdownItem, 
    DropdownSection,
    // Assuming HeroUI might have a specific divider or DropdownItem can act as one.
    // No specific Divider component imported for now, will use DropdownItem with a prop or a custom element.
    type DropdownProps as HeroDropdownProps,
    type DropdownItemProps as HeroDropdownItemProps,
    type DropdownMenuProps as HeroDropdownMenuProps,
} from '@heroui/react'; 

// Types from the old component
type OldDropdownPosition = 'top' | 'bottom' | 'left' | 'right';
type OldDropdownAlign = 'start' | 'center' | 'end';
type OldDropdownHover = boolean | 'click' | 'hover';

interface CustomDropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  position?: OldDropdownPosition;
  align?: OldDropdownAlign;
  hover?: OldDropdownHover;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean; // Will be mapped to isOpen if HeroDropdown is controlled
  onOpenChange?: (isOpen: boolean) => void; // Will be mapped to onOpenChange
  isOpen?: boolean; // For controlled component
}

// Helper to map old position/align to HeroUI placement
const mapPlacement = (position: OldDropdownPosition = 'bottom', align: OldDropdownAlign = 'start'): HeroDropdownProps['placement'] => {
  if (position === 'left' || position === 'right') {
    return `${position}-${align === 'center' ? 'center' : align === 'start' ? 'start' : 'end'}` as HeroDropdownProps['placement'];
  }
  // For top/bottom, HeroUI might use 'center' for 'middle', 'start' for 'left', 'end' for 'right'
  if (align === 'center') return `${position}-center` as HeroDropdownProps['placement']; // Or just position if center is default for that axis
  return `${position}-${align}` as HeroDropdownProps['placement'];
};

function Root({
  trigger,
  children,
  position = 'bottom',
  align = 'start',
  hover = 'click',
  className = '',
  contentClassName = '',
  defaultOpen, // Used if isOpen is not provided, for uncontrolled mode
  onOpenChange,
  isOpen, // For controlled mode
}: CustomDropdownProps) {
  
  if (hover === 'hover') {
    console.warn("Dropdown: Hover functionality is deprecated. Please use click activation.");
  }

  const placement = mapPlacement(position, align);

  // HeroDropdown can be controlled or uncontrolled.
  // If `isOpen` is provided, it's controlled. Otherwise, use `defaultOpen`.
  const controlledProps: Partial<HeroDropdownProps> = {};
  if (isOpen !== undefined) {
    controlledProps.isOpen = isOpen;
  } else if (defaultOpen !== undefined) {
    controlledProps.defaultOpen = defaultOpen;
  }
  
  return (
    <HeroDropdown 
      placement={placement} 
      className={cn(className)}
      onOpenChange={onOpenChange}
      {...controlledProps}
    >
      <DropdownTrigger>
        {/* The original component had a div with w-full here.
            The trigger content itself should handle its display. */}
        {trigger}
      </DropdownTrigger>
      <DropdownMenu 
        aria-label="Dropdown actions" 
        className={cn(contentClassName)} // Apply contentClassName to DropdownMenu
        // HeroUI DropdownMenu might have its own default styling for shadow, bg, rounded, width.
        // The old classes 'menu p-2 shadow bg-base-100 rounded-box w-52' are removed.
      >
        {children}
      </DropdownMenu>
    </HeroDropdown>
  );
}

interface CustomDropdownItemProps extends React.HTMLAttributes<HTMLLIElement> { // Keep HTMLAttributes for ...props compatibility
  active?: boolean; // Map to isSelected or rely on className
  disabled?: boolean;
  icon?: ReactNode;
  badge?: ReactNode;
  submenu?: ReactNode; // Submenus are complex, will be ignored for now with a warning
  onClick?: () => void; // Ensure onClick is passed
}

function Item({
  children,
  className = '',
  active = false,
  disabled = false,
  icon,
  badge,
  submenu,
  onClick,
  ...props // Pass rest of the props like `key`
}: CustomDropdownItemProps) {

  if (submenu) {
    console.warn("DropdownItem: Submenu functionality is not directly supported in this refactor. Consider using nested Dropdowns if HeroUI supports them, or redesigning the interaction.");
  }
  
  // Assuming HeroUI DropdownItem uses props like isDisabled, startContent, endContent
  // `active` state might be handled by `isSelected` or custom class if needed.
  // For now, active is not directly mapped unless HeroDropdownItem has `isSelected`.
  return (
    <HeroDropdownItem
      isDisabled={disabled}
      startContent={icon}
      endContent={badge}
      // isSelected={active} // If HeroUI has an isSelected prop
      className={cn(className, { 'font-semibold': active })} // Example: make active items bold
      onClick={onClick}
      textValue={typeof children === 'string' ? children : undefined} // For accessibility if HeroUI needs it
      {...props} 
    >
      {children}
    </HeroDropdownItem>
  );
}

function Divider() {
  // HeroUI might have a specific DropdownDivider component or allow an item to be a divider.
  // Using a simple hr as a fallback.
  // A more robust solution would be <HeroDropdownItem isDivider /> if supported,
  // or <DropdownSection><hr /></DropdownSection>
  return <hr className="my-1 border-gray-200 dark:border-gray-700" />; 
  // Alternatively, if DropdownSection can be empty and just provide spacing/line:
  // return <DropdownSection className="my-1 border-t border-gray-200 dark:border-gray-700" />;
}

function Header({ children }: { children: ReactNode }) {
  // Use DropdownSection for headers if it supports rendering a title or children directly as a header.
  // Or, style a non-interactive DropdownItem.
  // For simplicity, using DropdownSection with a styled h3.
  // This assumes DropdownSection renders its children.
  return (
    <DropdownSection>
      {/* 
        If DropdownSection has a title prop: <DropdownSection title={children} /> 
        Otherwise, render children within it, styled appropriately.
        The old class was 'menu-title'.
      */}
      <h3 className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
        {children}
      </h3>
    </DropdownSection>
  );
}

const DropdownNamespace = {
  Root: Root,
  Item: Item,
  Divider: Divider,
  Header: Header,
};

export default DropdownNamespace;
export type { CustomDropdownProps, CustomDropdownItemProps };
