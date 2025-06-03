// src/app/api/leads/upload/route.ts
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'papaparse';

import { createAdminServerClient } from '@/lib/supabase/server';

// Max execution time for this API route (in seconds)
export const maxDuration = 60; // 1 minute

// Helper function to process file in chunks
const processCSV = async (
  fileText: string,
  chunkSize: number,
  processChunk: (chunk: any[], isLastChunk: boolean) => Promise<void>
) => {
  return new Promise<void>((resolve, reject) => {
    try {
      let originalHeaders: string[] = [];
      let headerParseError: Error | null = null;

      // First, parse just the headers to get column names
      parse(fileText, {
        preview: 1, // Only parse the first row
        header: false, // Treat the first row as an array of strings
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length > 0 && Array.isArray(results.data[0])) {
            originalHeaders = results.data[0] as string[];
          }
        },
        error: (error: Error) => {
          // Capture error to reject promise outside
          headerParseError = new Error(`Failed to parse header row: ${error.message}`);
        }
      });

      if (headerParseError) {
        reject(headerParseError);
        return;
      }

      if (originalHeaders.length === 0) {
        reject(new Error('No header row found in CSV file.'));
        return;
      }
    
      const finalHeaders: string[] = [];
      const headerCounts: { [key: string]: number } = {};
    
      for (const h of originalHeaders) {
        const snakeCasedHeader = convertToSnakeCase(h);
        if (headerCounts[snakeCasedHeader] === undefined) {
          headerCounts[snakeCasedHeader] = 0;
          finalHeaders.push(snakeCasedHeader);
        } else {
          headerCounts[snakeCasedHeader]++;
          finalHeaders.push(`${snakeCasedHeader}_${headerCounts[snakeCasedHeader]}`);
        }
      }

      // Now, the main parsing
      let isHeaderRowSkipped = false;
      let chunk: any[] = [];
      let rowCount = 0;

      parse(fileText, {
        header: false,
        skipEmptyLines: true,
        step: (row, parser) => {
          const rowDataArray = row.data as any[];

          if (!isHeaderRowSkipped) {
            isHeaderRowSkipped = true;
            // Check if the current row is indeed the header row we already processed
            if (originalHeaders.length > 0 && 
                rowDataArray.length === originalHeaders.length && 
                originalHeaders.every((val, idx) => val === rowDataArray[idx])) {
               return; // Skip this row
            }
          }

          const csvRowData: { [key: string]: any } = {};
          finalHeaders.forEach((headerKey, index) => {
            if (index < rowDataArray.length) {
              csvRowData[headerKey] = rowDataArray[index];
            } else {
              csvRowData[headerKey] = null; 
            }
          });
          
          // Ensure not an empty or all-null object before pushing
          if (Object.keys(csvRowData).length > 0 && !Object.values(csvRowData).every(v => v === null || v === '' || (typeof v === 'string' && v.trim() === ''))) {
            chunk.push(csvRowData);
            rowCount++;

            if (chunk.length >= chunkSize) {
              parser.pause();
              const currentChunkToProcess = [...chunk];
              chunk = [];
              
              void processChunk(currentChunkToProcess, false)
                .then(() => parser.resume())
                .catch(error => {
                  parser.abort();
                  reject(error); 
                });
            }
          }
        },
        complete: () => {
          // Process any remaining rows in the last chunk
          if (chunk.length > 0) {
            void processChunk(chunk, true)
              .then(() => resolve())
              .catch(error => reject(error)); 
          } else {
            resolve(); 
          }
        },
        error: (error: Error) => {
          reject(error); 
        }
      });
    } catch (error) {
      reject(error);
    }
  });
};

// Utility function to convert strings to snake_case
const convertToSnakeCase = (str: string): string => {
  if (!str) return '';
  return (
    str
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/__+/g, '_')
  );
};

type LeadStagingRow = Record<string, any>;

export async function POST(request: NextRequest) {
  console.log('API: /api/leads/upload POST request received.');

  const supabase = createAdminServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('API Error: User not authenticated for lead upload.', userError);
    return NextResponse.json({ ok: false, error: 'User not authenticated.' }, { status: 401 });
  }
  const userId = user.id;
  console.log('API: Authenticated user ID for lead upload:', userId);

  const formData = await request.formData();
  const chunkFile = formData.get('file') as File | null;
  const marketRegion = formData.get('market_region') as string | null;
  const uploadId = formData.get('uploadId') as string | null;
  const chunkIndexStr = formData.get('chunkIndex') as string | null;
  const totalChunksStr = formData.get('totalChunks') as string | null;
  const originalFileName = formData.get('fileName') as string | null;

  console.log('API: Chunk upload request received.');
  console.log(`API: uploadId: ${uploadId}, chunkIndex: ${chunkIndexStr}, totalChunks: ${totalChunksStr}, fileName: ${originalFileName}, marketRegion: ${marketRegion}`);
  console.log('API: Chunk file object:', chunkFile ? { name: chunkFile.name, type: chunkFile.type, size: chunkFile.size } : 'No chunk file found');

  if (!chunkFile || !uploadId || chunkIndexStr === null || totalChunksStr === null || !originalFileName || !marketRegion) {
    console.error('API Error: Missing chunk metadata or file.');
    return NextResponse.json({ ok: false, error: 'Invalid chunk request: missing required fields.' }, { status: 400 });
  }

  const chunkIndex = parseInt(chunkIndexStr, 10);
  const totalChunks = parseInt(totalChunksStr, 10);

  if (isNaN(chunkIndex) || isNaN(totalChunks)) {
    return NextResponse.json({ ok: false, error: 'Invalid chunk metadata: chunkIndex or totalChunks is not a number.' }, { status: 400 });
  }
  
  const tempDir = path.join('/tmp', uploadId);
  const chunkFilePath = path.join(tempDir, `chunk_${chunkIndex}.bin`);

  let objectPath: string | null = null;
  const supabaseAdmin = createAdminServerClient();
  
  await supabaseAdmin.auth.setSession({
    access_token: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    refresh_token: ''
  });
  const bucket = 'lead-uploads';

  try {
    await fs.mkdir(tempDir, { recursive: true });
    console.log(`API: Temporary directory created/ensured: ${tempDir}`);

    const chunkBuffer = Buffer.from(await chunkFile.arrayBuffer());
    await fs.writeFile(chunkFilePath, chunkBuffer);
    console.log(`API: Chunk ${chunkIndex}/${totalChunks-1} for ${uploadId} stored at ${chunkFilePath}`);

    // Check if all chunks are received
    const filesInDir = await fs.readdir(tempDir);
    console.log(`API: Chunks received so far for ${uploadId}: ${filesInDir.length}/${totalChunks}`);

    if (filesInDir.length === totalChunks) {
      console.log(`API: All ${totalChunks} chunks received for ${uploadId}. Starting reassembly...`);
      const reassembledFileBuffers: Buffer[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const currentChunkPath = path.join(tempDir, `chunk_${i}.bin`);
        const buffer = await fs.readFile(currentChunkPath);
        reassembledFileBuffers.push(buffer);
        await fs.unlink(currentChunkPath);
      }
      await fs.rmdir(tempDir);
      console.log(`API: Temporary chunks deleted and directory ${tempDir} removed.`);

      const reassembledFileBuffer = Buffer.concat(reassembledFileBuffers);
      console.log(`API: File ${originalFileName} reassembled. Total size: ${reassembledFileBuffer.length} bytes.`);
      
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
      if (reassembledFileBuffer.length > MAX_FILE_SIZE) {
        console.error(`API Error: Reassembled file size (${reassembledFileBuffer.length}) exceeds 50MB limit.`);
        return NextResponse.json({ ok: false, error: 'Reassembled file size exceeds 50MB limit.' }, { status: 413 });
      }

      const reassembledFile = {
        name: originalFileName,
        type: chunkFile.type,
        size: reassembledFileBuffer.length,
        arrayBuffer: async () => reassembledFileBuffer.buffer.slice(
            reassembledFileBuffer.byteOffset, 
            reassembledFileBuffer.byteOffset + reassembledFileBuffer.byteLength
        ),
        text: async () => reassembledFileBuffer.toString('utf-8'),
      };
      
      console.log('API: Attempting to upload reassembled file to storage...');
      const sanitizedFileName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      objectPath = `${randomUUID()}-${Date.now()}-${sanitizedFileName}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(bucket)
        .upload(objectPath, await reassembledFile.arrayBuffer(), {
          cacheControl: '3600',
          contentType: reassembledFile.type || 'text/csv',
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload failed for reassembled file:', uploadError);
        return NextResponse.json(
          { ok: false, error: 'Storage upload failed for reassembled file.', details: uploadError.message },
          { status: 500 }
        );
      }
      console.log('Reassembled file uploaded to storage:', objectPath);

      console.log('API: Starting CSV processing for reassembled file...');
      let totalProcessed = 0;
      let allInsertedData: any[] = [];
      let hasError = false;
      let processingError: any = null;

      try {
        const BATCH_SIZE = 100; 
        await processCSV(
          await reassembledFile.text(),
          BATCH_SIZE,
          async (chunkToProcess, isLastChunk) => {
            if (hasError) return;
            try {
              console.log(`Processing chunk of ${chunkToProcess.length} rows from reassembled file...`);
              const leadsToInsert = chunkToProcess.map((processedCsvRowData: any) => {
                const rawDataPayload: { [key: string]: any } = {};
                for (const key in processedCsvRowData) {
                  if (Object.prototype.hasOwnProperty.call(processedCsvRowData, key)) {
                    rawDataPayload[key] = processedCsvRowData[key];
                  }
                }
                return {
                  uploaded_by: userId, 
                  original_filename: originalFileName, 
                  market_region: marketRegion, 
                  raw_data: rawDataPayload,
                };
              });

              const { data: batchInsertedData, error: batchInsertErr } = await supabaseAdmin
                .from('leads')
                .insert(leadsToInsert)
                .select();

              if (batchInsertErr) {
                console.error('Batch insert error:', batchInsertErr);
                throw batchInsertErr;
              }
              if (batchInsertedData) allInsertedData = [...allInsertedData, ...batchInsertedData];
              totalProcessed += chunkToProcess.length;
              console.log(`Successfully processed ${totalProcessed} rows from reassembled file so far...`);

            } catch (error) {
              hasError = true;
              processingError = error;
              throw error;
            }
          }
        );

        if (hasError && processingError) throw processingError;
        console.log('API: Finished processing reassembled CSV. Total rows processed:', totalProcessed);
        if (totalProcessed === 0) {
          if (objectPath) {
            await supabaseAdmin.storage.from(bucket).remove([objectPath]);
            console.log(`Cleaned up storage file ${objectPath} due to no data in CSV.`);
          }
          return NextResponse.json({ ok: false, error: 'No data found in CSV file.' }, { status: 400 });
        }
      } catch (error: any) {
        console.error('API Error during reassembled CSV processing:', error);
        if (objectPath) {
          console.log(`Attempting to cleanup storage file ${objectPath} due to processing failure...`);
          await supabaseAdmin.storage.from(bucket).remove([objectPath]);
        }
        let errorMessage = 'Failed to process reassembled CSV file';
        if (error.message.includes('violates row-level security policy')) errorMessage = 'Permission denied during CSV processing.';
        else if (error.message.includes('invalid input syntax')) errorMessage = 'Invalid data format in reassembled CSV.';
        return NextResponse.json({ ok: false, error: errorMessage, details: error.message }, { status: 500 });
      }

      console.log('API: All data from reassembled file inserted. Total rows:', allInsertedData.length);

      // Call the normalization function
      console.log('API: Calling normalize_staged_leads for market_region:', marketRegion);
      const { error: rpcError } = await supabaseAdmin.rpc('normalize_staged_leads', { p_market_region: marketRegion });
      if (rpcError) {
        console.error('RPC normalize_staged_leads failed:', rpcError);
        if (objectPath) await supabaseAdmin.storage.from(bucket).remove([objectPath]);
        return NextResponse.json({ 
          ok: false, 
          error: 'Failed to normalize staged leads.', 
          details: rpcError.message 
        }, { status: 500 });
      }
      console.log('API: Normalization successful.');

      // Create market-specific fine-cut leads table
      console.log(`API: Creating market-specific fine-cut leads table for market: ${marketRegion}`);

      if (!marketRegion) {
        console.error('API Error: marketRegion is null or empty before calling create_market_specific_fine_cut_leads_table.');
        if (objectPath) {
          console.log(`Attempting to cleanup storage file ${objectPath} due to missing marketRegion...`);
          await supabaseAdmin.storage.from(bucket).remove([objectPath]);
        }
        return NextResponse.json({
          ok: false,
          error: 'Market region is missing, cannot create fine-cut leads table.'
        }, { status: 400 });
      }

      const { data: createdTableName, error: fineCutTableError } = await supabaseAdmin.rpc(
        'create_market_specific_fine_cut_leads_table',
        {
          p_market_region_raw_name: marketRegion
        }
      );

      console.log('RPC create_market_specific_fine_cut_leads_table response:', { data: createdTableName, error: fineCutTableError });

      if (fineCutTableError) {
        console.error(`RPC call to create_market_specific_fine_cut_leads_table failed for ${marketRegion}:`, fineCutTableError);
        if (objectPath) {
          console.log(`Attempting to cleanup storage file ${objectPath} due to fine-cut leads table creation RPC error...`);
          await supabaseAdmin.storage.from(bucket).remove([objectPath]);
        }
        return NextResponse.json({
          ok: false,
          error: `RPC error when creating market-specific fine-cut leads table for '${marketRegion}'.`,
          details: fineCutTableError.message
        }, { status: 500 });
      }

      if (!createdTableName || typeof createdTableName !== 'string') {
        console.error(`API: Market-specific fine-cut leads table creation for ${marketRegion} did not return a valid table name. Response:`, createdTableName);
        if (objectPath) {
          console.log(`Attempting to cleanup storage file ${objectPath} due to unexpected response from table creation...`);
          await supabaseAdmin.storage.from(bucket).remove([objectPath]);
        }
        return NextResponse.json({
          ok: false,
          error: `Market-specific fine-cut leads table creation for '${marketRegion}' failed to return a table name or returned unexpected data.`,
          details: createdTableName === null ? 'No data returned.' : createdTableName
        }, { status: 500 });
      }

      console.log(`API: Market-specific fine-cut leads table '${createdTableName}' operation successful for ${marketRegion}.`);

      // Upsert into market_regions table
      console.log(`API: Upserting market region data for ${marketRegion} with lead count ${totalProcessed}`);
      const { data: marketRegionData, error: marketRegionError } = await supabaseAdmin
        .from('market_regions')
        .upsert(
          {
            name: marketRegion,
            lead_count: totalProcessed,
            created_by: userId,
          },
          {
            onConflict: 'name',
          }
        )
        .select();

      if (marketRegionError) {
        console.error(`API Error: Failed to upsert into market_regions for ${marketRegion}:`, marketRegionError);
      } else {
        console.log(`API: Successfully upserted market region ${marketRegion} with lead count ${totalProcessed}. Data:`, marketRegionData);
      }

      // Truncate normalized_leads table
      console.log('API: Attempting to truncate normalized_leads table...');
      const { error: truncateError } = await supabaseAdmin.rpc('truncate_normalized_leads');

      if (truncateError) {
        console.error('API Error: Failed to truncate normalized_leads table:', truncateError);
        if (objectPath) {
          console.log(`Attempting to cleanup storage file ${objectPath} due to normalized_leads truncation RPC error...`);
          await supabaseAdmin.storage.from(bucket).remove([objectPath]);
        }
        return NextResponse.json({
          ok: false,
          error: 'Failed to clear normalized_leads table after processing.',
          details: truncateError.message
        }, { status: 500 });
      } else {
        console.log('API: normalized_leads table truncated successfully.');
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully processed ${totalProcessed} leads from ${originalFileName}. Market-specific fine-cut leads table '${createdTableName}' created for market '${marketRegion}'. Market region info updated. Staging area cleared.`,
        staged_lead_count: totalProcessed,
        created_fine_cut_table: createdTableName
      });

    } else {
      // Not all chunks received yet
      return NextResponse.json({ 
        ok: true, 
        message: `Chunk ${chunkIndex + 1} of ${totalChunks} for ${uploadId} received.` 
      });
    }

  } catch (error: any) {
    console.error('API: Unhandled error in POST /api/leads/upload (chunk processing):', error);
    
    // Cleanup temp directory
    try {
      const dirExists = await fs.stat(tempDir).then(stat => stat.isDirectory()).catch(() => false);
      if (dirExists) {
        console.log(`Attempting to cleanup temporary directory ${tempDir} due to error...`);
        const files = await fs.readdir(tempDir);
        for (const file of files) {
          await fs.unlink(path.join(tempDir, file));
        }
        await fs.rmdir(tempDir);
        console.log(`Temporary directory ${tempDir} cleaned up.`);
      }
    } catch (cleanupError) {
      console.error(`API: Error during tempDir cleanup for ${uploadId}:`, cleanupError);
    }
    
    // Cleanup storage file if exists
    if (objectPath) {
      console.log(`Attempting to cleanup orphaned storage file: ${objectPath} due to error...`);
      try {
        await supabaseAdmin.storage.from(bucket).remove([objectPath]);
        console.log(`Successfully cleaned up orphaned storage file: ${objectPath}`);
      } catch (cleanupStorageError) {
        console.error(`Failed to cleanup orphaned storage file ${objectPath}:`, cleanupStorageError);
      }
    }

    const errorMessage = 'An unexpected error occurred during chunk processing.';
    const errorDetails = error.message || 'No additional details available.';
    
    return NextResponse.json(
      { ok: false, error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}

// Basic GET handler for health check or testing
export async function GET(request: NextRequest) {
  return NextResponse.json({ message: 'Lead upload API is active.' });
}