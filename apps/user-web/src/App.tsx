import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { userApi, UserProfile, RoomItem, NotificationItem } from './services/api';
import { AuthModal } from './components/AuthModal';
import { UserNavbar, UserTab } from './components/UserNavbar';
import { NotificationDrawer } from './components/NotificationDrawer';
import { ProfileModal } from './components/ProfileModal';
import { InvitationPreviewModal } from './components/InvitationPreviewModal';
import { LobbyView } from './views/LobbyView';
import { ActiveRoomView } from './views/ActiveRoomView';
import { PersonalProfileView, TransactionHistoryView } from './views/PersonalProfileView';
import { WalletView } from './views/WalletView';
import { SupportFeedbackView } from './views/SupportFeedbackView';
import { MobileBottomNav } from './components/MobileBottomNav';
import { Loader2, Bell, X } from 'lucide-react';
import { connectSocket } from './services/socket';
import { playNotificationSound } from './utils/audio';

const TradingView = lazy(() => import('./views/trading/TradingView').then(module => ({ default: module.TradingView })));

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentTab, setCurrentTab] = useState<UserTab>('lobby');
  const [walletEntry, setWalletEntry] = useState<'overview' | 'deposit' | 'withdraw'>('overview');
  useEffect(() => {
    if (currentTab !== 'wallet') setWalletEntry('overview');
  }, [currentTab]);

  const [balance, setBalance] = useState(0.0);
  const [lockedBalance, setLockedBalance] = useState(0.0);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [invitationToken, setInvitationToken] = useState<string | null>(() => {
    const match = window.location.pathname.match(/\/join\/([^/?#]+)/);
    if (match) return match[1];
    const urlParams = new URLSearchParams(window.location.search);
    const searchToken = urlParams.get('token') || urlParams.get('invite');
    if (searchToken) return searchToken;
    return sessionStorage.getItem('pending_invitation_token');
  });

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

      socket.on('lobby_rooms_updated', () => { void refreshRooms(); });

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
        playNotificationSound();
        refreshBalance();
        setToastNotification(newNotif);
        setTimeout(() => setToastNotification((curr) => curr?.id === newNotif.id ? null : curr), 6000);
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
      <>
        <AuthModal
          onSuccess={(u) => {
            setUser(u);
            if (u.wallet) setBalance(u.wallet.balance);
            setShowAuthModal(false);
            const pending = sessionStorage.getItem('pending_invitation_token');
            if (pending) setInvitationToken(pending);
          }}
        />
        {invitationToken && !showAuthModal && (
          <InvitationPreviewModal
            token={invitationToken}
            currentUser={null}
            onClose={() => {
              setInvitationToken(null);
              sessionStorage.removeItem('pending_invitation_token');
              if (window.location.pathname.startsWith('/join/')) {
                window.history.replaceState({}, '', '/');
              }
            }}
            onRequireAuth={() => setShowAuthModal(true)}
            onJoined={() => {}}
          />
        )}
      </>
    );
  }

  return (
    <div className={`min-h-screen text-slate-900 flex flex-col ${currentTab === 'trading' ? 'bg-[#0d1117]' : 'bg-slate-50'}`}>
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
        onOpenProfile={() => { setActiveRoomId(null); setCurrentTab('profile'); void refreshBalance(); }}
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

      <main className={currentTab === 'trading' ? 'flex-1 w-full pb-20 sm:pb-0' : 'flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 sm:pb-8'}>
        {/* Sticky Active Game Resumption Bar */}
        {currentTab !== 'trading' && !activeRoomId && (() => {
          const activeUserRoom = rooms.find(
            (r) => ['WAITING', 'PLAYING'].includes(r.status) && r.players?.some((p) => p.userId === user.id)
          );
          if (!activeUserRoom) return null;

          return (
            <div
              onClick={() => setActiveRoomId(activeUserRoom.id)}
              className="mb-4 p-3.5 bg-slate-900 text-white rounded-xl border border-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-800 transition shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold">Active Match in Progress (#{activeUserRoom.roomCode})</span>
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                  {activeUserRoom.gameType === 'TEEN_PATTI' ? 'Teen Patti' : activeUserRoom.gameType === 'SPORTS_MATCH' ? 'Sports Pool' : 'Dice Guess'} · Boot ₹{activeUserRoom.entryFee}
                </span>
              </div>
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                <span>Return to Table</span>
                <span>→</span>
              </div>
            </div>
          );
        })()}

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
                onOpenInvitationModal={(token) => setInvitationToken(token)}
              />
            )}
            {currentTab === 'profile' && <PersonalProfileView user={user} balance={balance} lockedBalance={lockedBalance}
              version={`${user.displayName}:${user.avatar}`} onBack={() => setCurrentTab('lobby')} onEdit={() => setProfileOpen(true)}
              onDeposit={() => {setWalletEntry('deposit'); setCurrentTab('wallet');}}
              onWithdraw={() => {setWalletEntry('withdraw'); setCurrentTab('wallet');}}
              onHistory={() => setCurrentTab('history')} onNotifications={() => setNotificationsOpen(true)}
              onSupport={() => setCurrentTab('support')} onLogout={() => {userApi.logout(); setUser(null); setCurrentTab('lobby'); setNotifications([]); setNotificationsOpen(false);}} />}
            {currentTab === 'history' && <TransactionHistoryView onBack={() => setCurrentTab('profile')}/>}
            {currentTab === 'sports' && (
              <LobbyView
                rooms={rooms}
                user={user}
                balance={balance}
                loading={loadingRooms || isRefreshing}
                onRefresh={handleRefreshAll}
                onSelectRoom={(id) => setActiveRoomId(id)}
                defaultFilter="SPORTS_MATCH"
                onOpenInvitationModal={(token) => setInvitationToken(token)}
              />
            )}
            {currentTab === 'wallet' && (
              <div><button className="mono-secondary mb-5" onClick={() => setCurrentTab('profile')}>← Back to profile</button><WalletView
                key={walletEntry}
                initialSubView={walletEntry}
                user={user}
                balance={balance}
                lockedBalance={lockedBalance}
                onRefreshBalance={refreshBalance}
              /></div>
            )}
            {currentTab === 'trading' && (
              <Suspense fallback={<p>Loading CricTrade…</p>}>
                <TradingView
                  userId={user.id}
                  onBack={() => setCurrentTab('lobby')}
                  onWithdraw={() => {
                    setWalletEntry('withdraw');
                    setCurrentTab('wallet');
                    void refreshBalance();
                  }}
                />
              </Suspense>
            )}
            {currentTab === 'support' && (
              <SupportFeedbackView user={user} />
            )}
          </>
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <MobileBottomNav
        currentTab={currentTab}
        onTabChange={(t) => {
          setActiveRoomId(null);
          setCurrentTab(t);
        }}
        balance={balance}
      />

      {/* User Profile Modal */}
      <ProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        onProfileUpdated={(updated) => {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  displayName: updated.displayName,
                  avatar: updated.avatar,
                }
              : null
          );
        }}
      />

      {/* Invitation Preview Modal */}
      <InvitationPreviewModal
        token={invitationToken}
        currentUser={user}
        onClose={() => {
          setInvitationToken(null);
          sessionStorage.removeItem('pending_invitation_token');
          if (window.location.pathname.startsWith('/join/')) {
            window.history.replaceState({}, '', '/');
          }
        }}
        onRequireAuth={() => setShowAuthModal(true)}
        onJoined={(roomId) => {
          setInvitationToken(null);
          sessionStorage.removeItem('pending_invitation_token');
          if (window.location.pathname.startsWith('/join/')) {
            window.history.replaceState({}, '', '/');
          }
          setActiveRoomId(roomId);
          refreshBalance();
          refreshRooms();
        }}
      />

      {toastNotification && (
        <div
          onClick={() => {
            setNotificationsOpen(true);
            setToastNotification(null);
          }}
          className="fixed top-18 right-4 z-50 max-w-sm w-full bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-700 cursor-pointer animate-in fade-in slide-in-from-top-4 duration-300 flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-white truncate">{toastNotification.title}</h4>
            <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">{toastNotification.message}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setToastNotification(null);
            }}
            className="text-slate-400 hover:text-white shrink-0 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
