import React, { useEffect, useState, useCallback } from 'react';
import { adminApi, AdminUser, DashboardStats, DepositItem, WithdrawalItem } from './services/api';
import { AdminLogin } from './components/AdminLogin';
import { AdminNavbar, AdminTab } from './components/AdminNavbar';
import { OverviewView } from './views/OverviewView';
import { UsersView } from './views/UsersView';
import { DepositsView } from './views/DepositsView';
import { WithdrawalsView } from './views/WithdrawalsView';
import { RoomsView } from './views/RoomsView';
import { FeedbackView } from './views/FeedbackView';
import { SettingsView } from './views/SettingsView';
import { UserProfileModal } from './components/UserProfileModal';
import { Loader2 } from 'lucide-react';
import { io } from 'socket.io-client';

export const App: React.FC = () => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentTab, setCurrentTab] = useState<AdminTab>('overview');
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);

  // Global Admin Data Cache
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Authenticate on Mount
  useEffect(() => {
    const token = adminApi.getToken();
    if (!token) {
      setCheckingAuth(false);
      return;
    }

    adminApi
      .getMe()
      .then((user) => setAdmin(user))
      .catch(() => adminApi.logout())
      .finally(() => setCheckingAuth(false));
  }, []);

  // Fetch Core Admin Telemetry
  const refreshData = useCallback(async () => {
    if (!admin) return;
    setLoadingData(true);
    try {
      const [s, d, w] = await Promise.all([
        adminApi.getStats(),
        adminApi.getDeposits(),
        adminApi.getWithdrawals(),
      ]);
      setStats(s);
      setDeposits(d);
      setWithdrawals(w);
    } catch (err) {
      console.error('Error fetching admin telemetry:', err);
    } finally {
      setLoadingData(false);
    }
  }, [admin]);

  useEffect(() => {
    if (admin) {
      refreshData();

      // Connect to WebSocket for live event triggers
      const socket = io('/', { transports: ['websocket'] });

      socket.on('admin_new_deposit', () => {
        refreshData();
      });

      socket.on('admin_new_withdrawal', () => {
        refreshData();
      });

      // Periodic 15s poll
      const interval = setInterval(refreshData, 15000);

      return () => {
        socket.disconnect();
        clearInterval(interval);
      };
    }
  }, [admin, refreshData]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!admin) {
    return <AdminLogin onSuccess={(user) => setAdmin(user)} />;
  }

  const pendingWithdrawalsCount = withdrawals.filter((w) => w.status === 'PENDING').length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AdminNavbar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        admin={admin}
        pendingCount={pendingWithdrawalsCount}
        openFeedbacksCount={stats?.openFeedbacksCount}
        onLogout={() => {
          adminApi.logout();
          setAdmin(null);
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === 'overview' && (
          <OverviewView stats={stats} loading={loadingData} onRefresh={refreshData} />
        )}
        {currentTab === 'users' && (
          <UsersView onSelectUser={(userId) => setSelectedProfileUserId(userId)} />
        )}
        {currentTab === 'deposits' && (
          <DepositsView
            deposits={deposits}
            loading={loadingData}
            onRefresh={refreshData}
            onSelectUser={(userId) => setSelectedProfileUserId(userId)}
          />
        )}
        {currentTab === 'withdrawals' && (
          <WithdrawalsView
            withdrawals={withdrawals}
            loading={loadingData}
            onRefresh={refreshData}
            onSelectUser={(userId) => setSelectedProfileUserId(userId)}
          />
        )}
        {currentTab === 'rooms' && <RoomsView />}
        {currentTab === 'feedback' && <FeedbackView />}
        {currentTab === 'settings' && <SettingsView />}
      </main>

      {/* Global User Profile Modal */}
      {selectedProfileUserId && (
        <UserProfileModal
          userId={selectedProfileUserId}
          onClose={() => setSelectedProfileUserId(null)}
          onUserUpdated={refreshData}
        />
      )}
    </div>
  );
};

