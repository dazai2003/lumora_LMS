"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import api from "@/lib/api";

import { SvgIcon } from "@/components/SvgIcon";

export default function ForcePasswordChange() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If user is not logged in or doesn't need to change password, render nothing
  if (!user || !user.must_change_password) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addToast("Passwords do not match.", "error");
      return;
    }
    if (newPassword.length < 6) {
      addToast("Password must be at least 6 characters.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.changePassword(newPassword);
      addToast("Password successfully reset.", "success");
      
      // Update local user context so the modal disappears
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err: any) {
      addToast(err.message || "Failed to update password.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // We enforce the modal stays open by not providing an onClose handler (or a no-op) and hiding the close button
  return (
    <Modal isOpen={true} onClose={() => {}} title="Action Required">
      <div style={{ marginBottom: "1rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
        You are logged in with a temporary password. Please create a new password to secure your account before continuing.
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>New Password</label>
          <div style={{ position: "relative" }}>
            <input 
              type={showNewPassword ? "text" : "password"}
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              disabled={isSubmitting}
              placeholder="At least 6 characters"
              style={{ width: "100%", paddingRight: "40px" }}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)"
              }}
            >
              <SvgIcon name={showNewPassword ? "eye-off" : "eye"} size={18} />
            </button>
          </div>
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Confirm Password</label>
          <div style={{ position: "relative" }}>
            <input 
              type={showConfirmPassword ? "text" : "password"}
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              disabled={isSubmitting}
              placeholder="Confirm new password"
              style={{ width: "100%", paddingRight: "40px" }}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)"
              }}
            >
              <SvgIcon name={showConfirmPassword ? "eye-off" : "eye"} size={18} />
            </button>
          </div>
        </div>
        
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button type="submit" className="btn-primary" disabled={isSubmitting || !newPassword || !confirmPassword}>
            {isSubmitting ? "Saving..." : "Save Password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
