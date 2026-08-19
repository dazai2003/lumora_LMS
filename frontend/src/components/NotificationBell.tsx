"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { SvgIcon } from "@/components/SvgIcon";

import api, { Notification } from "@/lib/api";

export default function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const data = await api.getNotifications();
      setNotifications(data || []);
    } catch (err) {
      setNotifications([]);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.is_read) {
      await handleMarkRead(n.id);
    }
    setIsOpen(false);
    
    const role = user?.role;
    
    // Routing Logic based on type
    if (n.type === "message") {
      if (role === "teacher") {
        router.push(n.sender_id && n.related_entity_id ? `/dashboard/teacher/inbox?student_id=${n.sender_id}&course_id=${n.related_entity_id}` : "/dashboard/teacher/inbox");
      } else {
        router.push("/dashboard/student/ask-teacher");
      }
    } else if (n.type === "course") {
      if (role === "student") {
        if (n.title.toLowerCase().includes("material")) {
          router.push(n.related_entity_id ? `/dashboard/student/courses/${n.related_entity_id}` : "/dashboard/student/browse");
        } else {
          router.push("/dashboard/student/assessments");
        }
      } else {
        // Teacher course notifications (e.g. A/L exam grading needed)
        router.push("/dashboard/teacher/al-exams/marking");
      }
    } else if (n.type === "reminder") {
      if (role === "student") {
        router.push(n.related_entity_id ? `/dashboard/student/courses/${n.related_entity_id}` : "/dashboard/student");
      }
    } else if (n.type === "system") {
      if (role === "teacher") {
        if (n.title.toLowerCase().includes("material")) {
          router.push("/dashboard/teacher/insights");
        } else {
          router.push("/dashboard/teacher/qa");
        }
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true }))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case "course": return <SvgIcon name="book" size={18} />;
      case "reminder": return <SvgIcon name="alert-triangle" size={18} />;
      case "message": return <SvgIcon name="message-circle" size={18} />;
      default: return <SvgIcon name="bell" size={18} />;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case "course": return "#2563EB";
      case "reminder": return "#F59E0B";
      case "message": return "#8B5CF6";
      default: return "#64748B";
    }
  };

  return (
    <div style={{ position: "relative" }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        style={{
          background: isOpen ? "#F1F5F9" : "transparent",
          border: "1px solid transparent",
          width: "40px",
          height: "40px",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          position: "relative",
          transition: "all 0.15s ease",
          color: "#64748B",
        }}
      >
        <SvgIcon name="bell" size={20} />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute",
            top: "4px",
            right: "4px",
            background: "#EF4444",
            color: "white",
            fontSize: "0.6rem",
            fontWeight: 700,
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #FFFFFF",
            lineHeight: 1,
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: "380px",
          maxHeight: "480px",
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 10px 25px rgba(15, 23, 42, 0.1)",
          display: "flex",
          flexDirection: "column",
          zIndex: 100,
          overflow: "hidden",
          animation: "fadeIn 0.15s ease-out",
        }}>
          {/* Header */}
          <div style={{
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "#0F172A" }}>
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: "none",
                  border: "none",
                  color: "#2563EB",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  fontWeight: 500,
                  padding: "0.25rem 0.5rem",
                  borderRadius: "var(--radius-sm)",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: "3rem 2rem",
                textAlign: "center",
                color: "#94A3B8",
                fontSize: "0.9rem",
              }}>
                <div style={{ marginBottom: "0.5rem", opacity: 0.5 }}>
                  <SvgIcon name="bell" size={32} />
                </div>
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: "0.875rem 1.25rem",
                    borderBottom: "1px solid #F1F5F9",
                    background: n.is_read ? "transparent" : "#F8FAFC",
                    display: "flex",
                    gap: "0.75rem",
                    cursor: n.is_read ? "default" : "pointer",
                    transition: "background 0.15s ease",
                    alignItems: "flex-start",
                  }}
                  onClick={() => handleNotificationClick(n)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F1F5F9"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = n.is_read ? "transparent" : "#F8FAFC"; }}
                >
                  <div style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "var(--radius-sm)",
                    background: "#F1F5F9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: getIconColor(n.type),
                  }}>
                    {getIconForType(n.type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "0.85rem",
                      fontWeight: n.is_read ? 400 : 600,
                      color: "#0F172A",
                      marginBottom: "0.15rem",
                      lineHeight: 1.4,
                    }}>
                      {n.title}
                    </div>
                    <div style={{
                      fontSize: "0.8rem",
                      color: "#64748B",
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}>
                      {n.message}
                    </div>
                    <div style={{
                      fontSize: "0.7rem",
                      color: "#94A3B8",
                      marginTop: "0.35rem",
                    }}>
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                  {!n.is_read && (
                    <div style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#2563EB",
                      alignSelf: "center",
                      flexShrink: 0,
                    }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
