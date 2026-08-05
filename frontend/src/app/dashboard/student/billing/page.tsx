"use client";

import { useEffect, useState } from "react";
import api, { PaymentResponse, SubscriptionResponse } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ReceiptModal from "@/components/ReceiptModal";
import { SvgIcon } from "@/components/SvgIcon";

export default function StudentBillingPage() {
  const [transactions, setTransactions] = useState<PaymentResponse[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subToCancel, setSubToCancel] = useState<number | null>(null);
  const [processingPayId, setProcessingPayId] = useState<number | null>(null);
  const [paymentFrequency, setPaymentFrequency] = useState<"monthly" | "quarterly" | "annual">("monthly");
  const [receiptTxn, setReceiptTxn] = useState<PaymentResponse | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    fetchBillingData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const [trans, subs] = await Promise.all([
        api.getMyTransactions(),
        api.getMySubscriptions()
      ]);
      setTransactions(trans || []);
      setSubscriptions(subs || []);
    } catch (err: any) {
      setError(err.message || "Failed to load tuition fee data");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSub = async () => {
    if (subToCancel === null) return;
    try {
      await api.cancelSubscription(subToCancel);
      await fetchBillingData();
      addToast("Class subscription cancelled successfully.", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to cancel subscription", "error");
    } finally {
      setSubToCancel(null);
    }
  };

  const handlePayTransaction = async (txnId: number) => {
    try {
      setProcessingPayId(txnId);
      await api.payTransaction(txnId);
      await fetchBillingData();
      addToast("Tuition fee payment processed successfully!", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to process payment", "error");
    } finally {
      setProcessingPayId(null);
    }
  };

  // Metrics
  const activeSubsCount = subscriptions.length;
  const isComboUnlocked = activeSubsCount >= 3;
  const pendingCount = transactions.filter(t => t.status === "pending" || t.status === "overdue").length;

  if (loading) {
    return (
      <div className="page-loader" style={{ minHeight: "60vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
        <div style={{ color: "var(--error)", marginBottom: "1rem", fontSize: "1.1rem" }}>{error}</div>
        <button className="btn-primary" onClick={fetchBillingData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "1280px", margin: "0 auto", paddingBottom: "2rem" }}>
      {/* Header & Status Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1.5rem" }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Billing & Subscriptions</h1>
          <p>Manage your Sri Lankan A/L & O/L subject class tuition fees, stream combo discounts, and payment receipts</p>
        </div>

        {/* Status Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.5rem", 
            padding: "0.5rem 1rem", 
            borderRadius: "var(--radius-full)", 
            background: isComboUnlocked ? "rgba(16,185,129,0.12)" : "rgba(99,102,241,0.12)",
            border: isComboUnlocked ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(99,102,241,0.3)",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: isComboUnlocked ? "#10b981" : "var(--accent-primary)"
          }}>
            <SvgIcon name="sparkle" size={15} />
            <span>{isComboUnlocked ? "3-Subject Stream Combo Unlocked (20% Off)" : "Single Class Pass Mode"}</span>
          </div>

          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.5rem", 
            padding: "0.5rem 1rem", 
            borderRadius: "var(--radius-full)", 
            background: pendingCount > 0 ? "rgba(239,68,68,0.12)" : "var(--bg-card)",
            border: pendingCount > 0 ? "1px solid rgba(239,68,68,0.3)" : "1px solid var(--border)",
            fontSize: "0.85rem",
            color: pendingCount > 0 ? "#ef4444" : "var(--text-secondary)",
            fontWeight: 600
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: pendingCount > 0 ? "#ef4444" : "#10b981" }} />
            <span>{pendingCount > 0 ? `${pendingCount} Fee Due` : "Tuition Fees Current"}</span>
          </div>
        </div>
      </div>

      {/* 1. ENROLLED SUBJECT CLASS TUITION PASSES */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Enrolled Subject Classes ({subscriptions.length})
          </h2>
        </div>

        {subscriptions.length === 0 ? (
          <div className="card" style={{ padding: "3rem 2rem", textAlign: "center", background: "var(--bg-card)", border: "1px dashed var(--border)" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(99,102,241,0.12)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
              <SvgIcon name="book" size={32} />
            </div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 0.5rem 0" }}>No Active Class Tuition Passes</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "460px", margin: "0 auto 1.5rem" }}>
              You are not currently enrolled in any Sri Lankan A/L or O/L subject classes. Browse available classes to get started.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
            {subscriptions.map((sub) => {
              const isOverdue = sub.status === "overdue";

              return (
                <div 
                  key={sub.id} 
                  className="card"
                  style={{ 
                    padding: "1.25rem", 
                    background: "var(--bg-card)", 
                    border: isOverdue ? "1.5px solid #ef4444" : "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "1rem"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>A/L Class Pass</span>
                      <span style={{ 
                        fontSize: "0.72rem", 
                        fontWeight: 700, 
                        color: isOverdue ? "#ef4444" : "#10b981",
                        background: isOverdue ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "var(--radius-full)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.3rem"
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: isOverdue ? "#ef4444" : "#10b981" }} />
                        {isOverdue ? "FEE OVERDUE" : "TUITION PAID"}
                      </span>
                    </div>

                    <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0.25rem 0", color: "var(--text-primary)" }}>
                      {sub.course_title}
                    </h3>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <SvgIcon name="clock" size={13} />
                      <span>Class Fee Due: <strong>{new Date(sub.current_period_end).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</strong></span>
                    </p>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      LKR 2,500 / mo
                    </div>

                    <button 
                      onClick={() => setSubToCancel(sub.id)}
                      style={{ 
                        padding: "0.35rem 0.75rem", 
                        borderRadius: "6px", 
                        fontSize: "0.78rem", 
                        fontWeight: 600, 
                        border: "1px solid rgba(239,68,68,0.4)", 
                        background: "rgba(239,68,68,0.1)", 
                        color: "#ef4444", 
                        cursor: "pointer"
                      }}
                    >
                      Unenroll Class
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. SRI LANKAN TUITION FEE & STREAM COMBO CALCULATOR (2 Cards Only) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Sri Lankan A/L Tuition Fees & Stream Combos
            </h2>
            <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>Choose your payment frequency or enroll in a full 3-Subject Stream Combo for big savings</p>
          </div>

          {/* Term Frequency Toggle */}
          <div style={{ display: "flex", alignItems: "center", background: "var(--bg-card)", border: "1px solid var(--border)", padding: "3px", borderRadius: "var(--radius-full)" }}>
            <button
              onClick={() => setPaymentFrequency("monthly")}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "var(--radius-full)",
                fontSize: "0.82rem",
                fontWeight: 600,
                border: "none",
                background: paymentFrequency === "monthly" ? "var(--accent-primary)" : "transparent",
                color: paymentFrequency === "monthly" ? "white" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Monthly Class Fee
            </button>

            <button
              onClick={() => setPaymentFrequency("quarterly")}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "var(--radius-full)",
                fontSize: "0.82rem",
                fontWeight: 600,
                border: "none",
                background: paymentFrequency === "quarterly" ? "var(--accent-primary)" : "transparent",
                color: paymentFrequency === "quarterly" ? "white" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem"
              }}
            >
              <span>Quarterly Term</span>
              <span style={{ fontSize: "0.65rem", background: "#f59e0b", color: "white", padding: "1px 5px", borderRadius: "8px" }}>10% OFF</span>
            </button>

            <button
              onClick={() => setPaymentFrequency("annual")}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "var(--radius-full)",
                fontSize: "0.82rem",
                fontWeight: 600,
                border: "none",
                background: paymentFrequency === "annual" ? "var(--accent-primary)" : "transparent",
                color: paymentFrequency === "annual" ? "white" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem"
              }}
            >
              <span>Full Year Pass</span>
              <span style={{ fontSize: "0.65rem", background: "#10b981", color: "white", padding: "1px 5px", borderRadius: "8px" }}>25% OFF</span>
            </button>
          </div>
        </div>

        {/* 2 Fee Structure Cards (Removed 4th Subject Card) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
          
          {/* Option 1: Single Class Pass */}
          <div className="card" style={{ padding: "1.75rem", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>SINGLE SUBJECT</div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0.4rem 0 0.75rem 0" }}>1 Subject Class Fee</h3>
              
              <div style={{ marginBottom: "1.25rem" }}>
                <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  LKR {paymentFrequency === "monthly" ? "2,500" : paymentFrequency === "quarterly" ? "6,750" : "22,500"}
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}> / {paymentFrequency === "monthly" ? "month" : paymentFrequency === "quarterly" ? "3 months" : "year"}</span>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem 0", display: "flex", flexDirection: "column", gap: "0.7rem", fontSize: "0.88rem", color: "var(--text-secondary)" }}>
                <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><SvgIcon name="check" size={15} style={{ color: "#10b981" }} /> Access to 1 A/L or O/L Subject Class</li>
                <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><SvgIcon name="check" size={15} style={{ color: "#10b981" }} /> Full Theory & Revision Lessons</li>
                <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><SvgIcon name="check" size={15} style={{ color: "#10b981" }} /> AI Tutor Question Assistance</li>
              </ul>
            </div>

            <button className="btn-secondary" style={{ width: "100%", padding: "0.65rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem" }}>
              Single Subject Pass Active
            </button>
          </div>

          {/* Option 2: 3-Subject Stream Combo (Featured) */}
          <div className="card" style={{ 
            padding: "1.75rem", 
            display: "flex", 
            flexDirection: "column", 
            justifyContent: "space-between", 
            background: "linear-gradient(145deg, var(--bg-card) 0%, rgba(99,102,241,0.08) 100%)", 
            border: "2px solid var(--accent-primary)",
            position: "relative",
            boxShadow: "0 10px 30px rgba(99,102,241,0.15)"
          }}>
            <div style={{ position: "absolute", top: "-12px", right: "16px", background: "var(--accent-primary)", color: "white", fontSize: "0.72rem", fontWeight: 700, padding: "2px 12px", borderRadius: "10px" }}>
              BEST VALUE • SAVE 20%
            </div>

            <div>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>STREAM COMBO PASS</div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0.4rem 0 0.75rem 0" }}>Full 3-Subject Stream Pass</h3>
              
              <div style={{ marginBottom: "1.25rem" }}>
                <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  LKR {paymentFrequency === "monthly" ? "6,000" : paymentFrequency === "quarterly" ? "16,200" : "54,000"}
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}> / {paymentFrequency === "monthly" ? "month" : paymentFrequency === "quarterly" ? "3 months" : "year"}</span>
                <div style={{ fontSize: "0.78rem", color: "#10b981", fontWeight: 600, marginTop: "0.2rem" }}>
                  Save LKR 1,500/month compared to individual single subjects!
                </div>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem 0", display: "flex", flexDirection: "column", gap: "0.7rem", fontSize: "0.88rem", color: "var(--text-secondary)" }}>
                <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><SvgIcon name="check" size={15} style={{ color: "#10b981" }} /> All 3 Stream Subjects (Bio + Chem + Physics or Maths)</li>
                <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><SvgIcon name="check" size={15} style={{ color: "#10b981" }} /> Priority Instructor Q&A Support</li>
                <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><SvgIcon name="check" size={15} style={{ color: "#10b981" }} /> Past Paper & Model Paper Revisions</li>
                <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><SvgIcon name="check" size={15} style={{ color: "#10b981" }} /> Full Year Exam Prediction Pack</li>
              </ul>
            </div>

            <button className="btn-primary" style={{ width: "100%", padding: "0.65rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem" }}>
              {isComboUnlocked ? "Stream Combo Active" : "Get 3-Subject Combo Pass"}
            </button>
          </div>

        </div>
      </div>

      {/* 3. OFFICIAL TUITION CLASS FEE RECEIPTS LEDGER */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Class Fee Payment Receipts & History
          </h2>
          <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>View, print, and download official monthly tuition class payment receipts</p>
        </div>

        <div className="card" style={{ padding: 0, overflowX: "auto", border: "1px solid var(--border)" }}>
          {transactions.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              <SvgIcon name="file-text" size={36} style={{ opacity: 0.3, marginBottom: "0.75rem" }} />
              <p style={{ margin: 0, fontSize: "0.9rem" }}>No class fee receipts recorded yet.</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-body)" }}>
                  <th style={{ padding: "0.9rem 1.25rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 600 }}>Receipt Ref & Class</th>
                  <th style={{ padding: "0.9rem 1.25rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 600 }}>Tuition Plan</th>
                  <th style={{ padding: "0.9rem 1.25rem", textAlign: "right", color: "var(--text-muted)", fontWeight: 600 }}>Amount Paid</th>
                  <th style={{ padding: "0.9rem 1.25rem", textAlign: "center", color: "var(--text-muted)", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "0.9rem 1.25rem", textAlign: "right", color: "var(--text-muted)", fontWeight: 600 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(txn => {
                  const isCompleted = txn.status === "completed";
                  const isOverdue = txn.status === "overdue";

                  return (
                    <tr key={txn.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s ease" }}>
                      <td style={{ padding: "1rem 1.25rem" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          SL-AL-2026-{txn.id.toString().padStart(4, '0')}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                          {txn.course_title}
                        </div>
                      </td>

                      <td style={{ padding: "1rem 1.25rem" }}>
                        <div style={{ textTransform: "capitalize", fontWeight: 500, color: "var(--text-primary)" }}>
                          {txn.payment_plan.replace('_', ' ')} Tuition Fee
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                          {new Date(txn.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </td>

                      <td style={{ padding: "1rem 1.25rem", textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>
                        LKR {txn.amount.toFixed(2)}
                      </td>

                      <td style={{ padding: "1rem 1.25rem", textAlign: "center" }}>
                        <span style={{ 
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.25rem 0.65rem", 
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          background: isCompleted ? "rgba(16,185,129,0.12)" : isOverdue ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                          color: isCompleted ? "#10b981" : isOverdue ? "#ef4444" : "#f59e0b"
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: isCompleted ? "#10b981" : isOverdue ? "#ef4444" : "#f59e0b" }} />
                          <span>{isCompleted ? "FEE PAID" : isOverdue ? "OVERDUE" : "PENDING"}</span>
                        </span>
                      </td>

                      <td style={{ padding: "1rem 1.25rem", textAlign: "right" }}>
                        {(isOverdue || txn.status === 'pending') ? (
                          <button
                            onClick={() => handlePayTransaction(txn.id)}
                            disabled={processingPayId === txn.id}
                            className="btn-primary"
                            style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", borderRadius: "var(--radius-full)" }}
                          >
                            {processingPayId === txn.id ? <SvgIcon name="refresh" className="spin" size={13} /> : "Pay Fee"}
                          </button>
                        ) : (
                          <button 
                            className="btn-secondary" 
                            onClick={() => setReceiptTxn(txn)}
                            style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", borderRadius: "var(--radius-full)" }}
                          >
                            Receipt
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {subToCancel !== null && (
        <ConfirmDialog
          open={subToCancel !== null}
          title="Unenroll Class"
          message="Are you sure you want to unenroll from this subject class? You will lose access to new theory materials and live Q&A at the end of this billing cycle."
          onConfirm={handleCancelSub}
          onCancel={() => setSubToCancel(null)}
          confirmLabel="Yes, Unenroll Class"
          danger={true}
        />
      )}

      {/* Official Receipt Modal Pop-up */}
      <ReceiptModal
        open={receiptTxn !== null}
        onClose={() => setReceiptTxn(null)}
        transaction={receiptTxn}
        studentName="Nimal Fernando"
        studentEmail="student1@fdp.com"
      />
    </div>
  );
}
