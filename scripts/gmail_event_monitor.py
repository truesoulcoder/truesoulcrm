import os
import json
from datetime import datetime, timezone # Added timezone
from dotenv import load_dotenv
from supabase import create_client, Client
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import traceback # For more detailed error logging
import logging # Added
import threading # Added
import sys # Added for sys.stderr

# --- SupabaseLogHandler Class Definition ---
class SupabaseLogHandler(logging.Handler):
    def __init__(self, supabase_client: Client, supabase_table_name: str = 'system_script_logs', script_name_override: str = None):
        super().__init__()
        self.supabase_client = supabase_client
        self.supabase_table_name = supabase_table_name
        # Use script_name_override if provided, otherwise use the base name of the current file
        self.script_name = script_name_override if script_name_override else os.path.basename(__file__)

    def emit(self, record: logging.LogRecord):
        try:
            log_entry = {
                'created_at': datetime.now(timezone.utc).isoformat(),
                'script_name': self.script_name,
                'log_level': record.levelname,
                'message': self.format(record), # Use the handler's formatter for the main message
                'details': {}
            }
            if record.exc_info:
                # Ensure traceback is imported in the file
                log_entry['details']['exception'] = traceback.format_exc()
            
            # Add any extra fields from the log record to 'details'
            # These are fields passed via logging.info("message", extra={...})
            extra_fields = {k: v for k, v in record.__dict__.items() if k not in 
                            ['args', 'asctime', 'created', 'exc_info', 'exc_text', 'filename', 
                             'funcName', 'levelname', 'levelno', 'lineno', 'module', 'msecs', 
                             'message', 'msg', 'name', 'pathname', 'process', 'processName', 
                             'relativeCreated', 'stack_info', 'thread', 'threadName']}
            if extra_fields:
                log_entry['details'].update(extra_fields)

            # Asynchronously send log to Supabase to avoid blocking
            threading.Thread(target=self._send_to_supabase, args=(log_entry,)).start()

        except Exception as e:
            # This is a fallback if the emit method itself has an issue
            # Ensure sys is imported in the file
            print(f"Error during SupabaseLogHandler.emit: {e}\\nRecord: {self.format(record)}", file=sys.stderr)

    def _send_to_supabase(self, log_entry):
        """Helper method to send log entry, designed to be run in a thread."""
        try:
            if self.supabase_client:
                self.supabase_client.table(self.supabase_table_name).insert(log_entry).execute()
            else:
                print(f"Supabase client not available in _send_to_supabase. Log entry not sent: {log_entry}", file=sys.stderr)
        except Exception as e:
            # This print will go to stderr from the thread
            print(f"Supabase logging thread error in _send_to_supabase: {e}\\nLog entry: {log_entry}", file=sys.stderr)
# --- End SupabaseLogHandler Class Definition ---


# --- Configuration ---
# Load .env file from project root (assuming crondonkey.py is in scripts/ and .env is in root)
# Adjust the path if your .env file is located elsewhere relative to this script.
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env') # Goes up one level from scripts/ to project root
load_dotenv(dotenv_path=dotenv_path)
# Also try loading .env.local for overrides, common in Next.js projects
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local'), override=True)


SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
GOOGLE_SA_KEY_STRING = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY")

# Initialize Supabase client - will be done once when module is loaded
supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
else:
    gmail_monitor_logger.critical("Supabase URL or Service Key not found in environment variables for gmail_event_monitor.")

# Parse Google Credentials once when module is loaded
google_creds_dict_global = None
if GOOGLE_SA_KEY_STRING:
    try:
        google_creds_dict_global = json.loads(GOOGLE_SA_KEY_STRING)
        if google_creds_dict_global and 'private_key' in google_creds_dict_global:
            google_creds_dict_global['private_key'] = google_creds_dict_global['private_key'].replace('\\n', '\n')
    except json.JSONDecodeError:
        gmail_monitor_logger.critical("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON in gmail_event_monitor.")
else:
    gmail_monitor_logger.critical("GOOGLE_SERVICE_ACCOUNT_KEY not found in environment variables for gmail_event_monitor.")

GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

# --- Logger Setup for Gmail Event Monitor ---
GMAIL_MONITOR_CONSOLE_LOG_LEVEL_STR = os.getenv("GMAIL_MONITOR_CONSOLE_LOG_LEVEL", "INFO").upper()
SUPABASE_LOG_LEVEL_STR = os.getenv("SUPABASE_LOG_LEVEL", "WARNING").upper()

# Convert string log levels to logging constants
LOG_LEVEL_MAP = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}
gmail_monitor_console_log_level = LOG_LEVEL_MAP.get(GMAIL_MONITOR_CONSOLE_LOG_LEVEL_STR, logging.INFO)
supabase_log_level_for_handler = LOG_LEVEL_MAP.get(SUPABASE_LOG_LEVEL_STR, logging.WARNING)

# Determine the overall minimum level for the logger itself
# The logger's level must be <= the lowest level of its handlers.
overall_logger_level = min(gmail_monitor_console_log_level, supabase_log_level_for_handler)

gmail_monitor_logger = logging.getLogger('gmail_event_monitor')
gmail_monitor_logger.setLevel(overall_logger_level)
gmail_monitor_logger.propagate = False # Don't pass to root logger

# Console Handler
console_handler_gm = logging.StreamHandler(sys.stdout)
console_handler_gm.setLevel(gmail_monitor_console_log_level)
console_formatter_gm = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler_gm.setFormatter(console_formatter_gm)
# Add console handler only if a similar one isn't already present
if not any(isinstance(h, logging.StreamHandler) and h.stream == sys.stdout for h in gmail_monitor_logger.handlers):
    gmail_monitor_logger.addHandler(console_handler_gm)

# Supabase Handler
if supabase_client: # Only add Supabase handler if client is available
    supabase_handler_gm = SupabaseLogHandler(
        supabase_client=supabase_client,
        script_name_override='gmail_event_monitor.py' # Explicitly set script name for clarity in logs
    )
    supabase_handler_gm.setLevel(supabase_log_level_for_handler)
    supabase_handler_gm.setFormatter(console_formatter_gm) # Using same formatter for consistency
    gmail_monitor_logger.addHandler(supabase_handler_gm)
    gmail_monitor_logger.info("SupabaseLogHandler initialized and added for gmail_event_monitor.")
else:
    # This print is a fallback if logger isn't set up when supabase_client is missing.
    # The initial check for SUPABASE_URL/KEY already prints an error.
    gmail_monitor_logger.critical("Supabase client not available for gmail_event_monitor, SupabaseLogHhandler not added.")

# --- End Logger Setup ---



def get_gmail_service(user_email_to_impersonate):
    """Authenticates to Gmail API impersonating the given user."""
    if not google_creds_dict_global:
        gmail_monitor_logger.error(f"Google SA Key not loaded. Cannot create Gmail service for {user_email_to_impersonate}.")
        return None
    try:
        creds = service_account.Credentials.from_service_account_info(
            google_creds_dict_global,
            scopes=GMAIL_SCOPES,
            subject=user_email_to_impersonate
        )
        # cache_discovery=False is important for long-running scripts or non-interactive environments
        service = build('gmail', 'v1', credentials=creds, cache_discovery=False)
        return service
    except Exception as e:
        gmail_monitor_logger.error(f"Error creating Gmail service for {user_email_to_impersonate}: {e}", exc_info=True)
        return None

def _parse_message_id_from_header_value(header_value: str) -> str | None:
    """Extracts the first Message-ID from a header string like <ID> or ID."""
    if not header_value:
        return None
    # Remove angle brackets if present
    cleaned_value = header_value.strip().lstrip('<').rstrip('>')
    # Sometimes there are multiple IDs in References, take the first one for simplicity here
    # A more robust parser might consider all of them.
    return cleaned_value.split()[0] if cleaned_value else None


def process_message_for_engagement(message_id, gmail_service, sender_email_used, sender_name_used, db_client: Client):
    """
    Fetches a single message, parses it for replies/bounces,
    and logs to email_engagement_events.
    """
    if not db_client:
        gmail_monitor_logger.error("Supabase client not available in process_message_for_engagement.")
        return

    try:
        # Fetch only metadata initially to quickly check headers
        msg = gmail_service.users().messages().get(userId='me', id=message_id, format='metadata').execute()
        headers = msg.get('payload', {}).get('headers', [])
        
        original_campaign_message_id = None
        event_type = None
        # Store the raw message metadata or parts of it
        event_details = {"raw_event_data": {"id": msg.get("id"), "threadId": msg.get("threadId"), "labelIds": msg.get("labelIds")}}

        # 1. Check for Reply
        in_reply_to_header_val = next((h['value'] for h in headers if h['name'].lower() == 'in-reply-to'), None)
        references_header_val = next((h['value'] for h in headers if h['name'].lower() == 'references'), None)
        
        potential_ref_ids = []
        parsed_in_reply_to = _parse_message_id_from_header_value(in_reply_to_header_val)
        if parsed_in_reply_to:
            potential_ref_ids.append(parsed_in_reply_to)
        
        if references_header_val:
            # References can have multiple IDs, often space-separated. Check each.
            for ref_id_with_brackets in references_header_val.split():
                parsed_ref = _parse_message_id_from_header_value(ref_id_with_brackets)
                if parsed_ref and parsed_ref not in potential_ref_ids: # Avoid duplicates
                    potential_ref_ids.append(parsed_ref)
        
        if potential_ref_ids:
            for ref_id in potential_ref_ids:
                # Check if this ref_id matches any email_message_id in campaign_jobs
                # We use campaign_jobs as the primary source for linking back.
                job_res = db_client.table("campaign_jobs").select("id, campaign_id, lead_id, contact_email").eq("email_message_id", ref_id).maybe_single().execute()
                if job_res.data:
                    original_campaign_message_id = ref_id
                    event_type = "REPLIED"
                    event_details.update({
                        "campaign_job_id": job_res.data["id"],
                        "campaign_id": job_res.data["campaign_id"],
                        "lead_id": job_res.data["lead_id"],
                        "contact_email": job_res.data["contact_email"], # This is the recipient of original email
                        "reply_subject": next((h['value'] for h in headers if h['name'].lower() == 'subject'), None),
                    })
                    # To get reply_body_preview, we'd need to fetch format='full' or 'raw' and parse
                    break # Found a match for reply

        # 2. Check for Bounce (if not already identified as a reply)
        # This is a simplified bounce check. Real bounce processing is complex.
        if not event_type:
            from_header = next((h['value'] for h in headers if h['name'].lower() == 'from'), "").lower()
            subject_header = next((h['value'] for h in headers if h['name'].lower() == 'subject'), "").lower()
            
            is_bounce_candidate = False
            if "mailer-daemon@" in from_header or "postmaster@" in from_header:
                is_bounce_candidate = True
            if "delivery status notification" in subject_header or "undeliverable" in subject_header or "delivery failure" in subject_header:
                is_bounce_candidate = True
            
            if is_bounce_candidate:
                # For bounces, we ideally need to parse the body to find the original Message-ID.
                # This is a placeholder. A full implementation would fetch the full message and parse it.
                # For now, we'll log a generic bounce if we can't link it, or try to find an ID.
                # This part needs significant enhancement for production.
                # Let's assume for now we can't reliably get original_campaign_message_id from a simple metadata bounce check.
                gmail_monitor_logger.info(f"Potential bounce detected for message ID {message_id} in {sender_email_used}'s inbox. Subject: {subject_header}. From: {from_header}. Further parsing needed for correlation.")
                # To actually log this as a 'BOUNCED' event, we MUST find the original_campaign_message_id.
                # This would involve fetching the full email and parsing its content.
                # Example: original_campaign_message_id = parse_original_id_from_bounce_content(gmail_service, message_id)
                # If found: event_type = "BOUNCED", add bounce_reason, etc.

        # 3. Log to email_engagement_events if an event was identified and correlated
        if event_type and original_campaign_message_id:
            # Convert internalDate (milliseconds since epoch) to ISO 8601 timestamp
            event_ts_raw = msg.get('internalDate')
            event_ts_iso = datetime.now(timezone.utc).isoformat() # Fallback
            if event_ts_raw:
                try:
                    event_ts_iso = datetime.fromtimestamp(int(event_ts_raw)/1000, tz=timezone.utc).isoformat()
                except ValueError:
                    gmail_monitor_logger.warning(f"Could not parse internalDate {event_ts_raw}")

            db_payload = {
                "email_message_id": original_campaign_message_id,
                "campaign_id": event_details.get("campaign_id"),
                "campaign_job_id": event_details.get("campaign_job_id"),
                "lead_id": event_details.get("lead_id"),
                "contact_email": event_details.get("contact_email"),
                "sender_email_used": sender_email_used,
                "sender_name": sender_name_used,
                "event_type": event_type,
                "event_timestamp": event_ts_iso,
                "reply_subject": event_details.get("reply_subject"),
                # "reply_body_preview": ..., # Requires full message fetch
                # "bounce_reason": ..., # Requires bounce parsing
                # "bounce_type": ..., # Requires bounce parsing
                "raw_event_data": event_details["raw_event_data"] # Store basic metadata
            }
            try:
                db_client.table("email_engagement_events").insert(db_payload).execute()
                gmail_monitor_logger.info(f"Logged {event_type} for original msg: {original_campaign_message_id} (new msg: {message_id}) from sender: {sender_email_used}")
            except Exception as db_e:
                gmail_monitor_logger.error(f"DB Error logging engagement for {original_campaign_message_id}: {db_e}", exc_info=True)
        
    except HttpError as error:
        gmail_monitor_logger.error(f"Gmail API error processing message {message_id} for {sender_email_used}: {error.resp.status} - {error._get_reason()}")
        if error.resp.status == 401 or error.resp.status == 403:
            gmail_monitor_logger.warning("This might be a token or permission issue.")
    except Exception as e:
        gmail_monitor_logger.error(f"General error processing message {message_id} for {sender_email_used}: {e}", exc_info=True)


def monitor_all_active_senders():
    """
    Main function to monitor Gmail inboxes of active senders.
    To be called by crondonkey.py's scheduler.
    """
    if not supabase_client:
        print("Supabase client not initialized. Exiting gmail_event_monitor.")
        return
    if not google_creds_dict_global:
        print("Google SA Key not loaded. Exiting gmail_event_monitor.")
        return

    gmail_monitor_logger.info(f"Starting Gmail inbox monitoring...")
    try:
        senders_res = supabase_client.table("senders").select("id, sender_name, sender_email, last_checked_history_id").eq("is_active", True).execute()
    except Exception as e:
        gmail_monitor_logger.error(f"Error fetching active senders: {e}", exc_info=True)
        return

    if not senders_res.data:
        gmail_monitor_logger.info("No active senders found to monitor.")
        return

    for sender in senders_res.data:
        sender_id = sender["id"]
        sender_email = sender["sender_email"]
        sender_name = sender["sender_name"]
        # Ensure last_history_id is a string if not None
        last_history_id = str(sender["last_checked_history_id"]) if sender.get("last_checked_history_id") else None

        gmail_monitor_logger.info(f"Checking inbox for sender: {sender_email} (Last History ID: {last_history_id})...")
        gmail_service = get_gmail_service(sender_email)
        if not gmail_service:
            gmail_monitor_logger.warning(f"Skipping sender {sender_email} due to Gmail service creation failure.")
            continue

        try:
            # If last_history_id is None (first time for this sender), we need to get the current historyId
            # and store it. We'll only process messages *after* this point.
            if not last_history_id:
                profile = gmail_service.users().getProfile(userId='me').execute()
                current_sender_history_id = profile.get('historyId')
                if current_sender_history_id:
                    gmail_monitor_logger.info(f"First-time check for {sender_email}. Setting initial history ID to {current_sender_history_id}. Subsequent checks will process newer mail.")
                    try:
                        supabase_client.table("senders").update({"last_checked_history_id": str(current_sender_history_id)}).eq("id", sender_id).execute()
                        last_history_id = str(current_sender_history_id) # Use this for the current run (should yield no new messages)
                    except Exception as db_e:
                        gmail_monitor_logger.error(f"DB Error setting initial history_id for {sender_email}: {db_e}", exc_info=True)
                        continue # Skip this sender if we can't set initial history
                else:
                    gmail_monitor_logger.warning(f"Could not retrieve current historyId for {sender_email}. Skipping.")
                    continue
            
            # Now, last_history_id should be set.
            history_request = gmail_service.users().history().list(
                userId='me',
                startHistoryId=last_history_id,
                historyTypes=['messageAdded'] # Only interested in new messages
            )
            
            all_new_message_ids_this_sender = []
            page_token = None
            
            while True:
                if page_token:
                    history_request = gmail_service.users().history().list(
                        userId='me',
                        startHistoryId=last_history_id, # Keep startHistoryId consistent for pagination
                        historyTypes=['messageAdded'],
                        pageToken=page_token
                    )
                
                response = history_request.execute()
                current_page_history_id = response.get('historyId', last_history_id) # The ID of the most recent history record processed by this call

                if 'history' in response:
                    for history_record in response['history']:
                        if 'messagesAdded' in history_record:
                            for msg_added_record in history_record['messagesAdded']:
                                # message object within messagesAdded
                                message_obj = msg_added_record.get('message', {}) # This was around line 277
                                if message_obj.get('id') and message_obj['id'] not in all_new_message_ids_this_sender:
                                     all_new_message_ids_this_sender.append(message_obj['id'])
                
                page_token = response.get('nextPageToken')
                if not page_token:
                    # Update last_history_id to the historyId from the last page of results
                    # This ensures the next run starts from this point.
                    if current_page_history_id and (not last_history_id or int(current_page_history_id) > int(last_history_id)):
                        try:
                            supabase_client.table("senders").update({"last_checked_history_id": str(current_page_history_id)}).eq("id", sender_id).execute()
                            gmail_monitor_logger.info(f"Updated last_checked_history_id for {sender_email} to {current_page_history_id}")
                            last_history_id = str(current_page_history_id) # For internal tracking if multiple pages
                        except Exception as db_e:
                            gmail_monitor_logger.error(f"DB Error updating history_id for {sender_email} after processing: {db_e}", exc_info=True)
                    break # Exit pagination loop
            
            if not all_new_message_ids_this_sender:
                gmail_monitor_logger.info(f"No new messages for {sender_email} since history ID {last_history_id}.")
            else:
                gmail_monitor_logger.info(f"Found {len(all_new_message_ids_this_sender)} new message candidate(s) for {sender_email}. Processing...")
                for msg_id in all_new_message_ids_this_sender:
                    process_message_for_engagement(msg_id, gmail_service, sender_email, sender_name, supabase_client)
        except HttpError as error:
            gmail_monitor_logger.error(f"Gmail API error during history list for sender {sender_email}: {error.resp.status} - {error._get_reason()}", exc_info=True)
            if error.resp.status == 401 or error.resp.status == 403:
                gmail_monitor_logger.warning("This might be a token or permission issue for this sender.")
            elif error.resp.status == 404 and 'historyId not found' in str(error.content).lower():
                 gmail_monitor_logger.warning(f"History ID {last_history_id} not found for {sender_email}. This can happen if history is too old or deleted. Resetting history ID.")
                 # Reset last_checked_history_id to None so it re-initializes on next run
                 try:
                    supabase_client.table("senders").update({"last_checked_history_id": None}).eq("id", sender_id).execute()
                    gmail_monitor_logger.info(f"Reset last_checked_history_id for {sender_email}. Will re-initialize on next run.")
                 except Exception as db_e:
                    gmail_monitor_logger.error(f"DB Error resetting history_id for {sender_email}: {db_e}", exc_info=True)
        except Exception as e:
            gmail_monitor_logger.error(f"General error processing sender {sender_email}: {e}", exc_info=True)

    gmail_monitor_logger.info(f"Gmail inbox monitoring finished.")

if __name__ == "__main__":
    monitor_all_active_senders()