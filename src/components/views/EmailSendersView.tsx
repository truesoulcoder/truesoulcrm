'use client';

import { PlusCircle, Edit3, Trash2, ShieldAlert, Mail, Power, PowerOff, Upload } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import type { Sender } from '@/types/index';

const SendersView: React.FC = () => {
  // State for the senders list and loading
  const [senders, setSenders] = useState<Sender[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // State for the add/edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSender, setEditingSender] = useState<Sender | null>(null);
  const [senderFormData, setSenderFormData] = useState({ 
    name: '', 
    email: '' 
  });
  const [modalError, setModalError] = useState<string | null>(null);
  
  // State for CSV upload
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<Array<{name: string, email: string, status: string}>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Filter senders based on search term
  const filteredSenders = senders.filter(sender =>
    sender.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sender.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Fetch senders from the API
  const fetchSenders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('Fetching senders from /api/email-senders...');
      const response = await fetch('/api/email-senders');
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        throw new Error(errorData.error || 'Failed to fetch senders');
      }
      
      const data = await response.json();
      console.log('Fetched senders:', data);
      
      if (!Array.isArray(data)) {
        console.error('Expected an array of senders but got:', data);
        throw new Error('Invalid response format: expected an array of senders');
      }
      
      // Ensure required fields exist
      const validatedSenders = data.map(sender => ({
        id: sender.id || '',
        user_id: sender.user_id || '',
        name: sender.name || '',
        email: sender.email || '',
        is_active: sender.is_active ?? true,
        is_default: sender.is_default ?? false,
        created_at: sender.created_at || new Date().toISOString(),
        updated_at: sender.updated_at || new Date().toISOString(),
        photo_url: sender.photo_url,
        status_message: sender.status_message
      }));
      
      console.log('Validated senders:', validatedSenders);
      setSenders(validatedSenders);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Error in fetchSenders:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load senders on component mount
  useEffect(() => {
    const loadSenders = async () => {
      try {
        await fetchSenders();
      } catch (error) {
        console.error('Failed to fetch senders:', error);
      }
    };
    void loadSenders();
  }, [fetchSenders]);

  // Modal handlers
  const openModalToAdd = () => {
    setEditingSender(null);
    setSenderFormData({ name: '', email: '' });
    setModalError(null);
    setIsModalOpen(true);
  };

  const openModalToEdit = (sender: Sender) => {
    setEditingSender(sender);
    setSenderFormData({ 
      name: sender.name || '', 
      email: sender.email || '' 
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSender(null);
    setSenderFormData({ name: '', email: '' });
    setModalError(null);
  };

  // Form handlers
  const handleSenderFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSenderFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSenderFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setModalError(null);

    if (!senderFormData.name.trim() || !senderFormData.email.trim()) {
      setModalError('Both name and email are required.');
      return;
    }
    
    if (!/\S+@\S+\.\S+/.test(senderFormData.email)) {
      setModalError('Please enter a valid email address.');
      return;
    }

    const method = editingSender ? 'PUT' : 'POST';
    const url = editingSender ? `/api/email-senders/${editingSender.id}` : '/api/email-senders';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(senderFormData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${editingSender ? 'update' : 'add'} sender`);
      }

      await fetchSenders();
      closeModal();
    } catch (err: any) {
      setModalError(err.message || 'An unexpected error occurred');
    }
  };

  // Sender action handlers
  const handleDeleteSender = async (senderId: string) => {
    if (!window.confirm('Are you sure you want to delete this email sender?')) {
      return;
    }
    
    setError(null);
    try {
      const response = await fetch(`/api/email-senders/${senderId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete sender');
      }
      await fetchSenders();
    } catch (err: any) {
      setError(err.message || 'Failed to delete sender');
    }
  };

  const handleToggleSenderActiveStatus = async (sender: Sender) => {
    const newStatus = !sender.is_active;
    setError(null);
    
    try {
      const response = await fetch(`/api/email-senders/${sender.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update status');
      }

      await fetchSenders();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  };

  // CSV handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setUploadError(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
          throw new Error('CSV file is empty or has invalid format');
        }
        
        // Parse CSV (assuming first row is header)
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIndex = headers.findIndex(h => h.includes('name'));
        const emailIndex = headers.findIndex(h => h.includes('email'));
        
        if (nameIndex === -1 || emailIndex === -1) {
          throw new Error('CSV must contain "Name" and "Email" columns');
        }
        
        const preview = lines.slice(1).map(line => {
          const values = line.split(',');
          return {
            name: values[nameIndex]?.trim() || '',
            email: values[emailIndex]?.trim() || '',
            status: 'Pending'
          };
        });
        
        setCsvPreview(preview);
      } catch (err: any) {
        setUploadError(err.message || 'Error parsing CSV file');
        setCsvPreview([]);
      }
    };
    
    reader.onerror = () => {
      setUploadError('Error reading file');
      setCsvPreview([]);
    };
    
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!csvFile || csvPreview.length === 0) return;
    
    setIsUploading(true);
    setUploadError(null);
    
    try {
      const results = [];
      
      for (const row of csvPreview) {
        if (!row.email) continue; // Skip rows without email
        
        try {
          const response = await fetch('/api/email-senders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: row.name,
              email: row.email,
              is_active: true
            }),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to add sender');
          }
          
          results.push({ email: row.email, success: true });
        } catch (err: any) {
          results.push({ 
            email: row.email, 
            success: false, 
            error: err.message || 'Failed to add sender' 
          });
        }
      }
      
      // Show results
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.length - successCount;
      
      if (errorCount > 0) {
        const errorMessages = results
          .filter(r => !r.success)
          .map(r => `- ${r.email}: ${r.error}`)
          .join('\n');
        
        setUploadError(`Failed to import ${errorCount} sender(s).\n${errorMessages}`);
      } else {
        setIsUploadModalOpen(false);
      }
      
      if (successCount > 0) {
        await fetchSenders();
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred during import';
      setUploadError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-base-content">Email Senders</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            className="btn btn-outline btn-primary flex-1 sm:flex-none"
            onClick={() => {
              setUploadError(null);
              setCsvFile(null);
              setCsvPreview([]);
              setIsUploadModalOpen(true);
            }}
            disabled={isLoading}
          >
            <Upload size={18} className="mr-2" /> Bulk Import
          </button>
          <button 
            className="btn btn-primary flex-1 sm:flex-none" 
            onClick={openModalToAdd}
            disabled={isLoading}
          >
            <PlusCircle size={18} className="mr-2" /> Add Sender
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="form-control w-full max-w-md">
          <input
            type="text"
            placeholder="Search senders..."
            className="input input-bordered w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-error shadow-lg mb-6">
          <ShieldAlert size={24} />
          <div>
            <h3 className="font-bold">Error</h3>
            <div className="text-xs">{error}</div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="text-center py-10">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="mt-4">Loading senders...</p>
        </div>
      ) : (
        /* Senders Table */
        <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
          {filteredSenders.length === 0 ? (
            <div className="text-center p-8">
              <Mail size={48} className="mx-auto text-base-content/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">No senders found</h3>
              <p className="text-base-content/70 mb-4">
                {searchTerm ? 'Try a different search term' : 'Get started by adding a new sender'}
              </p>
              <button 
                className="btn btn-primary"
                onClick={openModalToAdd}
              >
                <PlusCircle size={18} className="mr-2" /> Add Sender
              </button>
            </div>
          ) : (
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSenders.map((sender) => (
                  <tr key={sender.id} className="hover">
                    <td className="font-medium">{sender.name}</td>
                    <td>{sender.email}</td>
                    <td className="text-center">
                      <button
                        className={`btn btn-xs ${sender.is_active ? 'btn-success' : 'btn-error'}`}
                        onClick={() => {
                          void handleToggleSenderActiveStatus(sender);
                        }}
                      >
                        {sender.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => {
                            openModalToEdit(sender);
                          }}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          className="btn btn-ghost btn-xs text-error"
                          onClick={() => {
                            void handleDeleteSender(sender.id);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add/Edit Sender Modal */}
      {isModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">
              {editingSender ? 'Edit Sender' : 'Add New Sender'}
            </h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              void handleSenderFormSubmit(e);
            }}>
              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Name</span>
                </label>
                <input
                  type="text"
                  name="name"
                  className="input input-bordered w-full"
                  value={senderFormData.name}
                  onChange={handleSenderFormChange}
                  required
                />
              </div>
              <div className="form-control mb-6">
                <label className="label">
                  <span className="label-text">Email</span>
                </label>
                <input
                  type="email"
                  name="email"
                  className="input input-bordered w-full"
                  value={senderFormData.email}
                  onChange={handleSenderFormChange}
                  required
                />
              </div>
              
              {modalError && (
                <div className="alert alert-error mb-4">
                  <ShieldAlert size={20} />
                  <span>{modalError}</span>
                </div>
              )}
              
              <div className="modal-action">
                <button 
                  type="button" 
                  className="btn btn-ghost"
                  onClick={() => {
                    closeModal();
                  }}
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isUploading}
                >
                  {editingSender ? 'Save Changes' : 'Add Sender'}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={closeModal}></div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {isUploadModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="font-bold text-lg mb-4">Bulk Import Senders</h3>
            
            <div className="mb-6">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">CSV File</span>
                  <span className="label-text-alt">Format: Name,Email</span>
                </label>
                <input
                  type="file"
                  accept=".csv"
                  className="file-input file-input-bordered w-full"
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
              </div>
              
              {uploadError && (
                <div className="alert alert-error mt-4">
                  <ShieldAlert size={20} />
                  <div className="whitespace-pre-wrap">{uploadError}</div>
                </div>
              )}
              
              {csvPreview.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium mb-2">Preview ({csvPreview.length} senders)</h4>
                  <div className="overflow-x-auto max-h-64 border rounded-lg">
                    <table className="table table-zebra table-pin-rows">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.map((row, index) => (
                          <tr key={index}>
                            <td>{row.name || <span className="text-error">Required</span>}</td>
                            <td>{row.email || <span className="text-error">Required</span>}</td>
                            <td>{row.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-action">
              <button 
                type="button" 
                className="btn btn-ghost"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setCsvFile(null);
                  setCsvPreview([]);
                  setUploadError(null);
                }}
                disabled={isUploading}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={() => {
                  void handleUpload();
                }}
                disabled={isUploading || csvPreview.length === 0}
              >
                {isUploading ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    Uploading...
                  </>
                ) : (
                  'Upload Senders'
                )}
              </button>
            </div>
          </div>
          <div 
            className="modal-backdrop" 
            onClick={() => {
              if (!isUploading) {
                setIsUploadModalOpen(false);
              }
            }}
          ></div>
        </div>
      )}
    </div>
  );
};

export default SendersView;