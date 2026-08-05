"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import SvgIcon from "@/components/SvgIcon";
import api, { ConversationSummary, DirectMessageResponse } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from "next/link";

const getAvatarGradient = (name: string) => {
  if (!name) return "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)";
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradients = [
    "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    "linear-gradient(135deg, #ec4899 0%, #d946ef 100%)",
    "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
  ];
  return gradients[hash % gradients.length];
};

const formatTime = (isoString: string) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
};

function AdminMessagesContent() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  
  const targetTeacherId = searchParams.get("teacher_id");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<DirectMessageResponse[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (activeConversation) {
      fetchMessages(activeConversation.course_id, activeConversation.other_user_id);
    }
  }, [activeConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const data = await api.getConversations();
      setConversations(data);
      
      if (targetTeacherId) {
        const tId = parseInt(targetTeacherId, 10);
        let targetConv = data.find(c => c.other_user_id === tId);
        
        if (!targetConv) {
          targetConv = {
            course_id: 0,
            course_title: "Teacher Direct Chat",
            other_user_id: tId,
            other_user_name: "Teacher",
            last_message: "No messages yet",
            last_message_at: new Date().toISOString(),
            unread_count: 0
          };
          setConversations(prev => [targetConv!, ...prev]);
        }
        setActiveConversation(targetConv);
      } else if (data.length > 0 && !activeConversation) {
        setActiveConversation(data[0]);
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to load conversations.", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (courseId: number, otherUserId: number) => {
    try {
      setLoadingMessages(true);
      const data = await api.getMessageThread(courseId, otherUserId);
      setMessages(data);
      setConversations(prev => prev.map(c => 
        (c.course_id === courseId && c.other_user_id === otherUserId) 
          ? { ...c, unread_count: 0 } 
          : c
      ));
    } catch (err) {
      console.error(err);
      addToast("Failed to load message thread.", "error");
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeConversation || !newMessage.trim() || submitting) return;

    const content = newMessage.trim();
    setNewMessage("");
    setSubmitting(true);

    const tempMsg: DirectMessageResponse = {
      id: Date.now(),
      sender_id: user?.id || 0,
      receiver_id: activeConversation.other_user_id,
      course_id: activeConversation.course_id,
      content: content,
      is_read: false,
      created_at: new Date().toISOString(),
      sender_name: user?.full_name || "Admin",
      receiver_name: activeConversation.other_user_name,
      course_title: activeConversation.course_title
    };

    setMessages(prev => [...prev, tempMsg]);

    try {
      const sent = await api.sendDirectMessage({
        course_id: activeConversation.course_id || 0,
        receiver_id: activeConversation.other_user_id,
        content: content
      });

      setMessages(prev => prev.map(m => m.id === tempMsg.id ? sent : m));
      
      setConversations(prev => prev.map(c => {
        if (c.course_id === activeConversation.course_id && c.other_user_id === activeConversation.other_user_id) {
          return {
            ...c,
            last_message: content,
            last_message_at: sent.created_at
          };
        }
        return c;
      }));

    } catch (err: any) {
      console.error(err);
      addToast(err.message || "Failed to send message.", "error");
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
    } finally {
      setSubmitting(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const filteredConversations = conversations.filter(c => {
    return c.other_user_name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div style={{ display: "flex", height: "calc(100vh - 120px)", gap: "1rem", overflow: "hidden" }}>
      {/* Sidebar List */}
      <div style={{
        width: "340px",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0
      }}>
        {/* Header & Search */}
        <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <SvgIcon name="mail" size={20} style={{ color: "var(--accent-primary)" }} /> Teacher Direct Chat
            </h2>
            <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: "12px", background: "rgba(99, 102, 241, 0.1)", color: "var(--accent-primary)", fontWeight: 600 }}>
              {conversations.length} Teachers
            </span>
          </div>

          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search teacher by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field"
              style={{ width: "100%", paddingLeft: "2.25rem", fontSize: "0.85rem", height: "36px" }}
            />
            <SvgIcon name="search" size={14} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          </div>
        </div>

        {/* Conversations List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
              <div className="spinner" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>
              No teacher conversations found.
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = activeConversation?.other_user_id === c.other_user_id;

              return (
                <div
                  key={`${c.course_id}-${c.other_user_id}`}
                  onClick={() => setActiveConversation(c)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    background: isSelected ? "rgba(99, 102, 241, 0.1)" : "transparent",
                    borderLeft: isSelected ? "4px solid var(--accent-primary)" : "4px solid transparent",
                    transition: "all 0.15s ease",
                    marginBottom: "4px"
                  }}
                >
                  <div style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: getAvatarGradient(c.other_user_name),
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    flexShrink: 0,
                    boxShadow: "var(--shadow-sm)"
                  }}>
                    {c.other_user_name.charAt(0).toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.2rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.other_user_name}
                      </span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", flexShrink: 0 }}>
                        {formatTime(c.last_message_at)}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <p style={{
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                        margin: 0,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "180px"
                      }}>
                        {c.last_message}
                      </p>
                      {c.unread_count > 0 && (
                        <span style={{
                          background: "#ef4444",
                          color: "white",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "10px",
                          lineHeight: 1
                        }}>
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Thread Area */}
      <div style={{
        flex: 1,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}>
        {activeConversation ? (
          <>
            {/* Header */}
            <div style={{
              padding: "1rem 1.25rem",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--bg-body)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "50%",
                  background: getAvatarGradient(activeConversation.other_user_name),
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "1rem",
                  boxShadow: "var(--shadow-sm)"
                }}>
                  {activeConversation.other_user_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    {activeConversation.other_user_name}
                  </h3>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <SvgIcon name="check-circle" size={13} style={{ color: "#10b981" }} /> Registered Teacher &bull; Direct Admin Channel
                  </span>
                </div>
              </div>

              <Link
                href={`/dashboard/admin/teachers`}
                className="btn-secondary"
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <SvgIcon name="users" size={14} /> View Teacher Profile
              </Link>
            </div>

            {/* Messages View */}
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              background: "var(--bg-body)"
            }}>
              {loadingMessages ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
                  <div className="spinner" />
                </div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: "center", margin: "auto", color: "var(--text-muted)" }}>
                  <SvgIcon name="mail" size={40} style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }} />
                  <p style={{ margin: 0, fontSize: "0.95rem" }}>No messages yet in this conversation.</p>
                  <p style={{ fontSize: "0.82rem", opacity: 0.8 }}>Type a message below to start chatting with {activeConversation.other_user_name}.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.sender_id === user?.id;

                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isMe ? "flex-end" : "flex-start"
                      }}
                    >
                      <div style={{
                        maxWidth: "75%",
                        padding: "0.85rem 1.1rem",
                        borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        background: isMe ? "linear-gradient(135deg, var(--accent-primary, #6366f1), #8b5cf6)" : "var(--bg-card)",
                        color: isMe ? "white" : "var(--text-primary)",
                        border: isMe ? "none" : "1px solid var(--border)",
                        boxShadow: "var(--shadow-sm)",
                        fontSize: "0.92rem",
                        lineHeight: 1.5
                      }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>

                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.25rem", padding: "0 0.2rem" }}>
                        {formatTime(m.created_at)}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSendMessage} style={{ padding: "1rem", borderTop: "1px solid var(--border)", background: "var(--bg-card)", display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
              <textarea
                ref={textareaRef}
                className="input-field"
                placeholder={`Message ${activeConversation.other_user_name}... (Press Enter to send)`}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                style={{ flex: 1, resize: "none", fontSize: "0.9rem", padding: "0.75rem 0.9rem" }}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={!newMessage.trim() || submitting}
                style={{ height: "42px", padding: "0 1.25rem", display: "flex", alignItems: "center", gap: "0.5rem", borderRadius: "var(--radius-md)" }}
              >
                <SvgIcon name="send" size={16} /> Send
              </button>
            </form>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
            <SvgIcon name="mail" size={48} style={{ color: "var(--accent-primary)", marginBottom: "1rem", opacity: 0.5 }} />
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--text-primary)" }}>Direct Teacher Communication</h3>
            <p style={{ fontSize: "0.9rem", maxWidth: "360px", textAlign: "center", margin: 0 }}>Select a teacher from the left sidebar to start messaging or view conversation history.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <Suspense fallback={<div className="page-loader"><div className="spinner" /></div>}>
      <AdminMessagesContent />
    </Suspense>
  );
}
