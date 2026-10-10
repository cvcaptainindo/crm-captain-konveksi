import React from 'react';
import { NavTab } from './Sidebar.js';
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  MessageSquareText,
  Menu,
} from 'lucide-react';

interface BottomNavProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onToggleSidebar: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onToggleSidebar,
}) => {
  const navTabs: { id: NavTab; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customer', icon: Users },
    { id: 'schedule', label: 'Agenda', icon: CalendarClock },
    { id: 'templates', label: 'Template', icon: MessageSquareText },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800/80 px-2 py-1 flex items-center justify-around shadow-2xl safe-area-bottom select-none"
    >
      {navTabs.map(tab => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 min-h-[50px] py-1 px-1 rounded-xl transition-all active:scale-95 ${
              isActive
                ? 'text-[#c5a059] font-bold bg-[#c5a059]/10'
                : 'text-neutral-400 hover:text-neutral-200 active:bg-neutral-900/60'
            }`}
          >
            <Icon
              className={`w-5 h-5 ${
                isActive ? 'text-[#c5a059]' : 'text-neutral-400'
              } transition-transform`}
            />
            <span className="text-[10px] tracking-tight mt-1 leading-none">
              {tab.label}
            </span>
            {isActive && (
              <span className="w-1 h-1 rounded-full bg-[#c5a059] mt-0.5" />
            )}
          </button>
        );
      })}

      {/* Menu Drawer Toggle */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="flex flex-col items-center justify-center flex-1 min-h-[50px] py-1 px-1 rounded-xl text-neutral-400 hover:text-neutral-200 active:bg-neutral-900/60 transition-all active:scale-95"
        title="Menu Lengkap"
      >
        <Menu className="w-5 h-5 text-neutral-400" />
        <span className="text-[10px] tracking-tight mt-1 leading-none">Menu</span>
      </button>
    </nav>
  );
};
