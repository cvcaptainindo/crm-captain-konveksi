import React from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  MessageSquareText,
  Sliders,
  History,
  Trash2,
  PhoneCall,
  X,
  DollarSign,
  UserCheck,
  Radio,
  MessageSquare,
  FileText,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'customers'
  | 'transactions'
  | 'schedule'
  | 'templates'
  | 'wa_workspace'
  | 'connect_wa'
  | 'wa_monitoring'
  | 'sales_mgmt'
  | 'rules'
  | 'audit'
  | 'trash';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
}) => {
  const { isAdmin, user } = useAuth();

  const handleNav = (tab: NavTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const navItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard Follow-Up', icon: LayoutDashboard, adminOnly: false },
    { id: 'customers' as NavTab, label: 'Data Customer', icon: Users, adminOnly: false },
    { id: 'transactions' as NavTab, label: 'Transaksi & Omzet', icon: DollarSign, adminOnly: false },
    { id: 'schedule' as NavTab, label: 'Agenda Follow-Up', icon: CalendarClock, adminOnly: false },
    { id: 'templates' as NavTab, label: 'WhatsApp Templates', icon: MessageSquareText, adminOnly: false },
    { id: 'wa_workspace' as NavTab, label: 'WhatsApp Web', icon: MessageSquare, adminOnly: false },

    { id: 'wa_monitoring' as NavTab, label: 'Monitoring Follow-Up WA', icon: FileText, adminOnly: true },
    { id: 'sales_mgmt' as NavTab, label: 'Kelola Akun Sales', icon: UserCheck, adminOnly: true },
    { id: 'rules' as NavTab, label: 'Aturan Follow-Up', icon: Sliders, adminOnly: true },
    { id: 'audit' as NavTab, label: 'Audit Log Forensik', icon: History, adminOnly: true },
    { id: 'trash' as NavTab, label: 'Trash / Sampah', icon: Trash2, adminOnly: true },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-neutral-950/70 z-50 md:hidden backdrop-blur-xs transition-opacity duration-200"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-72 md:w-64 bg-neutral-900 text-neutral-300 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.jpg"
              alt="Captain Konveksi"
              className="w-9 h-9 rounded-xl object-cover border border-[#c5a059]/40 shadow-xs shrink-0"
            />
            <div className="min-w-0">
              <div className="text-xs font-bold text-white tracking-tight leading-tight truncate">CAPTAIN KONVEKSI</div>
              <div className="text-[10px] text-[#c5a059] font-mono tracking-wider font-semibold">CRM & FOLLOW-UP V1.0</div>
            </div>
          </div>

          {/* Close button on mobile */}
          <button
            onClick={onCloseMobile}
            className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-400 hover:text-white rounded-xl active:bg-neutral-800"
            aria-label="Tutup Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User preview on mobile */}
        {user && (
          <div className="md:hidden p-3 mx-3 mt-3 bg-neutral-800/80 rounded-xl border border-neutral-700/60 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{user.name}</div>
              <div className="text-[10px] text-neutral-400 font-mono">{user.email}</div>
            </div>
            <span
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                isAdmin
                  ? 'bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/30'
                  : 'bg-neutral-700 text-neutral-300 border border-neutral-600'
              }`}
            >
              {user.role}
            </span>
          </div>
        )}

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Menu Operasional
          </div>

          {navItems.map(item => {
            if (item.adminOnly && !isAdmin) return null;
            if ((item as any).salesOnly && isAdmin) return null;
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-medium transition-all text-left min-h-[44px] ${
                  isActive
                    ? 'bg-[#c5a059]/15 text-[#c5a059] border border-[#c5a059]/30 font-bold'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60 active:bg-neutral-800'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#c5a059]' : 'text-neutral-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-4 border-t border-neutral-800 text-[11px] text-neutral-500">
          <div className="flex items-center gap-1.5 text-neutral-300 font-medium">
            <PhoneCall className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">WhatsApp Click-to-Chat</span>
          </div>
          <p className="mt-1 text-[10px] text-neutral-500 leading-tight">
            Prioritas respon cepat untuk Owner & Sales Captain Konveksi.
          </p>
        </div>
      </aside>
    </>
  );
};
