import React, { useState, useEffect } from 'react';
import { userApi, UserProfile, DepositResponse } from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
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
} from 'lucide-react';

interface AddCashViewProps {
  user: UserProfile;
  onPaymentSuccess: () => void;
}

export const AddCashView: React.FC<AddCashViewProps> = ({ user, onPaymentSuccess }) => {
  const [selectedBase, setSelectedBase] = useState('100');
  const [deposit, setDeposit] = useState<DepositResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copy states
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  // Polling for confirmation
  const [checking, setChecking] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  const presets = ['50', '100', '200', '500', '1000'];

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDeposit(null);
    setIsApproved(false);

    try {
      const res = await userApi.createDeposit(user.id, parseFloat(selectedBase));
      setDeposit(res);
    } catch (err: any) {
      setError(err.message || 'Failed to generate deposit request.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUpi = () => {
    if (!deposit) return;
    navigator.clipboard.writeText(deposit.receivingUpi);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleCopyAmount = () => {
    if (!deposit) return;
    navigator.clipboard.writeText(deposit.totalAmount.toFixed(2));
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  // Poll deposit status
  useEffect(() => {
    if (!deposit || isApproved) return;

    const interval = setInterval(async () => {
      try {
        setChecking(true);
        const res = await userApi.getDepositStatus(deposit.depositId);
        if (res.deposit?.status === 'APPROVED') {
          setIsApproved(true);
          onPaymentSuccess();
        }
      } catch (err) {
        // quiet poll
      } finally {
        setChecking(false);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [deposit, isApproved, onPaymentSuccess]);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Add Cash via UPI</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Zero payment gateway fees. Instant auto-credit using unique paise offset.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isApproved ? (
        <div className="bg-white border border-emerald-300 rounded-xl p-8 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600 border border-emerald-200">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Payment Verified & Credited!</h3>
          <p className="text-xs text-slate-500">
            ₹{deposit?.totalAmount.toFixed(2)} has been added to your balance.
          </p>
          <button
            onClick={() => setDeposit(null)}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition"
          >
            Add More Cash
          </button>
        </div>
      ) : deposit ? (
        /* Render Generated QR and Instructions */
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 shadow-xs text-center">
          <div>
            <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded text-xs font-semibold mb-2">
              Step 2 of 2: Scan & Pay Exact Amount
            </span>
            <div className="text-2xl font-bold mono-num text-slate-900">
              ₹{deposit.totalAmount.toFixed(2)}
            </div>
            <p className="text-xs text-amber-700 font-medium mt-1">
              ⚠️ Important: Please pay the exact amount including paise ({deposit.offsetPaise}p) for instant verification.
            </p>
          </div>

          {/* QR Code Canvas */}
          <div className="inline-block p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
            <QRCodeSVG value={deposit.upiDeepLink || deposit.upiUri || ''} size={190} level="M" />
          </div>

          {/* Direct Pay Link for Mobile */}
          <div>
            <a
              href={deposit.upiDeepLink || deposit.upiUri || '#'}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition shadow-xs"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open in UPI App (GPay / PhonePe / Paytm)</span>
            </a>
          </div>

          {/* Copyable Details */}
          <div className="space-y-2 text-left pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Receiving UPI ID</span>
                <span className="font-mono font-semibold text-slate-800">{deposit.receivingUpi}</span>
              </div>
              <button
                onClick={handleCopyUpi}
                className="p-1.5 text-slate-500 hover:text-emerald-600 transition"
                title="Copy UPI ID"
              >
                {copiedUpi ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Exact Payable Amount</span>
                <span className="font-mono font-bold text-slate-900">₹{deposit.totalAmount.toFixed(2)}</span>
              </div>
              <button
                onClick={handleCopyAmount}
                className="p-1.5 text-slate-500 hover:text-emerald-600 transition"
                title="Copy Amount"
              >
                {copiedAmount ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Live Polling Status Indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
            <span>Awaiting bank payment confirmation...</span>
          </div>

          <button
            onClick={() => setDeposit(null)}
            className="text-xs text-slate-500 hover:underline"
          >
            Cancel & Change Amount
          </button>
        </div>
      ) : (
        /* Amount Selection Form */
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
                Payments are deposited directly into our official merchant bank account with zero middleman deductions.
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
    </div>
  );
};
