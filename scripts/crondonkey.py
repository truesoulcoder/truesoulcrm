import os
import csv
import time
import requests
import logging
import json
from datetime import datetime, timezone

# --- Configuration ---
LOG_LEVEL = os.getenv("CRON_LOG_LEVEL", "INFO").upper()
API_ENDPOINT = os.getenv("CRON_API_ENDPOINT", "http://localhost:3000/api/engine/send-email")
STATE_FILE = "crondonkey_state.json"
POLLING_INTERVAL_SECONDS = int(os.getenv("CRON_POLLING_INTERVAL_SECONDS", 30))

logging.basicConfig(level=LOG_LEVEL, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- State Management ---
def load_state():
    try:
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            state_data = json.load(f)
            processed_ids = set(state_data.get("processed_job_ids", []))
            logger.info(f"Successfully loaded state from '{STATE_FILE}'. Processed IDs: {len(processed_ids)}")
            return processed_ids
    except FileNotFoundError:
        logger.warning(f"State file '{STATE_FILE}' not found. Starting fresh.")
        return set()
    except (IOError, json.JSONDecodeError) as e:
        logger.error(f"Error loading state from '{STATE_FILE}': {e}", exc_info=True)
        return set()

def save_state(processed_job_ids_current_run):
    state_data = {
        "last_shutdown_time_utc": datetime.now(timezone.utc).isoformat(), # Still useful to know last run
        "processed_job_ids": sorted(list(processed_job_ids_current_run))
    }
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state_data, f, indent=4)
        logger.info(f"Successfully saved state to '{STATE_FILE}'.")
    except IOError as e:
        logger.error(f"Error saving state to '{STATE_FILE}': {e}", exc_info=True)

# --- API Interaction ---
def send_job_id_to_api(job_id_from_csv):
    logger.info(f"Attempting to send job_id '{job_id_from_csv}' to API: {API_ENDPOINT}")
    
    payload = {
        "sendToLead": True,
        "jobId": job_id_from_csv # API will use this to look up details in campaign_jobs
    }
    
    headers = {"Content-Type": "application/json"}
    # Add API token/auth if your API endpoint is protected
    # api_token = os.getenv("CRON_API_TOKEN")
    # if api_token:
    #     headers["Authorization"] = f"Bearer {api_token}"

    try:
        response = requests.post(API_ENDPOINT, json=payload, headers=headers, timeout=60)
        response_data = response.json()

        if not response.ok:
            logger.error(f"API call failed for job_id {job_id_from_csv}. Status: {response.status_code}. Response: {response_data}")
            return False
        
        logger.info(f"Successfully sent job_id '{job_id_from_csv}'. API Status: {response.status_code}. Message: {response_data.get('message', 'Processed')}")
        return True
        
    except requests.exceptions.Timeout:
        logger.error(f"Timeout sending job_id {job_id_from_csv} to API {API_ENDPOINT}.")
        return False
    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending job_id '{job_id_from_csv}' to API {API_ENDPOINT}: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_response_summary = e.response.json()
            except ValueError:
                error_response_summary = e.response.text[:500]
            logger.error(f"API Response Status: {e.response.status_code}, Body: {error_response_summary}")
        return False

# --- Job Processing Logic ---
def process_manifest(csv_filepath, processed_job_ids_from_state):
    logger.info(f"Processing manifest file: {csv_filepath}")
    newly_processed_job_ids = set()

    try:
        with open(csv_filepath, mode='r', encoding='utf-8-sig') as infile:
            reader = csv.DictReader(infile)
            if not reader.fieldnames or 'job_id' not in reader.fieldnames or 'next_processing_time' not in reader.fieldnames:
                logger.error(f"CSV file {csv_filepath} is missing 'job_id' or 'next_processing_time' header, or is empty. Columns found: {reader.fieldnames}")
                return newly_processed_job_ids
            jobs_to_process = list(reader)
    except FileNotFoundError:
        logger.error(f"Manifest file '{csv_filepath}' not found.")
        return newly_processed_job_ids
    except Exception as e:
        logger.error(f"Error reading CSV file '{csv_filepath}': {e}", exc_info=True)
        return newly_processed_job_ids

    for job_row in jobs_to_process:
        try:
            job_id_str = job_row.get('job_id')
            if not job_id_str:
                logger.warning(f"Skipping row with missing 'job_id' in CSV: {job_row}")
                continue
            
            job_id = int(job_id_str)

            if job_id in processed_job_ids_from_state or job_id in newly_processed_job_ids:
                logger.debug(f"Job ID {job_id} already processed by this script instance. Skipping.")
                continue

            next_processing_time_str = job_row.get('next_processing_time')
            if not next_processing_time_str:
                logger.warning(f"Skipping job ID {job_id} due to missing 'next_processing_time' in CSV.")
                continue
            
            try:
                # Handles formats like "2025-06-04T19:41:02.254Z"
                if next_processing_time_str.endswith('Z'):
                    next_processing_time_dt = datetime.fromisoformat(next_processing_time_str[:-1] + '+00:00')
                else:
                    next_processing_time_dt = datetime.fromisoformat(next_processing_time_str)
                
                if next_processing_time_dt.tzinfo is None:
                    next_processing_time_dt = next_processing_time_dt.replace(tzinfo=timezone.utc) # Assume UTC if naive

            except ValueError as ve:
                logger.error(f"Error parsing next_processing_time '{next_processing_time_str}' for job ID {job_id}: {ve}. Expected ISO format. Skipping.")
                continue

            current_time_utc = datetime.now(timezone.utc)

            if next_processing_time_dt <= current_time_utc:
                logger.info(f"Job ID {job_id} is due. (Due: {next_processing_time_dt}, Current: {current_time_utc})")
                if send_job_id_to_api(job_id): # Pass only the job_id
                    newly_processed_job_ids.add(job_id)
                else:
                    logger.warning(f"Failed to process job ID {job_id} via API. It will be retried next cycle if not marked processed by API.")
            else:
                logger.debug(f"Job ID {job_id} not yet due (Due: {next_processing_time_dt}). Skipping for now.")
        except Exception as e:
            logger.error(f"Unexpected error processing job row: {job_row}. Error: {e}", exc_info=True)
            
    return newly_processed_job_ids

def main_loop(csv_filepath):
    logger.info(f"Crondonkey (Python/CSV - Simplified Payload) starting. Polling: {POLLING_INTERVAL_SECONDS}s. API: {API_ENDPOINT}")
    processed_ids_from_state = load_state()

    while True:
        logger.info(f"Starting new processing cycle for {csv_filepath}...")
        newly_processed_this_cycle = process_manifest(csv_filepath, processed_ids_from_state)
        
        if newly_processed_this_cycle:
            processed_ids_from_state.update(newly_processed_this_cycle)
            save_state(processed_ids_from_state)
        
        logger.info(f"Cycle finished. Sleeping for {POLLING_INTERVAL_SECONDS} seconds...")
        time.sleep(POLLING_INTERVAL_SECONDS)

if __name__ == "__main__":
    manifest_path = os.getenv("CRON_MANIFEST_PATH", "job_manifest.csv") 
    # Ensure .env.local is in parent dir or env vars are set
    # from dotenv import load_dotenv
    # load_dotenv('../.env.local') # If .env.local is in parent dir of 'scripts'
    main_loop(manifest_path)