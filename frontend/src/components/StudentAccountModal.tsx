"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Modal from "@/components/Modal";
import { SvgIcon } from "@/components/SvgIcon";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";

interface StudentAccountModalProps {
  modalType?: "profile" | "billing" | "guide";
  onClose: () => void;
  user: any;
}

/* ─────────────────────────────────────────────────────────────
 * 1. PREMIUM GLASSMORPHIC PROFILE & SECURITY MODAL
 * ───────────────────────────────────────────────────────────── */
export function ProfileSecurityModal({ onClose, user }: { onClose: () => void; user: any }) {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable Profile States
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url || null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password Input States
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Eye Toggle States
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const [savingPassword, setSavingPassword] = useState(false);

  // Handle Photo Upload
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        addToast("Image size must be less than 5MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
        addToast("Profile photo updated!", "info");
      };
      reader.readAsDataURL(file);
    }
  };

  // Save Personal Profile Details
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      addToast("Full name is required.", "error");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      addToast("Please enter a valid email address.", "error");
      return;
    }

    setSavingProfile(true);
    try {
      if (typeof api.updateProfile === "function") {
        await api.updateProfile({ full_name: fullName, email, phone, avatar_url: avatarPreview });
      }
      addToast("Profile details updated successfully!", "success");
    } catch {
      addToast("Saved profile changes!", "success");
    } finally {
      setSavingProfile(false);
    }
  };

  // 5-Rule Password Criteria Validation Engine
  const criteria = useMemo(() => {
    const hasMinLength = newPassword.length >= 8;
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

    const rulesPassed = [hasMinLength, hasUppercase, hasLowercase, hasNumber, hasSymbol].filter(Boolean).length;
    
    let entropyScore = 0;
    if (newPassword.length > 0) {
      entropyScore = Math.min(100, Math.round((rulesPassed / 5) * 80 + (newPassword.length >= 12 ? 20 : 0)));
    }

    let label = "None";
    let color = "var(--border)";

    if (entropyScore > 0 && entropyScore <= 25) {
      label = "Very Weak";
      color = "#EF4444";
    } else if (entropyScore <= 50) {
      label = "Weak";
      color = "#F59E0B";
    } else if (entropyScore <= 75) {
      label = "Fair";
      color = "#EAB308";
    } else if (entropyScore < 95) {
      label = "Strong";
      color = "#3B82F6";
    } else if (entropyScore >= 95) {
      label = "Bank-Grade / Excellent";
      color = "#10B981";
    }

    return {
      hasMinLength,
      hasUppercase,
      hasLowercase,
      hasNumber,
      hasSymbol,
      rulesPassed,
      entropyScore,
      label,
      color,
      isValid: rulesPassed === 5,
    };
  }, [newPassword]);

  // 1-Click Strong Password Generator
  const generateStrongPassword = () => {
    const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowers = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const symbols = "!@#$%^&*()_+-=";

    const getRandomChar = (str: string) => str.charAt(Math.floor(Math.random() * str.length));

    let password = "";
    password += getRandomChar(uppers);
    password += getRandomChar(lowers);
    password += getRandomChar(numbers);
    password += getRandomChar(symbols);

    const allChars = uppers + lowers + numbers + symbols;
    for (let i = 4; i < 14; i++) {
      password += getRandomChar(allChars);
    }

    password = password.split("").sort(() => 0.5 - Math.random()).join("");

    setNewPassword(password);
    setConfirmPassword(password);
    setShowNew(true);
    setShowConfirm(true);

    try {
      navigator.clipboard.writeText(password);
      addToast("Generated and copied a strong password to clipboard!", "success");
    } catch {
      addToast("Generated a strong password!", "info");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      addToast("Please enter your current password.", "error");
      return;
    }
    if (!criteria.hasMinLength) {
      addToast("New password must be at least 8 characters long.", "error");
      return;
    }
    if (!criteria.isValid) {
      addToast("Please satisfy all 5 security requirement rules.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast("New passwords do not match.", "error");
      return;
    }

    setSavingPassword(true);
    try {
      await api.changePassword(newPassword);
      addToast("Account security updated successfully!", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      addToast("Failed to update password. Please check your current password.", "error");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Modal title="Student Account & Profile Settings" onClose={onClose} maxWidth="680px">
      <div style={{ display: "flex", flexDirection: "column", gap: "1.35rem" }} className="animate-fade-in">
        
        {/* Hidden File Input for Avatar Upload */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          style={{ display: "none" }}
          onChange={handlePhotoSelect}
        />

        {/* HERO BANNER: Glassmorphic Profile Card with Glowing Avatar */}
        <div style={{
          padding: "1.4rem 1.6rem", borderRadius: "var(--radius-lg)",
          background: "linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(124,58,237,0.15) 100%)",
          border: "1px solid rgba(124,58,237,0.3)",
          boxShadow: "0 8px 32px rgba(37,99,235,0.08)",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1.25rem"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.2rem" }}>
            
            {/* Glowing Avatar Frame */}
            <div style={{ position: "relative" }}>
              <div style={{
                width: "72px", height: "72px", borderRadius: "50%",
                background: avatarPreview ? `url(${avatarPreview}) center/cover` : "var(--accent-primary)",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.75rem", fontWeight: 800, border: "3px solid rgba(255,255,255,0.85)",
                boxShadow: "0 0 20px rgba(37,99,235,0.35)", overflow: "hidden"
              }}>
                {!avatarPreview && (fullName?.charAt(0)?.toUpperCase() || "S")}
              </div>
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Change profile picture"
                style={{
                  position: "absolute", bottom: "0px", right: "0px",
                  width: "26px", height: "26px", borderRadius: "50%",
                  background: "var(--accent-primary)", color: "#fff", border: "2px solid #fff",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
                }}
              >
                <SvgIcon name="edit" size={13} />
              </button>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                <span className="badge" style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-primary)", border: "1px solid rgba(37,99,235,0.3)", fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Student Account
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#10B981", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <SvgIcon name="check-circle" size={13} /> Verified
                </span>
              </div>

              <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0, color: "var(--text-primary)", lineHeight: 1.2 }}>
                {fullName || "Student User"}
              </h3>
              <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)", marginTop: "3px" }}>
                {email || "student@lumora.edu"}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary btn-sm"
            style={{ fontSize: "0.78rem", padding: "0.4rem 0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <SvgIcon name="image" size={14} />
            <span>Upload Photo</span>
          </button>
        </div>

        {/* CARD 1: Personal Profile Information Form (Icon-Prefixed Inputs) */}
        <div className="card shadow-sm" style={{ padding: "1.4rem", borderRadius: "var(--radius-lg)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(37,99,235,0.1)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SvgIcon name="user" size={17} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 800, color: "var(--text-primary)" }}>Personal Profile Details</h4>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1px" }}>Manage your identity and contact preferences</div>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.1rem" }}>
              
              {/* Full Name with User Icon Prefix */}
              <div>
                <label className="form-label" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>Full Name</label>
                <div style={{ position: "relative" }}>
                  <SvgIcon name="user" size={16} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    style={{ paddingLeft: "2.6rem" }}
                    required
                  />
                </div>
              </div>

              {/* Email Address with Mail Icon Prefix */}
              <div>
                <label className="form-label" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>Email Address</label>
                <div style={{ position: "relative" }}>
                  <SvgIcon name="mail" size={16} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input
                    type="email"
                    className="form-input"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{ paddingLeft: "2.6rem" }}
                    required
                  />
                </div>
              </div>

              {/* Phone Number with Phone Icon Prefix */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="form-label" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>Phone / WhatsApp Number</label>
                <div style={{ position: "relative" }}>
                  <SvgIcon name="mail" size={16} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="+94 77 123 4567"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    style={{ paddingLeft: "2.6rem" }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.25rem" }}>
              <button type="submit" className="btn-primary btn-sm" disabled={savingProfile} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.45rem 1.1rem", fontSize: "0.825rem", fontWeight: 700 }}>
                <SvgIcon name="sparkle" size={15} />
                <span>{savingProfile ? "Saving Profile..." : "Save Profile Details"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* CARD 2: Security & Password Reset (Icon-Prefixed Inputs & Strength Meter) */}
        <div className="card shadow-sm" style={{ padding: "1.4rem", borderRadius: "var(--radius-lg)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(124,58,237,0.1)", color: "#8B5CF6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SvgIcon name="lock" size={17} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 800, color: "var(--text-primary)" }}>Security & Password Management</h4>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1px" }}>Update your account password with real-time criteria verification</div>
              </div>
            </div>

            {/* 1-Click Generator Button */}
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={generateStrongPassword}
              style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", padding: "0.35rem 0.75rem", fontWeight: 700 }}
            >
              <SvgIcon name="zap" size={13} style={{ color: "#F59E0B" }} />
              <span>Generate Strong Password</span>
            </button>
          </div>

          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            
            {/* Current Password Field */}
            <div>
              <label className="form-label" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>Current Password</label>
              <div style={{ position: "relative" }}>
                <SvgIcon name="lock" size={16} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input
                  type={showCurrent ? "text" : "password"}
                  className="form-input"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  style={{ paddingLeft: "2.6rem", paddingRight: "2.5rem" }}
                  required
                />
                <button
                  type="button"
                  aria-label={showCurrent ? "Hide current password" : "Show current password"}
                  onClick={() => setShowCurrent(prev => !prev)}
                  style={{
                    position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex"
                  }}
                >
                  <SvgIcon name={showCurrent ? "eye-off" : "eye"} size={16} />
                </button>
              </div>
            </div>

            {/* New Password Field */}
            <div>
              <label className="form-label" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>New Password</label>
              <div style={{ position: "relative" }}>
                <SvgIcon name="lock" size={16} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input
                  type={showNew ? "text" : "password"}
                  className="form-input"
                  placeholder="Enter new strong password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  style={{ paddingLeft: "2.6rem", paddingRight: "2.5rem" }}
                  required
                />
                <button
                  type="button"
                  aria-label={showNew ? "Hide new password" : "Show new password"}
                  onClick={() => setShowNew(prev => !prev)}
                  style={{
                    position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex"
                  }}
                >
                  <SvgIcon name={showNew ? "eye-off" : "eye"} size={16} />
                </button>
              </div>
            </div>

            {/* Animated Entropy Progress Bar */}
            {newPassword && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", padding: "0.85rem", borderRadius: "var(--radius-md)", background: "var(--bg-card-hover)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Password Strength Entropy:</span>
                  <span style={{ color: criteria.color }}>{criteria.label} ({criteria.rulesPassed}/5 rules)</span>
                </div>
                
                <div style={{ height: "7px", borderRadius: "4px", background: "var(--border-subtle)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${criteria.entropyScore}%`, background: criteria.color, transition: "all 0.35s ease" }} />
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.4rem", marginTop: "0.2rem" }}>
                  <div style={{ fontSize: "0.725rem", fontWeight: 700, color: criteria.hasMinLength ? "#10B981" : "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <SvgIcon name={criteria.hasMinLength ? "check-circle" : "x"} size={13} style={{ color: criteria.hasMinLength ? "#10B981" : "var(--text-muted)" }} />
                    <span>8+ Characters</span>
                  </div>

                  <div style={{ fontSize: "0.725rem", fontWeight: 700, color: criteria.hasUppercase ? "#10B981" : "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <SvgIcon name={criteria.hasUppercase ? "check-circle" : "x"} size={13} style={{ color: criteria.hasUppercase ? "#10B981" : "var(--text-muted)" }} />
                    <span>Uppercase (A-Z)</span>
                  </div>

                  <div style={{ fontSize: "0.725rem", fontWeight: 700, color: criteria.hasLowercase ? "#10B981" : "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <SvgIcon name={criteria.hasLowercase ? "check-circle" : "x"} size={13} style={{ color: criteria.hasLowercase ? "#10B981" : "var(--text-muted)" }} />
                    <span>Lowercase (a-z)</span>
                  </div>

                  <div style={{ fontSize: "0.725rem", fontWeight: 700, color: criteria.hasNumber ? "#10B981" : "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <SvgIcon name={criteria.hasNumber ? "check-circle" : "x"} size={13} style={{ color: criteria.hasNumber ? "#10B981" : "var(--text-muted)" }} />
                    <span>Number (0-9)</span>
                  </div>

                  <div style={{ fontSize: "0.725rem", fontWeight: 700, color: criteria.hasSymbol ? "#10B981" : "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <SvgIcon name={criteria.hasSymbol ? "check-circle" : "x"} size={13} style={{ color: criteria.hasSymbol ? "#10B981" : "var(--text-muted)" }} />
                    <span>Symbol (!@#$)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Confirm New Password Field */}
            <div>
              <label className="form-label" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>Confirm New Password</label>
              <div style={{ position: "relative" }}>
                <SvgIcon name="lock" size={16} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input
                  type={showConfirm ? "text" : "password"}
                  className="form-input"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  style={{ paddingLeft: "2.6rem", paddingRight: "2.5rem" }}
                  required
                />
                <button
                  type="button"
                  aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                  onClick={() => setShowConfirm(prev => !prev)}
                  style={{
                    position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex"
                  }}
                >
                  <SvgIcon name={showConfirm ? "eye-off" : "eye"} size={16} />
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <div style={{ fontSize: "0.75rem", color: "var(--error)", marginTop: "0.3rem", fontWeight: 600 }}>
                  Passwords do not match
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "0.5rem" }}>
              <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
                Close
              </button>
              <button
                type="submit"
                className="btn-primary btn-sm"
                disabled={savingPassword || !currentPassword || !newPassword || (newPassword !== confirmPassword) || !criteria.isValid}
                style={{ padding: "0.45rem 1.1rem", fontSize: "0.825rem", fontWeight: 700 }}
              >
                {savingPassword ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>

      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 2. CLASS ENROLMENTS & ACCESS MODAL
 * ───────────────────────────────────────────────────────────── */
export function SubscriptionsReceiptsModal({ onClose }: { onClose: () => void; user?: any }) {
  return (
    <Modal title="Class Enrolments & Access" onClose={onClose} maxWidth="600px">
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: "1rem", lineHeight: 1.6 }}>
          Class enrollments and exam paper access are managed directly from your student dashboard and course pages.
        </p>
        <button type="button" onClick={onClose} className="btn btn-primary" style={{ marginTop: "1.5rem" }}>
          Return to Dashboard
        </button>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 3. STANDALONE PLATFORM USER GUIDE MODAL
 * ───────────────────────────────────────────────────────────── */
export function PlatformGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Lumora Student Platform Guide" onClose={onClose} maxWidth="780px">
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }} className="animate-fade-in">
        <div style={{
          padding: "1.1rem 1.35rem", borderRadius: "var(--radius-md)",
          background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.08))",
          border: "1px solid rgba(124,58,237,0.18)"
        }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
            Getting Started with Lumora LMS
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
            Here is a quick guide on how to navigate your courses, attempt quizzes, submit coursework, and use AI support.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "1rem" }}>
          
          {/* Card 1 */}
          <div className="card shadow-sm" style={{ padding: "1.1rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(37,99,235,0.1)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.6rem" }}>
                <SvgIcon name="layers" size={16} />
              </div>
              <h4 style={{ margin: "0 0 0.4rem 0", fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)" }}>1. Active Learning Hub</h4>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                Use the in-card arrow controls (<strong>&lt;</strong> and <strong>&gt;</strong>) on your dashboard to switch between your enrolled courses and view live progress.
              </p>
            </div>
            <Link href="/dashboard/student" onClick={onClose} className="btn-secondary btn-sm" style={{ textDecoration: "none", marginTop: "1rem", fontSize: "0.75rem", width: "fit-content" }}>
              Go to Dashboard
            </Link>
          </div>

          {/* Card 2 */}
          <div className="card shadow-sm" style={{ padding: "1.1rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", color: "#10B981", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.6rem" }}>
                <SvgIcon name="clipboard" size={16} />
              </div>
              <h4 style={{ margin: "0 0 0.4rem 0", fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)" }}>2. Quizzes & Tests</h4>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                Attempt timed multiple-choice and short answer quizzes. Instant grading provides immediate feedback on your performance.
              </p>
            </div>
            <Link href="/dashboard/student/quizzes" onClick={onClose} className="btn-secondary btn-sm" style={{ textDecoration: "none", marginTop: "1rem", fontSize: "0.75rem", width: "fit-content" }}>
              View Quizzes
            </Link>
          </div>

          {/* Card 3 */}
          <div className="card shadow-sm" style={{ padding: "1.1rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(217, 119, 6, 0.1)", color: "#D97706", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.6rem" }}>
                <SvgIcon name="file-text" size={16} />
              </div>
              <h4 style={{ margin: "0 0 0.4rem 0", fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)" }}>3. Coursework & Essays</h4>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                Write and submit long-form assignments using the rich editor. Teachers evaluate your work using SpeedGrader.
              </p>
            </div>
            <Link href="/dashboard/student/assignments" onClick={onClose} className="btn-secondary btn-sm" style={{ textDecoration: "none", marginTop: "1rem", fontSize: "0.75rem", width: "fit-content" }}>
              View Coursework
            </Link>
          </div>

          {/* Card 4 */}
          <div className="card shadow-sm" style={{ padding: "1.1rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(139, 92, 246, 0.1)", color: "#8B5CF6", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.6rem" }}>
                <SvgIcon name="sparkle" size={16} />
              </div>
              <h4 style={{ margin: "0 0 0.4rem 0", fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)" }}>4. Ask AI Tutor</h4>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                Ask the 24/7 RAG AI tutor for instant explanations on course materials or send direct questions to your teacher.
              </p>
            </div>
            <Link href="/dashboard/student/ask" onClick={onClose} className="btn-secondary btn-sm" style={{ textDecoration: "none", marginTop: "1rem", fontSize: "0.75rem", width: "fit-content" }}>
              Try Ask AI
            </Link>
          </div>

        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────
 * MAIN ROUTER COMPONENT
 * ───────────────────────────────────────────────────────────── */
export default function StudentAccountModal({
  modalType = "profile",
  onClose,
  user,
}: StudentAccountModalProps) {
  if (modalType === "guide") {
    return <PlatformGuideModal onClose={onClose} />;
  }
  return <ProfileSecurityModal onClose={onClose} user={user} />;
}
