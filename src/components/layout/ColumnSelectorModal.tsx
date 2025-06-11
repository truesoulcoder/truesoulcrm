import React, { useState, useEffect } from 'react';
// import { Modal } from '@/components/ui/modal'; // Removed custom Modal wrapper
import { 
    Button, 
    Checkbox,
    Modal as HeroModal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
} from '@heroui/react'; // HeroUI components

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
  return (
    <HeroModal 
        isOpen={isOpen} 
        onOpenChange={(open) => !open && handleCancel()}
        backdrop="opaque" // Consistent with LeadFormModal, or 'blur' if preferred
    >
      <ModalContent>
        {(modalOnClose) => ( // modalOnClose can be used for a default close button if needed
          <>
            <ModalHeader>Select Columns to Display</ModalHeader>
            <ModalBody>
              <div className="space-y-3">
                {allColumns.map(col => (
                  <Checkbox
                    key={col.key}
                    isSelected={tempVisibility[col.key] ?? false}
                    onValueChange={(checked) => handleCheckboxChange(col.key, checked)}
                    color="primary"
                    size="sm" // Consistent sizing
                  >
                    {col.label}
                  </Checkbox>
                ))}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={handleCancel}> {/* Using light variant for cancel */}
                Cancel
              </Button>
              <Button color="primary" onPress={handleSave}>
                Save
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </HeroModal>
  );
};

export default ColumnSelectorModal;
