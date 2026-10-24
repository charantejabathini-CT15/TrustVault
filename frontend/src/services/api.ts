import axios from 'axios';
import type {
  User, DocumentItem, DocumentDetail, AuditEventItem,
  AuditVerificationResult, PolicySimulationResult, SecurityAlertItem,
  OrgMemberItem, DashboardStats, UserPublicInfo, ShareItem
} from '../types';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const csrfToken = getCookie('csrf_token');
  if (csrfToken && config.headers) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

// --- Auth API ---
export const authApi = {
  register: (data: { email: string; password: string; display_name: string; org_name: string }) =>
    api.post<User>('/auth/register', data).then(r => r.data),

  login: (data: { email: string; password: string }) =>
    api.post<User>('/auth/login', data).then(r => r.data),

  logout: () => api.post('/auth/logout').then(r => r.data),

  me: () => api.get<User>('/auth/me').then(r => r.data),
};

// --- Documents API ---
export const documentsApi = {
  list: (filter?: 'owned' | 'shared') =>
    api.get<any>('/documents', { params: { filter } }).then(r => {
      if (Array.isArray(r.data)) {
        return { documents: r.data as DocumentItem[], total: r.data.length };
      }
      return {
        documents: Array.isArray(r.data?.documents) ? r.data.documents : [],
        total: r.data?.total ?? (Array.isArray(r.data?.documents) ? r.data.documents.length : 0),
      };
    }),

  get: (id: string) =>
    api.get<DocumentDetail>(`/documents/${id}`).then(r => r.data),

  upload: (formData: FormData) =>
    api.post<DocumentItem>('/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  getContent: (id: string, action: 'view' | 'download' = 'view') =>
    api.get<{ encrypted_content: string; encrypted_key: string; encrypted_file_hash: string }>(
      `/documents/${id}/content`,
      { params: { action } }
    ).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/documents/${id}`).then(r => r.data),

  createShare: (documentId: string, data: { grantee_email: string; permission: 'view' | 'download'; encrypted_key: string; expires_at?: string }) =>
    api.post<ShareItem>(`/documents/${documentId}/shares`, data).then(r => r.data),

  revokeShare: (documentId: string, shareId: string) =>
    api.delete(`/documents/${documentId}/shares/${shareId}`).then(r => r.data),
};

// --- Audit API ---
export const auditApi = {
  list: (params?: { actor_id?: string; document_id?: string; action?: string; result?: string; start_date?: string; end_date?: string; offset?: number; limit?: number }) =>
    api.get<any>('/audit', { params }).then(r => {
      if (Array.isArray(r.data)) {
        return { events: r.data as AuditEventItem[], total: r.data.length };
      }
      return {
        events: Array.isArray(r.data?.events) ? r.data.events : [],
        total: r.data?.total ?? (Array.isArray(r.data?.events) ? r.data.events.length : 0),
      };
    }),

  verify: () =>
    api.post<AuditVerificationResult>('/audit/verify').then(r => r.data),
};

// --- Policy Simulator API ---
export const policyApi = {
  simulate: (data: { user_id: string; document_id: string; action: 'view' | 'download'; simulated_time?: string }) =>
    api.post<PolicySimulationResult>('/policy/simulate', data).then(r => r.data),
};

// --- Security Alerts API ---
export const alertsApi = {
  list: (params?: { status?: string; severity?: string }) =>
    api.get<any>('/alerts', { params }).then(r => {
      if (Array.isArray(r.data)) {
        return { alerts: r.data as SecurityAlertItem[], total: r.data.length };
      }
      return {
        alerts: Array.isArray(r.data?.alerts) ? r.data.alerts : [],
        total: r.data?.total ?? (Array.isArray(r.data?.alerts) ? r.data.alerts.length : 0),
      };
    }),

  updateStatus: (alertId: string, status: 'acknowledged' | 'resolved' | 'dismissed') =>
    api.patch<SecurityAlertItem>(`/alerts/${alertId}`, { status }).then(r => r.data),
};

// --- Dashboard & Team API ---
export const dashboardApi = {
  getStats: () =>
    api.get<DashboardStats>('/dashboard/stats').then(r => r.data),
};

export const teamApi = {
  getMembers: () =>
    api.get<any>('/team/members').then(r => {
      if (Array.isArray(r.data)) {
        return { members: r.data as OrgMemberItem[], total: r.data.length };
      }
      return (r.data || { members: [], total: 0 }) as { members: OrgMemberItem[]; total: number };
    }),

  addMember: (data: { email: string; role: string; display_name?: string }) =>
    api.post('/team/members', data).then(r => r.data),
};

// --- Keys & Profile API ---
export const profileApi = {
  getProfile: () =>
    api.get<{ id: string; email: string; display_name: string; public_key?: string; encrypted_private_key?: string; private_key_salt?: string; pbkdf2_iterations: number }>('/profile').then(r => r.data),

  uploadKeys: (data: { public_key: string; encrypted_private_key: string; private_key_salt: string; pbkdf2_iterations: number }) =>
    api.put('/profile/keys', data).then(r => r.data),

  getUserPublicKey: (userId: string) =>
    api.get<UserPublicInfo>(`/profile/public-key/${userId}`).then(r => r.data),
};
