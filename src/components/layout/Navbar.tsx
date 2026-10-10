import React from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { LogOut, Shield, User as UserIcon, Menu } from 'lucide-react';

interface NavbarProps {
  currentPageTitle: string;
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPageTitle, onToggleSidebar }) => {
  const { user, logout, isAdmin } = useAuth();

  return (
    <header className="h-14 sm:h-16 border-b border-neutral-200/80 bg-white/95 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
      {/* Zone 1 & 2: Mobile toggle & Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100 active:bg-neutral-200 focus:outline-none shrink-0"
          aria-label="Buka Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs sm:text-sm min-w-0">
          <img
            src="/logo.jpg"
            alt="Captain Konveksi"
            className="w-7 h-7 rounded-lg object-cover border border-[#c5a059]/40 shrink-0 shadow-2xs"
          />
          <span className="font-bold text-neutral-900 tracking-tight hidden sm:inline shrink-0">
            Captain Konveksi
          </span>
          <span className="text-neutral-300 hidden sm:inline">/</span>
          <span className="text-neutral-700 font-semibold truncate max-w-[160px] xs:max-w-[220px] sm:max-w-none">
            {currentPageTitle}
          </span>
        </div>
      </div>

      {/* Zone 3: User Info & Actions */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {user && (
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-neutral-900 leading-tight">{user.name}</span>
              <span className="text-[10px] font-mono tracking-wider">
                {isAdmin ? (
                  <span className="text-[#c5a059] font-bold">OWNER / ADMIN</span>
                ) : (
                  <span className="text-neutral-500 font-medium">SALES PIC</span>
                )}
              </span>
            </div>

            <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-700 shrink-0">
              {isAdmin ? (
                <Shield className="w-4 h-4 text-[#c5a059]" />
              ) : (
                <UserIcon className="w-4 h-4 text-neutral-600" />
              )}
            </div>

            <button
              onClick={logout}
              title="Logout"
              aria-label="Logout"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 active:bg-neutral-200 rounded-xl transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
