import React, { useState, useEffect, useCallback } from 'react';
import { userApi, UserProfile, UserFeedbackItem, SupportContactInfo } from '../services/api';
import {
  MessageSquare,
  HelpCircle,
  Send,
  Mail,
  Phone,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageCircle,
} from 'lucide-react';

interface SupportFeedbackViewProps {
  user: UserProfile;
}

export const SupportFeedbackView: React.FC<SupportFeedbackViewProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'contact' | 'tickets' | 'faq'>('contact');

  // Contact info
  const [contactInfo, setContactInfo] = useState<SupportContactInfo | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Tickets
  const [tickets, setTickets] = useState<UserFeedbackItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Form submission
  const [category, setCategory] = useState('DEPOSIT');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [userContact, setUserContact] = useState(user.phone || user.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // FAQs open state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const fetchContact = useCallback(async () => {
    try {
      const info = await userApi.getContactInfo();
      setContactInfo(info);
    } catch (err) {
      console.error('Error fetching contact info:', err);
    }
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const data = await userApi.getMyFeedbacks();
      setTickets(data);
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    fetchContact();
    fetchTickets();
  }, [fetchContact, fetchTickets]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setSubmitError('Please provide both a subject and message.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      await userApi.submitFeedback({
        category,
        subject: subject.trim(),
        message: message.trim(),
        contactInfo: userContact.trim(),
      });
      setSubmitSuccess('Your ticket has been submitted successfully! The admin team will review it shortly.');
      setSubject('');
      setMessage('');
      fetchTickets();
      setActiveTab('tickets');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const faqs = [
    {
      q: 'How long does a deposit take to reflect in my wallet?',
      a: 'Deposits are automated! Once you pay the exact amount with the unique paise offset, your balance updates within seconds to 2 minutes. If a bank delay occurs, submit a ticket above with your 12-digit UTR number and admin will instantly verify and credit it.',
    },
    {
      q: 'How fast are withdrawal payouts?',
      a: 'Withdrawal requests are processed rapidly by our administration team directly to your provided UPI ID. Most payouts are completed within 5-15 minutes during operating hours.',
    },
    {
      q: 'What is the platform commission on game tables?',
      a: 'MoneyGame charges 0% or low platform commission on game pools. You can view full match roll outcomes and winner allocations transparently in real time.',
    },
    {
      q: 'Where do I find my transaction or UTR number?',
      a: 'After completing payment in Google Pay, PhonePe, Paytm, or BHIM, tap on the transaction details to find the 12-digit numeric "UPI Transaction ID" or "UTR".',
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* View Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Help & Support</h1>
                <p className="text-xs text-slate-500">Contact admin, report an issue, or submit platform feedback</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('contact')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'contact'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Contact / Submit
            </button>
            <button
              onClick={() => setActiveTab('tickets')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'tickets'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>My Tickets</span>
              {tickets.length > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeTab === 'tickets'
                      ? 'bg-white text-emerald-700'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tickets.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('faq')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'faq'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              FAQs
            </button>
          </div>
        </div>
      </div>

      {/* Tab: Contact & Submit */}
      {activeTab === 'contact' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Direct Support Channels */}
          <div className="md:col-span-1 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>Direct Contact</span>
              </h3>

              <div className="space-y-3 text-xs">
                {/* Email */}
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <span className="text-slate-500 font-medium block">Support Email</span>
                  <div className="flex items-center justify-between font-semibold text-slate-800">
                    <span className="truncate">{contactInfo?.email || 'support@moneygame.com'}</span>
                    <button
                      onClick={() =>
                        handleCopy(contactInfo?.email || 'support@moneygame.com', 'email')
                      }
                      className="p-1 hover:text-emerald-600 transition"
                      title="Copy Email"
                    >
                      {copiedKey === 'email' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <span className="text-slate-500 font-medium block">WhatsApp Support</span>
                  <div className="flex items-center justify-between font-semibold text-slate-800">
                    <span>{contactInfo?.whatsapp || '+91 98765 43210'}</span>
                    <button
                      onClick={() =>
                        handleCopy(contactInfo?.whatsapp || '+91 98765 43210', 'whatsapp')
                      }
                      className="p-1 hover:text-emerald-600 transition"
                      title="Copy Phone"
                    >
                      {copiedKey === 'whatsapp' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Telegram */}
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <span className="text-slate-500 font-medium block">Telegram Channel</span>
                  <div className="flex items-center justify-between font-semibold text-slate-800">
                    <span>{contactInfo?.telegram || '@MoneyGameSupport'}</span>
                    <button
                      onClick={() =>
                        handleCopy(contactInfo?.telegram || '@MoneyGameSupport', 'telegram')
                      }
                      className="p-1 hover:text-emerald-600 transition"
                      title="Copy Telegram"
                    >
                      {copiedKey === 'telegram' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Hours */}
                <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl flex items-center gap-2 text-emerald-800">
                  <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">{contactInfo?.hours || '24/7 Live Support Available'}</span>
                </div>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 space-y-1.5">
              <span className="font-bold flex items-center gap-1.5 text-amber-800">
                <AlertCircle className="w-4 h-4" />
                Deposit Issue Tip
              </span>
              <p className="text-[11px] leading-relaxed text-amber-800/90">
                Please always provide your 12-digit UTR / UPI Reference ID when submitting a deposit issue so the admin can verify and credit your wallet immediately.
              </p>
            </div>
          </div>

          {/* Feedback / Ticket Form */}
          <div className="md:col-span-2">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Submit Feedback or Support Request</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Our administrators review and resolve incoming queries actively.
                </p>
              </div>

              {submitSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{submitSuccess}</span>
                </div>
              )}

              {submitError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Category Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Category of Issue / Feedback
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'DEPOSIT', label: 'Deposit / Payment' },
                      { id: 'WITHDRAWAL', label: 'Withdrawal / Payout' },
                      { id: 'GAME', label: 'Game / Room Issue' },
                      { id: 'ACCOUNT', label: 'Account / Login' },
                      { id: 'BUG', label: 'Bug / Technical' },
                      { id: 'GENERAL', label: 'General / Suggestion' },
                    ].map((cat) => (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border transition text-center ${
                          category === cat.id
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Subject / Summary
                  </label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Deposit ₹500 via PhonePe not credited (UTR: 123456789012)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-emerald-600 focus:bg-white transition"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Details / Description
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Please explain the issue or provide details, including payment timestamps, room codes, or suggestions..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-emerald-600 focus:bg-white transition"
                  />
                </div>

                {/* Contact reference */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Your Contact Info / UTR Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={userContact}
                    onChange={(e) => setUserContact(e.target.value)}
                    placeholder="Phone number, WhatsApp, or Bank UTR"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-emerald-600 focus:bg-white transition"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-xs transition"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Submit to Admin</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Tab: My Tickets */}
      {activeTab === 'tickets' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">My Submitted Tickets</h3>
              <p className="text-xs text-slate-500">Track the status and admin responses to your issues</p>
            </div>
            <button
              onClick={fetchTickets}
              disabled={loadingTickets}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              title="Refresh tickets"
            >
              <RefreshCw className={`w-4 h-4 ${loadingTickets ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>

          {loadingTickets && tickets.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
              <p className="text-xs">Loading your tickets...</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium">You haven't submitted any tickets yet.</p>
              <button
                onClick={() => setActiveTab('contact')}
                className="mt-3 text-xs font-semibold text-emerald-600 hover:underline"
              >
                Submit your first feedback or query &rarr;
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-4.5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded uppercase">
                        {t.category}
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm">{t.subject}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          t.status === 'RESOLVED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : t.status === 'IN_PROGRESS'
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : t.status === 'OPEN'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {t.status === 'OPEN' ? 'Under Review' : t.status}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap bg-white p-3 rounded-lg border border-slate-200/80">
                    {t.message}
                  </p>

                  {t.contactInfo && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <span>Ref / Contact:</span>
                      <span className="font-mono text-slate-700 bg-slate-200/70 px-1.5 py-0.2 rounded">
                        {t.contactInfo}
                      </span>
                    </div>
                  )}

                  {t.adminReply ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Admin Response:
                        </span>
                        {t.repliedAt && (
                          <span className="text-[11px] font-normal text-emerald-700">
                            {new Date(t.repliedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-emerald-950 whitespace-pre-wrap">
                        {t.adminReply}
                      </p>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-700 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Ticket is being reviewed by administrator.</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: FAQ */}
      {activeTab === 'faq' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Frequently Asked Questions</h3>
            <p className="text-xs text-slate-500">Quick answers to common questions about deposits, games, and withdrawals</p>
          </div>

          <div className="space-y-3 pt-2">
            {faqs.map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={index}
                  className="border border-slate-200 rounded-xl overflow-hidden transition"
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="w-full p-4 text-left font-semibold text-sm text-slate-800 bg-slate-50 hover:bg-slate-100 flex items-center justify-between gap-4 transition"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="p-4 text-xs sm:text-sm text-slate-600 bg-white border-t border-slate-100 leading-relaxed">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <span className="text-emerald-900 font-medium">
              Didn't find an answer to your question?
            </span>
            <button
              onClick={() => setActiveTab('contact')}
              className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition"
            >
              Contact Admin Support
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
