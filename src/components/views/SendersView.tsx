'use client';

import { PlusCircle, Edit3, Trash2, ShieldAlert, Mail, Upload } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import type { Database, Sender } from '@/types';
import { supabase } from '@/lib/supabase/client';

const SendersView: React.FC = () => {
  // State for the senders list and loading
  const [senders, setSenders] = useState<Sender[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // State for the add/edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSender, setEditingSender] = useState<Sender | null>(null);
  const [senderFormData, setSenderFormData] = useState<Partial<Sender>>({
    sender_name: '',
    sender_email: '',
    is_active: false,
  });
  const [modalError, setModalError] = useState<string | null>(null);
  
  // State for CSV upload
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<Partial<Sender>[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Filter senders based on search term
  const filteredSenders = senders.filter(sender =>
    sender.sender_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sender.sender_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Fetch senders from the API
  const fetchSenders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('Failed to get session. Please log in.');
      }
      const accessToken = sessionData.session.access_token;

      const response = await fetch('/api/senders', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch senders');
      }
      
      const data: Sender[] = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid response format: expected an array of senders');
      }
      setSenders(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load senders on component mount
  useEffect(() => {
    void fetchSenders();
  }, [fetchSenders]);

  // Modal handlers
  const openModalToAdd = () => {
    setEditingSender(null);
    setSenderFormData({ sender_name: '', sender_email: '', is_active: false });
    setModalError(null);
    setIsModalOpen(true);
  };

  const openModalToEdit = (sender: Sender) => {
    setEditingSender(sender);
    setSenderFormData(sender);
    setModalError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSender(null);
    setSenderFormData({ sender_name: '', sender_email: '', is_active: false });
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

    if (!senderFormData.sender_name?.trim() || !senderFormData.sender_email?.trim()) {
      setModalError('Both name and email are required.');
      return;
    }
    
    if (!/\S+@\S+\.\S+/.test(senderFormData.sender_email)) {
      setModalError('Please enter a valid email address.');
      return;
    }

    const method = editingSender ? 'PUT' : 'POST';
    const url = editingSender ? `/api/senders/${editingSender.id}` : '/api/senders';

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        setModalError('Failed to get session. Please log in.');
        return;
      }
      const accessToken = sessionData.session.access_token;

      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(senderFormData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${editingSender ? 'update' : 'add'} sender`);
      }

      await fetchSenders();
      closeModal();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setModalError(errorMessage);
    }
  };

  const handleDeleteSender = async (senderId: string) => {
    if (!window.confirm('Are you sure you want to delete this email sender?')) return;
    
    setError(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        setError('Failed to get session. Please log in.');
        return;
      }
      const accessToken = sessionData.session.access_token;

      const response = await fetch(`/api/senders?id=${senderId}`, { 
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete sender');
      }
      await fetchSenders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete sender');
    }
  };

  const handleToggleSenderActiveStatus = async (sender: Sender) => {
    const newStatus = !sender.is_active;
    setError(null);
    
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        setError('Failed to get session. Please log in.');
        return;
      }
      const accessToken = sessionData.session.access_token;

      const response = await fetch(`/api/senders/${sender.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ is_active: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update status');
      }
      await fetchSenders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update sender status');
    }
  };

  // CSV handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setUploadError(null);
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error('CSV file is empty or has invalid format');
        
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIndex = headers.findIndex(h => h.includes('name'));
        const emailIndex = headers.findIndex(h => h.includes('email'));
        if (nameIndex === -1 || emailIndex === -1) throw new Error('CSV must contain "Name" and "Email" columns');
        
        const previewData: Partial<Sender>[] = lines.slice(1).map(line => {
          const values = line.split(',');
          return {
            sender_name: values[nameIndex]?.trim() || '',
            sender_email: values[emailIndex]?.trim() || '',
          };
        });
        setCsvPreview(previewData);
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : 'Failed to parse CSV file');
        setCsvPreview([]);
      }
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!csvFile || csvPreview.length === 0) return;
    
    setIsUploading(true);
    setUploadError(null);
    
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        setUploadError('Failed to get session. Please log in.');
        setIsUploading(false);
        return;
      }
      const accessToken = sessionData.session.access_token;

      for (const row of csvPreview) {
        if (!row.sender_email) continue;
        // TODO: Consider batching these requests or using a dedicated bulk endpoint if available
        const response = await fetch('/api/senders', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            sender_name: row.sender_name,
            sender_email: row.sender_email,
            is_active: true // Default to active for bulk imported senders
          }),
        });
         if (!response.ok) {
          const errorData = await response.json();
          // If one row fails, we stop and report error. Alternative: collect errors and continue.
          throw new Error(`Failed to import ${row.sender_email}: ${errorData.error || 'Unknown error'}`);
        }
      }
      setIsUploadModalOpen(false);
      setCsvFile(null);
      setCsvPreview([]);
      await fetchSenders(); // Refresh the list
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'An error occurred during import');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full h-full">
      {/* The bento box styling (padding, bg, shadow, rounded) is now handled by MainAppShell */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-base-content">Email Senders</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <button className="btn btn-outline btn-primary flex-1 sm:flex-none" onClick={() => setIsUploadModalOpen(true)} disabled={isLoading}>
            <Upload size={18} className="mr-2" /> Bulk Import
          </button>
          <button className="btn btn-primary flex-1 sm:flex-none" onClick={openModalToAdd} disabled={isLoading}>
            <PlusCircle size={18} className="mr-2" /> Add Sender
          </button>
        </div>
      </div>

      <div className="mb-6">
        <input type="text" placeholder="Search senders..." className="input input-bordered w-full max-w-md" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      {error && <div className="alert alert-error shadow-lg mb-6"><ShieldAlert size={24} /><div><h3 className="font-bold">Error</h3><div className="text-xs">{error}</div></div></div>}

      {isLoading ? (
        <div className="text-center py-10"><span className="loading loading-spinner loading-lg text-primary"></span><p className="mt-4">Loading senders...</p></div>
      ) : (
        <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
          {filteredSenders.length === 0 ? (
            <div className="text-center p-8">
              <Mail size={48} className="mx-auto text-base-content/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">No senders found</h3>
              <p className="text-base-content/70 mb-4">{searchTerm ? 'Try a different search term' : 'Get started by adding a new sender'}</p>
              <button className="btn btn-primary" onClick={openModalToAdd}><PlusCircle size={18} className="mr-2" /> Add Sender</button>
            </div>
          ) : (
            <table className="table w-full">
              <thead><tr><th>Name</th><th>Email</th><th className="text-center">Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {filteredSenders.map((sender) => (
                  <tr key={sender.id} className="hover">
                    <td className="font-medium">{sender.sender_name}</td>
                    <td>{sender.sender_email}</td>
                    <td className="text-center"><button className={`btn btn-xs ${sender.is_active ? 'btn-success' : 'btn-error'}`} onClick={() => handleToggleSenderActiveStatus(sender)}>{sender.is_active ? 'Active' : 'Inactive'}</button></td>
                    <td className="text-right"><div className="flex justify-end gap-2"><button className="btn btn-ghost btn-xs" onClick={() => openModalToEdit(sender)}><Edit3 size={16} /></button><button className="btn btn-ghost btn-xs text-error" onClick={() => handleDeleteSender(sender.id)}><Trash2 size={16} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box"><h3 className="font-bold text-lg mb-4">{editingSender ? 'Edit Sender' : 'Add New Sender'}</h3>
            <form onSubmit={handleSenderFormSubmit}>
              <div className="form-control mb-4"><label className="label"><span className="label-text">Name</span></label><input type="text" name="sender_name" className="input input-bordered w-full" value={senderFormData.sender_name ?? ''} onChange={handleSenderFormChange} required /></div>
              <div className="form-control mb-6"><label className="label"><span className="label-text">Email</span></label><input type="email" name="sender_email" className="input input-bordered w-full" value={senderFormData.sender_email ?? ''} onChange={handleSenderFormChange} required /></div>
              {modalError && <div className="alert alert-error mb-4"><ShieldAlert size={20} /><span>{modalError}</span></div>}
              <div className="modal-action"><button type="button" className="btn btn-ghost" onClick={closeModal} disabled={isUploading}>Cancel</button><button type="submit" className="btn btn-primary" disabled={isUploading}>{editingSender ? 'Save Changes' : 'Add Sender'}</button></div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={closeModal}></div>
        </div>
      )}

      {isUploadModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="font-bold text-lg mb-4">Bulk Import Senders</h3>
            <div className="mb-6">
              <div className="form-control"><label className="label"><span className="label-text">CSV File</span><span className="label-text-alt">Format: Name,Email</span></label><input type="file" accept=".csv" className="file-input file-input-bordered w-full" onChange={handleFileChange} disabled={isUploading}/></div>
              {uploadError && <div className="alert alert-error mt-4"><ShieldAlert size={20} /><div className="whitespace-pre-wrap">{uploadError}</div></div>}
              {csvPreview.length > 0 && <div className="mt-6"><h4 className="font-medium mb-2">Preview ({csvPreview.length} senders)</h4><div className="overflow-x-auto max-h-64 border rounded-lg"><table className="table table-zebra table-pin-rows"><thead><tr><th>Name</th><th>Email</th></tr></thead><tbody>{csvPreview.map((row, index) => (<tr key={index}><td>{row.sender_name || <span className="text-error">Required</span>}</td><td>{row.sender_email || <span className="text-error">Required</span>}</td></tr>))}</tbody></table></div></div>}
            </div>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => setIsUploadModalOpen(false)} disabled={isUploading}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleUpload} disabled={isUploading || csvPreview.length === 0}>{isUploading ? <><span className="loading loading-spinner loading-xs"></span>Uploading...</> : 'Upload Senders'}</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => !isUploading && setIsUploadModalOpen(false)}></div>
        </div>
      )}
    </div>
  );
};

export default SendersView;