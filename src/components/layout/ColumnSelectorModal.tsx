import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal'; // Custom Modal wrapper
import { Button, Checkbox } from '@heroui/react'; // HeroUI components

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

  useEffect(() => {
    setTempVisibility(currentVisibility);
  }, [currentVisibility, isOpen]);

  const handleCheckboxChange = (columnKey: string, checked: boolean) => {
    setTempVisibility(prev => ({
      ...prev,
      [columnKey]: checked,
    }));
  };

  const handleSave = () => {
    onSave(tempVisibility);
    onClose();
  };

  const handleCancel = () => {
    setTempVisibility(currentVisibility); 
    onClose();
  };

  // The Modal component from @/components/ui/modal now needs to provide ModalHeader, ModalBody, ModalFooter
  // or allow content to be structured accordingly.
  // For this refactor, we assume Modal can take children and we structure them.
  // The title prop of Modal is used.
  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title="Select Columns to Display">
      {/* ModalBody equivalent */}
      <div className="p-4 sm:p-6"> {/* Added padding assuming ModalBody would have it */}
        <div className="space-y-3"> {/* Adjusted spacing */}
          {allColumns.map(col => (
            <div key={col.key} className="flex items-center">
              <Checkbox
                id={`col-checkbox-${col.key}`}
                isSelected={tempVisibility[col.key] ?? false}
                onValueChange={(checked) => handleCheckboxChange(col.key, checked)} // HeroUI Checkbox might use onValueChange
                color="primary" // Assuming HeroUI Checkbox takes a color prop
              >
                {/* HeroUI Checkbox might take children as label, or have a label prop */}
                {/* For now, using a separate label element for compatibility */}
              </Checkbox>
              <label htmlFor={`col-checkbox-${col.key}`} className="ml-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                {col.label}
              </label>
            </div>
          ))}
        </div>
      </div>
      
      {/* ModalFooter equivalent */}
      <div className="flex justify-end items-center gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
        <Button variant="outline" onClick={handleCancel}> {/* Changed ghost to outline for better visibility */}
          Cancel
        </Button>
        <Button color="primary" onClick={handleSave}>
          Save
        </Button>
      </div>
    </Modal>
  );
};

export default ColumnSelectorModal;
