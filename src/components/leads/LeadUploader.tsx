'use client';

import { useState, useTransition, useRef, useEffect } from 'react';

import { supabase } from '@/lib/supabase/client';

// Define the expected response structure from the upload API
interface UploadResponse {
  ok: boolean;
  error?: string;
  message?: string; // Optional success message from API
  warning?: string; // Optional warning message
  details?: any;    // Optional details
}

interface LeadUploaderProps {
  onUploadSuccess?: (filename: string, count?: number) => void; // Callback with filename and count on successful upload
  addMessage?: (type: 'info' | 'error' | 'success' | 'warning', message: string) => void; // Callback to send messages to parent
  isProcessing?: boolean; // To disable uploader during parent's processing (e.g., normalization)
}

export default function LeadUploader({ onUploadSuccess, addMessage, isProcessing }: LeadUploaderProps) {

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [marketRegion, setMarketRegion] = useState<string>('');
  const [marketRegions, setMarketRegions] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition(); 
  const successAudioRef = useRef<HTMLAudioElement | null>(null);
  const failureAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      successAudioRef.current = new Audio('https://oviiqouhtdajfwhpwbyq.supabase.co/storage/v1/object/public/media/success.mp3'); 
      failureAudioRef.current = new Audio('https://oviiqouhtdajfwhpwbyq.supabase.co/storage/v1/object/public/media/failed.mp3');
      successAudioRef.current.load();
      failureAudioRef.current.load();
    } catch (err) {
      console.warn('Audio initialization error:', err);
    }
  }, []);

  // Fetch available market regions
  useEffect(() => {
    const fetchMarketRegions = async () => {
      const { data, error } = await supabase
        .from('market_regions') // Query the new 'market_regions' table
        .select('name');       // Select the 'name' column

      if (error) {
        console.error('Error fetching market regions:', error);
        if (addMessage) addMessage('error', 'Could not load market regions.');
        setMarketRegions([]);
        return;
      }

      if (data) {
        // Ensure row.name is a string and filter out any null/undefined if necessary
        const regions = Array.from(
          new Set(data.map((row: { name: string | null }) => row.name).filter(Boolean) as string[])
        );
        setMarketRegions(regions);
      }
    };
    
    void fetchMarketRegions();
  }, [addMessage]); // Add addMessage to dependency array

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile || !marketRegion.trim()) { 
        setMessage('Please select a file and enter a market region.');
        if (addMessage) addMessage('error', 'Please select a file and enter a market region.');
        return;
    }

    setMessage(`Uploading file: ${selectedFile.name} for market: ${marketRegion}...`); 

    const formData = new FormData();
    const uploadId = crypto.randomUUID();
    formData.append('file', selectedFile);
    formData.append('market_region', marketRegion.trim());
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', '0');
    formData.append('totalChunks', '1');
    formData.append('fileName', selectedFile.name); 

    startTransition(async () => {
      try {
        const res = await fetch('/api/leads/upload', { method: 'POST', body: formData });
        const result: UploadResponse = await res.json(); 

        if (result.ok) {
          const successMsg = result.message || 'Upload successful!';
          setMessage(successMsg);
          if (addMessage) addMessage('success', successMsg);
          if (onUploadSuccess && selectedFile) {
            const count = typeof result.details === 'number' ? result.details : (result.details?.count as number | undefined);
            onUploadSuccess(selectedFile.name, count);
          }
          if (successAudioRef.current) {
            successAudioRef.current.play().catch(err => console.warn('Success audio error:', err));
          }
          if (result.warning && addMessage) {
            addMessage('warning', result.warning);
          }
        } else {
          const errorMsg = result.error || 'Unknown upload error';
          const fullErrorMsg = `Upload failed: ${errorMsg}`;
          setMessage(fullErrorMsg);
          if (addMessage) addMessage('error', fullErrorMsg);
          if (failureAudioRef.current) {
            failureAudioRef.current.play().catch(err => console.warn('Failure audio error:', err));
          }
        }
      } catch (err) {
        console.error('Upload fetch error:', err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        const fullErrorMsg = `Upload failed: ${errorMsg}`;
        setMessage(fullErrorMsg);
        if (addMessage) addMessage('error', fullErrorMsg);
        if (failureAudioRef.current) {
          failureAudioRef.current.play().catch(err => console.warn('Failure audio error:', err));
        }
      }
    });
  }

  return (
    <>
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(e);
        }} 
        className="space-y-4 p-4 border border-gray-200 rounded-lg shadow-sm bg-white"
      >
        <div>
          <label htmlFor="market-region" className="block text-sm font-medium text-gray-700 mb-1">Market Region</label>
          <input
            id="market-region"
            value={marketRegion}
            onChange={(e) => setMarketRegion(e.target.value)}
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isPending || isProcessing}
            required
          />
        </div>
        <div>
          <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-1">Leads CSV File</label>
          <input
            id="file-upload"
            type="file"
            accept=".csv"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isPending || isProcessing}
            required 
          />
        </div>
        <button 
          type="submit" 
          disabled={!selectedFile || !marketRegion.trim() || isPending || isProcessing} 
          className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-150 ease-in-out"
        >
          {isPending ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Uploading...
            </span>
          ) : 'Upload Leads CSV'}
        </button>
        {message && (
          <p className={`mt-3 text-sm text-center ${message.startsWith('Upload failed') || message.startsWith('Please select') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}
      </form>
    </>
  );
}
