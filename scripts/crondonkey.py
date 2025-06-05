import os
import csv
import time
import requests
import logging
import json
from datetime import datetime, timezone
import sys # Added for exit and traceback
import traceback # Added for detailed error logging
from supabase import create_client, Client as SupabaseClient # Added SupabaseClient for type hinting

# --- Import the Gmail event monitor --- 
# Assuming gmail_event_monitor.py is in the same directory (scripts/)
try:
    import gmail_event_monitor 
except ModuleNotFoundError:
    logging.getLogger(__name__).error("CRITICAL: Could not import gmail_event_monitor.py. Ensure it's in the same directory as crondonkey.py or PYTHONPATH is set.")
    sys.exit(1)

# --- Configuration --- 
# Load .env files. gmail_event_monitor also does this, but good for crondonkey's own vars.
# Assumes .env.local and .env are in the parent directory of 'scripts/'
from dotenv import load_dotenv
dotenv_path_local = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
dotenv_path_env = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(dotenv_path=dotenv_path_local, override=True)
load_dotenv(dotenv_path=dotenv_path_env)

OVERALL_LOG_LEVEL = os.getenv('OVERALL_LOG_LEVEL', 'DEBUG').upper()
CRONDONKEY_LOG_LEVEL = os.getenv('CRONDONKEY_LOG_LEVEL', 'INFO').upper()
SUPABASE_LOG_LEVEL = os.getenv('SUPABASE_LOG_LEVEL', 'INFO').upper() # New: Log level for Supabase

# Supabase Configuration
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

API_ENDPOINT = os.getenv("CRON_API_ENDPOINT", "http://localhost:3000/api/engine/send-email")
STATE_FILE = "crondonkey_state.json"
POLLING_INTERVAL_SECONDS = int(os.getenv("CRON_POLLING_INTERVAL_SECONDS", 30))

# --- Gmail Monitoring Configuration ---
GMAIL_MONITOR_INTERVAL_SECONDS = int(os.getenv("GMAIL_MONITOR_INTERVAL_SECONDS", 15 * 60)) # Default 15 minutes
last_gmail_monitor_run_time = 0 # Initialize to ensure it runs on first suitable cycle

# --- SupabaseLogHandler Class Definition ---
class SupabaseLogHandler(logging.Handler):
    def __init__(self, supabase_client: SupabaseClient, supabase_table_name: str = 'system_script_logs'):
        super().__init__()
        self.supabase_client = supabase_client
        self.supabase_table_name = supabase_table_name
        self.script_name = os.path.basename(__file__) # Get the name of the current script

    def emit(self, record: logging.LogRecord):
        if not self.supabase_client:
            # Fallback or error if Supabase client isn't initialized
            print(f"Supabase client not initialized. Log not sent: {self.format(record)}")
            return
        try:
            log_entry = {
                'created_at': datetime.utcnow().isoformat(), # Changed 'timestamp' to 'created_at'
                'script_name': self.script_name,
                'log_level': record.levelname,
                'message': self.format(record),
                'details': {}  # Changed 'details_json' to 'details'
            }
            if record.exc_info:
                log_entry['details']['exception'] = logging.Formatter().formatException(record.exc_info)
            
            self.supabase_client.table(self.supabase_table_name).insert(log_entry).execute()
        except Exception as e:
            # Handle exceptions during logging to Supabase, e.g., print to stderr
            print(f"Failed to send log to Supabase: {e}\nRecord: {self.format(record)}")

# --- Logger Setup ---
# Get the root logger
root_logger = logging.getLogger()
root_logger.setLevel(OVERALL_LOG_LEVEL)

# Create a console handler for the root logger
console_handler = logging.StreamHandler()
console_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(console_formatter)
# Add console handler to root logger only if it doesn't have one to avoid duplicate console logs
if not any(isinstance(h, logging.StreamHandler) for h in root_logger.handlers):
    root_logger.addHandler(console_handler)

# Create a specific logger for crondonkey
crondonkey_logger = logging.getLogger('crondonkey')
crondonkey_logger.setLevel(CRONDONKEY_LOG_LEVEL)
crondonkey_logger.propagate = False  # Prevent logs from being passed to the root logger's handlers if we add specific ones

# Add the console handler to crondonkey_logger if it's not already there or if no root handlers exist
# This ensures crondonkey logs go to console at its specific level
if not crondonkey_logger.handlers:
    crondonkey_console_handler = logging.StreamHandler() # Separate handler for crondonkey console output
    crondonkey_console_handler.setFormatter(console_formatter)
    crondonkey_console_handler.setLevel(CRONDONKEY_LOG_LEVEL) # Ensure this handler respects crondonkey's level
    crondonkey_logger.addHandler(crondonkey_console_handler)

# Initialize Supabase client for logging
supabase_client_for_logging: SupabaseClient = None
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    try:
        supabase_client_for_logging = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        crondonkey_logger.info("Successfully connected to Supabase for logging.")
        
        # Create and add SupabaseLogHandler to crondonkey_logger
        supabase_handler = SupabaseLogHandler(supabase_client=supabase_client_for_logging)
        supabase_handler.setLevel(SUPABASE_LOG_LEVEL) # Set level for logs sent to Supabase
        supabase_log_formatter = logging.Formatter('%(message)s') # Keep Supabase messages clean
        supabase_handler.setFormatter(supabase_log_formatter)
        crondonkey_logger.addHandler(supabase_handler)
        crondonkey_logger.info(f"SupabaseLogHandler added to crondonkey_logger. Logs >= {SUPABASE_LOG_LEVEL} will be sent to Supabase.")

    except Exception as e:
        crondonkey_logger.error(f"Failed to initialize Supabase client or add SupabaseLogHandler: {e}", exc_info=True)
else:
    crondonkey_logger.warning("Supabase URL or Service Key not configured. Supabase logging disabled.")

logger = crondonkey_logger

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
    global last_gmail_monitor_run_time # Declare as global to modify it
    logger.info(f"Crondonkey (Python/CSV - Simplified Payload) starting. Polling: {POLLING_INTERVAL_SECONDS}s. API: {API_ENDPOINT}")
    logger.info(f"Gmail Event Monitoring Interval: {GMAIL_MONITOR_INTERVAL_SECONDS}s")
    processed_ids_from_state = load_state()

    # Ensure Gmail monitor runs on the first suitable cycle after startup
    last_gmail_monitor_run_time = time.time() - GMAIL_MONITOR_INTERVAL_SECONDS

    while True:
        logger.info(f"Starting new processing cycle for {csv_filepath}...")
        
        # --- Task 1: Job Manifest Processing ---
        newly_processed_this_cycle = process_manifest(csv_filepath, processed_ids_from_state)
        
        if newly_processed_this_cycle:
            processed_ids_from_state.update(newly_processed_this_cycle)
            save_state(processed_ids_from_state)
        
        # --- Task 2: Gmail Inbox Monitoring ---
        current_time = time.time()
        if (current_time - last_gmail_monitor_run_time) >= GMAIL_MONITOR_INTERVAL_SECONDS:
            logger.info(f"Interval reached. Triggering Gmail inbox monitoring...")
            try:
                gmail_event_monitor.monitor_all_active_senders()
                last_gmail_monitor_run_time = current_time # Update last run time
            except Exception as e:
                logger.error(f"CRITICAL ERROR during Gmail monitoring execution: {e}")
                logger.error(traceback.format_exc()) # Log full traceback
                # Optionally, update last_gmail_monitor_run_time here too to prevent rapid retries
                # if the error is persistent and you want a cool-down.
                # last_gmail_monitor_run_time = current_time 
        else:
            logger.debug(f"Gmail monitor interval not yet reached. Next check in approx. {int(GMAIL_MONITOR_INTERVAL_SECONDS - (current_time - last_gmail_monitor_run_time))}s.")

        logger.info(f"Cycle finished. Sleeping for {POLLING_INTERVAL_SECONDS} seconds...")
        time.sleep(POLLING_INTERVAL_SECONDS)

if __name__ == "__main__":
    manifest_path = os.getenv("CRON_MANIFEST_PATH", "job_manifest.csv") 
    main_loop(manifest_path)