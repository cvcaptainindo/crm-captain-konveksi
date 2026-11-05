import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext.js';
import { ToastProvider, useToast } from './contexts/ToastContext.js';
import { Customer, CustomerStatus, User, WhatsAppTemplate } from './types/index.js';
import { apiRequest } from './api/client.js';

// Layout
import { Navbar } from './components/layout/Navbar.js';
import { Sidebar, NavTab } from './components/layout/Sidebar.js';
import { BottomNav } from './components/layout/BottomNav.js';

// Pages
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { CustomersPage } from './pages/CustomersPage.js';
import { FollowUpSchedulePage } from './pages/FollowUpSchedulePage.js';
import { WhatsAppTemplatesPage } from './pages/WhatsAppTemplatesPage.js';
import { FollowUpRulesPage } from './pages/FollowUpRulesPage.js';
import { AuditLogsPage } from './pages/AuditLogsPage.js';
import { TrashPage } from './pages/TrashPage.js';
import { TransactionsPage } from './pages/TransactionsPage.js';
import { SalesManagementPage } from './pages/SalesManagementPage.js';
import { SalesWhatsAppConnectPage } from './pages/SalesWhatsAppConnectPage.js';
import { WhatsAppWorkspacePage } from './pages/WhatsAppWorkspacePage.js';
import { WhatsAppMonitoringPage } from './pages/WhatsAppMonitoringPage.js';
import { InvoiceSettingsPage } from './pages/InvoiceSettingsPage.js';

// Modals
import { CustomerFormModal } from './components/customers/CustomerFormModal.js';
import { CustomerDetailModal } from './components/customers/CustomerDetailModal.js';
import { FollowUpActionModal } from './components/followUp/FollowUpActionModal.js';
import { ConfirmModal } from './components/common/ConfirmModal.js';

const MainApp: React.FC = () => {
  const { user, isLoading: isAuthLoading, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Common Lookups
  const [statuses, setStatuses] = useState<CustomerStatus[]>([]);
  const [salesList, setSalesList] = useState<User[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [detailCustomerId, setDetailCustomerId] = useState<number | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const [followUpCustomer, setFollowUpCustomer] = useState<Customer | null>(null);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);

  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  // Load common lookups on session start
  const loadLookups = async () => {
    try {
      const [resStatus, resUsers, resTemplates] = await Promise.all([
        apiRequest('/customers/statuses'),
        apiRequest('/users'),
        apiRequest('/templates'),
      ]);

      if (resStatus.success) setStatuses(resStatus.data);
      if (resUsers.success) setSalesList(resUsers.data);
      if (resTemplates.success) setTemplates(resTemplates.data);
    } catch (err: any) {
      console.warn('Could not load lookups:', err);
    }
  };

  useEffect(() => {
    if (user) {
      loadLookups();
    }
  }, [user]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white text-sm font-mono">
        Memeriksa sesi login CRM Captain Konveksi...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Modal Handlers
  const handleOpenAddCustomer = () => {
    setEditingCustomer(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditCustomer = (c: Customer) => {
    setEditingCustomer(c);
    setIsFormModalOpen(true);
    setIsDetailModalOpen(false);
  };

  const handleOpenDetail = (c: Customer) => {
    setDetailCustomerId(c.id);
    setIsDetailModalOpen(true);
  };

  const handleOpenFollowUp = (c: Customer) => {
    setFollowUpCustomer(c);
    setIsFollowUpModalOpen(true);
  };

  const handleConfirmSoftDelete = async () => {
    if (!deletingCustomer) return;
    try {
      await apiRequest(`/customers/${deletingCustomer.id}`, { method: 'DELETE' });
      showToast(`Customer ${deletingCustomer.name} dipindahkan ke Trash.`, 'success');
      setDeletingCustomer(null);
      setIsDetailModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus customer.', 'error');
    }
  };

  const getPageTitle = (tab: NavTab) => {
    switch (tab) {
      case 'dashboard':
        return 'Dashboard Follow-Up';
      case 'customers':
        return 'Data Customer';
      case 'transactions':
        return 'Laporan & Transaksi Closing (Omzet)';
      case 'schedule':
        return 'Agenda Follow-Up';
      case 'templates':
        return 'Template WhatsApp';
      case 'wa_workspace':
        return 'WhatsApp Web Workspace (Sales)';
      case 'wa_monitoring':
        return 'Monitoring Follow-Up WhatsApp (Admin)';
      case 'connect_wa':
        return 'Live Screen WhatsApp';
      case 'sales_mgmt':
        return 'Kelola Akun Sales';
      case 'invoice_settings':
        return 'Pengaturan Invoice';
      case 'rules':
        return 'Aturan Follow-Up (Admin)';
      case 'audit':
        return 'Audit Log';
      case 'trash':
        return 'Trash / Sampah';
      default:
        return 'Dashboard';
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          currentPageTitle={getPageTitle(currentTab)}
          onToggleSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
        />

        <main className="flex-1 p-3.5 sm:p-5 lg:p-8 max-w-7xl w-full mx-auto pb-24 md:pb-8">
          {currentTab === 'dashboard' && (
            <DashboardPage
              onOpenCustomerDetail={handleOpenDetail}
              onOpenFollowUpModal={handleOpenFollowUp}
              onNavigateToCustomers={() => setCurrentTab('customers')}
              onNavigateToTransactions={() => setCurrentTab('transactions')}
              onNavigateToWhatsAppWeb={() => setCurrentTab('wa_workspace')}
            />
          )}

          {currentTab === 'customers' && (
            <CustomersPage
              statuses={statuses}
              salesList={salesList}
              onOpenAddModal={handleOpenAddCustomer}
              onOpenEditModal={handleOpenEditCustomer}
              onOpenDetailModal={handleOpenDetail}
              onOpenFollowUpModal={handleOpenFollowUp}
              onDeleteCustomer={c => setDeletingCustomer(c)}
            />
          )}

          {currentTab === 'transactions' && <TransactionsPage />}

          {currentTab === 'schedule' && (
            <FollowUpSchedulePage
              onOpenCustomerDetail={handleOpenDetail}
              onOpenFollowUpModal={handleOpenFollowUp}
            />
          )}

          {currentTab === 'templates' && <WhatsAppTemplatesPage />}

          {currentTab === 'wa_workspace' && (
            <WhatsAppWorkspacePage
              onOpenFollowUpModal={handleOpenFollowUp}
              onNavigateToDashboard={() => setCurrentTab('dashboard')}
              onNavigateToCustomers={() => setCurrentTab('customers')}
            />
          )}

          {currentTab === 'wa_monitoring' && isAdmin && <WhatsAppMonitoringPage />}

          {currentTab === 'connect_wa' && !isAdmin && <SalesWhatsAppConnectPage />}

          {currentTab === 'sales_mgmt' && isAdmin && <SalesManagementPage />}

          {currentTab === 'invoice_settings' && isAdmin && <InvoiceSettingsPage />}

          {currentTab === 'rules' && isAdmin && <FollowUpRulesPage />}

          {currentTab === 'audit' && isAdmin && <AuditLogsPage />}

          {currentTab === 'trash' && isAdmin && <TrashPage />}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onToggleSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
      />

      {/* Global Modals */}
      <CustomerFormModal
        isOpen={isFormModalOpen}
        customer={editingCustomer}
        statuses={statuses}
        salesList={salesList}
        onClose={() => setIsFormModalOpen(false)}
        onSuccess={() => {
          loadLookups();
        }}
      />

      <CustomerDetailModal
        isOpen={isDetailModalOpen}
        customerId={detailCustomerId}
        onClose={() => setIsDetailModalOpen(false)}
        onOpenFollowUp={c => {
          setIsDetailModalOpen(false);
          handleOpenFollowUp(c);
        }}
        onOpenEdit={handleOpenEditCustomer}
        onDeleteCustomer={c => setDeletingCustomer(c)}
      />

      <FollowUpActionModal
        isOpen={isFollowUpModalOpen}
        customer={followUpCustomer}
        templates={templates}
        statuses={statuses}
        onClose={() => setIsFollowUpModalOpen(false)}
        onSuccess={() => {
          loadLookups();
        }}
      />

      <ConfirmModal
        isOpen={Boolean(deletingCustomer)}
        title="Pindahkan Customer ke Trash"
        message={`Apakah Anda yakin ingin memindahkan "${deletingCustomer?.name}" ke Trash? Customer tidak akan muncul dalam daftar aktif tim sales.`}
        confirmLabel="Pindahkan ke Trash"
        isDanger={true}
        onConfirm={handleConfirmSoftDelete}
        onCancel={() => setDeletingCustomer(null)}
      />
    </div>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ToastProvider>
  );
}
