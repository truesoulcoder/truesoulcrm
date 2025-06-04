'use client';
// External dependencies
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid'; 

import LeadUploader from '@/components/leads/LeadUploader';

import type { Database } from '@/db_types';

// Define NormalizedLead based on the Database schema
export type NormalizedLead = Database['public']['Tables']['normalized_leads']['Row'];

interface AppMessage {
  id: string;
  type: 'info' | 'error' | 'success' | 'warning';
  text: string;
}

const LeadsView: React.FC = () => {
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [isProcessingLeads, setIsProcessingLeads] = useState<boolean>(false);

  const handleAddMessage = useCallback((type: AppMessage['type'], text: string) => {
    const newMessage: AppMessage = { id: uuidv4(), type, text };
    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages, newMessage];
      // Keep only the last 5 messages
      return updatedMessages.slice(-5);
    });

    if (type === 'success') {
      setTimeout(() => {
        setMessages(prevMessages => prevMessages.filter(msg => msg.id !== newMessage.id));
      }, 5000);
    }
  }, []); // Empty dependency array for useCallback as setMessages is stable

  const handleUploadSuccess = (filename: string, count?: number) => {
    handleAddMessage('success', `Successfully uploaded ${filename}.${count ? ` ${count} leads processed.` : ''}`);
    setIsProcessingLeads(true); 
    
    console.log(`LeadsView: Need to refresh leads data after uploading ${filename}`);
    
    setTimeout(() => {
      setIsProcessingLeads(false);
      handleAddMessage('info', 'Lead data refresh simulated.'); 
    }, 2000);
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
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Leads Management</h1>
      
      <div className="mb-8 p-6 bg-base-200 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Upload New Leads CSV</h2>
        <LeadUploader 
          onUploadSuccess={handleUploadSuccess} 
          addMessage={handleAddMessage} 
          isProcessing={isProcessingLeads} 
        />
      </div>

      {messages.length > 0 && (
        <div className="space-y-4 mt-6">
          {messages.map((msg) => (
            <div key={msg.id} role="alert" className={`alert ${getAlertClass(msg.type)} shadow-lg`}>
              {getAlertIcon(msg.type)}
              <span>{msg.text}</span>
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
  );
};

export default LeadsView;
