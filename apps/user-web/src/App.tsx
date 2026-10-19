import React, { useEffect, useState, useCallback } from 'react';
import { userApi, UserProfile, RoomItem } from './services/api';
import { AuthModal } from './components/AuthModal';
import { UserNavbar, UserTab } from './components/UserNavbar';
import { LobbyView } from './views/LobbyView';
import { ActiveRoomView } from './views/ActiveRoomView';
import { AddCashView } from './views/AddCashView';
import { WithdrawView } from './views/WithdrawView';
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

  // Connect to Sockets & Periodic Refresh
  useEffect(() => {
    if (user) {
      refreshBalance();
      refreshRooms();

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

      const interval = setInterval(refreshRooms, 5000);

      return () => {
        socket.disconnect();
        clearInterval(interval);
      };
    }
  }, [user, refreshBalance, refreshRooms]);

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
        }}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeRoomId ? (
          <ActiveRoomView
            roomId={activeRoomId}
            user={user}
            onBack={() => {
              setActiveRoomId(null);
              refreshRooms();
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
                loading={loadingRooms}
                onRefresh={refreshRooms}
                onSelectRoom={(id) => setActiveRoomId(id)}
              />
            )}
            {currentTab === 'deposit' && (
              <AddCashView
                user={user}
                onPaymentSuccess={() => {
                  refreshBalance();
                  setCurrentTab('lobby');
                }}
              />
            )}
            {currentTab === 'withdraw' && (
              <WithdrawView
                user={user}
                balance={balance}
                lockedBalance={lockedBalance}
                onWithdrawSuccess={refreshBalance}
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
