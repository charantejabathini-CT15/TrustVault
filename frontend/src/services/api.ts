/**
 * TrustVault API Gateway
 * Powered completely by Firebase Cloud Services (Auth, Firestore, Cloud Storage, Analytics)
 */

export {
  firebaseAuthApi as authApi,
  firebaseDocumentsApi as documentsApi,
  firebaseAuditApi as auditApi,
  firebasePolicyApi as policyApi,
  firebaseAlertsApi as alertsApi,
  firebaseTeamApi as teamApi,
  firebaseProfileApi as profileApi,
  firebaseDashboardApi as dashboardApi,
} from './firebaseBackend';
