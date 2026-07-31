"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import SvgIcon from "@/components/SvgIcon";
import api, { ConversationSummary, DirectMessageResponse } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const getAvatarGradient = (name: string) => {
  if (!name) return "linear-gradient(135deg, #e2e8f0, #cbd5e1)";
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradients = [
    "linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)",
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f6d365 0%, #fda085 100%)"
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
  const [hoveredConversation, setHoveredConversation] = useState<string | null>(null);
  
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

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeConversation || submitting) return;
    
    const content = newMessage.trim();
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

  if (loading) {
    return (
      <div style={{ display: "flex", height: "50vh", alignItems: "center", justifyContent: "center" }}>
        <SvgIcon name="refresh" className="spin" size={32} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", paddingBottom: "1rem" }}>
      {/* Standard SaaS Page Header */}
      <div className="page-header" style={{ marginBottom: "1.5rem" }}>
        <h1>Inbox</h1>
        <p>Direct messaging with your students</p>
      </div>

      {/* Standard Card Container */}
      <div className="card" style={{ 
        flex: 1, 
        display: "flex", 
        overflow: "hidden", 
        padding: 0,
        backgroundColor: "var(--bg-primary)",
        border: "1px solid var(--border-color)",
      }}>
        
        {/* Left Sidebar: Conversations List */}
        <div style={{ 
          width: "320px", 
          borderRight: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#F8FAFC"
        }}>
          {/* Header */}
          <div style={{ 
            padding: "1.25rem", 
            borderBottom: "1px solid var(--border-color)",
            backgroundColor: "#F8FAFC"
          }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Active Conversations</h2>
          </div>
          
          <div style={{ flex: 1, overflowY: "auto" }}>
            {conversations.length === 0 ? (
              <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                <SvgIcon name="message-circle" size={32} style={{ opacity: 0.3, marginBottom: "1rem" }} />
                <p style={{ fontSize: "0.95rem" }}>No active conversations yet.</p>
              </div>
            ) : (
              conversations.map(conv => {
                const key = `${conv.course_id}-${conv.other_user_id}`;
                const isActive = activeConversation?.course_id === conv.course_id && activeConversation?.other_user_id === conv.other_user_id;
                const isHovered = hoveredConversation === key;
                
                return (
                  <div 
                    key={key}
                    onClick={() => setActiveConversation(conv)}
                    onMouseEnter={() => setHoveredConversation(key)}
                    onMouseLeave={() => setHoveredConversation(null)}
                    style={{
                      padding: "1rem 1.25rem",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border-color)",
                      backgroundColor: isActive ? "white" : (isHovered ? "white" : "transparent"),
                      boxShadow: (isActive || isHovered) ? "0 2px 4px rgba(0,0,0,0.02)" : "none",
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
                      fontSize: "1.1rem",
                      flexShrink: 0
                    }}>
                      {conv.other_user_name.charAt(0)}
                    </div>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.2rem" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {conv.other_user_name}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", flexShrink: 0, marginLeft: "0.5rem" }}>
                          {formatTime(conv.last_message_at)}
                        </div>
                      </div>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ 
                          fontSize: "0.85rem", 
                          color: conv.unread_count > 0 ? "var(--text-primary)" : "var(--text-secondary)", 
                          fontWeight: conv.unread_count > 0 ? 700 : 400,
                          whiteSpace: "nowrap", 
                          overflow: "hidden", 
                          textOverflow: "ellipsis",
                          flex: 1
                        }}>
                          {conv.last_message || `Student in ${conv.course_title}`}
                        </div>
                        {conv.unread_count > 0 && (
                          <div style={{ 
                            backgroundColor: "var(--accent-primary)", 
                            color: "white", 
                            fontSize: "0.7rem", 
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "10px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginLeft: "0.5rem"
                          }}>
                            {conv.unread_count}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "var(--bg-primary)" }}>
          {activeConversation ? (
            <>
              {/* Solid Chat Header */}
              <div style={{ 
                padding: "1rem 1.5rem", 
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                backgroundColor: "var(--bg-primary)"
              }}>
                <div style={{ position: "relative" }}>
                  <div style={{ 
                    width: "40px", 
                    height: "40px", 
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
                  <div style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: "12px",
                    height: "12px",
                    backgroundColor: "#10b981", // Green online indicator
                    border: "2px solid white",
                    borderRadius: "50%"
                  }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {activeConversation.other_user_name}
                  </h3>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Student in {activeConversation.course_title}
                  </div>
                </div>
              </div>

              {/* Chat Messages Area */}
              <div style={{ 
                flex: 1, 
                overflowY: "auto", 
                padding: "1.5rem", 
                display: "flex", 
                flexDirection: "column", 
                gap: "0.75rem",
                backgroundColor: "#F8FAFC"
              }}>
                <div style={{ textAlign: "center", margin: "1rem 0 2rem 0", color: "var(--text-muted)", fontSize: "0.8rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border-color)", opacity: 0.5, margin: "0 1rem" }} />
                  <span>Start of conversation with {activeConversation.other_user_name}</span>
                  <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border-color)", opacity: 0.5, margin: "0 1rem" }} />
                </div>
                
                {loadingMessages ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
                    <SvgIcon name="refresh" className="spin" size={24} style={{ color: "var(--accent-primary)" }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", opacity: 0.8 }}>
                    <SvgIcon name="message-circle" size={48} style={{ opacity: 0.3, marginBottom: "1rem" }} />
                    <p style={{ margin: 0, fontSize: "0.95rem" }}>Start the conversation with {activeConversation.other_user_name}</p>
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
                        marginTop: isFirstInGroup ? "0.5rem" : "0" // Spacing between groups
                      }}>
                        {isFirstInGroup && !isMe && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem", marginLeft: "0.25rem" }}>
                            {msg.sender_name}
                          </div>
                        )}
                        <div style={{
                          backgroundColor: isMe ? "var(--accent-primary)" : "#E2E8F0",
                          color: isMe ? "white" : "var(--text-primary)",
                          padding: "0.75rem 1rem",
                          borderRadius: isMe ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                          fontSize: "0.95rem",
                          lineHeight: 1.5,
                          border: "none",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                        }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                        <div style={{ 
                          fontSize: "0.7rem", 
                          color: "var(--text-muted)", 
                          marginTop: "0.25rem"
                        }}>
                          {formatTime(msg.created_at)}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Standard Compose Bar */}
              <div style={{ 
                padding: "1rem 1.5rem", 
                borderTop: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-primary)",
                display: "flex",
                alignItems: "flex-end",
                gap: "1rem"
              }}>
                <div style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "flex-end",
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "0.5rem",
                  gap: "0.5rem"
                }}>
                  <div style={{ display: "flex", gap: "0.5rem", padding: "0.5rem 0.25rem", color: "var(--text-muted)", cursor: "pointer" }}>
                    <button style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "0 0.25rem" }} title="Attach file">
                      <SvgIcon name="file-text" size={18} />
                    </button>
                    <button style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "0 0.25rem" }} title="Upload image">
                      <SvgIcon name="image" size={18} />
                    </button>
                  </div>
                  
                  <textarea
                    ref={textareaRef}
                    placeholder="Type your message..."
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
                      padding: "0.5rem",
                      border: "none",
                      backgroundColor: "transparent",
                      color: "var(--text-primary)",
                      fontFamily: "inherit",
                      fontSize: "0.95rem",
                      minHeight: "44px",
                      maxHeight: "150px",
                      outline: "none"
                    }}
                    rows={1}
                  />
                  
                  {/* Send Button */}
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || submitting}
                    className="btn-primary"
                    style={{
                      width: "40px",
                      height: "40px",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      borderRadius: "8px",
                      alignSelf: "flex-end",
                      marginBottom: "0.15rem"
                    }}
                  >
                    {submitting ? (
                      <SvgIcon name="refresh" className="spin" size={16} />
                    ) : (
                      <SvgIcon name="send" size={16} />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", flexDirection: "column" }}>
              <SvgIcon name="message-circle" size={48} style={{ opacity: 0.3, marginBottom: "1rem" }} />
              <p style={{ fontSize: "1.05rem" }}>Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeacherInboxPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading Inbox...</div>}>
      <InboxPageContent />
    </Suspense>
  );
}
