// src/components/leads/LeadUploader.tsx
'use client';

import { useState, useCallback, ChangeEvent, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { v4 as uuidv4 } from 'uuid';
import { type RealtimeChannel } from '@supabase/supabase-js';
import { type Database } from '@/types/supabase';

// Define the shape of the job state
type JobStatus = Database['public']['Enums']['upload_job_status'];
interface UploadJobState {
    jobId: string | null;
    status: JobStatus;
    progress: number;
    message: string;
}

export function LeadUploader() {
    // Component State
    const [file, setFile] = useState<File | null>(null);
    const [marketRegion, setMarketRegion] = useState<string>('');
    const [error, setError] = useState<string>('');

    // Job Progress State
    const [jobState, setJobState] = useState<UploadJobState>({
        jobId: null,
        status: 'PENDING',
        progress: 0,
        message: '',
    });

    const channelRef = useRef<RealtimeChannel | null>(null);

    // This effect cleans up the Realtime channel subscription when the component unmounts
    useEffect(() => {
        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, []);
    

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            setFile(acceptedFiles[0]);
            setError('');
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'text/csv': ['.csv'] },
        multiple: false,
    });
    
    // Resets the component to its initial state for a new upload
    const handleReset = () => {
        setFile(null);
        setMarketRegion('');
        setError('');
        setJobState({ jobId: null, status: 'PENDING', progress: 0, message: '' });
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current)
              .then(status => console.log('Unsubscribed from channel with status:', status));
            channelRef.current = null;
        }
    };


    const handleUpload = async () => {
        if (!file || !marketRegion.trim()) {
            setError('Please select a file and define a market region.');
            return;
        }
        setError('');

        const newJobId = uuidv4();
        setJobState({
            jobId: newJobId,
            status: 'PENDING',
            progress: 0,
            message: 'Preparing upload...',
        });

        // --- Step 1: Subscribe to the job's progress updates in Realtime ---
        // Ensure any previous channel is removed before creating a new one
        if (channelRef.current) {
            await supabase.removeChannel(channelRef.current);
        }
        
        channelRef.current = supabase.channel(`upload_job:${newJobId}`);
        channelRef.current
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'upload_jobs',
                    filter: `job_id=eq.${newJobId}`,
                },
                (payload) => {
                    const { progress, status, message } = payload.new as Database['public']['Tables']['upload_jobs']['Row'];
                    setJobState(prevState => ({ ...prevState, progress, status, message: message || prevState.message }));

                    // Unsubscribe when the job is complete or failed
                    if (status === 'COMPLETE' || status === 'FAILED') {
                       if(channelRef.current) {
                           supabase.removeChannel(channelRef.current);
                           channelRef.current = null;
                       }
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    // --- Step 2: Once subscribed, send the upload request ---
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('market_region', marketRegion.trim());
                    formData.append('job_id', newJobId);

                    setJobState(prevState => ({ ...prevState, progress: 2, message: 'Uploading file...' }));
                    
                    supabase.auth.getSession().then(({ data: { session } }) => {
                        if (!session) {
                            throw new Error("Not authenticated. Please log in.");
                        }
                        return fetch('/api/leads/upload', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${session.access_token}` },
                            body: formData,
                        });
                    })
                    .then(response => {
                         if (!response.ok) {
                            return response.json().then(errorBody => {
                                throw new Error(errorBody.details || errorBody.error || 'The server could not start the upload process.');
                            });
                        }
                        return response.json();
                    })
                    .then(result => {
                         setJobState(prevState => ({ ...prevState, status: 'PROCESSING', message: 'Upload accepted. Server is processing the file...' }));
                    })
                    .catch(err => {
                        setError(err.message);
                        setJobState(prevState => ({ ...prevState, status: 'FAILED', message: err.message }));
                        if (channelRef.current) {
                            supabase.removeChannel(channelRef.current);
                        }
                    });
                } else if (err) {
                    setError(`Realtime connection error: ${err.message}. Please try again.`);
                    setJobState(prevState => ({...prevState, status: 'FAILED'}));
                }
            });
    };
    
    const isUploading = jobState.status === 'PROCESSING' || (jobState.status === 'PENDING' && !!jobState.jobId);
    const isFinished = jobState.status === 'COMPLETE' || jobState.status === 'FAILED';

    return (
        <div className="card w-full max-w-lg bg-base-200 shadow-xl">
            <div className="card-body">
                <h2 className="card-title">Upload Leads CSV</h2>
                
                {!isUploading && !isFinished && (
                    <>
                        <p className="text-sm opacity-70">Upload a raw CSV file to process and add new properties and contacts to the system.</p>
                        <div className="form-control w-full mt-4">
                            <label className="label"><span className="label-text">Define Market Region</span></label>
                            <input
                                type="text"
                                placeholder="e.g., Dallas / Fort Worth"
                                className="input input-bordered w-full"
                                value={marketRegion}
                                onChange={(e) => setMarketRegion(e.target.value)}
                            />
                        </div>
                        <div {...getRootProps()} className={`mt-4 p-8 border-2 border-dashed rounded-lg text-center cursor-pointer ${isDragActive ? 'border-primary' : 'border-base-300'}`}>
                            <input {...getInputProps()} />
                            {file ? <p>Selected file: {file.name}</p> : <p>Drag & drop a CSV file here, or click to select</p>}
                        </div>
                        {error && <div className="mt-4 text-error text-sm">{error}</div>}
                        <div className="card-actions justify-end mt-6">
                            <Button onClick={handleUpload} disabled={!file || !marketRegion.trim()}>Upload and Process</Button>
                        </div>
                    </>
                )}

                {(isUploading || isFinished) && (
                    <div className="flex flex-col items-center justify-center space-y-4 py-8">
                         <div
                            className={`radial-progress ${jobState.status === 'COMPLETE' ? 'text-success' : jobState.status === 'FAILED' ? 'text-error' : 'text-primary'}`}
                            style={{ "--value": jobState.progress, "--size": "12rem", "--thickness": "1rem" } as React.CSSProperties}
                            role="progressbar"
                        >
                           {jobState.progress}%
                        </div>
                        <p className="text-lg font-medium">{jobState.status}</p>
                        <p className="text-sm text-base-content/70 text-center px-4">{jobState.message}</p>
                        
                        {isFinished && (
                           <Button onClick={handleReset} className="mt-4">Upload Another File</Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}