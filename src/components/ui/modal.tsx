import { type ReactNode, type MouseEvent, useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
}

export function Modal({ isOpen, onClose, children, title, className = '' }: ModalProps) {
  const modalRef = useRef<HTMLDialogElement>(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      // Add event listener when modal is open
      document.addEventListener('mousedown', handleClickOutside as any);
      // Show the modal using showModal() API
      modalRef.current?.showModal();
    } else {
      // Close the modal
      modalRef.current?.close();
    }

    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleClickOutside as any);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <dialog ref={modalRef} className={`modal ${className}`}>
      {/* This style block specifically targets the browser's native backdrop for the dialog */}
      <style>{`
        dialog.modal::backdrop {
          background-color: transparent;
        }
      `}</style>
      <div className="modal-box">
        {title && (
          <h3 className="text-lg font-bold mb-4">{title}</h3>
        )}
        <div className="py-4">
          {children}
        </div>
      </div>
      {/* This form is a fallback for backdrop click behavior in older browsers */}
      <form method="dialog" className="modal-backdrop bg-transparent">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}