'use client';

import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Corrected import path after renaming
import { LeadUploader } from '@/components/leads/LeadUploader';

interface AppMessage {
  id: string;
  type: 'info' | 'error' | 'success' | 'warning';
  text: string;
}

const LeadsView: React.FC = () => {
  const [messages, setMessages] = useState<AppMessage[]>([]);
  // This state is kept for potential future use where a parent component might
  // want to show a global processing state after an upload is complete.
  const [isProcessingLeads, setIsProcessingLeads] = useState<boolean>(false);

  const handleAddMessage = useCallback((type: AppMessage['type'], text: string) => {
    const newMessage: AppMessage = { id: uuidv4(), type, text };
    setMessages(prevMessages => {
      // Keep only the last 5 messages for a clean UI
      const updatedMessages = [...prevMessages, newMessage];
      return updatedMessages.slice(-5);
    });

    // Automatically dismiss success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        setMessages(prevMessages => prevMessages.filter(msg => msg.id !== newMessage.id));
      }, 5000);
    }
  }, []);

  const handleUploadSuccess = (filename: string, count?: number) => {
    const successMessage = `Successfully uploaded ${filename}.${count ? ` ${count} leads processed.` : ''}`;
    handleAddMessage('success', successMessage);
    // You could trigger a global processing state here if needed
    // setIsProcessingLeads(true); 
  };

  const getAlertClass = (type: AppMessage['type']) => {
    switch (type) {
      case 'success': return 'alert-success';
      case 'error': return 'alert-error';
      case 'warning': return 'alert-warning';
      case 'info':
      default: return 'alert-info';
    }
  };

  const getAlertIcon = (type: AppMessage['type']) => {
    switch (type) {
      case 'success': return <CheckCircle className="stroke-current shrink-0 h-6 w-6" />;
      case 'error': return <XCircle className="stroke-current shrink-0 h-6 w-6" />;
      case 'warning': return <AlertTriangle className="stroke-current shrink-0 h-6 w-6" />;
      case 'info':
      default: return <Info className="stroke-current shrink-0 h-6 w-6" />;
    }
  };

  return (
    <div className="container mx-auto px-0 max-w-full">
      <div className="px-4">
        <div className="mb-8 max-w-full overflow-x-hidden">
          {/* The LeadUploader component is now self-contained. 
              We pass callbacks to receive status updates. */}
          <LeadUploader
            onUploadSuccess={handleUploadSuccess}
            addMessage={handleAddMessage}
            isProcessing={isProcessingLeads}
          />
        </div>

        {/* This message display area can show feedback from various child components or actions */}
        {messages.length > 0 && (
          <div className="space-y-4 mt-6 max-w-full overflow-x-hidden">
            {messages.map((msg) => (
              <div key={msg.id} role="alert" className={`alert ${getAlertClass(msg.type)} shadow-lg max-w-full`}>
                {getAlertIcon(msg.type)}
                <span className="max-w-full overflow-x-auto">{msg.text}</span>
                <button
                  onClick={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}
                  className="btn btn-sm btn-ghost absolute right-2 top-1/2 -translate-y-1/2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadsView;