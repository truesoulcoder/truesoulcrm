// Shared types for CRM
export interface Sender {
  id: number;
  employee_name: string;
  employee_email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  photo_url?: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: string;
  created_at: string;
  emailsSent?: number;
  openRate?: number;
  clickRate?: number;
  creationDate?: string;
}
