import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal'; // Adjust path if necessary

interface ColumnSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  allColumns: Array<{ key: string; label: string }>;
  currentVisibility: { [key: string]: boolean };
  onSave: (newVisibility: { [key: string]: boolean }) => void;
}

const ColumnSelectorModal: React.FC<ColumnSelectorModalProps> = ({
  isOpen,
  onClose,
  allColumns,
  currentVisibility,
  onSave,
}) => {
  const [tempVisibility, setTempVisibility] = useState<{ [key: string]: boolean }>(currentVisibility);

  // Effect to update tempVisibility when currentVisibility prop changes (e.g., modal reopened)
  useEffect(() => {
    setTempVisibility(currentVisibility);
  }, [currentVisibility, isOpen]); // Also depend on isOpen to reset when modal re-opens

  const handleCheckboxChange = (columnKey: string) => {
    setTempVisibility(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey],
    }));
  };

  const handleSave = () => {
    console.log('[ColumnSelectorModal] Saving tempVisibility:', tempVisibility); // Added console log
    onSave(tempVisibility);
    onClose(); // Or onSave could handle closing if preferred
  };

  const handleCancel = () => {
    setTempVisibility(currentVisibility); // Reset changes
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title="Select Columns to Display">
      <div className="space-y-4">
        {allColumns.map(col => (
          <div key={col.key} className="flex items-center">
            <input
              type="checkbox"
              id={`col-checkbox-${col.key}`}
              className="checkbox checkbox-primary"
              checked={tempVisibility[col.key] ?? false} // Default to false if key somehow missing
              onChange={() => handleCheckboxChange(col.key)}
            />
            <label htmlFor={`col-checkbox-${col.key}`} className="ml-2 cursor-pointer">
              {col.label}
            </label>
          </div>
        ))}
      </div>
      <div className="modal-action mt-6">
        <button className="btn btn-ghost" onClick={handleCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave}>
          Save
        </button>
      </div>
    </Modal>
  );
};

export default ColumnSelectorModal;
