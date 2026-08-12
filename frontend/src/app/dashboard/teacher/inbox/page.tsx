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

function InboxPageContent() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  
  const targetStudentId = searchParams.get("student_id");
  const targetCourseId = searchParams.get("course_id");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<DirectMessageResponse[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [tabFilter, setTabFilter] = useState<"all" | "students" | "admin">("all");
  
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
      
      if (targetStudentId && targetCourseId) {
        const sId = parseInt(targetStudentId, 10);
        const cId = parseInt(targetCourseId, 10);
        
        let targetConv = data.find(c => c.course_id === cId && c.other_user_id === sId);
        
        if (!targetConv) {
          targetConv = {
            course_id: cId,
            other_user_id: sId,
            other_user_name: searchParams.get("student_name") || "Student",
            course_title: searchParams.get("course_title") || "Course",
            last_message: "Start a new conversation",
            last_message_at: new Date().toISOString(),
            unread_count: 0
          };
          setConversations(prev => [targetConv!, ...prev]);
        }
        setActiveConversation(targetConv);
      } else if (data.length > 0) {
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
      addToast("Failed to load messages.", "error");
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend || newMessage).trim();
    if (!content || !activeConversation || submitting) return;
    
    setNewMessage("");
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    const tempMsg: DirectMessageResponse = {
      id: Date.now(),
      sender_id: user!.id,
      receiver_id: activeConversation.other_user_id,
      course_id: activeConversation.course_id,
      content: content,
      is_read: false,
      created_at: new Date().toISOString(),
      sender_name: user!.full_name,
      receiver_name: activeConversation.other_user_name,
      course_title: activeConversation.course_title
    };
    
    setMessages(prev => [...prev, tempMsg]);
    
    try {
      setSubmitting(true);
      const res = await api.sendDirectMessage(
        activeConversation.course_id,
        activeConversation.other_user_id,
        content,
        "Message"
      );
      
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? res : m));
      
      setConversations(prev => prev.map(c => {
        if (c.course_id === activeConversation.course_id && c.other_user_id === activeConversation.other_user_id) {
          return {
            ...c,
            last_message: content,
            last_message_at: new Date().toISOString()
          };
        }
        return c;
      }));
    } catch (err) {
      console.error(err);
      addToast("Failed to send message.", "error");
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      setNewMessage(content);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Derived Statistics
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  const uniqueCourses = Array.from(new Set(conversations.map(c => c.course_title))).sort();

  const filteredConversations = conversations.filter(c => {
    const matchesSearch = c.other_user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.course_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (c.last_message || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCourse = courseFilter === "all" || c.course_title === courseFilter;
    const matchesTab = tabFilter === "all" ? true : (tabFilter === "admin" ? (c.course_id === 0 || c.course_title === "System Admin Support") : (c.course_id > 0 && c.course_title !== "System Admin Support"));
    return matchesSearch && matchesCourse && matchesTab;
  });

  if (loading) {
    return (
      <div className="page-loader" style={{ minHeight: "60vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", height: "calc(100vh - 110px)", paddingBottom: "0.5rem" }}>
      {/* Header & Metrics */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Messages & Support Inbox</h1>
          <p>Direct communication channel with your students and system administrators</p>
        </div>

        {/* Quick Stat Badges */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div className="card" style={{ padding: "0.6rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ padding: "0.4rem", borderRadius: "8px", background: "rgba(99, 102, 241, 0.15)", color: "var(--accent-primary)" }}>
              <SvgIcon name="graduation" size={18} />
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: "1.1rem" }}>{conversations.length}</div>
              <div className="stat-label" style={{ fontSize: "0.7rem" }}>Active Students</div>
            </div>
          </div>

          <div className="card" style={{ padding: "0.6rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ padding: "0.4rem", borderRadius: "8px", background: totalUnread > 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)", color: totalUnread > 0 ? "#ef4444" : "#10b981" }}>
              <SvgIcon name="bell" size={18} />
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: "1.1rem", color: totalUnread > 0 ? "#ef4444" : "var(--text-primary)" }}>{totalUnread}</div>
              <div className="stat-label" style={{ fontSize: "0.7rem" }}>Unread</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Glassmorphic Container */}
      <div className="card" style={{ 
        flex: 1, 
        display: "flex", 
        overflow: "hidden", 
        padding: 0,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-md)"
      }}>
        
        {/* Left Sidebar: Conversations List */}
        <div style={{ 
          width: "320px", 
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-body)",
          flexShrink: 0
        }}>
          {/* Search & Filter Header */}
          <div style={{ 
            padding: "0.85rem", 
            borderBottom: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem"
          }}>
            {/* Category Filter Tabs */}
            <div style={{ display: "flex", gap: "0.25rem", padding: "0.25rem", background: "var(--bg-card)", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
              <button 
                onClick={() => setTabFilter("all")}
                style={{ flex: 1, padding: "0.35rem 0.4rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer", background: tabFilter === "all" ? "var(--accent-primary)" : "transparent", color: tabFilter === "all" ? "white" : "var(--text-secondary)", transition: "all 0.15s ease" }}
              >
                All
              </button>
              <button 
                onClick={() => setTabFilter("students")}
                style={{ flex: 1, padding: "0.35rem 0.4rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer", background: tabFilter === "students" ? "var(--accent-primary)" : "transparent", color: tabFilter === "students" ? "white" : "var(--text-secondary)", transition: "all 0.15s ease" }}
              >
                Students ({conversations.filter(c => c.course_id > 0 && c.course_title !== "System Admin Support").length})
              </button>
            </div>
            <div style={{ position: "relative" }}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Search student or message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "2.2rem", fontSize: "0.85rem" }}
              />
              <div style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
                <SvgIcon name="search" size={14} />
              </div>
            </div>

            {uniqueCourses.length > 0 && (
              <select 
                className="input-field" 
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
              >
                <option value="all">All Courses</option>
                {uniqueCourses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
          
          {/* Conversation List Items */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredConversations.length === 0 ? (
              <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                <SvgIcon name="users" size={32} style={{ opacity: 0.3, marginBottom: "0.75rem" }} />
                <p style={{ fontSize: "0.85rem", margin: 0 }}>No student conversations found.</p>
              </div>
            ) : (
              filteredConversations.map(conv => {
                const key = `${conv.course_id}-${conv.other_user_id}`;
                const isActive = activeConversation?.course_id === conv.course_id && activeConversation?.other_user_id === conv.other_user_id;
                
                return (
                  <div 
                    key={key}
                    onClick={() => setActiveConversation(conv)}
                    style={{
                      padding: "0.9rem 1rem",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border-subtle, var(--border))",
                      background: isActive ? "rgba(99, 102, 241, 0.12)" : "transparent",
                      borderLeft: isActive ? "4px solid var(--accent-primary)" : "4px solid transparent",
                      transition: "all 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem"
                    }}
                  >
                    <div style={{ 
                      width: "40px", 
                      height: "40px", 
                      borderRadius: "50%", 
                      background: getAvatarGradient(conv.other_user_name),
                      color: "white",
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "1.05rem",
                      flexShrink: 0,
                      boxShadow: "0 2px 5px rgba(0,0,0,0.15)"
                    }}>
                      {conv.other_user_name.charAt(0)}
                    </div>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.2rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", overflow: "hidden" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {conv.other_user_name}
                          </div>
                          {(conv.course_id === 0 || conv.course_title === "System Admin Support") && (
                            <span style={{ fontSize: "0.62rem", padding: "0.1rem 0.4rem", borderRadius: "4px", background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>
                              Admin
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", flexShrink: 0, marginLeft: "0.5rem" }}>
                          {formatTime(conv.last_message_at)}
                        </div>
                      </div>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ 
                          fontSize: "0.8rem", 
                          color: conv.unread_count > 0 ? "var(--text-primary)" : "var(--text-muted)", 
                          fontWeight: conv.unread_count > 0 ? 600 : 400,
                          whiteSpace: "nowrap", 
                          overflow: "hidden", 
                          textOverflow: "ellipsis",
                          flex: 1
                        }}>
                          {conv.last_message || `Student in ${conv.course_title}`}
                        </div>
                        {conv.unread_count > 0 && (
                          <div style={{ 
                            background: "#ef4444", 
                            color: "white", 
                            fontSize: "0.7rem", 
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "10px",
                            marginLeft: "0.5rem"
                          }}>
                            {conv.unread_count}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--accent-primary)", marginTop: "0.15rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {conv.course_title}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Thread */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-card)" }}>
          {activeConversation ? (
            <>
              {/* Active Header */}
              <div style={{ 
                padding: "0.9rem 1.25rem", 
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
                    fontSize: "1.1rem"
                  }}>
                    {activeConversation.other_user_name.charAt(0)}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {activeConversation.other_user_name}
                    </h3>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span className="badge badge-info" style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem" }}>Enrolled Student</span>
                      <span>•</span>
                      <span>{activeConversation.course_title}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat Messages Feed */}
              <div style={{ 
                flex: 1, 
                overflowY: "auto", 
                padding: "1.25rem", 
                display: "flex", 
                flexDirection: "column", 
                gap: "0.75rem",
                background: "var(--bg-card)"
              }}>
                <div style={{ textAlign: "center", margin: "0.5rem 0 1rem 0", color: "var(--text-muted)", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)", opacity: 0.5, margin: "0 1rem" }} />
                  <span>Discussion history with <strong>{activeConversation.other_user_name}</strong></span>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)", opacity: 0.5, margin: "0 1rem" }} />
                </div>
                
                {loadingMessages ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
                    <div className="spinner" />
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                    <SvgIcon name="message-circle" size={48} style={{ opacity: 0.3, marginBottom: "1rem" }} />
                    <p style={{ margin: 0, fontSize: "0.95rem" }}>Send a message to {activeConversation.other_user_name}</p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isMe = msg.sender_id === user?.id;
                    const prevMsg = messages[index - 1];
                    const isFirstInGroup = index === 0 || prevMsg.sender_id !== msg.sender_id;
                    
                    return (
                      <div key={msg.id} style={{ 
                        alignSelf: isMe ? "flex-end" : "flex-start",
                        maxWidth: "75%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isMe ? "flex-end" : "flex-start",
                        marginTop: isFirstInGroup ? "0.5rem" : "0.15rem"
                      }}>
                        {isFirstInGroup && !isMe && (
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent-primary)", marginBottom: "0.25rem", marginLeft: "0.25rem" }}>
                            {msg.sender_name}
                          </div>
                        )}
                        <div style={{
                          background: isMe 
                            ? "linear-gradient(135deg, var(--accent-primary, #6366f1), #8b5cf6)" 
                            : "var(--bg-body)",
                          color: isMe ? "#ffffff" : "var(--text-primary)",
                          padding: "0.75rem 1.1rem",
                          borderRadius: isMe ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                          fontSize: "0.92rem",
                          lineHeight: 1.6,
                          border: isMe ? "none" : "1px solid var(--border)",
                          boxShadow: isMe ? "0 2px 8px rgba(99, 102, 241, 0.25)" : "0 1px 3px rgba(0,0,0,0.05)"
                        }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                        <div style={{ 
                          fontSize: "0.7rem", 
                          color: "var(--text-muted)", 
                          marginTop: "0.25rem",
                          padding: "0 0.2rem"
                        }}>
                          {formatTime(msg.created_at)}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Response Chips */}
              <div style={{ padding: "0.5rem 1.25rem 0 1.25rem", background: "var(--bg-body)", display: "flex", gap: "0.5rem", overflowX: "auto" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", alignSelf: "center", flexShrink: 0 }}>Quick replies:</span>
                {[
                  "Glad to help! Let me know if you have more questions.",
                  "Please review the material notes for lesson 2.",
                  "Great question! We will cover this in detail soon."
                ].map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(reply)}
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.25rem 0.6rem",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                      background: "var(--bg-card)",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent-primary)"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                  >
                    {reply.length > 35 ? reply.slice(0, 35) + "..." : reply}
                  </button>
                ))}
              </div>

              {/* Compose Bar */}
              <div style={{ 
                padding: "0.75rem 1.25rem 0.9rem 1.25rem", 
                borderTop: "1px solid var(--border)",
                background: "var(--bg-body)"
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "flex-end",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: "0.5rem 0.75rem",
                  gap: "0.75rem",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.04)"
                }}>
                  <textarea
                    ref={textareaRef}
                    placeholder={`Write a response to ${activeConversation.other_user_name}...`}
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
                    }}
                    onKeyDown={handleKeyDown}
                    style={{
                      flex: 1,
                      resize: "none",
                      padding: "0.4rem 0",
                      border: "none",
                      background: "transparent",
                      color: "var(--text-primary)",
                      fontFamily: "inherit",
                      fontSize: "0.92rem",
                      minHeight: "38px",
                      maxHeight: "150px",
                      outline: "none"
                    }}
                    rows={1}
                  />
                  
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!newMessage.trim() || submitting}
                    className="btn-primary"
                    style={{
                      padding: "0.5rem 1rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      flexShrink: 0
                    }}
                  >
                    {submitting ? (
                      <SvgIcon name="refresh" className="spin" size={16} />
                    ) : (
                      <>
                        <span>Reply</span>
                        <SvgIcon name="send" size={14} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", flexDirection: "column" }}>
              <SvgIcon name="message-circle" size={48} style={{ opacity: 0.3, marginBottom: "1rem" }} />
              <p style={{ fontSize: "1.05rem" }}>Select a student conversation to reply</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeacherInboxPage() {
  return (
    <Suspense fallback={<div className="page-loader" style={{ minHeight: "60vh" }}><div className="spinner" /></div>}>
      <InboxPageContent />
    </Suspense>
  );
}
