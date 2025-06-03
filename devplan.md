# Development Plan

## Phase 1: Core CRM Features

### 1. Lead Management
    -   **Task 1.1: Data Integration & Filtering**
        -   [/] Integrate real data from `normalized_leads` table. (New component fetches data)
        -   [/] Implement filtering by user-created market regions. (New component includes dropdown filter)
    -   **Task 1.2: Table Interactivity - Basic**
        -   [/] Implement on-hover row highlighting. (New component includes hover styling)
        -   [/] Implement clickable rows that popup lead card modals. (New component implements this)
    -   **Task 1.3: Lead Card Modal**
        -   [/] Create a modal for viewing and editing lead details. (New component implements this)
        -   [/] Implement data editing and saving functionality in the modal. (New component includes save logic)
        -   [/] Implement note-adding functionality in the modal. (New component includes notes field in modal)
    -   **Task 1.4: Table Interactivity - Advanced**
        -   [/] Implement sortable columns in the leads table. (New component implements sortable columns)
        -   [/] Implement pagination with options for 25, 50, or 100 rows per page. (New component implements pagination)
    -   **Task 1.5: CSV Upload & Processing**
        -   [/] Implement functionality to upload raw CSV files. (New component implements CSV upload UI and logic)
        -   [/] Process uploaded CSVs into the `normalized_leads` table. (New component calls `/api/leads/upload` for processing)
    -   **Task 1.6: General Refinements, Bug Fixes, and Authentication**
        -   [x] Corrected JSX structural errors (e.g., mismatched/extra closing tags) in `CrmView.tsx`.
        -   [x] Replaced custom UI components (Input, Select, Button, Badge, Table, etc.) with standard HTML elements styled with DaisyUI in `CrmView.tsx`.
        -   [x] Addressed ESLint 'Promise-returning function' error in `CrmView.tsx`.
        -   [x] Added explicit types for improved type safety in `CrmView.tsx`.
        -   [x] Resolve "Auth session missing!" errors and redirect loops (Implemented robust session handling in `auth.ts`, `page.tsx`, and `RequireAuth.tsx` including `onAuthStateChange`).
        -   [x] Implement robust OAuth login flow on the home page (`page.tsx` updated with loading states, error handling, and correct use of new auth library functions).
        -   [x] Enhance `RequireAuth` component for reliable session checking and redirection (Updated `RequireAuth.tsx` to use `getSupabaseSession` and added `onAuthStateChange` listener for dynamic updates).

### 2. Email Sender Management
    -   [x] Core functionality implemented (`EmailSendersView.tsx`):
        -   [x] Add, edit, delete individual senders.
        -   [x] Toggle sender active status.
        -   [x] Bulk upload senders via CSV.
        -   [x] API integration with `/api/email-senders`.

### 3. Template Management
    -   [x] Core functionality implemented (`TemplatesView.tsx`):
        -   [x] Create, edit, delete email and document templates.
        -   [x] Rich text editor (Tiptap) for template body.
        -   [x] Placeholder management.
        -   [x] Search and filter templates.
        -   [x] API integration for template operations.
        -   [x] PDF Preview functionality:
            -   [x] Added inline PDF preview for document templates
            -   [x] Modal-based PDF viewer with loading/error states
            -   [x] API endpoint for generating sample PDFs from templates
            -   [x] TypeScript type safety improvements
    -   [x] Document Template Storage Improvements:
        -   [x] Updated PDF storage to save directly to bucket root instead of user-specific folders
        -   [x] Standardized template type naming from 'loi_document' to 'pdf_document'
        -   [x] Added proper database schema for document templates with available_placeholders support

### 4. Campaign Management
    -   [x] Core functionality implemented (`CampaignsView.tsx`):
        -   [x] Create, edit, delete campaigns.
        -   [x] Start and stop campaigns.
        -   [x] Select senders and templates for campaigns.
        -   [x] Monitor basic campaign status (view for detailed monitoring exists).
        -   [x] Supabase and API integration for campaign operations.
        -   [x] Advanced features implemented in `campaignEngine.ts`:
            -   [x] Quota-based sending with daily limits
            -   [x] Interval-driven sending with configurable delays
            -   [x] Sender allocation with round-robin selection
            -   [x] Pre-flight check with test email to admin
            -   [x] TypeScript type safety improvements
            -   [x] Error handling and retry logic
            -   [x] PDF attachment generation for document templates
            -   [x] Multi-recipient handling (contacts 1-3 + agent)

### 5. Dashboard & Monitoring
    -   [x] A dashboard to control the entire operation and monitor the progress in real time, including graphs/charts and statistics for each email sender account.  We're tracking KPI data for emails (sent, delivered, bounced) and the control for starting and stopping the engine that assigns leads to email senders has to be wired to do a pre-flight check to test send one email from each sender to the single user who is logged in to control the app (in this case, me and my address chrisphillips@truesoulpartners.com).
    *   **Status: Significantly Implemented.**
    *   **Details:** `DashboardView.tsx` has been rewritten to `DashboardView_temp.tsx` to resolve persistent parsing and structural issues. The new version includes:
        *   Real-time KPI monitoring (Supabase realtime & polling).
        *   Bar charts for sender performance (Recharts).
        *   Display of key email statistics (sent, delivered, opened, clicked, bounced).
        *   Controls for starting/stopping the campaign engine.
        *   Pre-flight check functionality before campaign start.
        *   Robust error handling and a live activity console.
    *   **Next Steps:** Review `DashboardView_temp.tsx`, integrate if satisfactory, and perform thorough testing.

### 6. Settings Management
    -   [x] UI for settings implemented (`SettingsView.tsx`) with tabs for:
        -   [x] Access Control (UI only, persistence scaffolded)
        -   [x] Delegation (UI only, persistence scaffolded)
        -   [x] Branding (Logo upload functional, other persistence scaffolded)
        -   [x] Analytics (UI only, persistence scaffolded)
    -   [x] Functional logo upload to Supabase Storage.
    -   [ ] Full data persistence for all settings sections needs implementation/verification.
