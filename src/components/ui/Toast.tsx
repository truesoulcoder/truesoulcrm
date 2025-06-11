import React, { useEffect } from 'react';
import { X } from 'lucide-react'; // Using lucide-react for the close icon

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

// Tailwind CSS classes for different toast types, including dark mode and borders
const typeStyles: Record<string, string> = {
  success: 'bg-green-50 dark:bg-green-800 text-green-700 dark:text-green-100 border border-green-300 dark:border-green-600',
  error: 'bg-red-50 dark:bg-red-800 text-red-700 dark:text-red-100 border border-red-300 dark:border-red-600',
  info: 'bg-blue-50 dark:bg-blue-800 text-blue-700 dark:text-blue-100 border border-blue-300 dark:border-blue-600',
  // An alternative for info, if a more neutral gray is preferred:
  // info: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600',
};

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose, duration = 3000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div 
      className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 ${typeStyles[type]}`}
      role="alert"
    >
      {/* Icons can be kept as emojis or replaced with HeroUI/lucide-react icons if desired */}
      {type === 'success' && <span className="text-xl">✅</span>}
      {type === 'error' && <span className="text-xl">❌</span>}
      {type === 'info' && <span className="text-xl">ℹ️</span>}
      
      <span className="flex-grow">{message}</span>
      
      <button 
        className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-current"
        onClick={onClose}
        aria-label="Close toast"
      >
        <X size={18} /> {/* Using Lucide X icon */}
      </button>
    </div>
  );
};

export default Toast;
