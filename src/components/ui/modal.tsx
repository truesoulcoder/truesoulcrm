import { type ReactNode } from 'react';
import { 
  Modal as HeroNextModal, // Renamed to avoid potential future naming conflicts with HTML elements
  ModalContent, 
  ModalHeader, 
  ModalBody,
  // ModalFooter, // Not used in this generic wrapper, children define their own footers
  type ModalProps as HeroNextModalProps // To get HeroUI's backdrop type
} from '@heroui/react'; 

interface CustomModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  className?: string; // For overall modal width/height styling, e.g., "w-full max-w-md"
  // Explicit backdrop prop, defaulting to 'blur' or 'opaque'
  backdrop?: HeroNextModalProps['backdrop']; // Use HeroUI's defined backdrop types
  scrollBehavior?: HeroNextModalProps['scrollBehavior'];
}

export function Modal({ 
  isOpen, 
  onClose, 
  children, 
  title, 
  className = '',
  backdrop = 'blur', // Default backdrop behavior
  scrollBehavior = 'inside' // Default scroll behavior
}: CustomModalProps) {

  if (!isOpen) return null;

  // Extract sizing classes from className to apply to Modal.
  // This is a basic approach; more sophisticated parsing might be needed if complex classes are used.
  const sizeClasses = className.split(' ').filter(cls => 
    cls.startsWith('w-') || cls.startsWith('max-w-') || cls.startsWith('h-') || cls.startsWith('max-h-')
  ).join(' ');
  
  // The `no-backdrop` class previously used in LeadFormModal would translate to backdrop="transparent"
  // This logic should ideally be handled by the calling component by passing the correct `backdrop` prop.
  // For now, if 'no-backdrop' is in className, we will override the backdrop prop.
  // A better long-term solution is to remove 'no-backdrop' from className in LeadFormModal
  // and have it pass backdrop="transparent" directly.
  let effectiveBackdrop = backdrop;
  if (className.includes('no-backdrop')) {
    effectiveBackdrop = 'transparent';
  }

  return (
    <HeroNextModal 
      isOpen={isOpen} 
      // onOpenChange is typically (isOpen: boolean) => void.
      // We only want to call onClose when the modal is being closed.
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      backdrop={effectiveBackdrop}
      scrollBehavior={scrollBehavior}
      // Apply sizing classes directly to the Modal or use classNames prop if available for specific parts
      // For overall modal dialog/panel sizing, it's often a direct className or a specific slot in classNames
      // Assuming HeroUI Modal passes className to the main modal panel/dialog.
      // If not, classNames={{ panel: sizeClasses }} or similar would be used.
      className={sizeClasses} // Pass size classes directly
    >
      <ModalContent>
        {/* ModalContent often provides an internal onClose, useful for a close button in ModalHeader */}
        {/* For now, we assume HeroUI's default close button behavior or the parent onClose handles it. */}
        <> 
          {title && (
            <ModalHeader className="font-bold text-lg"> {/* Basic styling for header */}
              {title}
            </ModalHeader>
          )}
          <ModalBody>
            {children}
          </ModalBody>
          {/* 
            Footers are currently handled within the children of LeadFormModal and ColumnSelectorModal.
            If a consistent footer is desired, ModalFooter could be added here,
            but it would require changes to how children are passed or a new prop for footer content.
          */}
        </>
      </ModalContent>
    </HeroNextModal>
  );
}
