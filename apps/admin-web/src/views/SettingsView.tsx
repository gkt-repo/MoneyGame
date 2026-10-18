import React, { useState, useEffect } from 'react';
import { adminApi } from '../services/api';
import {
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  Phone,
  MessageCircle,
  Clock,
  QrCode,
  ShieldCheck,
  Send,
  Eye,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  // Payment / UPI State
  const [upiId, setUpiId] = useState('8340271508@ptsbi');
  const [upiName, setUpiName] = useState('MoneyGame');
  const [savingUpi, setSavingUpi] = useState(false);
  const [upiStatus, setUpiStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Support & Contact Channels State
  const [supportEmail, setSupportEmail] = useState('support@moneygame.com');
  const [supportWhatsapp, setSupportWhatsapp] = useState('+91 98765 43210');
  const [supportTelegram, setSupportTelegram] = useState('@MoneyGameSupport');
  const [supportHours, setSupportHours] = useState('24/7 Live Support');
  const [savingSupport, setSavingSupport] = useState(false);
  const [supportStatus, setSupportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [loadingInitial, setLoadingInitial] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.getStats(),
      adminApi.getSupportSettings().catch(() => null),
    ])
      .then(([stats, support]) => {
        if (stats.adminUpiId) setUpiId(stats.adminUpiId);
        if (stats.adminUpiName) setUpiName(stats.adminUpiName);
        if (stats.supportEmail) setSupportEmail(stats.supportEmail);
        if (stats.supportWhatsapp) setSupportWhatsapp(stats.supportWhatsapp);
        if (stats.supportTelegram) setSupportTelegram(stats.supportTelegram);
        if (stats.supportHours) setSupportHours(stats.supportHours);

        if (support) {
          if (support.email) setSupportEmail(support.email);
          if (support.whatsapp) setSupportWhatsapp(support.whatsapp);
          if (support.telegram) setSupportTelegram(support.telegram);
          if (support.hours) setSupportHours(support.hours);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingInitial(false));
  }, []);

  const handleSaveUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUpi(true);
    setUpiStatus(null);

    try {
      await adminApi.updateUpiSettings(upiId.trim(), upiName.trim());
      setUpiStatus({ type: 'success', message: 'Receiving UPI settings updated successfully.' });
      setTimeout(() => setUpiStatus(null), 4000);
    } catch (err: any) {
      setUpiStatus({ type: 'error', message: err.message || 'Failed to update UPI settings.' });
    } finally {
      setSavingUpi(false);
    }
  };

  const handleSaveSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSupport(true);
    setSupportStatus(null);

    try {
      await adminApi.updateSupportSettings({
        email: supportEmail.trim(),
        whatsapp: supportWhatsapp.trim(),
        telegram: supportTelegram.trim(),
        hours: supportHours.trim(),
      });
      setSupportStatus({ type: 'success', message: 'Support contact channels updated successfully.' });
      setTimeout(() => setSupportStatus(null), 4000);
    } catch (err: any) {
      setSupportStatus({ type: 'error', message: err.message || 'Failed to update support channels.' });
    } finally {
      setSavingSupport(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-3" />
        <p className="text-sm">Loading system configuration...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">System & Support Configuration</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Manage dynamic deposit receiver endpoints, official player support emails, WhatsApp helplines, and Telegram channels.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Configuration Forms */}
        <div className="lg:col-span-2 space-y-8">
          {/* Section 1: Support & Contact Channels */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-zinc-100">Player Support & Contact Channels</h2>
                  <p className="text-xs text-zinc-400">
                    Controls the contact info, WhatsApp number, and Telegram channels visible to players on the user web page.
                  </p>
                </div>
              </div>
            </div>

            {supportStatus && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  supportStatus.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                }`}
              >
                {supportStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{supportStatus.message}</span>
              </div>
            )}

            <form onSubmit={handleSaveSupport} className="space-y-4">
              {/* Support Email */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Support Email Address</span>
                </label>
                <input
                  type="email"
                  required
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="e.g. support@moneygame.com"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-emerald-500 transition"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Primary email where users can request escalations or report issues.
                </p>
              </div>

              {/* WhatsApp Support */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-zinc-500" />
                  <span>WhatsApp Support Helpline / Link</span>
                </label>
                <input
                  type="text"
                  required
                  value={supportWhatsapp}
                  onChange={(e) => setSupportWhatsapp(e.target.value)}
                  placeholder="e.g. +91 98765 43210 or https://wa.me/919876543210"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-emerald-500 transition"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  WhatsApp phone number or direct wa.me chat link for fast player assistance.
                </p>
              </div>

              {/* Telegram Support */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Telegram Support Channel / Handle</span>
                </label>
                <input
                  type="text"
                  required
                  value={supportTelegram}
                  onChange={(e) => setSupportTelegram(e.target.value)}
                  placeholder="e.g. @MoneyGameSupport or https://t.me/MoneyGameSupport"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-emerald-500 transition"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Official Telegram channel or admin bot handle.
                </p>
              </div>

              {/* Support Operating Hours */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Support Operating Hours Text</span>
                </label>
                <input
                  type="text"
                  required
                  value={supportHours}
                  onChange={(e) => setSupportHours(e.target.value)}
                  placeholder="e.g. 24/7 Live Support or 9:00 AM - 11:00 PM IST"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-emerald-500 transition"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Displayed badge describing support availability to players.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingSupport}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition flex items-center gap-2 shadow-xs"
                >
                  {savingSupport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Support Settings</span>
                </button>
              </div>
            </form>
          </div>

          {/* Section 2: Payment & UPI Settings */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-zinc-100">Deposit & UPI Receiver Settings</h2>
                  <p className="text-xs text-zinc-400">
                    Controls dynamic UPI receiver endpoints for deposit requests.
                  </p>
                </div>
              </div>
            </div>

            {upiStatus && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  upiStatus.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                }`}
              >
                {upiStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{upiStatus.message}</span>
              </div>
            )}

            <form onSubmit={handleSaveUpi} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Receiving UPI VPA Address
                </label>
                <input
                  type="text"
                  required
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. business@bank"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm mono-num focus:outline-none focus:border-emerald-500 transition"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Dynamic QR codes and intent links route incoming payments to this UPI ID.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Merchant / Business Name
                </label>
                <input
                  type="text"
                  required
                  value={upiName}
                  onChange={(e) => setUpiName(e.target.value)}
                  placeholder="e.g. MoneyGame Admin"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-emerald-500 transition"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Displayed on banking apps (GPay, PhonePe, Paytm) during checkout.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingUpi}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition flex items-center gap-2 shadow-xs"
                >
                  {savingUpi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save UPI Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Col: Live Preview on User Web */}
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4 sticky top-24">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>User Web Preview</span>
            </div>
            <p className="text-xs text-zinc-500">
              This preview shows how your support details appear to players inside the "Support & Contact" tab:
            </p>

            <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-800 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>Direct Contact</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg space-y-0.5">
                  <span className="text-[10px] text-slate-500 block">Support Email</span>
                  <span className="font-semibold text-slate-800 break-all">{supportEmail || 'support@moneygame.com'}</span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg space-y-0.5">
                  <span className="text-[10px] text-slate-500 block">WhatsApp Helpline</span>
                  <span className="font-semibold text-slate-800 break-all">{supportWhatsapp || '+91 98765 43210'}</span>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg space-y-0.5">
                  <span className="text-[10px] text-slate-500 block">Telegram Channel</span>
                  <span className="font-semibold text-slate-800 break-all">{supportTelegram || '@MoneyGameSupport'}</span>
                </div>

                <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-1.5 text-[11px] text-emerald-800 font-medium">
                  <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{supportHours || '24/7 Live Support'}</span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3 text-[11px] text-zinc-400 space-y-1">
              <span className="font-bold text-zinc-300 block">Instant Updates:</span>
              <span>Changes take effect immediately across all active player sessions without requiring app reloads.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
