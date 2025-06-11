// src/components/ui/PageSizeSelector.tsx
'use client';

import React from 'react';
import { Select as HeroSelect, SelectItem as HeroSelectItem, type SelectProps as HeroSelectProps } from '@heroui/react'; // Import HeroUI components

interface PageSizeSelectorProps {
  selectedPageSize: number;
  onPageSizeChange: (size: number) => void;
  options?: number[];
  disabled?: boolean;
  className?: string; // Allow passing custom className for layout
}

const PageSizeSelector: React.FC<PageSizeSelectorProps> = ({
  selectedPageSize,
  onPageSizeChange,
  options = [10, 25, 50, 100],
  disabled = false,
  className = '',
}) => {
  // HeroUI's onSelectionChange typically provides the selected key(s) directly or as a Set.
  // Assuming it's a single key for a single-select dropdown, or a Set from which we take the first item.
  const handleSelectionChange = (selectedKey: HeroSelectProps['selectedKeys'] | string | number | Set<string|number>) => {
    let newSize: number | undefined = undefined;

    if (selectedKey instanceof Set) {
      const firstKey = Array.from(selectedKey)[0];
      if (firstKey !== undefined) {
        newSize = Number(firstKey);
      }
    } else if (typeof selectedKey === 'string' || typeof selectedKey === 'number') {
      newSize = Number(selectedKey);
    }
    
    if (newSize !== undefined && !isNaN(newSize)) {
      onPageSizeChange(newSize);
    }
  };

  return (
    <HeroSelect
      label="Rows per page:"
      // HeroUI Select's selectedKeys usually expects an array of strings for controlled components
      selectedKeys={[String(selectedPageSize)]}
      // Use onSelectionChange if that's HeroUI's API for value changes
      // Some HeroUI components might use `onValueChange` or a more specific prop
      onSelectionChange={handleSelectionChange} 
      isDisabled={disabled}
      size="sm" // Assuming HeroUI Select has a size prop similar to DaisyUI's select-sm
      className={className || "min-w-[180px]"} // Provide a default min-width, allow override
      aria-label="Select page size" // For accessibility
    >
      {options.map((size) => (
        <HeroSelectItem 
          key={String(size)} 
          // value={String(size)} // HeroUI Item often uses its key as its value, or a textValue prop
          textValue={String(size)} // Important for selection manager in HeroUI
        >
          {String(size)}
        </HeroSelectItem>
      ))}
    </HeroSelect>
  );
};

export default PageSizeSelector;
