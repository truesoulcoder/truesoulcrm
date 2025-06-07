// src/components/leads/LeadUploader.tsx
'use client';

import { useState, useCallback, ChangeEvent } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';

export function LeadUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setUploadMessage('');
      setIsError(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadMessage('Please select a file first.');
      setIsError(true);
      return;
    }

    setIsUploading(true);
    setIsError(false);
    setUploadMessage('Uploading and processing... This may take a moment.');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/leads/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (!response.ok || !result.ok) {
        throw new Error(result.details || result.error || 'An unknown error occurred.');
      }

      setUploadMessage(result.message || 'Upload complete and processed!');
      setFile(null); // Clear file input on success
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setUploadMessage(`Upload failed: ${errorMessage}`);
      setIsError(true);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="card w-full max-w-lg bg-base-200 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Upload Leads CSV</h2>
        <p className="text-sm opacity-70">Upload a raw CSV file to process and add new properties and contacts to the system.</p>
        
        <div {...getRootProps()} className={`mt-4 p-8 border-2 border-dashed rounded-lg text-center cursor-pointer ${isDragActive ? 'border-primary' : 'border-base-300'}`}>
          <input {...getInputProps()} onChange={handleFileChange} />
          {file ? (
            <p>Selected file: {file.name}</p>
          ) : isDragActive ? (
            <p>Drop the CSV file here ...</p>
          ) : (
            <p>Drag &apos;n&apos; drop a CSV file here, or click to select a file</p>
          )}
        </div>

        {isUploading && (
          <div className="mt-4 space-y-2">
            <p>{uploadMessage}</p>
            <progress className="progress progress-primary w-full"></progress>
          </div>
        )}

        {uploadMessage && !isUploading && (
          <div className={`mt-4 p-2 rounded-md text-sm ${isError ? 'bg-error text-error-content' : 'bg-success text-success-content'}`}>
            <p>{uploadMessage}</p>
          </div>
        )}

        <div className="card-actions justify-end mt-6">
          <Button onClick={handleUpload} disabled={!file || isUploading}>
            {isUploading ? 'Processing...' : 'Upload and Process'}
          </Button>
        </div>
      </div>
    </div>
  );
}