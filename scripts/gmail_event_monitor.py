import os
import json
from datetime import datetime, timezone, timedelta # Added timezone and timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import traceback # For more detailed error logging
import logging # Added
import threading # Added
import sys # Added for sys.stderr
import base64 # Added for base64 decoding
import re # Added for regular expressions
import time # Added for retry delay

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
                # Create client with timeout
                client = self.supabase_client
                client.postgrest.timeout = 10  # 10 second timeout
                
                result = client.table(self.supabase_table_name).insert(log_entry).execute()
                if not result.data:
                    raise Exception("Empty response from Supabase")
            else:
                print(f"Supabase client not available in _send_to_supabase. Log entry not sent: {log_entry}", file=sys.stderr)
        except Exception as e:
            print(f"Supabase logging error: {str(e)}", file=sys.stderr)


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
    logger = logging.getLogger('gmail_event_monitor')
    logger.critical("Supabase URL or Service Key not found in environment variables for gmail_event_monitor.")

# Parse Google Credentials once when module is loaded
google_creds_dict_global = None
if GOOGLE_SA_KEY_STRING:
    try:
        google_creds_dict_global = json.loads(GOOGLE_SA_KEY_STRING)
        if google_creds_dict_global and 'private_key' in google_creds_dict_global:
            google_creds_dict_global['private_key'] = google_creds_dict_global['private_key'].replace('\\n', '\n')
    except json.JSONDecodeError:
        logger = logging.getLogger('gmail_event_monitor')
        logger.critical("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON in gmail_event_monitor.")
else:
    logger = logging.getLogger('gmail_event_monitor')
    logger.critical("GOOGLE_SERVICE_ACCOUNT_KEY not found in environment variables for gmail_event_monitor.")

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
        logger = logging.getLogger('gmail_event_monitor')
        logger.error(f"Google SA Key not loaded. Cannot create Gmail service for {user_email_to_impersonate}.")
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
        logger = logging.getLogger('gmail_event_monitor')
        logger.error(f"Error creating Gmail service for {user_email_to_impersonate}: {e}", exc_info=True)
        return None

def get_message_body(message):
    """Extracts plain text body from Gmail message"""
    try:
        parts = message.get('payload', {}).get('parts', [])
        for part in parts:
            if part.get('mimeType') == 'text/plain':
                body_data = part.get('body', {}).get('data', '')
                if body_data:
                    return base64.urlsafe_b64decode(body_data).decode('utf-8')
        return None
    except Exception as e:
        logger = logging.getLogger('gmail_event_monitor')
        logger.warning(f"Error parsing message body: {str(e)}")
        return None

def _parse_message_id_from_header_value(header_value: str) -> list[str]:
    """Extracts all Message-IDs from a header string."""
    if not header_value:
        return []
        
    # Extract all message IDs (with or without angle brackets)
    message_ids = []
    for part in header_value.split():
        cleaned = part.strip().lstrip('<').rstrip('>')
        if cleaned:
            message_ids.append(cleaned)
            
    return message_ids


def is_bounce(message):
    """Enhanced bounce detection with comprehensive SMTP code checking"""
    try:
        headers = {h['name'].lower(): h['value'] for h in message['payload']['headers']}
        body = get_message_body(message)
        
        # Return early if no body content
        if body is None:
            return False
        
        body = body.lower()
        
        # SMTP error codes (4xx and 5xx)
        SMTP_ERROR_CODES = [
            '421', '422', '431', '432', '441', '442', '446', '447', '449', '450',
            '451', '452', '453', '454', '455', '458', '459', '471', '500', '501',
            '502', '503', '504', '510', '511', '512', '513', '515', '517', '521',
            '522', '523', '530', '531', '533', '534', '535', '538', '540', '541',
            '542', '543', '546', '547', '550', '551', '552', '553', '554', '555', '556'
        ]
        
        # Common bounce phrases
        BOUNCE_PHRASES = [
            'mailbox unavailable', 'this mailbox is disabled',
            'requested action not taken', 'communication failure occurred',
            'address not found', 'user does not exist',
            'recipient rejected', 'unable to receive mail'
        ]
        
        # 1. Check subject line
        try:
            subject = headers.get('Subject', '').lower()
            from_ = headers.get('From', '').lower()
        except Exception as e:
            logger = logging.getLogger('gmail_event_monitor')
            logger.error(f"Error processing email headers: {e}", exc_info=True)
            return False
        
        if any(phrase in subject for phrase in BOUNCE_PHRASES + ['undelivered', 'returned', 'failure']):
            return True
        
        # 2. Check body content
        if body:
            # Check for SMTP error codes
            if any(f' {code} ' in body for code in SMTP_ERROR_CODES):
                return True
            
            # Check for provider patterns and bounce phrases
            if any(phrase in body for phrase in PROVIDER_PATTERNS + BOUNCE_PHRASES):
                return True
            
        return False
        
    except Exception as e:
        logger = logging.getLogger('gmail_event_monitor')
        logger.error(f"Error checking for bounce: {str(e)}", exc_info=True)
        return False


def extract_original_id_from_bounce(message):
    """Try to find original Message-ID from bounce content"""
    try:
        body = get_message_body(message)
        if body:
            # Look for common bounce patterns
            patterns = [
                "Original-Message-ID: <(.*?)>",
                "Message-ID: <(.*?)>",
                "OriginalMessageID.*?<(.*?)>"
            ]
            for pattern in patterns:
                match = re.search(pattern, body, re.IGNORECASE)
                if match:
                    return match.group(1)
    except Exception:
        pass
    return None


def process_message_for_engagement(message_id, gmail_service, sender_email_used, sender_name_used, db_client):
    gmail_monitor_logger.debug(f"Processing message {message_id}")
    try:
        # 1. Get message metadata
        try:
            msg = gmail_service.users().messages().get(
                userId='me', 
                id=message_id, 
                format='metadata'
            ).execute()
            gmail_monitor_logger.debug(f"Message headers: {msg.get('payload', {}).get('headers', [])}")
        except Exception as e:
            gmail_monitor_logger.error(f"Failed to fetch message {message_id}", exc_info=True)
            return

        # 2. Check for reply
        is_reply = False
        try:
            is_reply = is_reply_message(msg)
            gmail_monitor_logger.debug(f"Reply check result: {is_reply}")
        except Exception as e:
            gmail_monitor_logger.error(f"Error checking reply status for {message_id}", exc_info=True)

        # 3. Check for bounce
        is_bounce_msg = False
        try:
            is_bounce_msg = is_bounce(msg)
            gmail_monitor_logger.debug(f"Bounce check result: {is_bounce_msg}")
        except Exception as e:
            gmail_monitor_logger.error(f"Error checking bounce status for {message_id}", exc_info=True)

        # Process engagement events
        event_details = {
            'message_id': message_id,
            'sender_email': sender_email_used,
            'sender_name': sender_name_used,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }

        # Handle reply detection
        if is_reply:
            try:
                headers = {h['name'].lower(): h['value'] for h in msg['payload']['headers']}
                in_reply_to_header_val = headers.get('in-reply-to')
                references_header_val = headers.get('references')
                
                potential_ref_ids = []
                
                # Parse message IDs from headers
                parsed_in_reply_to = _parse_message_id_from_header_value(in_reply_to_header_val)
                if parsed_in_reply_to:
                    potential_ref_ids.extend(parsed_in_reply_to)
                
                if references_header_val:
                    for ref_id_with_brackets in references_header_val.split():
                        parsed_ref = _parse_message_id_from_header_value(ref_id_with_brackets)
                        if parsed_ref and any(ref not in potential_ref_ids for ref in parsed_ref):
                            potential_ref_ids.extend(parsed_ref)
                
                # Check each potential reference ID
                for ref_id in potential_ref_ids:
                    try:
                        job_res = execute_with_retry(
                            lambda: db_client.table("campaign_jobs")
                                .select("id, campaign_id, lead_id, contact_email")
                                .eq("email_message_id", ref_id)
                                .maybe_single()
                                .execute(),
                            max_retries=3,
                            initial_delay=1
                        )
                        
                        if not job_res or not job_res.data:
                            gmail_monitor_logger.debug(f"No campaign job found for message ID: {ref_id}")
                            continue
                            
                        # Process valid reply
                        event_details.update({
                            "campaign_job_id": job_res.data["id"],
                            "campaign_id": job_res.data["campaign_id"],
                            "lead_id": job_res.data["lead_id"],
                            "contact_email": job_res.data["contact_email"],
                            "event_type": "REPLIED",
                            "reply_subject": headers.get('subject')
                        })
                        
                        gmail_monitor_logger.info(f"Detected REPLY from {event_details['contact_email']} to campaign {event_details['campaign_id']}")
                        break
                        
                    except Exception as e:
                        gmail_monitor_logger.error(f"Error processing reply reference {ref_id}", exc_info=True)
                        continue

            except Exception as e:
                gmail_monitor_logger.error(f"Error processing reply for {message_id}", exc_info=True)

        # Handle bounce detection
        elif is_bounce_msg:
            try:
                original_id = extract_original_id_from_bounce(msg) or message_id
                event_details.update({
                    "event_type": "BOUNCED",
                    "original_message_id": original_id
                })
                
                gmail_monitor_logger.warning(f"Detected BOUNCE for message {original_id}")
                
            except Exception as e:
                gmail_monitor_logger.error(f"Error processing bounce for {message_id}", exc_info=True)

        # Log the engagement event if detected
        if 'event_type' in event_details:
            try:
                gmail_monitor_logger.debug(f"Attempting to insert engagement event: {event_details}")
                result = db_client.table("email_engagement_events").insert(event_details).execute()
                gmail_monitor_logger.info(f"Logged engagement event: {event_details['event_type']} for {message_id}")
                gmail_monitor_logger.debug(f"Supabase insert result: {result}")
            except Exception as e:
                gmail_monitor_logger.error(f"Failed to log engagement event for {message_id}", exc_info=True)
                gmail_monitor_logger.debug(f"Failed event details: {event_details}")
        else:
            gmail_monitor_logger.debug(f"No engagement event detected for message {message_id}")
            gmail_monitor_logger.debug(f"is_reply: {is_reply}, is_bounce: {is_bounce_msg}")

    except Exception as e:
        gmail_monitor_logger.error(f"Unexpected error processing message {message_id}", exc_info=True)


def execute_with_retry(query_func, max_retries=3, initial_delay=1):
    """Execute a Supabase query with basic retry logic."""
    for attempt in range(max_retries):
        try:
            return query_func()
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            delay = initial_delay * (2 ** attempt)  # Simple exponential backoff
            gmail_monitor_logger.warning(f"Query failed, retrying in {delay}s: {str(e)}")
            time.sleep(delay)


def test_supabase_connection(db_client):
    """Test Supabase connection before processing messages."""
    try:
        # Test query against a table that should always exist
        result = db_client.from_('senders').select('*').limit(1).execute()
        if not result.data:
            gmail_monitor_logger.warning("Supabase connection test returned empty data - check if senders table exists")
            return True  # Still return True as connection succeeded
        gmail_monitor_logger.info("Supabase connection test successful")
        return True
    except Exception as e:
        gmail_monitor_logger.error(f"Supabase connection test failed: {str(e)}", exc_info=True)
        return False


def process_historical_messages(gmail_service, sender_email, sender_name, db_client, days_back=1, batch_size=100):
    try:
        if not test_supabase_connection(db_client):
            return
            
        query = f"after:{datetime.now(timezone.utc).date() - timedelta(days=days_back)} before:{datetime.now(timezone.utc).date() + timedelta(days=1)}"
        
        # Get all messages
        result = gmail_service.users().messages().list(
            userId='me',
            q=query,
            maxResults=500
        ).execute()
        
        messages = result.get('messages', [])
        total_messages = len(messages)
        
        if not messages:
            gmail_monitor_logger.info(f"No messages found for {sender_email} in the last {days_back} days")
            return
            
        gmail_monitor_logger.info(f"Processing {total_messages} historical messages for {sender_email}")
        
        processed = 0
        batch_count = 0
        
        while processed < total_messages:
            batch = messages[processed:processed+batch_size]
            batch_count += 1
            
            for i, msg in enumerate(batch):
                try:
                    process_message_for_engagement(
                        msg['id'], 
                        gmail_service, 
                        sender_email, 
                        sender_name, 
                        db_client
                    )
                    
                    # Log every 10 messages
                    if (i+1) % 10 == 0:
                        gmail_monitor_logger.info(f"Processed {i+1} messages in current batch ({processed + i + 1}/{total_messages} total)")
                        
                except Exception as e:
                    gmail_monitor_logger.error(f"Error processing message {msg['id']}", exc_info=True)
                
            processed += len(batch)
            gmail_monitor_logger.info(f"Processed batch of {len(batch)} messages (total: {processed})")
            
    except Exception as e:
        gmail_monitor_logger.error("Error in historical message processing", exc_info=True)


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

    logger = logging.getLogger('gmail_event_monitor')
    logger.info(f"Starting Gmail inbox monitoring...")
    try:
        senders_res = supabase_client.table("senders").select("id, sender_name, sender_email, last_checked_history_id").eq("is_active", True).execute()
    except Exception as e:
        logger = logging.getLogger('gmail_event_monitor')
        logger.error(f"Error fetching active senders: {e}", exc_info=True)
        return

    if not senders_res.data:
        logger = logging.getLogger('gmail_event_monitor')
        logger.info("No active senders found to monitor.")
        return

    for sender in senders_res.data:
        sender_id = sender["id"]
        sender_email = sender["sender_email"]
        sender_name = sender["sender_name"]
        # Ensure last_history_id is a string if not None
        last_history_id = str(sender["last_checked_history_id"]) if sender.get("last_checked_history_id") else None

        logger = logging.getLogger('gmail_event_monitor')
        logger.info(f"Checking inbox for sender: {sender_email} (Last History ID: {last_history_id})...")
        gmail_service = get_gmail_service(sender_email)
        if not gmail_service:
            logger = logging.getLogger('gmail_event_monitor')
            logger.warning(f"Skipping sender {sender_email} due to Gmail service creation failure.")
            continue

        try:
            # If last_history_id is None (first time for this sender), we need to get the current historyId
            # and store it. We'll only process messages *after* this point.
            if not last_history_id:
                profile = gmail_service.users().getProfile(userId='me').execute()
                current_sender_history_id = profile.get('historyId')
                if current_sender_history_id:
                    logger = logging.getLogger('gmail_event_monitor')
                    logger.info(f"First-time check for {sender_email}. Setting initial history ID to {current_sender_history_id}. Subsequent checks will process newer mail.")
                    try:
                        supabase_client.table("senders").update({"last_checked_history_id": str(current_sender_history_id)}).eq("id", sender_id).execute()
                        last_history_id = str(current_sender_history_id) # Use this for the current run (should yield no new messages)
                    except Exception as db_e:
                        logger = logging.getLogger('gmail_event_monitor')
                        logger.error(f"DB Error setting initial history_id for {sender_email}: {db_e}", exc_info=True)
                        continue # Skip this sender if we can't set initial history
                else:
                    logger = logging.getLogger('gmail_event_monitor')
                    logger.warning(f"Could not retrieve current historyId for {sender_email}. Skipping.")
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
                            logger = logging.getLogger('gmail_event_monitor')
                            logger.info(f"Updated last_checked_history_id for {sender_email} to {current_page_history_id}")
                            last_history_id = str(current_page_history_id) # For internal tracking if multiple pages
                        except Exception as db_e:
                            logger = logging.getLogger('gmail_event_monitor')
                            logger.error(f"DB Error updating history_id for {sender_email} after processing: {db_e}", exc_info=True)
                    break # Exit pagination loop
            
            if not all_new_message_ids_this_sender:
                logger = logging.getLogger('gmail_event_monitor')
                logger.info(f"No new messages for {sender_email} since history ID {last_history_id}.")
            else:
                logger = logging.getLogger('gmail_event_monitor')
                logger.info(f"Found {len(all_new_message_ids_this_sender)} new message candidate(s) for {sender_email}. Processing...")
                for msg_id in all_new_message_ids_this_sender:
                    process_message_for_engagement(
                        msg_id, 
                        gmail_service, 
                        sender_email, 
                        sender_name, 
                        supabase_client
                    )
        except HttpError as error:
            logger = logging.getLogger('gmail_event_monitor')
            logger.error(f"Gmail API error during history list for sender {sender_email}: {error.resp.status} - {error._get_reason()}", exc_info=True)
            if error.resp.status == 401 or error.resp.status == 403:
                logger = logging.getLogger('gmail_event_monitor')
                logger.warning("This might be a token or permission issue for this sender.")
            elif error.resp.status == 404 and 'historyId not found' in str(error.content).lower():
                 logger = logging.getLogger('gmail_event_monitor')
                 logger.warning(f"History ID {last_history_id} not found for {sender_email}. This can happen if history is too old or deleted. Resetting history ID.")
                 # Reset last_checked_history_id to None so it re-initializes on next run
                 try:
                    supabase_client.table("senders").update({"last_checked_history_id": None}).eq("id", sender_id).execute()
                    logger = logging.getLogger('gmail_event_monitor')
                    logger.info(f"Reset last_checked_history_id for {sender_email}. Will re-initialize on next run.")
                 except Exception as db_e:
                    logger = logging.getLogger('gmail_event_monitor')
                    logger.error(f"DB Error resetting history_id for {sender_email}: {db_e}", exc_info=True)
        except Exception as e:
            logger = logging.getLogger('gmail_event_monitor')
            logger.error(f"General error processing sender {sender_email}: {e}", exc_info=True)

    logger = logging.getLogger('gmail_event_monitor')
    logger.info(f"Gmail inbox monitoring finished.")


def is_reply_message(msg):
    """
    Checks if a message is a reply by examining email headers.
    Returns True if the message is a reply, False otherwise.
    """
    try:
        headers = {h['name'].lower(): h['value'] for h in msg['payload']['headers']}
        
        # Check standard reply headers
        if headers.get('in-reply-to'):
            return True
            
        # Check References header for multiple message IDs
        if headers.get('references'):
            refs = headers['references'].split()
            if len(refs) > 1:  # Multiple references indicates a thread
                return True
                
        # Check subject for reply/forward indicators
        subject = headers.get('subject', '').lower()
        reply_prefixes = ('re:', 'fw:', 'fwd:', 'aw:')
        if any(subject.startswith(prefix) for prefix in reply_prefixes):
            return True
            
        # Check for auto-replies
        auto_submitted = headers.get('auto-submitted', '').lower()
        if auto_submitted and auto_submitted != 'no':
            return True
            
        return False
        
    except Exception as e:
        gmail_monitor_logger.error(f"Error checking for reply: {str(e)}", exc_info=True)
        return False


if __name__ == "__main__":
    # ... existing setup code ...
    
    # Add this after service initialization but before main loop
    if '--process-history' in sys.argv:
        for sender in supabase_client.table("senders").select("sender_email, sender_name").eq("is_active", True).execute().data:
            process_historical_messages(
                get_gmail_service(sender["sender_email"]), 
                sender["sender_email"], 
                sender["sender_name"], 
                supabase_client,
                days_back=1  # Adjust as needed
            )
    
    # Continue with normal monitoring...
    monitor_all_active_senders()