import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

const typeStyles: Record<string, string> = {
  success: 'bg-success text-success-content',
  error: 'bg-error text-error-content',
  info: 'bg-base-300 text-base-content',
};

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose, duration = 3000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded shadow-lg flex items-center gap-2 ${typeStyles[type]}`}
         role="alert">
      {type === 'success' && <span>✅</span>}
      {type === 'error' && <span>❌</span>}
      {type === 'info' && <span>ℹ️</span>}
      <span>{message}</span>
      <button className="ml-2 btn btn-xs btn-ghost" onClick={onClose}>✕</button>
    </div>
  );
};

export default Toast;
