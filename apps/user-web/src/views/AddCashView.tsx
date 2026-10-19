import React, { useState, useEffect, useCallback, useRef } from 'react';
import { userApi, UserProfile, DepositResponse, DepositItem } from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { Socket } from 'socket.io-client';
import { connectSocket } from '../services/socket';
import {
  QrCode,
  Copy,
  Check,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  RotateCcw,
  Receipt,
  Send,
  Zap,
} from 'lucide-react';

interface AddCashViewProps {
  user: UserProfile;
  onPaymentSuccess: () => void;
}

// Play pleasant web audio chime on payment approval
const playSuccessChime = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (_) {}
};

export const AddCashView: React.FC<AddCashViewProps> = ({ user, onPaymentSuccess }) => {
  const [selectedBase, setSelectedBase] = useState('100');
  const [deposit, setDeposit] = useState<DepositResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copy states
  const [copiedAmount, setCopiedAmount] = useState(false);

  // Approval state
  const [isApproved, setIsApproved] = useState(false);
  const [approvedDetails, setApprovedDetails] = useState<{ amount: number; utr?: string } | null>(null);

  // Countdown timer state
  const [timeLeft, setTimeLeft] = useState<number>(600);
  const [isExpired, setIsExpired] = useState(false);

  // User "I Have Paid" 1-minute verification countdown
  const [hasTappedPaid, setHasTappedPaid] = useState(false);
  const [paidCountdown, setPaidCountdown] = useState(60);

  // Fallback UTR Claim state
  const [showUtrModal, setShowUtrModal] = useState(false);
  const [manualUtr, setManualUtr] = useState('');
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [utrSuccessMsg, setUtrSuccessMsg] = useState<string | null>(null);
  const [utrErrorMsg, setUtrErrorMsg] = useState<string | null>(null);
  // True once user submits a UTR that isn't instantly approved — keeps the live
  // "still verifying" indicator visible in the main screen after the modal closes
  const [utrSubmitted, setUtrSubmitted] = useState(false);

  // Deposit history list
  const [history, setHistory] = useState<DepositItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const presets = ['50', '100', '200', '500', '1000'];

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const items = await userApi.getMyDeposits();
      setHistory(items);
    } catch (_) {
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Handle successful approval trigger
  const handleApprovalSuccess = useCallback(
    (details: { amount: number; utr?: string }) => {
      setIsApproved(true);
      setApprovedDetails(details);
      playSuccessChime();
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
      });
      onPaymentSuccess();
      loadHistory();
    },
    [onPaymentSuccess, loadHistory]
  );

  // Check deposit status on demand
  const checkStatus = useCallback(async () => {
    if (!deposit || isApproved) return;
    try {
      const res = await userApi.getDepositStatus(deposit.depositId);
      if (res.deposit?.status === 'APPROVED') {
        handleApprovalSuccess({
          amount: res.deposit.baseAmount || deposit.baseAmount,
          utr: res.deposit.utr,
        });
      } else if (res.deposit?.status === 'EXPIRED') {
        setIsExpired(true);
      }
    } catch (_) {}
  }, [deposit, isApproved, handleApprovalSuccess]);

  // Generate new deposit QR
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDeposit(null);
    setIsApproved(false);
    setIsExpired(false);
    setApprovedDetails(null);
    setShowUtrModal(false);
    setManualUtr('');
    setUtrSuccessMsg(null);
    setUtrErrorMsg(null);
    setHasTappedPaid(false);
    setPaidCountdown(60);
    setUtrSubmitted(false);

    try {
      const res = await userApi.createDeposit(user.id, parseFloat(selectedBase));
      setDeposit(res);
      setTimeLeft(res.expiresInSeconds || 600);
    } catch (err: any) {
      setError(err.message || 'Failed to generate deposit request.');
    } finally {
      setLoading(false);
    }
  };

  // Direct WebSocket Connection for <100ms Instant Approval
  useEffect(() => {
    if (!deposit || isApproved) return;

    const socket = connectSocket();
    socketRef.current = socket;

    // Join deposit-specific channel AND personal user channel
    socket.on('connect', () => {
      socket.emit('join_deposit_channel', deposit.depositId);
    });

    socket.on('deposit_approved', (data: any) => {
      if (data?.depositId === deposit.depositId) {
        handleApprovalSuccess({
          amount: data.amount || deposit.baseAmount,
          utr: data.utr,
        });
      }
    });

    return () => {
      socket.emit('leave_deposit_channel', deposit.depositId);
      socket.disconnect();
    };
  }, [deposit, isApproved, user.id, handleApprovalSuccess]);

  // Countdown Timer
  useEffect(() => {
    if (!deposit || isApproved || isExpired) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [deposit, isApproved, isExpired]);

  // 1-Minute Post-Payment Verification Countdown
  useEffect(() => {
    if (!deposit || isApproved || isExpired || !hasTappedPaid || paidCountdown <= 0) return;

    const timer = setInterval(() => {
      setPaidCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [deposit, isApproved, isExpired, hasTappedPaid, paidCountdown]);

  // Fix #2 — Opens the UPI deep link and simultaneously starts the verification
  // countdown so users don't have to tap "I Have Paid" as a separate step.
  // Uses the Android intent:// scheme so UPI apps open reliably inside WebViews.
  const handleOpenUpiApp = () => {
    const upiLink = deposit?.upiDeepLink || deposit?.upiUri || '';
    if (!upiLink) return;
    // Auto-start the countdown right here — no separate "I Have Paid" tap needed
    if (!hasTappedPaid) {
      setHasTappedPaid(true);
      setPaidCountdown(60);
    }
    const isAndroid = /android/i.test(navigator.userAgent);
    if (isAndroid) {
      // intent:// opens the Android UPI app chooser reliably in Chrome and WebViews
      const intentUrl =
        upiLink.replace(/^upi:\/\//, 'intent://') +
        '#Intent;scheme=upi;action=android.intent.action.VIEW;end';
      window.location.href = intentUrl;
    } else {
      // iOS / desktop: upi:// is handled by the UPI app or browser
      window.location.href = upiLink;
    }
  };

  const handlePaidClicked = () => {
    setHasTappedPaid(true);
    setPaidCountdown(60);
    checkStatus();
  };

  // Fast Background Poller & Instant Window-Focus / Visibility-Change Resume
  useEffect(() => {
    if (!deposit || isApproved || isExpired) return;

    // 1. Regular 3s poll as fallback
    const interval = setInterval(checkStatus, 3000);

    // 2. INSTANT CHECK the exact millisecond user returns from GPay/PhonePe to browser.
    // Also auto-start the countdown so they don't need to tap "I Have Paid" manually.
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        // Fix #1: auto-trigger "I Have Paid" state the moment they switch back
        if (!hasTappedPaid) {
          setHasTappedPaid(true);
          setPaidCountdown(60);
        }
        checkStatus();
      }
    };

    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    };
  }, [deposit, isApproved, isExpired, checkStatus, hasTappedPaid]);

  // User Manual UTR Claim Handler
  const handleClaimUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deposit || !manualUtr.trim()) return;

    setSubmittingUtr(true);
    setUtrErrorMsg(null);
    setUtrSuccessMsg(null);

    try {
      const res = await userApi.claimDepositUtr(deposit.depositId, manualUtr.trim());
      if (res.instantApproval) {
        handleApprovalSuccess({
          amount: deposit.baseAmount,
          utr: manualUtr.trim(),
        });
      } else {
        setUtrSubmitted(true);
        setUtrSuccessMsg(res.message || 'UTR recorded! Verifying against bank records...');
        // Auto-close the modal after 2s so user sees the live verifying indicator
        setTimeout(() => setShowUtrModal(false), 2000);
      }
    } catch (err: any) {
      setUtrErrorMsg(err.message || 'Failed to submit UTR. Please recheck your reference number.');
    } finally {
      setSubmittingUtr(false);
    }
  };

  const handleCopyAmount = () => {
    if (!deposit) return;
    navigator.clipboard.writeText(deposit.totalAmount.toFixed(2));
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Add Cash via UPI</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Zero payment gateway deductions. Instant auto-credit with real-time bank sync.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* State 1: Payment Approved Celebration View */}
      {isApproved ? (
        <div className="bg-white border border-emerald-300 rounded-xl p-8 text-center space-y-4 shadow-sm animate-fade-in">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600 border border-emerald-200 shadow-xs">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Payment Verified & Credited!</h3>
            <p className="text-xs text-slate-500 mt-1">
              ₹{(approvedDetails?.amount || deposit?.baseAmount || 0).toFixed(2)} has been added to your balance.
            </p>
            {approvedDetails?.utr && (
              <span className="inline-block mt-2 font-mono text-xs px-2.5 py-1 bg-slate-100 text-slate-700 rounded border border-slate-200">
                Bank UTR: {approvedDetails.utr}
              </span>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                setDeposit(null);
                setIsApproved(false);
                setHasTappedPaid(false);
                setPaidCountdown(60);
              }}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
            >
              Add More Cash
            </button>
          </div>
        </div>
      ) : deposit ? (
        /* State 2: Active Deposit QR & Intent Screen */
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5 shadow-xs text-center">
          {/* Header & Live Timer Pill */}
          <div className="flex items-center justify-between">
            <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded text-xs font-semibold">
              Step 2 of 2: Scan & Pay
            </span>

            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold mono-num border ${
                isExpired
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : timeLeft < 120
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{isExpired ? 'Expired' : formatTimer(timeLeft)}</span>
            </div>
          </div>

          {isExpired ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
              <h4 className="text-base font-bold text-red-900">Payment Request Expired</h4>
              <p className="text-xs text-red-700">
                This dynamic paise slot has expired. If you already transferred money from your bank, submit your UTR below and we will credit it immediately!
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setShowUtrModal(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition"
                >
                  I Already Paid (Submit UTR)
                </button>
                <button
                  onClick={() => setDeposit(null)}
                  className="px-4 py-2 bg-white border border-red-200 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 transition"
                >
                  Generate New QR
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="text-3xl font-extrabold mono-num text-slate-900">
                  ₹{deposit.totalAmount.toFixed(2)}
                </div>
                <p className="text-xs text-amber-700 font-semibold mt-1">
                  ⚠️ Pay exact amount with paise ({deposit.offsetPaise}p) for instant verification.
                </p>
              </div>

              {/* QR Code Canvas */}
              <div className="inline-block p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
                <QRCodeSVG value={deposit.upiDeepLink || deposit.upiUri || ''} size={190} level="M" />
              </div>

              {/* Direct Pay Link for Mobile — Fix #2: starts countdown + Android intent:// */}
              <div>
                <button
                  type="button"
                  onClick={handleOpenUpiApp}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition shadow-xs"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in UPI App (GPay / PhonePe / Paytm)</span>
                </button>
              </div>

              {/* Payable Amount & Guidance Details */}
              <div className="space-y-2 text-left pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Exact Payable Amount</span>
                    <span className="font-mono font-bold text-emerald-700">₹{deposit.totalAmount.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={handleCopyAmount}
                    className="p-1.5 text-slate-500 hover:text-emerald-600 transition"
                    title="Copy Amount"
                  >
                    {copiedAmount ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Tap the button above to pay directly via your UPI app, or scan the QR code. Your balance is auto-credited once payment is received.</span>
                </div>
              </div>

              {/* Post-Payment 1-Minute Verification Workflow */}
              {!hasTappedPaid ? (
                /* Stage A: User has not yet tapped "I Have Paid" */
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handlePaidClicked}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>I Have Paid via UPI</span>
                  </button>
                  <p className="text-[11px] text-slate-500 text-center">
                    Tap above after completing payment in your UPI app. 1-minute automated bank verification will begin.
                  </p>
                </div>
              ) : paidCountdown > 0 ? (
                /* Stage B: User tapped "I Have Paid", 1-minute countdown actively verifying */
                <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2.5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                    <span className="text-xs font-bold text-emerald-900">
                      Verifying with bank... ({paidCountdown}s remaining)
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    Listening for automated bank confirmation. Your wallet balance will update instantaneously the moment the notification arrives.
                  </p>
                  <div className="w-full bg-emerald-200/60 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full transition-all duration-1000 ease-linear rounded-full"
                      style={{ width: `${((60 - paidCountdown) / 60) * 100}%` }}
                    />
                  </div>
                </div>
              ) : utrSubmitted ? (
                /* Stage D — Fix #3: UTR submitted, background auto-verify still running */
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2.5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    <span className="text-xs font-bold text-blue-900">
                      UTR submitted — matching with bank records…
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-800">
                    Your UTR is recorded. We're checking incoming bank payments. Your wallet will credit automatically once matched, or an admin will verify and approve it shortly.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setShowUtrModal(true); setUtrSuccessMsg(null); }}
                    className="text-[11px] text-blue-600 underline underline-offset-2"
                  >
                    Wrong UTR? Tap to correct it
                  </button>
                </div>
              ) : (
                /* Stage C: 1 Minute Elapsed Without Notification -> Option appears to enter UTR */
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-left space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">
                        Bank confirmation taking longer than 1 minute
                      </h4>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        If money was debited from your UPI app, enter your 12-digit bank UTR / Reference No. to verify manually.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowUtrModal(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Paid? Enter 12-Digit UTR</span>
                  </button>
                </div>
              )}

              <div>
                <button
                  onClick={() => {
                    setDeposit(null);
                    setHasTappedPaid(false);
                    setPaidCountdown(60);
                    setUtrSubmitted(false);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600 hover:underline cursor-pointer"
                >
                  Cancel & Change Amount
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* State 3: Deposit Amount Selection */
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5 shadow-xs">
          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Select Deposit Amount
              </label>
              <div className="grid grid-cols-5 gap-2 mb-3">
                {presets.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSelectedBase(val)}
                    className={`py-2 rounded-lg text-xs font-bold mono-num border transition ${
                      selectedBase === val
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    ₹{val}
                  </button>
                ))}
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-bold">
                  ₹
                </div>
                <input
                  type="number"
                  required
                  min={10}
                  max={50000}
                  value={selectedBase}
                  onChange={(e) => setSelectedBase(e.target.value)}
                  placeholder="Enter custom amount"
                  className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm mono-num font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-600 mt-0.5" />
              <span>
                100% direct bank deposit. Zero commission deducted. Your deposit is automatically verified within seconds.
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-xs"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <QrCode className="w-4 h-4" />
                  <span>Generate Payment QR</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Manual UTR Submission Modal */}
      {showUtrModal && deposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Verify Payment with UTR</h3>
              <button
                onClick={() => setShowUtrModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Enter the 12-digit UPI Reference Number / UTR shown on your Google Pay, PhonePe, or Paytm receipt.
            </p>

            {utrErrorMsg && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{utrErrorMsg}</span>
              </div>
            )}

            {utrSuccessMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                <span>{utrSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleClaimUtr} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  12-Digit Bank UTR / UPI Ref ID
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={18}
                  value={manualUtr}
                  onChange={(e) => setManualUtr(e.target.value.trim())}
                  placeholder="e.g. 429384729182"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mono-num font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 tracking-wider"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUtrModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={submittingUtr || manualUtr.length < 8}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingUtr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Verify UTR</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Deposit Ledger & Passbook Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Your Deposit History</h3>
            <p className="text-[11px] text-slate-500">Track all your past top-ups, receipts, and bank UTRs</p>
          </div>
          <button
            type="button"
            onClick={loadHistory}
            className="p-1.5 text-slate-400 hover:text-slate-700 transition rounded hover:bg-slate-50"
            title="Refresh history"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            {loadingHistory ? 'Loading history...' : 'No deposits recorded yet.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((d) => (
              <div key={d.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="mono-num font-bold text-sm text-slate-900">
                      ₹{d.baseAmount.toFixed(2)}
                    </span>
                    {d.utr && (
                      <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        UTR: {d.utr}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {new Date(d.createdAt).toLocaleString()}
                  </span>
                </div>

                <div>
                  {d.status === 'APPROVED' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Credited
                    </span>
                  ) : d.status === 'CLAIMED' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      <Clock className="w-3 h-3 text-blue-600" />
                      UTR Under Review
                    </span>
                  ) : d.status === 'PENDING' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Awaiting Payment
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500">
                      {d.status}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
