"use client";

import Modal from "@/components/Modal";
import { SvgIcon } from "@/components/SvgIcon";
import { PaymentResponse } from "@/lib/api";

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  transaction: PaymentResponse | null;
  studentName?: string;
  studentEmail?: string;
}

export default function ReceiptModal({
  open,
  onClose,
  transaction,
  studentName = "Nimal Fernando",
  studentEmail = "student1@fdp.com"
}: ReceiptModalProps) {
  if (!open || !transaction) return null;

  const receiptNo = `SL-AL-2026-${transaction.id.toString().padStart(4, "0")}`;
  const formattedDate = new Date(transaction.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([
      `LUMORA LMS - OFFICIAL TUITION RECEIPT\n` +
      `Receipt No: ${receiptNo}\n` +
      `Date: ${formattedDate}\n` +
      `Student Name: ${studentName}\n` +
      `Student Email: ${studentEmail}\n` +
      `Subject Class: ${transaction.course_title}\n` +
      `Payment Plan: ${transaction.payment_plan.replace("_", " ").toUpperCase()}\n` +
      `Amount Paid: LKR ${transaction.amount.toFixed(2)}\n` +
      `Status: COMPLETED / PAID\n`
    ], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `${receiptNo}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <Modal title="Official Tuition Fee Receipt" onClose={onClose}>
      <div className="printable-receipt" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "0.5rem" }}>
        
        {/* Receipt Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid var(--border)", paddingBottom: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-primary)", fontWeight: 800, fontSize: "1.1rem" }}>
              <SvgIcon name="book" size={22} />
              <span>LUMORA LMS</span>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              Sri Lankan A/L & O/L Online Tuition Portal
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {receiptNo}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
              Issued: {formattedDate}
            </div>
          </div>
        </div>

        {/* Student & Course Info Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", background: "var(--bg-body)", padding: "0.9rem", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "0.83rem" }}>
          <div>
            <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 600 }}>STUDENT DETAILS</span>
            <strong style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}>{studentName}</strong>
            <div style={{ color: "var(--text-secondary)" }}>{studentEmail}</div>
            <div style={{ color: "var(--accent-primary)", fontWeight: 600, marginTop: "0.2rem" }}>A/L Biological & Physical Sciences Stream</div>
          </div>

          <div>
            <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 600 }}>PAYMENT DETAILS</span>
            <strong style={{ color: "var(--text-primary)", fontSize: "0.9rem" }}>Sri Lankan Card / Bank Online</strong>
            <div style={{ color: "var(--text-secondary)", textTransform: "capitalize" }}>Plan: {transaction.payment_plan.replace("_", " ")} Pass</div>
            <div style={{ color: "#10b981", fontWeight: 700, marginTop: "0.2rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <SvgIcon name="check-circle" size={13} />
              <span>STATUS: PAID & VERIFIED</span>
            </div>
          </div>
        </div>

        {/* Itemized Table */}
        <div style={{ border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "var(--bg-body)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.6rem 0.9rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 600 }}>Subject Class / Particulars</th>
                <th style={{ padding: "0.6rem 0.9rem", textAlign: "right", color: "var(--text-muted)", fontWeight: 600 }}>Amount (LKR)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.75rem 0.9rem" }}>
                  <strong style={{ color: "var(--text-primary)" }}>{transaction.course_title}</strong>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                    Monthly Tuition Pass & Theory Lessons
                  </div>
                </td>
                <td style={{ padding: "0.75rem 0.9rem", textAlign: "right", fontWeight: 600, color: "var(--text-primary)" }}>
                  LKR {transaction.amount.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "0.6rem 0.9rem", color: "#10b981", fontSize: "0.78rem" }}>
                  ✓ 3-Subject Stream Combo Pass Discount Applied
                </td>
                <td style={{ padding: "0.6rem 0.9rem", textAlign: "right", color: "#10b981", fontSize: "0.78rem", fontWeight: 600 }}>
                  20% OFF
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 0.9rem", background: "var(--bg-body)", borderTop: "2px solid var(--border)" }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>TOTAL AMOUNT PAID</span>
            <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-primary)" }}>LKR {transaction.amount.toFixed(2)}</span>
          </div>
        </div>

        {/* Verification Stamp */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.9rem", borderRadius: "8px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <div style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 600 }}>
            Official Electronic Tuition Receipt • Generated by Lumora LMS Portal
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: "#10b981", fontWeight: 700 }}>
            <SvgIcon name="check-circle" size={14} />
            <span>VERIFIED</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "0.5rem" }}>
          <button className="btn-secondary" onClick={onClose} style={{ padding: "0.45rem 1rem", fontSize: "0.83rem" }}>
            Close
          </button>
          <button className="btn-secondary" onClick={handleDownload} style={{ padding: "0.45rem 1rem", fontSize: "0.83rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <SvgIcon name="file-text" size={14} />
            <span>Download</span>
          </button>
          <button className="btn-primary" onClick={handlePrint} style={{ padding: "0.45rem 1.1rem", fontSize: "0.83rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <SvgIcon name="file-text" size={14} />
            <span>Print Receipt</span>
          </button>
        </div>

      </div>
    </Modal>
  );
}
