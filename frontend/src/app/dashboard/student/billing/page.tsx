"use client";

import { useEffect, useState } from "react";
import api, { PaymentResponse, SubscriptionResponse } from "@/lib/api";
import { CreditCard, History, CheckCircle, Clock, AlertTriangle, CalendarDays } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export default function StudentBillingPage() {
  const [transactions, setTransactions] = useState<PaymentResponse[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subToCancel, setSubToCancel] = useState<number | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const [trans, subs] = await Promise.all([
        api.getMyTransactions(),
        api.getMySubscriptions()
      ]);
      setTransactions(trans);
      setSubscriptions(subs);
    } catch (err: any) {
      setError(err.message || "Failed to load billing data");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSub = async () => {
    if (subToCancel === null) return;
    try {
      await api.cancelSubscription(subToCancel);
      await fetchBillingData();
      addToast("Subscription cancelled successfully.", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to cancel subscription", "error");
    } finally {
      setSubToCancel(null);
    }
  };

  const handlePayTransaction = async (txnId: number) => {
    try {
      await api.payTransaction(txnId);
      await fetchBillingData();
    } catch (err: any) {
      addToast(err.message || "Failed to process payment", "error");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-[var(--foreground-muted)]">Loading billing data...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-[var(--destructive)]">{error}</div>;
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-[var(--foreground)] tracking-tight flex items-center gap-2">
          <CreditCard className="w-8 h-8 text-[var(--accent-primary)]" />
          Billing & Subscriptions
        </h1>
        <p className="text-[var(--foreground-muted)]">Manage your course subscriptions and view payment history.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Subscriptions Card */}
        <div className="bg-[var(--background-card)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-[var(--border)] bg-[var(--background-alt)]/50 flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <CalendarDays className="w-5 h-5 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold">Active Subscriptions</h2>
          </div>
          
          <div className="p-6 flex-1 flex flex-col gap-4">
            {subscriptions.length === 0 ? (
              <div className="text-center py-12 text-[var(--foreground-muted)] flex flex-col items-center justify-center">
                <Clock className="w-12 h-12 mb-3 opacity-20" />
                <p>No active subscriptions found.</p>
              </div>
            ) : (
              subscriptions.map(sub => (
                <div key={sub.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-[var(--radius-lg)] border border-[var(--border)] hover:border-[var(--accent-primary)]/50 transition-colors bg-[var(--background)] gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg text-[var(--foreground)]">{sub.course_title}</h3>
                      {sub.status === 'overdue' && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200">OVERDUE</span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--foreground-muted)] flex items-center gap-1 mt-1">
                      <Clock className="w-4 h-4" /> 
                      Renews on: {new Date(sub.current_period_end).toLocaleDateString()}
                    </p>
                  </div>
                  <button 
                    onClick={() => setSubToCancel(sub.id)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors border border-red-500/20"
                  >
                    Cancel Subscription
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Transactions Card */}
        <div className="bg-[var(--background-card)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-[var(--border)] bg-[var(--background-alt)]/50 flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <History className="w-5 h-5 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold">Transaction History</h2>
          </div>
          
          <div className="p-6 flex-1 flex flex-col gap-4">
            {transactions.length === 0 ? (
              <div className="text-center py-12 text-[var(--foreground-muted)] flex flex-col items-center justify-center">
                <History className="w-12 h-12 mb-3 opacity-20" />
                <p>No transactions found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {transactions.map(txn => (
                  <div key={txn.id} className="flex items-center justify-between p-4 rounded-[var(--radius-lg)] bg-[var(--background)] border border-[var(--border)]">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-[var(--accent-primary)]/10 rounded-full">
                        {txn.status === 'completed' ? (
                          <CheckCircle className="w-5 h-5 text-[var(--accent-primary)]" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-amber-500" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold text-[var(--foreground)]">{txn.course_title}</h4>
                        <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)] mt-1">
                          <span className="capitalize">{txn.payment_plan.replace('_', ' ')} Plan</span>
                          <span>•</span>
                          <span>{new Date(txn.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <div>
                        <p className="font-bold text-[var(--foreground)]">LKR {txn.amount.toFixed(2)}</p>
                        <p className={`text-xs capitalize font-medium mt-1 ${
                          txn.status === 'completed' ? 'text-green-500' : 
                          txn.status === 'overdue' ? 'text-red-500' : 
                          'text-amber-500'
                        }`}>
                          {txn.status}
                        </p>
                      </div>
                      {(txn.status === 'overdue' || txn.status === 'pending') && (
                        <button
                          onClick={() => handlePayTransaction(txn.id)}
                          className="px-3 py-1 text-xs font-medium bg-[var(--accent-primary)] text-white rounded hover:bg-[var(--accent-primary)]/90 transition-colors"
                        >
                          Pay Now
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {subToCancel !== null && (
        <ConfirmDialog
          open={subToCancel !== null}
          title="Cancel Subscription"
          message="Are you sure you want to cancel this subscription? You will lose access at the end of the billing period."
          onConfirm={handleCancelSub}
          onCancel={() => setSubToCancel(null)}
          confirmLabel="Yes, Cancel"
          danger={true}
        />
      )}
    </div>
  );
}
