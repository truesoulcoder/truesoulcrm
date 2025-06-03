import csv
import logging
from datetime import datetime, timezone
import time # For the final sleep loop if not using BlockingScheduler's blocking nature
import requests
from apscheduler.schedulers.blocking import BlockingScheduler
# For older Python versions or more flexible ISO parsing:
# from dateutil import parser as date_parser

# --- Configuration ---
MANIFEST_CSV_FILE = "job_manifest.csv"
API_ENDPOINT = "https://api.example.com/submit_job"  # Replace with your actual API endpoint
API_TOKEN = "YOUR_API_TOKEN"  # Optional: If your API requires authentication

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(schedulerName)s - %(jobName)s - %(message)s')
logger = logging.getLogger(__name__)


def send_job_to_api(job_id):
    """Sends the job ID to the configured API."""
    logger.info(f"Attempting to send job_id '{job_id}' to API: {API_ENDPOINT}")
    headers = {
        "Content-Type": "application/json"
    }
    if API_TOKEN:
        headers["Authorization"] = f"Bearer {API_TOKEN}"

    payload = {"job_id": job_id}

    try:
        response = requests.post(API_ENDPOINT, json=payload, headers=headers, timeout=30)
        response.raise_for_status()  # Raises an HTTPError for bad responses (4XX or 5XX)
        logger.info(f"Successfully sent job_id '{job_id}'. Response: {response.status_code}")
        return True
    except requests.exceptions.Timeout:
        logger.error(f"Timeout while sending job_id '{job_id}' to API.")
        return False
    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending job_id '{job_id}' to API: {e}")
        return False


def load_and_schedule_jobs(scheduler, csv_filepath):
    """Loads jobs from the CSV manifest and schedules them."""
    jobs_scheduled_count = 0
    jobs_skipped_past_count = 0
    now_utc = datetime.now(timezone.utc)

    try:
        with open(csv_filepath, mode='r', encoding='utf-8') as infile:
            reader = csv.DictReader(infile)
            if 'job_id' not in reader.fieldnames or 'next_processed_time' not in reader.fieldnames:
                logger.error(f"CSV file must contain 'job_id' and 'next_processed_time' columns.")
                return

            for row_number, row in enumerate(reader, 1):
                job_id = row.get('job_id')
                time_str = row.get('next_processed_time')

                if not job_id or not time_str:
                    logger.warning(f"Skipping row {row_number} due to missing job_id or next_processed_time: {row}")
                    continue

                try:
                    # Python 3.7+ fromisoformat handles 'Z' and +/-HH:MM offsets correctly.
                    # For more complex/varied formats, or older Python, consider dateutil.parser:
                    # scheduled_time_aware = date_parser.parse(time_str)
                    # if scheduled_time_aware.tzinfo is None:
                    #     logger.warning(f"Timestamp '{time_str}' for job '{job_id}' is naive. Assuming UTC.")
                    #     scheduled_time_aware = scheduled_time_aware.replace(tzinfo=timezone.utc)

                    # Handle 'Z' for UTC explicitly for broader compatibility if needed,
                    # though fromisoformat should handle it in Python 3.7+ (fully in 3.11+)
                    if time_str.endswith('Z'):
                        time_str_adjusted = time_str[:-1] + '+00:00'
                    else:
                        time_str_adjusted = time_str
                    
                    scheduled_time_aware = datetime.fromisoformat(time_str_adjusted)

                    # Ensure it's UTC for internal consistency if it was parsed as such
                    # or convert to UTC if it had another offset for comparison.
                    # APScheduler handles timezone-aware datetimes correctly.
                    scheduled_time_utc = scheduled_time_aware.astimezone(timezone.utc)


                    if scheduled_time_utc <= now_utc:
                        logger.warning(
                            f"Scheduled time {scheduled_time_utc.isoformat()} for job_id '{job_id}' is in the past. Skipping."
                        )
                        jobs_skipped_past_count += 1
                        continue

                    # Schedule the job
                    # The job_id is used for logging within APScheduler if job name is not explicitly set.
                    # We pass job_id as an argument to the target function.
                    scheduler.add_job(
                        send_job_to_api,
                        trigger='date',
                        run_date=scheduled_time_aware,  # APScheduler handles tz-aware datetimes
                        args=[job_id],
                        id=f"job_{job_id}_{row_number}",  # Unique ID for the scheduler job
                        name=f"API call for {job_id}"
                    )
                    jobs_scheduled_count += 1
                    logger.info(f"Scheduled job_id '{job_id}' for {scheduled_time_aware.isoformat()}")

                except ValueError as ve:
                    logger.error(f"Invalid timestamp format for job_id '{job_id}' ('{time_str}'): {ve}. Skipping.")
                except Exception as e:
                    logger.error(f"Error processing job_id '{job_id}': {e}. Skipping.")
        
        logger.info(f"Finished loading manifest. Scheduled {jobs_scheduled_count} jobs. Skipped {jobs_skipped_past_count} past jobs.")

    except FileNotFoundError:
        logger.error(f"Manifest file '{csv_filepath}' not found.")
    except Exception as e:
        logger.error(f"Failed to read or process manifest file '{csv_filepath}': {e}")


def main():
    logger.info("Initializing manifest-based cron worker...")

    # Using BlockingScheduler as it runs in the foreground and waits for jobs.
    # It's suitable if this worker's sole purpose is to run these scheduled tasks.
    scheduler = BlockingScheduler(timezone="UTC") # Configure scheduler to use UTC internally

    load_and_schedule_jobs(scheduler, MANIFEST_CSV_FILE)

    if not scheduler.get_jobs():
        logger.info("No jobs were scheduled. Worker will exit.")
        return

    logger.info("Scheduler started. Waiting for scheduled jobs...")
    logger.info("Press Ctrl+C to exit.")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped by user or system.")
    except Exception as e:
        logger.error(f"Scheduler encountered a critical error: {e}", exc_info=True)
    finally:
        if scheduler.running:
            scheduler.shutdown()
        logger.info("Cron worker shut down.")


if __name__ == "__main__":
    main()