import React, { useEffect, useState, useCallback } from 'react';
import { userApi, UserProfile, RoomItem, NotificationItem } from './services/api';
import { AuthModal } from './components/AuthModal';
import { UserNavbar, UserTab } from './components/UserNavbar';
import { NotificationDrawer } from './components/NotificationDrawer';
import { LobbyView } from './views/LobbyView';
import { ActiveRoomView } from './views/ActiveRoomView';
import { WalletView } from './views/WalletView';
import { SupportFeedbackView } from './views/SupportFeedbackView';
import { Loader2 } from 'lucide-react';
import { connectSocket } from './services/socket';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentTab, setCurrentTab] = useState<UserTab>('lobby');

  const [balance, setBalance] = useState(0.0);
  const [lockedBalance, setLockedBalance] = useState(0.0);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Authenticate on Mount
  useEffect(() => {
    const token = userApi.getToken();
    if (!token) {
      setCheckingAuth(false);
      return;
    }

    userApi
      .getMe()
      .then((u) => {
        setUser(u);
        if (u.wallet) {
          setBalance(u.wallet.balance);
          setLockedBalance(u.wallet.lockedBalance || 0);
        }
      })
      .catch(() => userApi.logout())
      .finally(() => setCheckingAuth(false));
  }, []);

  // Fetch Wallet Balance
  const refreshBalance = useCallback(async () => {
    if (!user) return;
    try {
      const w = await userApi.getWallet(user.id);
      if (w) {
        setBalance(w.balance);
        setLockedBalance(w.lockedBalance || 0);
      }
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  // Fetch Rooms
  const refreshRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const data = await userApi.getRooms();
      setRooms(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  // Fetch Notifications
  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingNotifications(true);
      const res = await userApi.getMyNotifications();
      setNotifications(res.notifications);
      setUnreadNotificationsCount(res.unreadCount);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  }, [user]);

  const handleMarkAsRead = async (id: string) => {
    try {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadNotificationsCount((c) => Math.max(0, c - 1));
      await userApi.markNotificationAsRead(id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadNotificationsCount(0);
      await userApi.markAllNotificationsAsRead();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      const target = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (target && !target.isRead) {
        setUnreadNotificationsCount((c) => Math.max(0, c - 1));
      }
      await userApi.deleteNotification(id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAllNotifications = async () => {
    try {
      setNotifications([]);
      setUnreadNotificationsCount(0);
      await userApi.clearAllNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Manual refresh for all telemetry (Balance + Rooms + Notifications)
  const handleRefreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshBalance(), refreshRooms(), loadNotifications()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshBalance, refreshRooms, loadNotifications]);

  // Connect to Sockets & Initial Load (Auto-refresh once on open)
  useEffect(() => {
    if (user) {
      refreshBalance();
      refreshRooms();
      loadNotifications();

      const socket = connectSocket();

      // Join private user channel for wallet events
      socket.on('connect', () => socket.emit('join_user_channel', user.id));

      socket.on('wallet_updated', () => refreshBalance());
      socket.on('balance_updated', (data: { balance: number; lockedBalance?: number }) => {
        setBalance(data.balance);
        if (typeof data.lockedBalance === 'number') {
          setLockedBalance(data.lockedBalance);
        }
      });

      socket.on('deposit_approved', (data: { balance: number }) => {
        setBalance(data.balance);
      });

      socket.on('withdrawal_completed', () => {
        refreshBalance();
      });

      socket.on('withdrawal_rejected', () => {
        refreshBalance();
      });

      socket.on('new_notification', (newNotif: NotificationItem) => {
        setNotifications((prev) => [newNotif, ...prev]);
        setUnreadNotificationsCount((c) => c + 1);
      });

      socket.on('notification_unread_count', (data: { unreadCount: number }) => {
        if (typeof data?.unreadCount === 'number') {
          setUnreadNotificationsCount(data.unreadCount);
        }
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [user, refreshBalance, refreshRooms, loadNotifications]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <AuthModal
        onSuccess={(u) => {
          setUser(u);
          if (u.wallet) setBalance(u.wallet.balance);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <UserNavbar
        user={user}
        balance={balance}
        currentTab={currentTab}
        onTabChange={(t) => {
          setActiveRoomId(null);
          setCurrentTab(t);
        }}
        onLogout={() => {
          userApi.logout();
          setUser(null);
          setNotifications([]);
          setUnreadNotificationsCount(0);
          setNotificationsOpen(false);
        }}
        onRefresh={handleRefreshAll}
        isRefreshing={isRefreshing || loadingRooms}
        onOpenNotifications={() => setNotificationsOpen(true)}
        unreadNotificationsCount={unreadNotificationsCount}
      />

      <NotificationDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        unreadCount={unreadNotificationsCount}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        onDelete={handleDeleteNotification}
        onClearAll={handleClearAllNotifications}
        loading={loadingNotifications}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeRoomId ? (
          <ActiveRoomView
            roomId={activeRoomId}
            user={user}
            onBack={() => {
              setActiveRoomId(null);
              handleRefreshAll();
            }}
            onRefreshBalance={refreshBalance}
          />
        ) : (
          <>
            {currentTab === 'lobby' && (
              <LobbyView
                rooms={rooms}
                user={user}
                balance={balance}
                loading={loadingRooms || isRefreshing}
                onRefresh={handleRefreshAll}
                onSelectRoom={(id) => setActiveRoomId(id)}
              />
            )}
            {currentTab === 'sports' && (
              <LobbyView
                rooms={rooms}
                user={user}
                balance={balance}
                loading={loadingRooms || isRefreshing}
                onRefresh={handleRefreshAll}
                onSelectRoom={(id) => setActiveRoomId(id)}
                defaultFilter="SPORTS_MATCH"
              />
            )}
            {currentTab === 'wallet' && (
              <WalletView
                user={user}
                balance={balance}
                lockedBalance={lockedBalance}
                onRefreshBalance={refreshBalance}
              />
            )}
            {currentTab === 'support' && (
              <SupportFeedbackView user={user} />
            )}
          </>
        )}
      </main>
    </div>
  );
};
