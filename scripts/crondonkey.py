import csv
import logging
from datetime import datetime, timezone, timedelta # Added timedelta
import time
import requests
from apscheduler.schedulers.blocking import BlockingScheduler
import json # Added for state management
import os   # Added for checking file existence

# --- Configuration ---
MANIFEST_CSV_FILE = "job_manifest.csv"
STATE_FILE = "crondonkey_state.json" # For storing last shutdown time and processed jobs
API_ENDPOINT = "http://localhost:3000/api/engine/send-email"
API_TOKEN = None

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(schedulerName)s - %(jobName)s - %(message)s')
{{ ... }}
logger = logging.getLogger(__name__)

# --- State Management Functions ---
def load_state():
    """Loads the last shutdown time and processed job IDs from the state file."""
    if not os.path.exists(STATE_FILE):
        logger.info(f"State file '{STATE_FILE}' not found. Assuming first run or clean start.")
        return None, set()  # No last shutdown time, empty set of processed IDs

    try:
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            state_data = json.load(f)
        
        last_shutdown_time_utc_str = state_data.get("last_shutdown_time_utc")
        last_shutdown_time_utc = datetime.fromisoformat(last_shutdown_time_utc_str) if last_shutdown_time_utc_str else None
        
        processed_job_ids = set(state_data.get("processed_job_ids", []))
        
        if last_shutdown_time_utc:
            logger.info(f"Loaded state: Last shutdown was at {last_shutdown_time_utc.isoformat()}.")
        logger.info(f"Loaded {len(processed_job_ids)} processed job IDs from state.")
        return last_shutdown_time_utc, processed_job_ids
    except (FileNotFoundError, json.JSONDecodeError, TypeError, ValueError) as e:
        logger.error(f"Error loading state file '{STATE_FILE}': {e}. Starting fresh.", exc_info=True)
        return None, set()

def save_state(last_shutdown_time_utc, processed_job_ids):
    """Saves the current shutdown time and all processed job IDs to the state file."""
    state_data = {
        "last_shutdown_time_utc": last_shutdown_time_utc.isoformat() if last_shutdown_time_utc else None,
        "processed_job_ids": sorted(list(processed_job_ids)) # Store as sorted list
    }
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state_data, f, indent=4)
        logger.info(f"Successfully saved state to '{STATE_FILE}'.")
    except IOError as e:
        logger.error(f"Error saving state to '{STATE_FILE}': {e}", exc_info=True)

# --- API Interaction ---
def send_job_to_api(job_id, processed_job_ids_current_session): # Modified to accept current session's processed IDs
    """Sends the job ID to the configured email workflow API."""
{{ ... }}
    try:
        response = requests.post(API_ENDPOINT, json=payload, headers=headers, timeout=60) 
        response.raise_for_status()
        response_summary = response.text[:500]
        logger.info(f"Successfully sent job_id '{job_id}'. Status: {response.status_code}. Response: {response_summary}")
        processed_job_ids_current_session.add(job_id) # Add to current session's set on success
        return True
{{ ... }}
    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending job_id '{job_id}' to API {API_ENDPOINT}: {e}")
        if e.response is not None:
            error_response_summary = e.response.text[:500]
            logger.error(f"API Response Status: {e.response.status_code}, Body: {error_response_summary}")
        return False # Return False, job_id not added to processed_job_ids_current_session

# --- Job Scheduling Logic ---
def load_and_schedule_jobs(scheduler, csv_filepath, processed_job_ids_from_state, last_shutdown_time_utc, processed_job_ids_current_session):
    """Loads jobs from the CSV manifest, adjusts schedules based on downtime, and schedules them."""
    jobs_scheduled_count = 0
    jobs_skipped_past_count = 0
    jobs_already_processed_count = 0
    
    now_utc = datetime.now(timezone.utc)
    downtime_delta = timedelta(0) # Initialize to zero

    if last_shutdown_time_utc:
        # Ensure last_shutdown_time_utc is timezone-aware (should be if loaded correctly)
        if last_shutdown_time_utc.tzinfo is None:
             last_shutdown_time_utc = last_shutdown_time_utc.replace(tzinfo=timezone.utc) # Defensive
        
        if now_utc > last_shutdown_time_utc:
            downtime_delta = now_utc - last_shutdown_time_utc
            logger.info(f"Calculated downtime: {downtime_delta}. Schedules will be adjusted.")
        else:
            logger.warning(f"Current time {now_utc.isoformat()} is not after last shutdown {last_shutdown_time_utc.isoformat()}. No downtime adjustment.")


    try:
        with open(csv_filepath, mode='r', encoding='utf-8') as infile:
            reader = csv.DictReader(infile)
            if 'job_id' not in reader.fieldnames or 'next_processed_time' not in reader.fieldnames:
                logger.error(f"CSV file must contain 'job_id' and 'next_processed_time' columns.")
                return
            
            manifest_jobs = list(reader) # Read all jobs to allow modification of scheduler based on full list
            logger.info(f"Read {len(manifest_jobs)} jobs from manifest '{csv_filepath}'.")

            for row_number, row in enumerate(manifest_jobs, 1):
                job_id = row.get('job_id')
                time_str = row.get('next_processed_time')

                if not job_id or not time_str:
                    logger.warning(f"Skipping row {row_number} due to missing job_id or next_processed_time: {row}")
                    continue

                if job_id in processed_job_ids_from_state:
                    logger.info(f"Job_id '{job_id}' was already processed in a previous session. Skipping.")
                    jobs_already_processed_count += 1
                    continue
                
                # Check if already scheduled in this run (e.g. if script was restarted quickly without shutdown)
                # This check is more for robustness, as processed_job_ids_current_session should be empty on fresh load_and_schedule
                if job_id in processed_job_ids_current_session:
                    logger.info(f"Job_id '{job_id}' was already processed in THIS session (unexpected). Skipping.")
                    continue


                try:
                    if time_str.endswith('Z'):
                        time_str_adjusted = time_str[:-1] + '+00:00'
                    else:
                        time_str_adjusted = time_str
                    
                    original_scheduled_time_aware = datetime.fromisoformat(time_str_adjusted)
                    
                    # Apply downtime_delta
                    adjusted_scheduled_time_aware = original_scheduled_time_aware + downtime_delta
                    
                    # Ensure it's UTC for internal consistency
                    adjusted_scheduled_time_utc = adjusted_scheduled_time_aware.astimezone(timezone.utc)

                    # Compare with now_utc (which is also UTC)
                    if adjusted_scheduled_time_utc <= now_utc:
                        logger.warning(
                            f"Original time {original_scheduled_time_aware.isoformat()}, "
                            f"Adjusted time {adjusted_scheduled_time_utc.isoformat()} for job_id '{job_id}' is in the past. "
                            f"Consider running immediately or skipping. For now, skipping." 
                            # TODO: Add logic here to run immediately if desired, e.g., by setting run_date to now_utc + few seconds
                        )
                        jobs_skipped_past_count += 1
                        continue
                    
                    run_date_for_scheduler = adjusted_scheduled_time_aware # APScheduler handles tz-aware

                    scheduler.add_job(
                        send_job_to_api,
                        trigger='date',
                        run_date=run_date_for_scheduler,
                        args=[job_id, processed_job_ids_current_session], # Pass current session set
                        id=f"job_{job_id}_{row_number}",
                        name=f"API call for {job_id}"
                    )
                    jobs_scheduled_count += 1
                    logger.info(f"Scheduled job_id '{job_id}' for {run_date_for_scheduler.isoformat()} (Original: {original_scheduled_time_aware.isoformat()})")

                except ValueError as ve:
                    logger.error(f"Invalid timestamp format for job_id '{job_id}' ('{time_str}'): {ve}. Skipping.")
                except Exception as e:
                    logger.error(f"Error processing job_id '{job_id}': {e}. Skipping.")
        
        logger.info(f"Finished loading manifest. Scheduled {jobs_scheduled_count} new jobs.")
        logger.info(f"Skipped {jobs_skipped_past_count} past jobs (after adjustment).")
        logger.info(f"Skipped {jobs_already_processed_count} jobs already processed in previous sessions.")

    except FileNotFoundError:
        logger.error(f"Manifest file '{csv_filepath}' not found.")
    except Exception as e:
        logger.error(f"Failed to read or process manifest file '{csv_filepath}': {e}")


# --- Main Execution ---
def main():
    logger.info("Initializing manifest-based cron worker with pause/resume capability...")

    processed_job_ids_current_session = set()
    last_shutdown_time_from_state, processed_job_ids_from_state = load_state()

    scheduler = BlockingScheduler(timezone="UTC")

    # Load jobs, passing the state information and the set for current session's processed jobs
    load_and_schedule_jobs(scheduler, 
                           MANIFEST_CSV_FILE, 
                           processed_job_ids_from_state, 
                           last_shutdown_time_from_state,
                           processed_job_ids_current_session)

    if not scheduler.get_jobs():
        logger.info("No jobs were scheduled (either none in manifest, all processed, or all past). Worker will exit.")
        # Save state even if no jobs scheduled, to record processed IDs if manifest was empty but state wasn't
        current_shutdown_time = datetime.now(timezone.utc)
        all_processed_ids_to_save = processed_job_ids_from_state.union(processed_job_ids_current_session)
        save_state(current_shutdown_time, all_processed_ids_to_save)
        return

    logger.info("Scheduler started. Waiting for scheduled jobs...")
    logger.info("Press Ctrl+C to exit gracefully (will save state).")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stop requested by user or system...")
    except Exception as e:
        logger.error(f"Scheduler encountered a critical error: {e}", exc_info=True)
    finally:
        logger.info("Shutting down scheduler and saving state...")
        if scheduler.running:
            scheduler.shutdown(wait=False) # Don't wait for jobs to complete, just stop scheduling new ones
        
        current_shutdown_time = datetime.now(timezone.utc)
        # Combine processed IDs from state file with those processed in the current session
        all_processed_ids_to_save = processed_job_ids_from_state.union(processed_job_ids_current_session)
        save_state(current_shutdown_time, all_processed_ids_to_save)
        logger.info("Cron worker shut down gracefully.")

if __name__ == "__main__":
    main()
{{ ... }}