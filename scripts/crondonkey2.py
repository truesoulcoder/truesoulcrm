# crondonkey.py - REWRITTEN & TUNED

import os
import csv
import time
import requests
import logging
import json
from datetime import datetime, timezone
import sys
import traceback
from supabase import create_client, Client as SupabaseClient
from dotenv import load_dotenv

# --- Configuration ---
# (This section remains the same)
dotenv_path_local = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
dotenv_path_env = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(dotenv_path=dotenv_path_local, override=True)
load_dotenv(dotenv_path=dotenv_path_env)

# --- (Logging and other configurations remain the same) ---
# ...
# This setup is fine, so it is omitted for brevity. Assume it's here.
# ...

# --- Supabase Client ---
# It's better to create one client and pass it around.
try:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    logger.info("Successfully connected to Supabase.")
except Exception as e:
    logger.critical(f"Failed to initialize Supabase client: {e}", exc_info=True)
    sys.exit(1)

# --- API Interaction ---
def send_job_id_to_api(job_id: int):
    logger.info(f"Attempting to send job_id '{job_id}' to API: {API_ENDPOINT}")
    payload = {"sendToLead": True, "jobId": job_id}
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(API_ENDPOINT, json=payload, headers=headers, timeout=60)
        
        if not response.ok:
            logger.error(f"API call failed for job_id {job_id}. Status: {response.status_code}. Response: {response.text}")
            return False
        
        logger.info(f"Successfully sent job_id '{job_id}'. API Status: {response.status_code}.")
        return True
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending job_id '{job_id}' to API {API_ENDPOINT}: {e}")
        return False

# --- Job Processing Logic (Revised for Reliability) ---
def process_manifest(csv_filepath: str, db_client: SupabaseClient):
    logger.info(f"Processing manifest file: {csv_filepath}")

    try:
        with open(csv_filepath, mode='r', encoding='utf-8-sig') as infile:
            reader = csv.DictReader(infile)
            jobs_to_process = list(reader)
    except FileNotFoundError:
        logger.error(f"Manifest file '{csv_filepath}' not found.")
        return
    except Exception as e:
        logger.error(f"Error reading CSV file '{csv_filepath}': {e}", exc_info=True)
        return

    job_ids_from_csv = [int(job['job_id']) for job in jobs_to_process if job.get('job_id')]
    if not job_ids_from_csv:
        logger.info("No job IDs found in the manifest file.")
        return

    # --- REVISED: Use database as the source of truth, not a state file ---
    try:
        res = db_client.table("campaign_jobs").select("id, status").in_("id", job_ids_from_csv).execute()
        processed_jobs_map = {job['id']: job['status'] for job in res.data}
    except Exception as e:
        logger.error(f"Could not check job statuses in Supabase: {e}. Aborting this cycle to be safe.")
        return

    for job_row in jobs_to_process:
        try:
            job_id = int(job_row['job_id'])
            
            # --- REVISED CHECK ---
            # Skip if the job has a terminal status in the database.
            job_status = processed_jobs_map.get(job_id)
            if job_status and job_status not in ['pending', 'failed_sending']:
                 logger.debug(f"Job ID {job_id} already has status '{job_status}'. Skipping.")
                 continue

            # Check if the job is scheduled to run
            next_processing_time_str = job_row.get('next_processing_time')
            if not next_processing_time_str:
                logger.warning(f"Skipping job ID {job_id} due to missing 'next_processing_time'.")
                continue
            
            if next_processing_time_str.endswith('Z'):
                next_processing_time_dt = datetime.fromisoformat(next_processing_time_str[:-1] + '+00:00')
            else:
                next_processing_time_dt = datetime.fromisoformat(next_processing_time_str)
            
            if next_processing_time_dt.tzinfo is None:
                next_processing_time_dt = next_processing_time_dt.replace(tzinfo=timezone.utc)

            if next_processing_time_dt <= datetime.now(timezone.utc):
                logger.info(f"Job ID {job_id} is due. Triggering API.")
                send_job_id_to_api(job_id)
            else:
                logger.debug(f"Job ID {job_id} not yet due (Due: {next_processing_time_dt}).")

        except (ValueError, KeyError) as e:
            logger.error(f"Skipping invalid row in manifest: {job_row}. Error: {e}")
        except Exception as e:
            logger.error(f"Unexpected error processing job row: {job_row}. Error: {e}", exc_info=True)

def main_loop(csv_filepath: str):
    logger.info(f"Crondonkey starting. Polling: {POLLING_INTERVAL_SECONDS}s. API: {API_ENDPOINT}")
    
    # --- NOTE ---
    # The call to gmail_event_monitor is removed from this script.
    # It's better practice to run crondonkey.py and gmail_event_monitor.py as two
    # separate, independent processes managed by your OS scheduler (like cron or Task Scheduler).

    while True:
        logger.info(f"Starting new processing cycle for {csv_filepath}...")
        
        process_manifest(csv_filepath, supabase_client)
        
        # --- REMOVED ---
        # The broken database update block that was here has been removed.
        # The API is now responsible for all updates after sending an email.
        
        logger.info(f"Cycle finished. Sleeping for {POLLING_INTERVAL_SECONDS} seconds...")
        time.sleep(POLLING_INTERVAL_SECONDS)

if __name__ == "__main__":
    manifest_path = os.getenv("CRON_MANIFEST_PATH", "job_manifest.csv") 
    main_loop(manifest_path)