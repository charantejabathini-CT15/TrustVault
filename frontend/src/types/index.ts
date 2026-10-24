export interface User {
  id: string;
  email: string;
  display_name: string;
  org_id?: string;
  org_name?: string;
  role?: 'owner' | 'admin' | 'member' | 'auditor';
  has_keys: boolean;
}

export interface UserPublicInfo {
  id: string;
  email: string;
  display_name: string;
  public_key?: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  content_type?: string;
  size: number;
  owner_id?: string;
  owner_name?: string;
  org_id: string;
  encrypted_file_hash?: string;
  created_at: string;
  share_count: number;
  has_access: boolean;
  permission?: 'owner' | 'view' | 'download';
}

export interface ShareItem {
  id: string;
  document_id: string;
  grantor_id?: string;
  grantor_name?: string;
  grantee_id: string;
  grantee_email?: string;
  grantee_name?: string;
  permission: 'view' | 'download';
  expires_at?: string;
  revoked: boolean;
  revoked_at?: string;
  created_at: string;
}

export interface DocumentDetail extends DocumentItem {
  shares: ShareItem[];
  key_envelope?: string;
}

export interface AuditEventItem {
  id: number;
  org_id: string;
  actor_id?: string;
  actor_email?: string;
  actor_name?: string;
  document_id?: string;
  document_name?: string;
  action: string;
  result: string;
  metadata_json?: Record<string, any>;
  request_id?: string;
  previous_hash: string;
  event_hash: string;
  sequence_number: number;
  created_at: string;
}

export interface AuditVerificationResult {
  valid: boolean;
  events_checked: number;
  first_failure_sequence?: number;
  message: string;
}

export interface PolicyCheckStep {
  check: string;
  passed: boolean;
  detail: string;
}

export interface PolicySimulationResult {
  allowed: boolean;
  reason: string;
  checks: PolicyCheckStep[];
}

export interface SecurityAlertItem {
  id: string;
  org_id: string;
  user_id?: string;
  user_email?: string;
  document_id?: string;
  rule_name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence_json?: Record<string, any>;
  recommendation?: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
}

export interface OrgMemberItem {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'admin' | 'member' | 'auditor';
  joined_at: string;
  has_keys?: boolean;
}

export interface DashboardStats {
  total_documents: number;
  active_shares: number;
  open_alerts: number;
  total_audit_events: number;
  chain_verified: boolean;
}
