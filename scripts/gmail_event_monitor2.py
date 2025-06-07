# gmail_event_monitor.py - FINAL & TUNED

import os
import json
import base64
import re
import sys
import time
import logging
import threading
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

from supabase import create_client, Client
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# --- Environment & Configuration ---
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(dotenv_path=dotenv_path)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local'), override=True)

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
GOOGLE_SA_KEY_STRING = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY")
GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

LOG_LEVEL_MAP = {
    "DEBUG": logging.DEBUG, "INFO": logging.INFO, "WARNING": logging.WARNING,
    "ERROR": logging.ERROR, "CRITICAL": logging.CRITICAL
}
CONSOLE_LOG_LEVEL_STR = os.getenv("GMAIL_MONITOR_CONSOLE_LOG_LEVEL", "INFO").upper()
SUPABASE_LOG_LEVEL_STR = os.getenv("SUPABASE_LOG_LEVEL", "WARNING").upper()
CONSOLE_LOG_LEVEL = LOG_LEVEL_MAP.get(CONSOLE_LOG_LEVEL_STR, logging.INFO)
SUPABASE_LOG_LEVEL = LOG_LEVEL_MAP.get(SUPABASE_LOG_LEVEL_STR, logging.WARNING)

# --- Logger Setup ---
logger = logging.getLogger('gmail_engagement_monitor')
logger.setLevel(min(CONSOLE_LOG_LEVEL, SUPABASE_LOG_LEVEL))
logger.propagate = False

if not logger.handlers:
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(CONSOLE_LOG_LEVEL)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

# --- Supabase Client Initialization ---
supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        logger.info("Supabase client initialized.")
    except Exception as e:
        logger.critical(f"Failed to create Supabase client: {e}", exc_info=True)
else:
    logger.critical("Supabase URL or Service Key not found in environment variables.")

# --- Supabase Log Handler Class ---
class SupabaseLogHandler(logging.Handler):
    def __init__(self, supabase_client: Client, table_name: str = 'system_script_logs'):
        super().__init__()
        self.supabase_client = supabase_client
        self.table_name = table_name
        self.script_name = os.path.basename(__file__)

    def emit(self, record: logging.LogRecord):
        try:
            log_entry = {
                'script_name': self.script_name,
                'log_level': record.levelname,
                'message': self.format(record),
                'details': {}
            }
            if record.exc_info:
                log_entry['details']['exception'] = traceback.format_exc()
            threading.Thread(target=self._send_to_supabase, args=(log_entry,)).start()
        except Exception as e:
            print(f"FATAL: Error in SupabaseLogHandler.emit: {e}", file=sys.stderr)

    def _send_to_supabase(self, log_entry):
        try:
            self.supabase_client.table(self.table_name).insert(log_entry).execute()
        except Exception as e:
            print(f"ERROR: Failed to send log to Supabase: {e}", file=sys.stderr)

if supabase_client:
    supabase_handler = SupabaseLogHandler(supabase_client)
    supabase_handler.setLevel(SUPABASE_LOG_LEVEL)
    supabase_handler.setFormatter(formatter)
    logger.addHandler(supabase_handler)
    logger.info("Supabase log handler configured.")

# --- Google Credentials ---
google_creds = None
if GOOGLE_SA_KEY_STRING:
    try:
        creds_dict = json.loads(GOOGLE_SA_KEY_STRING)
        if 'private_key' in creds_dict:
            creds_dict['private_key'] = creds_dict['private_key'].replace('\\n', '\n')
        google_creds = service_account.Credentials.from_service_account_info(creds_dict, scopes=GMAIL_SCOPES)
    except Exception as e:
        logger.critical(f"Failed to process Google credentials: {e}", exc_info=True)
else:
    logger.critical("GOOGLE_SERVICE_ACCOUNT_KEY not found.")

# --- Core Functions ---

def get_gmail_service(user_email_to_impersonate):
    if not google_creds:
        logger.error(f"Google credentials not loaded. Cannot create Gmail service for {user_email_to_impersonate}.")
        return None
    try:
        scoped_creds = google_creds.with_subject(user_email_to_impersonate)
        return build('gmail', 'v1', credentials=scoped_creds, cache_discovery=False)
    except Exception as e:
        logger.error(f"Error creating Gmail service for {user_email_to_impersonate}: {e}", exc_info=True)
        return None

def get_message_body(message_payload):
    body_data = ""
    if 'parts' in message_payload:
        for part in message_payload['parts']:
            if part.get('mimeType') == 'text/plain' and 'data' in part['body']:
                body_data = part['body']['data']
                break
    elif 'data' in message_payload.get('body', {}):
        body_data = message_payload['body']['data']
    if body_data:
        return base64.urlsafe_b64decode(body_data).decode('utf-8', errors='ignore')
    return ""

def is_reply_message(msg):
    try:
        headers = {h['name'].lower(): h['value'] for h in msg['payload']['headers']}
        if headers.get('in-reply-to') or headers.get('references'):
            return True
        if headers.get('subject', '').lower().startswith(('re:', 'aw:')):
            return True
        if headers.get('auto-submitted', 'no').lower() != 'no':
            return True
        return False
    except Exception:
        return False

def is_bounce_message(msg):
    try:
        headers = {h['name'].lower(): h['value'] for h in msg['payload']['headers']}
        if 'mailer-daemon@' in headers.get('from', '') or 'postmaster@' in headers.get('from', ''):
            return True
        if any(phrase in headers.get('subject', '').lower() for phrase in ['undeliverable', 'delivery status notification', 'failure notice']):
            return True
        body = get_message_body(msg['payload']).lower()
        if any(phrase in body for phrase in ['mailbox unavailable', 'address not found', 'recipient rejected', 'user does not exist']):
            return True
        return False
    except Exception:
        return False

def update_campaign_job_status(db_client, job_id, status, message_id, event_timestamp):
    try:
        logger.info(f"Updating campaign job {job_id} to status: {status}")
        db_client.table("campaign_jobs").update({
            "status": status,
            "status_updated_at": event_timestamp
        }).eq("id", job_id).execute()
        db_client.table("email_engagement_events").insert({
            "campaign_job_id": job_id,
            "email_message_id": message_id,
            "event_type": status,
            "event_timestamp": event_timestamp
        }).execute()
    except Exception as e:
        logger.error(f"Failed to update database for job {job_id} with status {status}: {e}", exc_info=True)

def process_message_for_engagement(message_id, gmail_service, db_client):
    try:
        msg = gmail_service.users().messages().get(userId='me', id=message_id).execute()
        headers = {h['name'].lower(): h['value'] for h in msg['payload']['headers']}
        event_timestamp = datetime.fromtimestamp(int(msg['internalDate']) / 1000, tz=timezone.utc).isoformat()

        if is_reply_message(msg):
            ref_ids = headers.get('in-reply-to', '').strip('<>').split() + \
                      headers.get('references', '').replace('><', '> <').strip('<>').split()
            if not ref_ids:
                return
            response = db_client.table("campaign_jobs").select("id, status").in_("email_message_id", ref_ids).neq("status", "REPLIED").execute()
            if response.data:
                job = response.data[0]
                logger.info(f"REPLY detected for campaign job {job['id']} from message {message_id}.")
                update_campaign_job_status(db_client, job['id'], "REPLIED", message_id, event_timestamp)
            return

        if is_bounce_message(msg):
            body = get_message_body(msg['payload'])
            match = re.search(r"Original-Message-ID:\s*<([^>]+)>", body, re.IGNORECASE)
            original_message_id = match.group(1) if match else None

            # --- REVISED: Fallback for bounce reports that use In-Reply-To ---
            if not original_message_id:
                in_reply_to_header = headers.get('in-reply-to', '').strip('<>')
                if in_reply_to_header:
                    logger.debug(f"Bounce {message_id} missing Original-Message-ID, using In-Reply-To as fallback.")
                    original_message_id = in_reply_to_header
            
            if not original_message_id:
                logger.warning(f"Bounce message {message_id} found, but could not extract an original message ID.")
                return

            response = db_client.table("campaign_jobs").select("id, status").eq("email_message_id", f"<{original_message_id}>").neq("status", "BOUNCED").execute()
            if response.data:
                job = response.data[0]
                logger.warning(f"BOUNCE detected for campaign job {job['id']} (original msg: {original_message_id}).")
                update_campaign_job_status(db_client, job['id'], "BOUNCED", message_id, event_timestamp)
            return

        sent_message_id = headers.get('message-id')
        if not sent_message_id:
            return

        response = db_client.table("campaign_jobs").select("id, status").eq("email_message_id", sent_message_id).eq("status", "sent").execute()
        if response.data:
            job = response.data[0]
            logger.info(f"DELIVERED status confirmed for campaign job {job['id']} (message: {sent_message_id}).")
            update_campaign_job_status(db_client, job['id'], "DELIVERED", sent_message_id, event_timestamp)

    except HttpError as e:
        if e.resp.status == 404:
            logger.debug(f"Message {message_id} not found. It may have been deleted.")
        else:
            logger.error(f"HTTP error processing message {message_id}: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Unexpected error processing message {message_id}: {e}", exc_info=True)

def process_historical_messages(gmail_service, db_client, sender_email, days_back=3):
    logger.info(f"Starting historical message processing for {sender_email} for the last {days_back} days.")
    date_query = (datetime.now(timezone.utc).date() - timedelta(days=days_back)).strftime('%Y/%m/%d')
    query = f'after:{date_query}'
    
    try:
        # --- REVISED: Added pagination to get ALL messages ---
        all_messages = []
        page_token = None
        while True:
            response = gmail_service.users().messages().list(userId='me', q=query, maxResults=500, pageToken=page_token).execute()
            messages = response.get('messages', [])
            all_messages.extend(messages)
            page_token = response.get('nextPageToken')
            if not page_token:
                break

        if not all_messages:
            logger.info(f"No historical messages found for {sender_email} in the last {days_back} days.")
            return

        logger.info(f"Found {len(all_messages)} total historical messages to process for {sender_email}.")
        for i, msg_summary in enumerate(all_messages):
            logger.info(f"Processing historical message {i+1}/{len(all_messages)} (ID: {msg_summary['id']})")
            process_message_for_engagement(msg_summary['id'], gmail_service, db_client)
            time.sleep(0.5)

    except Exception as e:
        logger.error(f"Failed during historical processing for {sender_email}: {e}", exc_info=True)

def monitor_new_messages(db_client):
    logger.info("Starting new message monitoring cycle...")
    try:
        senders_res = db_client.table("senders").select("id, sender_email, last_checked_history_id").eq("is_active", True).execute()
        if not senders_res.data:
            logger.warning("No active senders found to monitor.")
            return

        for sender in senders_res.data:
            sender_id, sender_email, last_history_id = sender["id"], sender["sender_email"], sender.get("last_checked_history_id")
            logger.info(f"Checking for new mail for: {sender_email}")
            gmail_service = get_gmail_service(sender_email)
            if not gmail_service:
                continue

            if not last_history_id:
                profile = gmail_service.users().getProfile(userId='me').execute()
                last_history_id = profile.get('historyId')
                logger.warning(f"No last_checked_history_id for {sender_email}. Setting initial ID to {last_history_id}.")
                db_client.table("senders").update({"last_checked_history_id": str(last_history_id)}).eq("id", sender_id).execute()
                continue
            
            history_response = gmail_service.users().history().list(userId='me', startHistoryId=last_history_id, historyTypes=['messageAdded']).execute()
            new_history_id = history_response.get('historyId', last_history_id)
            
            if 'history' in history_response:
                messages_added = [msg['message']['id'] for rec in history_response['history'] for msg in rec.get('messagesAdded', [])]
                unique_message_ids = sorted(list(set(messages_added)))
                if unique_message_ids:
                    logger.info(f"Found {len(unique_message_ids)} new message(s) for {sender_email}. Processing...")
                    for msg_id in unique_message_ids:
                        process_message_for_engagement(msg_id, gmail_service, db_client)
                        time.sleep(0.5)
            
            if str(new_history_id) != str(last_history_id):
                db_client.table("senders").update({"last_checked_history_id": str(new_history_id)}).eq("id", sender_id).execute()
                logger.info(f"Updated history ID for {sender_email} to {new_history_id}")

    except Exception as e:
        logger.error(f"An error occurred during the monitoring cycle: {e}", exc_info=True)

if __name__ == "__main__":
    if not supabase_client or not google_creds:
        logger.critical("Exiting: Supabase client or Google credentials are not configured.")
        sys.exit(1)

    if '--process-history' in sys.argv:
        days_back = 3
        try:
            if '--days-back' in sys.argv:
                idx = sys.argv.index('--days-back')
                days_back = int(sys.argv[idx + 1])
        except (ValueError, IndexError):
            pass
        
        senders_res = supabase_client.table("senders").select("sender_email").eq("is_active", True).execute()
        for sender in senders_res.data:
            gmail_service = get_gmail_service(sender["sender_email"])
            if gmail_service:
                process_historical_messages(gmail_service, supabase_client, sender["sender_email"], days_back)
    else:
        monitor_new_messages(supabase_client)

    logger.info("Script finished.")