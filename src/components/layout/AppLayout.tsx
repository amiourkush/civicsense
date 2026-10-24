import React, { useState, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, BarChart3,
  LogOut, ChevronLeft, Menu, X, Shield
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Complaints', icon: ClipboardList, href: '/complaints' },
  { label: 'Analytics', icon: BarChart3, href: '/analytics' },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  const isActive = (href: string) => location.pathname.startsWith(href);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-govblue-800/30">
        <div className="w-9 h-9 rounded-lg bg-govblue-500 flex items-center justify-center shadow-sm">
          <Shield size={18} className="text-white" />
        </div>
        {sidebarOpen && (
          <div className="min-w-0">
            <div className="font-bold text-white text-lg leading-tight tracking-tight">CivicSense</div>
            <div className="text-govblue-300 text-xs">Admin Portal</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-govblue-700 text-white shadow-sm'
                  : 'text-govblue-200 hover:bg-govblue-800/50 hover:text-white',
              )}
            >
              <item.icon size={18} className="shrink-0" />
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className={cn('border-t border-govblue-800/30 p-3', sidebarOpen ? '' : 'flex flex-col items-center')}>
        {sidebarOpen ? (
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-govblue-800/40 transition-colors">
            <div className="w-8 h-8 rounded-full bg-govblue-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {user?.avatarInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.name}</div>
              <div className="text-xs text-govblue-300 truncate">{user?.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md hover:bg-govblue-700 text-govblue-300 hover:text-white transition-colors"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <>
            <div className="w-8 h-8 rounded-full bg-govblue-500 flex items-center justify-center text-xs font-bold text-white mb-2">
              {user?.avatarInitials}
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md hover:bg-govblue-700 text-govblue-300 hover:text-white transition-colors"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col bg-govblue-900 transition-all duration-300 shrink-0',
          sidebarOpen ? 'w-60' : 'w-16',
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 flex flex-col w-60 bg-govblue-900 h-full">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 shrink-0 shadow-sm">
          {/* Collapse toggle (desktop) */}
          <button
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <ChevronLeft
              size={16}
              className={cn('transition-transform duration-300', !sidebarOpen && 'rotate-180')}
            />
          </button>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={16} />
          </button>

          {/* Page title (breadcrumb-style) */}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-slate-700 truncate">
              {NAV_ITEMS.find((n) => isActive(n.href))?.label ?? 'CivicSense'}
            </h1>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Role chip */}
            <div className="hidden sm:flex items-center gap-1.5 bg-govblue-50 border border-govblue-200 rounded-full px-3 py-1">
              <div className="w-5 h-5 rounded-full bg-govblue-600 flex items-center justify-center text-[9px] font-bold text-white">
                {user?.avatarInitials}
              </div>
              <span className="text-xs font-medium text-govblue-700">{user?.role}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
