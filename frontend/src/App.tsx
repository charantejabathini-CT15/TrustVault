import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { VaultModal } from './components/VaultModal';
import { UploadModal } from './components/UploadModal';
import { ShareModal } from './components/ShareModal';
import { DocumentPreviewModal } from './components/DocumentPreviewModal';

import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { SharedWithMePage } from './pages/SharedWithMePage';
import { AuditPage } from './pages/AuditPage';
import { PolicySimulatorPage } from './pages/PolicySimulatorPage';
import { AlertsPage } from './pages/AlertsPage';
import { TeamPage } from './pages/TeamPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';

import type { DocumentItem } from './types';
import { RefreshCw } from 'lucide-react';

const ProtectedLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [shareDocId, setShareDocId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center text-cyan-400 gap-3">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <span className="text-xs font-mono">Authenticating with TrustVault...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col">
      <Navbar onOpenVaultModal={() => setIsVaultModalOpen(true)} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          onOpenUpload={() => setIsUploadModalOpen(true)}
          openAlertsCount={0}
        />

        <main className="flex-1 overflow-y-auto bg-[#070b14] pb-12">
          <Routes>
            <Route
              path="/dashboard"
              element={
                <DashboardPage
                  key={`dash-${refreshKey}`}
                  onOpenUpload={() => setIsUploadModalOpen(true)}
                  onOpenVault={() => setIsVaultModalOpen(true)}
                />
              }
            />
            <Route
              path="/documents"
              element={
                <DocumentsPage
                  key={`docs-${refreshKey}`}
                  onOpenUpload={() => setIsUploadModalOpen(true)}
                  onOpenPreview={(doc) => setPreviewDoc(doc)}
                  onOpenShare={(id) => setShareDocId(id)}
                />
              }
            />
            <Route
              path="/shared-with-me"
              element={
                <SharedWithMePage
                  key={`shared-${refreshKey}`}
                  onOpenPreview={(doc) => setPreviewDoc(doc)}
                />
              }
            />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/policy-simulator" element={<PolicySimulatorPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route
              path="/settings"
              element={<SettingsPage onOpenVault={() => setIsVaultModalOpen(true)} />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>

      {/* Global Modals */}
      <VaultModal
        isOpen={isVaultModalOpen}
        onClose={() => setIsVaultModalOpen(false)}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
        onOpenVault={() => {
          setIsUploadModalOpen(false);
          setIsVaultModalOpen(true);
        }}
      />

      <ShareModal
        isOpen={shareDocId !== null}
        documentId={shareDocId || ''}
        onClose={() => setShareDocId(null)}
        onShareUpdated={() => setRefreshKey((k) => k + 1)}
        onOpenVault={() => {
          setShareDocId(null);
          setIsVaultModalOpen(true);
        }}
      />

      <DocumentPreviewModal
        isOpen={previewDoc !== null}
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onOpenVault={() => {
          setPreviewDoc(null);
          setIsVaultModalOpen(true);
        }}
      />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
