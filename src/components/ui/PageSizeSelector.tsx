// src/components/ui/PageSizeSelector.tsx
'use client';

import React from 'react';

interface PageSizeSelectorProps {
  selectedPageSize: number;
  onPageSizeChange: (size: number) => void;
  options?: number[];
  disabled?: boolean;
}

const PageSizeSelector: React.FC<PageSizeSelectorProps> = ({
  selectedPageSize,
  onPageSizeChange,
  options = [10, 25, 50, 100],
  disabled = false,
}) => {
  const handleSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onPageSizeChange(Number(event.target.value));
  };

  return (
    <div className="form-control">
      <label className="label">
        <span className="label-text">Rows per page:</span>
      </label>
      <select
        className="select select-bordered select-sm w-full max-w-xs"
        value={selectedPageSize}
        onChange={handleSizeChange}
        disabled={disabled}
      >
        {options.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </div>
  );
};

export default PageSizeSelector;
