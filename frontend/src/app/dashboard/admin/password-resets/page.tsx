"use client";

import { useState, useEffect } from "react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SvgIcon } from "@/components/SvgIcon";
import { Modal } from "@/components/ui/Modal";

export default function PasswordResetsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "resolved" | "">("pending");
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { addToast } = useToast();

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await api.getPasswordResetRequests(statusFilter || undefined);
      setRequests(data);
    } catch (err) {
      console.error(err);
      addToast("Failed to load password reset requests.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const generateTempPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let p = "";
    for (let i = 0; i < 8; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
    setNewPassword(p + "!"); // ensure a special char
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    
    setIsSubmitting(true);
    try {
      await api.resolvePasswordReset(selectedRequest.id, newPassword);
      addToast("Password reset successfully. User has been notified.", "success");
      setIsResolveModalOpen(false);
      fetchRequests(); // refresh list
    } catch (err: any) {
      addToast(err.message || "Failed to resolve request.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>Password Resets</h1>
          <p>Review and resolve user password reset requests.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <button 
          className={statusFilter === "pending" ? "btn-primary" : "btn-secondary"}
          onClick={() => setStatusFilter("pending")}
        >
          Pending
        </button>
        <button 
          className={statusFilter === "resolved" ? "btn-primary" : "btn-secondary"}
          onClick={() => setStatusFilter("resolved")}
        >
          Resolved
        </button>
        <button 
          className={statusFilter === "" ? "btn-primary" : "btn-secondary"}
          onClick={() => setStatusFilter("")}
        >
          All
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Email</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>Loading...</td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No requests found.</td></tr>
            ) : (
              requests.map(req => (
                <tr key={req.id}>
                  <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{new Date(req.created_at).toLocaleString()}</td>
                  <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{req.email}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{req.reason || "-"}</td>
                  <td>
                    <span className={`badge ${req.status === "resolved" ? "badge-success" : "badge-warning"}`}>
                      {req.status}
                    </span>
                  </td>
                  <td>
                    {req.status === "pending" ? (
                      <button 
                        className="btn-primary btn-sm"
                        onClick={() => {
                          setSelectedRequest(req);
                          setNewPassword("");
                          setIsResolveModalOpen(true);
                        }}
                      >
                        Resolve
                      </button>
                    ) : (
                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        Pass: <strong style={{ color: "var(--text-primary)" }}>{req.temp_password || "***"}</strong>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isResolveModalOpen} onClose={() => !isSubmitting && setIsResolveModalOpen(false)} title="Resolve Password Reset">
        <form onSubmit={handleResolveSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ padding: "1rem", backgroundColor: "var(--bg-hover)", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              You are resetting the password for: <strong style={{ color: "var(--text-primary)" }}>{selectedRequest?.email}</strong>
            </p>
          </div>
          
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>New Temporary Password</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input 
                type="text" 
                className="input" 
                style={{ flex: 1 }}
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                required 
                minLength={6}
              />
              <button type="button" className="btn-secondary" onClick={generateTempPassword}>
                Generate
              </button>
            </div>
          </div>
          
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            When you click Resolve, the user's password will be updated and an email with the temporary password will be dispatched to their address.
          </div>
          
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <button type="button" className="btn-secondary" onClick={() => setIsResolveModalOpen(false)} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || !newPassword}>
              {isSubmitting ? "Resolving..." : "Confirm & Resolve"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
