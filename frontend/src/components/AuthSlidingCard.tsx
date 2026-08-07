"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import api, { ApiError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import Lottie from "lottie-react";
import Image from "next/image";
import studentAnimation from "@/components/ico/wired-outline-21-avatar-hover-jumping.json";
import teacherAnimation from "@/components/ico/wired-outline-17-avatar-man-nodding-hover-pinch.json";
import lumoraLogo from "@/components/ico/Black_background_Logo.png";
import { SvgIcon } from "@/components/SvgIcon";

type Mode = "login" | "register";

interface AuthSlidingCardProps {
  initialMode?: Mode;
}

export default function AuthSlidingCard({ initialMode = "login" }: AuthSlidingCardProps) {
  const { login, register } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);

  // ---------------- LOGIN: state & submit logic (unchanged from original) ----------------
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      await login(loginEmail, loginPassword, rememberMe);
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setLoginError(err.message);
      } else if (
        err instanceof TypeError &&
        (err.message.includes("fetch") || err.message.includes("network"))
      ) {
        setLoginError(
          "Cannot connect to the server. Please make sure the backend is running on port 8000."
        );
      } else {
        setLoginError("Cannot connect to the server. Please make sure the backend is running.");
      }
    } finally {
      setLoginLoading(false);
    }
  };

  // ---------------- FORGOT PASSWORD ----------------
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotReason, setForgotReason] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  const { addToast } = useToast();

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await api.requestPasswordReset(forgotEmail, forgotReason);
      addToast(res.message, "success");
      setForgotEmail("");
      setForgotReason("");
      setIsForgotOpen(false);
    } catch (err: any) {
      addToast(err.message || "Failed to submit request.", "error");
    } finally {
      setForgotLoading(false);
    }
  };

  // ---------------- REGISTER: state & submit logic (unchanged from original) ----------------
  const [fullName, setFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");

    if (regPassword !== confirmPassword) {
      setRegError("Passwords do not match");
      return;
    }

    if (regPassword.length < 6) {
      setRegError("Password must be at least 6 characters");
      return;
    }

    setRegLoading(true);
    try {
      await register({ email: regEmail, password: regPassword, full_name: fullName, role });
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setRegError(err.message);
      } else {
        setRegError("Cannot connect to the server. Please make sure the backend is running.");
      }
    } finally {
      setRegLoading(false);
    }
  };

  // Switches the visible pane and keeps the URL in sync, without unmounting
  // this component (which is what makes the slide animation possible).
  const goTo = (m: Mode) => {
    setMode(m);
    window.history.replaceState(null, "", m === "login" ? "/login" : "/register");
  };

  return (
    <div className="auth-outer">
      <div className={`auth-track ${mode === "register" ? "is-register" : ""}`}>
        {/* SCENE 1 — brand panel left, login form right */}
        <div className="scene">
          <BrandPanel mode="login" />
          <div className="form-panel">
            <div className="form-shell">
              <h1 className="form-title">Welcome back</h1>
              <p className="form-sub">Sign in to Lumora</p>

              {loginError && <div className="form-error">{loginError}</div>}

              <form onSubmit={handleLoginSubmit} noValidate>
                <div className="field">
                  <label className="field-label" htmlFor="login-email">
                    Email Address
                  </label>
                  <input
                    id="login-email"
                    className="field-input"
                    type="email"
                    placeholder="john@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    autoComplete="email"
                    suppressHydrationWarning
                  />
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="login-password">
                    Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="login-password"
                      className="field-input"
                      type={showLoginPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      suppressHydrationWarning
                      style={{ paddingRight: "40px" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      <SvgIcon name={showLoginPassword ? "eye-off" : "eye"} size={18} />
                    </button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.4rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--text-secondary)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        style={{ accentColor: "var(--accent-primary)", cursor: "pointer" }}
                      />
                      Keep me signed in
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotMessage("");
                        setIsForgotOpen(true);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-primary)",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        fontWeight: 500,
                        padding: 0
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                <button type="submit" className="primary-btn" disabled={loginLoading}>
                  {loginLoading ? (
                    <span className="spinner-dot" />
                  ) : (
                    <span className="btn-label">
                      Login <span className="btn-arrow">→</span>
                    </span>
                  )}
                </button>
              </form>

              <p className="switch-line">
                Don&apos;t have an account?{" "}
                <button type="button" className="switch-link" onClick={() => goTo("register")}>
                  Create account
                </button>
              </p>
            </div>
          </div>
        </div>

        {/* SCENE 2 — register form left, brand panel right (mirrored) */}
        <div className="scene">
          <div className="form-panel">
            <div className="form-shell">
              <h1 className="form-title">Welcome to Lumora!</h1>
              <p className="form-sub">Create your account and join the platform</p>

              {regError && <div className="form-error">{regError}</div>}

              <form onSubmit={handleRegisterSubmit} noValidate>
                <div className="field">
                  <label className="field-label">I am a</label>
                  <div className="role-toggle">
                    {(["student", "teacher"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`role-btn ${role === r ? "is-active" : ""}`}
                      >
                        {r === "student" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                            <Lottie animationData={studentAnimation} loop={role === r} autoplay={role === r} style={{ width: 24, height: 24 }} />
                            Student
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                            <Lottie animationData={teacherAnimation} loop={role === r} autoplay={role === r} style={{ width: 24, height: 24 }} />
                            Teacher
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="register-name">
                    Full Name
                  </label>
                  <input
                    id="register-name"
                    className="field-input"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                    suppressHydrationWarning
                  />
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="register-email">
                    Email Address
                  </label>
                  <input
                    id="register-email"
                    className="field-input"
                    type="email"
                    placeholder="john@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                    autoComplete="email"
                    suppressHydrationWarning
                  />
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="field-label" htmlFor="register-password">
                      Password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="register-password"
                        className="field-input"
                        type={showRegPassword ? "text" : "password"}
                        placeholder="Min 6 characters"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        suppressHydrationWarning
                        style={{ paddingRight: "40px" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        style={{
                          position: "absolute",
                          right: "10px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          display: "flex",
                          alignItems: "center"
                        }}
                      >
                        <SvgIcon name={showRegPassword ? "eye-off" : "eye"} size={18} />
                      </button>
                    </div>

                    {/* Live Password Strength Meter */}
                    {regPassword.length > 0 && (() => {
                      let score = 0;
                      const length = regPassword.length >= 6;
                      const number = /\d/.test(regPassword);
                      const upper = /[A-Z]/.test(regPassword) || /[^a-zA-Z0-9]/.test(regPassword);
                      if (length) score += 1;
                      if (number) score += 1;
                      if (upper) score += 1;

                      let label = "Weak";
                      let color = "#ef4444";
                      if (score === 2) { label = "Medium"; color = "#f59e0b"; }
                      else if (score >= 3) { label = "Strong"; color = "#10b981"; }

                      return (
                        <div style={{ marginTop: "0.35rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", marginBottom: "0.2rem" }}>
                            <span style={{ color: "var(--text-muted)" }}>Strength:</span>
                            <span style={{ fontWeight: 600, color }}>{label}</span>
                          </div>
                          <div style={{ display: "flex", gap: "4px", height: "4px", borderRadius: "2px", overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
                            <div style={{ flex: 1, background: score >= 1 ? color : "transparent", transition: "all 0.3s" }} />
                            <div style={{ flex: 1, background: score >= 2 ? color : "transparent", transition: "all 0.3s" }} />
                            <div style={{ flex: 1, background: score >= 3 ? color : "transparent", transition: "all 0.3s" }} />
                          </div>
                          <div style={{ display: "flex", gap: "0.6rem", fontSize: "0.68rem", marginTop: "0.25rem", color: "var(--text-muted)" }}>
                            <span style={{ color: length ? "#10b981" : "inherit" }}>{length ? "✓" : "○"} 6+ chars</span>
                            <span style={{ color: number ? "#10b981" : "inherit" }}>{number ? "✓" : "○"} Number</span>
                            <span style={{ color: upper ? "#10b981" : "inherit" }}>{upper ? "✓" : "○"} Capital/Symbol</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="register-confirm">
                      Confirm Password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="register-confirm"
                        className="field-input"
                        type={showRegConfirmPassword ? "text" : "password"}
                        placeholder="Repeat your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        suppressHydrationWarning
                        style={{ paddingRight: "40px" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                        style={{
                          position: "absolute",
                          right: "10px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          display: "flex",
                          alignItems: "center"
                        }}
                      >
                        <SvgIcon name={showRegConfirmPassword ? "eye-off" : "eye"} size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                <button type="submit" className="primary-btn" disabled={regLoading}>
                  {regLoading ? (
                    <span className="spinner-dot" />
                  ) : (
                    <span className="btn-label">
                      Create Account <span className="btn-arrow">→</span>
                    </span>
                  )}
                </button>
              </form>

              <p className="switch-line">
                Already have an account?{" "}
                <button type="button" className="switch-link" onClick={() => goTo("login")}>
                  Sign in
                </button>
              </p>
            </div>
          </div>
          <BrandPanel mode="register" />
        </div>
      </div>

      <Modal isOpen={isForgotOpen} onClose={() => !forgotLoading && setIsForgotOpen(false)} title="Reset Password">
        <div style={{ marginBottom: "1rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Enter your registered email address and an optional note. If your account exists, a reset request will be sent to the administrator.
        </div>
        <form onSubmit={handleForgotSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Email Address</label>
            <input 
              type="email" 
              className="field-input" 
              value={forgotEmail} 
              onChange={e => setForgotEmail(e.target.value)} 
              required 
              disabled={forgotLoading}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-secondary)" }}>Reason / Note (Optional)</label>
            <textarea 
              className="field-input" 
              rows={2} 
              value={forgotReason} 
              onChange={e => setForgotReason(e.target.value)}
              placeholder="e.g. Lost access to my old device"
              disabled={forgotLoading}
              style={{ minHeight: "80px", resize: "none", padding: "0.75rem" }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            <button type="button" className="btn-secondary" style={{ padding: "0.5rem 1rem" }} onClick={() => setIsForgotOpen(false)} disabled={forgotLoading}>Close</button>
            <button type="submit" className="primary-btn" style={{ padding: "0.5rem 1rem", width: "auto" }} disabled={forgotLoading}>
              {forgotLoading ? "Sending..." : "Submit Request"}
            </button>
          </div>
        </form>
      </Modal>

      <style jsx>{`
        .auth-outer {
          position: relative;
          width: 100%;
          height: 100vh;
          overflow: hidden;
          background: #f8fafc;
        }

        .auth-track {
          display: flex;
          width: 200%;
          height: 100%;
          transform: translateX(0%);
          transition: transform 0.5s ease-in-out;
        }
        .auth-track.is-register {
          transform: translateX(-50%);
        }

        .scene {
          display: flex;
          width: 50%;
          height: 100%;
          flex-shrink: 0;
        }

        .form-panel {
          width: 50%;
          height: 100%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          padding: 2rem;
          overflow-y: auto;
        }

        .form-shell {
          width: 100%;
          max-width: 400px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
          padding: 2.25rem;
        }

        .form-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 0.4rem;
        }

        .form-sub {
          font-size: 0.9rem;
          color: #64748b;
          margin: 0 0 1.5rem;
        }

        .form-error {
          background: #fef2f2;
          border-left: 4px solid #ef4444;
          border-radius: 6px;
          padding: 0.8rem 1rem;
          margin-bottom: 1.25rem;
          color: #991b1b;
          font-size: 0.85rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .form-error::before {
          content: "\\26A0";
          font-size: 1rem;
          font-style: normal;
        }

        .field {
          margin-bottom: 1.15rem;
          flex: 1;
        }

        .field-row {
          display: flex;
          gap: 0.75rem;
        }

        .field-label {
          display: block;
          font-size: 0.85rem;
          font-weight: 500;
          color: #475569;
          margin-bottom: 0.4rem;
        }

        .field-input {
          width: 100%;
          box-sizing: border-box;
          padding: 0.65rem 0.85rem;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 0.9rem;
          color: #0f172a;
          background: #ffffff;
          outline: none;
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }
        .field-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
        .field-input::placeholder {
          color: #94a3b8;
        }

        .role-toggle {
          display: flex;
          gap: 0.6rem;
        }
        .role-btn {
          flex: 1;
          padding: 0.6rem;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #64748b;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 150ms ease;
        }
        .role-btn.is-active {
          border: 2px solid #2563eb;
          background: rgba(37, 99, 235, 0.08);
          color: #2563eb;
        }

        .primary-btn {
          width: 100%;
          height: 48px;
          border-radius: 12px;
          border: none;
          background: #2563eb;
          color: #ffffff;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          margin-top: 0.35rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 150ms ease, box-shadow 150ms ease, transform 150ms ease;
          box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.39);
        }
        .primary-btn:hover:not(:disabled) {
          background: #1d4ed8;
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.23);
          transform: translateY(-1px);
        }
        .primary-btn:disabled {
          opacity: 0.7;
          cursor: default;
        }

        .btn-label {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
        }
        .btn-arrow {
          display: inline-block;
          transition: transform 150ms ease;
        }
        .primary-btn:hover:not(:disabled) .btn-arrow {
          transform: translateX(4px);
        }

        .spinner-dot {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.4);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .switch-line {
          text-align: center;
          margin: 1.5rem 0 0;
          font-size: 0.85rem;
          color: #64748b;
        }
        .switch-link {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          color: #2563eb;
          font-weight: 600;
          cursor: pointer;
        }
        .switch-link:hover {
          text-decoration: underline;
        }

        @media (max-width: 900px) {
          .scene {
            flex-direction: column;
            overflow-y: auto;
          }
          .form-panel {
            width: 100%;
            padding: 1.5rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .auth-track {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}

function BrandPanel({ mode }: { mode: Mode }) {
  const heading =
    mode === "login" ? "Illuminate your learning journey." : "Start your journey with clarity.";

  return (
    <div className="brand-panel">
      <div className="brand-gradient" />
      <div className="brand-particles" aria-hidden="true">
        <span className="p p1" />
        <span className="p p2" />
        <span className="p p3" />
        <span className="p p4" />
        <span className="p p5" />
      </div>

      <div className="brand-content">
        <div className="brand-logo">
          <Image src={lumoraLogo} alt="Lumora Logo" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "10px" }} />
        </div>
        <h2 className="brand-heading">{heading}</h2>
        <p className="brand-desc">AI powered smarter education.</p>
      </div>

      <style jsx>{`
        .brand-panel {
          position: relative;
          width: 50%;
          height: 100%;
          flex-shrink: 0;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .brand-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #1e40af, #2563eb, #60a5fa, #f8fafc);
          background-size: 400% 400%;
          animation: gradientShift 25s ease infinite;
        }
        @keyframes gradientShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .brand-particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .p {
          position: absolute;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.5);
          filter: blur(6px);
          opacity: 0.35;
        }
        .p1 {
          width: 90px;
          height: 90px;
          left: 12%;
          top: 20%;
          animation: floatA 18s ease-in-out infinite;
        }
        .p2 {
          width: 60px;
          height: 60px;
          left: 70%;
          top: 15%;
          animation: floatB 20s ease-in-out infinite;
        }
        .p3 {
          width: 130px;
          height: 130px;
          left: 60%;
          top: 60%;
          animation: floatA 22s ease-in-out infinite;
        }
        .p4 {
          width: 45px;
          height: 45px;
          left: 20%;
          top: 70%;
          animation: floatB 16s ease-in-out infinite;
        }
        .p5 {
          width: 75px;
          height: 75px;
          left: 40%;
          top: 40%;
          animation: floatA 19s ease-in-out infinite;
        }
        @keyframes floatA {
          0%, 100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(18px, -22px);
          }
        }
        @keyframes floatB {
          0%, 100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(-16px, 20px);
          }
        }

        .brand-content {
          position: relative;
          z-index: 1;
          max-width: 380px;
          padding: 2rem;
          text-align: left;
          color: #ffffff;
        }

        .brand-logo {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: transparent;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
          animation: logoIn 600ms ease-out both;
          transition: transform 0.3s ease, filter 0.3s ease;
          cursor: pointer;
        }
        .brand-logo:hover {
          transform: scale(1.05);
          filter: drop-shadow(0 4px 12px rgba(255, 255, 255, 0.15));
        }
        @keyframes logoIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .brand-heading {
          font-size: 1.9rem;
          font-weight: 700;
          line-height: 1.3;
          margin: 0 0 0.85rem;
          animation: slideUp 500ms ease-out 200ms both;
        }

        .brand-desc {
          font-size: 0.95rem;
          color: rgba(255, 255, 255, 0.85);
          margin: 0 0 1.5rem;
          animation: fadeIn 500ms ease-out 400ms both;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .ai-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(239, 246, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: #eff6ff;
          font-size: 0.78rem;
          font-weight: 600;
          padding: 0.4rem 0.75rem;
          border-radius: 999px;
          animation: fadeIn 500ms ease-out 550ms both;
        }

        @media (max-width: 900px) {
          .brand-panel {
            width: 100%;
            min-height: 220px;
          }
          .brand-content {
            padding: 1.5rem;
          }
          .brand-heading {
            font-size: 1.4rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .brand-gradient,
          .p,
          .brand-logo,
          .brand-heading,
          .brand-desc,
          .ai-badge {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
