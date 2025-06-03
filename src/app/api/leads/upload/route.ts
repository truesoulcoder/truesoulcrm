// src/app/api/leads/upload/route.ts
import { randomUUID } from 'crypto';
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';

import { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'papaparse';

import { Database } from '@/db_types';
import { createAdminServerClient } from '@/lib/supabase/server';

// Helper function to normalize market region names in TypeScript
function normalizeMarketRegionTS(rawName: string | null): string {
  if (!rawName || rawName.trim() === '') {
    // Allow returning a default or handle as error, for now, let's be strict like SQL
    throw new Error('Market region name cannot be empty.');
  }
  let sanitized = rawName.toLowerCase().trim();
  sanitized = sanitized.replace(/[^a-z0-9_]+/g, '_'); // Replace non-alphanumeric (excluding _) with _
  sanitized = sanitized.replace(/^[_]+|[_]+$/g, '');   // Remove leading/trailing underscores
  if (sanitized === '') {
    throw new Error(`Invalid market region name "${rawName}" resulting in empty sanitized name.`);
  }
  return sanitized;
}

// Max execution time for this API route (in seconds)
export const maxDuration = 60; // 1 minute

const BATCH_SIZE = 500; // Define batch size for processing

interface ProcessLeadsResult {
  ok: boolean;
  message?: string;
  error?: string;
  details?: any;
  status?: number;
  warning?: string;
  totalProcessed: number;
}

async function processAndUpsertLeads(
  csvText: string,
  supabaseClient: SupabaseClient<Database>, // Use SupabaseClient type from '@supabase/supabase-js'
  marketRegionRaw: string, // Raw market region name from form
  userId: string,
  originalFileName: string
): Promise<ProcessLeadsResult> {
  let allInsertedData: any[] = [];
  let totalProcessed = 0;
  let hasError = false;
  let processingError: any = null;

  try {
    console.log(`processAndUpsertLeads: Starting for market ${marketRegionRaw}, file ${originalFileName}`);
    await processCSV(
      csvText,
      BATCH_SIZE,
      async (chunkToProcess, isLastChunk) => {
        if (hasError) return;
        try {
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
              market_region: marketRegionRaw, // Store raw market region in leads table
              raw_data: rawDataPayload,
            };
          });

          if (leadsToInsert.length > 0) {
            const { data: batchInsertedData, error: batchInsertErr } = await supabaseClient
              .from('leads')
              .insert(leadsToInsert)
              .select('id');

            if (batchInsertErr) {
              console.error('processAndUpsertLeads: Batch insert error:', batchInsertErr);
              throw batchInsertErr;
            }
            if (batchInsertedData) allInsertedData = [...allInsertedData, ...batchInsertedData];
            totalProcessed += chunkToProcess.length;
          }
        } catch (error) {
          hasError = true;
          processingError = error;
          throw error; 
        }
      }
    );

    if (hasError && processingError) throw processingError;
    if (totalProcessed === 0) {
      return { ok: false, error: 'No data found in CSV file.', status: 400, totalProcessed: 0 };
    }

    console.log(`processAndUpsertLeads: CSV processing done. ${totalProcessed} rows staged into 'leads' table. Normalizing...`);

    const { error: rpcError } = await supabaseClient.rpc('normalize_staged_leads', { 
      p_market_region: marketRegionRaw 
    });

    if (rpcError) {
      console.error('processAndUpsertLeads: RPC normalize_staged_leads failed:', rpcError);
      return {
        ok: false,
        error: 'Failed to normalize staged leads.',
        details: rpcError.message,
        status: 500,
        totalProcessed
      };
    }
    console.log('processAndUpsertLeads: Normalization successful. Leads are now in normalized_leads.');
    return { 
      ok: true, 
      message: `Successfully processed and normalized ${totalProcessed} leads.`, 
      totalProcessed 
    };

  } catch (error: any) { // Explicitly type error as any for broader compatibility
    console.error('processAndUpsertLeads: Error:', error);
    let errorMessage = 'Failed to process and upsert leads.';
    // Check if error.message exists and is a string before calling .includes()
    if (error && typeof error.message === 'string') {
      const messageString: string = error.message;
      if (messageString.includes('violates row-level security policy')) {
        errorMessage = 'Permission denied during CSV processing.';
      } else if (messageString.includes('invalid input syntax')) {
        errorMessage = 'Invalid data format in CSV.';
      }
    }
    
    return { 
      ok: false, 
      error: errorMessage, 
      details: error && error.message ? error.message : 'No specific error message available.', 
      status: 500,
      totalProcessed 
    };
  }
}

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

  const supabase: SupabaseClient<Database> = await createAdminServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('API Error: User not authenticated for lead upload.', userError);
    return NextResponse.json({ ok: false, error: 'User not authenticated.' }, { status: 401 });
  }
  const userId = user.id;
  console.log('API: Authenticated user ID for lead upload:', userId);

  const formData = await request.formData();

  const rawMarketRegionFromForm = formData.get('market_region') as string | null;
  if (!rawMarketRegionFromForm || rawMarketRegionFromForm.trim() === '') {
    console.error('API Error: Market region is missing from the request.');
    return NextResponse.json({ ok: false, error: 'Market region is required.' }, { status: 400 });
  }

  let tsNormalizedMarketRegion: string;
  try {
    tsNormalizedMarketRegion = normalizeMarketRegionTS(rawMarketRegionFromForm);
  } catch (e: any) {
    console.error('API Error: Invalid market region format.', e.message);
    return NextResponse.json({ ok: false, error: `Invalid market region: ${e.message}` }, { status: 400 });
  }

  const chunkFile = formData.get('file') as File | null;
  const uploadId = formData.get('uploadId') as string | null;
  const chunkIndexStr = formData.get('chunkIndex') as string | null;
  const totalChunksStr = formData.get('totalChunks') as string | null;
  const originalFileName = formData.get('fileName') as string | null;

  console.log('API: Chunk upload request details:');
  console.log(`  uploadId: ${uploadId}, chunkIndex: ${chunkIndexStr}, totalChunks: ${totalChunksStr}`);
  console.log(`  fileName: ${originalFileName}, marketRegion: ${rawMarketRegionFromForm}`);
  console.log('  Chunk file object:', chunkFile ? { name: chunkFile.name, type: chunkFile.type, size: chunkFile.size } : 'No chunk file found');

  if (!chunkFile || !uploadId || chunkIndexStr === null || totalChunksStr === null || !originalFileName) {
    console.error('API Error: Missing chunk metadata or file.');
    return NextResponse.json({ ok: false, error: 'Invalid chunk request: missing required fields.' }, { status: 400 });
  }

  const chunkIndex = parseInt(chunkIndexStr, 10);
  const totalChunks = parseInt(totalChunksStr, 10);

  if (isNaN(chunkIndex) || isNaN(totalChunks) || chunkIndex < 0 || totalChunks <= 0 || chunkIndex >= totalChunks) {
    return NextResponse.json({ ok: false, error: 'Invalid chunk metadata: chunkIndex or totalChunks out of bounds or not a number.' }, { status: 400 });
  }

  const tempDir = path.join('/tmp', 'crm-uploads', uploadId);
  const chunkFilePath = path.join(tempDir, `${chunkIndex}`);

  try { // Main try for chunk file operations
    await fs.mkdir(tempDir, { recursive: true });
    const chunkBuffer = Buffer.from(await chunkFile.arrayBuffer());
    await fs.writeFile(chunkFilePath, chunkBuffer);
    console.log(`API: Chunk ${chunkIndex + 1}/${totalChunks} for ${uploadId} (${originalFileName}) saved to ${chunkFilePath}`);

    if (chunkIndex === totalChunks - 1) {
      // Last chunk, combine all chunks
      console.log(`API: Last chunk received for ${uploadId}. Combining all ${totalChunks} chunks.`);
      const chunkPaths = Array.from({ length: totalChunks }, (_, i) => path.join(tempDir, `${i}`));
      const combinedCsvFilePath = path.join(tempDir, `combined_${originalFileName}`);

      const outputStream = createWriteStream(combinedCsvFilePath);
      for (const p of chunkPaths) {
        try {
          const data = await fs.readFile(p);
          outputStream.write(data);
          await fs.unlink(p); 
        } catch (readError: any) {
          console.error(`API: Error reading chunk ${p} for combining:`, readError);
          outputStream.end();
          // tempDir cleanup will be handled by the main catch block
          return NextResponse.json({ ok: false, error: `Failed to read chunk ${p} during reassembly.` }, { status: 500 });
        }
      }
      outputStream.end();
      await new Promise<void>((resolve, reject) => { // Added <void> for Promise type
        outputStream.on('finish', resolve);
        outputStream.on('error', (err: Error) => { // Typed err as Error
            console.error("API: Error during combined file stream write:", err);
            reject(err); // This will be caught by the outer try-catch
        });
      });
      console.log(`API: All chunks combined into ${combinedCsvFilePath}`);
      
      const combinedCsvText = await fs.readFile(combinedCsvFilePath, 'utf-8');
      await fs.unlink(combinedCsvFilePath); // Delete combined file after reading
      
      // Process the combined CSV data
      const processingResult = await processAndUpsertLeads(combinedCsvText, supabase, rawMarketRegionFromForm, userId, originalFileName);

      if (!processingResult.ok) {
        // tempDir cleanup handled by main catch
        return NextResponse.json({ ok: false, error: processingResult.error, details: processingResult.details, warning: processingResult.warning }, { status: processingResult.status || 500 });
      }

      const totalProcessedLeads = processingResult.totalProcessed;
      console.log(`API: processAndUpsertLeads successful. Total leads processed and normalized: ${totalProcessedLeads}`);

      console.log(`API: Creating market-specific fine-cut leads table for market: ${rawMarketRegionFromForm}`);
      const { data: createdTableName, error: fineCutTableError } = await supabase.rpc(
        'create_market_specific_fine_cut_leads_table',
        { p_market_region_raw_name: rawMarketRegionFromForm }
      );

      if (fineCutTableError) {
        console.error(`RPC call to create_market_specific_fine_cut_leads_table failed for ${rawMarketRegionFromForm}:`, fineCutTableError);
        return NextResponse.json({
          ok: false,
          error: `RPC error when creating market-specific fine-cut leads table for '${rawMarketRegionFromForm}'.`,
          details: fineCutTableError.message
        }, { status: 500 });
      }

      if (!createdTableName || typeof createdTableName !== 'string') {
        console.error(`API: Market-specific fine-cut leads table creation for ${rawMarketRegionFromForm} did not return a valid table name. Response:`, createdTableName);
        return NextResponse.json({
          ok: false,
          error: `Market-specific fine-cut leads table creation for '${rawMarketRegionFromForm}' failed to return a table name. Expected string, got: ${typeof createdTableName}.`,
          details: String(createdTableName)
        }, { status: 500 });
      }
      console.log(`API: Market-specific fine-cut leads table '${createdTableName}' operation successful for ${rawMarketRegionFromForm}.`);

      console.log(`API: Upserting market region data for ${tsNormalizedMarketRegion} (raw: ${rawMarketRegionFromForm}) with lead count ${totalProcessedLeads}`);
      const { data: marketRegionUpsertData, error: marketRegionUpsertError } = await supabase
        .from('market_regions')
        .upsert({
          name: tsNormalizedMarketRegion,
          raw_name: rawMarketRegionFromForm,
          lead_count: totalProcessedLeads,
          created_by: userId,
          last_processed_at: new Date().toISOString(),
        }, { onConflict: 'name' })
        .select();

      if (marketRegionUpsertError) {
        console.error(`API Error: Failed to upsert into market_regions for ${tsNormalizedMarketRegion}:`, marketRegionUpsertError);
      } else {
        console.log(`API: Successfully upserted market region ${tsNormalizedMarketRegion}. Data:`, marketRegionUpsertData);
      }

      console.log('API: Attempting to truncate normalized_leads table...');
      const { error: truncateError } = await supabase.rpc('truncate_normalized_leads');
      if (truncateError) {
        console.error('API Error: Failed to truncate normalized_leads table:', truncateError);
      } else {
        console.log('API: normalized_leads table truncated successfully.');
      }
      
      return NextResponse.json({
        ok: true,
        message: `Successfully processed ${totalProcessedLeads} leads from ${originalFileName}. Market-specific table '${createdTableName}' for ${rawMarketRegionFromForm} created/updated. Market region info updated. Staging area cleared. ${processingResult.message || ''}`.trim(),
        details: {
          processedLeads: totalProcessedLeads,
          marketRegion: rawMarketRegionFromForm,
          normalizedMarketRegion: tsNormalizedMarketRegion,
          fineCutTable: createdTableName,
          uploadWarnings: processingResult.warning
        }
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
    
    // Cleanup temp directory for chunks
    try {
      // Check if tempDir was defined (it should be if error happened after its declaration)
      if (typeof tempDir !== 'undefined' && tempDir) { 
        const dirExists = await fs.stat(tempDir).then(stat => stat.isDirectory()).catch(() => false);
        if (dirExists) {
          console.log(`Attempting to cleanup temporary directory ${tempDir} due to error...`);
          await fs.rm(tempDir, { recursive: true, force: true }); // Corrected to fs.rm
          console.log(`Temporary directory ${tempDir} cleaned up.`);
        }
      }
    } catch (cleanupError: any) {
      console.error(`API: Failed to cleanup temporary directory ${tempDir}:`, cleanupError.message, cleanupError.stack);
    }

    // Determine error message and details safely
    const errorMessage = 'An unexpected error occurred during file processing.';
    const errorDetails = (error && error.message) ? error.message : 'No specific error details available.';
    const errorStack = (error && error.stack && process.env.NODE_ENV === 'development') ? error.stack : undefined;

    return NextResponse.json({ 
      ok: false, 
      error: errorMessage, 
      details: errorDetails, 
      stack: errorStack 
    }, { status: 500 });
  }
}

// Basic GET handler for health check or testing
export async function GET(request: NextRequest) {
  return NextResponse.json({ message: 'Lead upload API is active.' });
}