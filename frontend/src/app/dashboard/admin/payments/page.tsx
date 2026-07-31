"use client";

import { useEffect, useState, useMemo } from "react";
import api, { PaymentOverview, PaymentResponse } from "@/lib/api";
import { SvgIcon } from "@/components/SvgIcon";
import { useToast } from "@/components/ui/Toast";

type SortKey = "transaction_id" | "amount" | "paid_at";
type SortDir = "asc" | "desc";
const PAGE_SIZE = 10;

export default function AdminPaymentsPage() {
  const [overview, setOverview] = useState<PaymentOverview | null>(null);
  const [transactions, setTransactions] = useState<PaymentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  
  const [sortKey, setSortKey] = useState<SortKey>("paid_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const { addToast } = useToast();

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ovData, txData] = await Promise.all([
        api.getAdminPaymentOverview(),
        api.getAdminTransactions(statusFilter !== "all" ? statusFilter : undefined)
      ]);
      setOverview(ovData);
      setTransactions(txData);
    } catch (err) {
      console.error("Failed to load payment data", err);
      addToast("Failed to load payment data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, courseFilter, sortKey, sortDir]);

  const handleSendReminder = async (txnId: number) => {
    try {
      const res = await api.sendPaymentReminder(txnId);
      addToast(res.message, "success");
    } catch (err: any) {
      addToast(err.message || "Failed to send reminder", "error");
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const uniqueCourses = useMemo(() => {
    const courses = new Set(transactions.map(t => t.course_title));
    return Array.from(courses).filter(Boolean).sort();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter(t => {
      const matchesSearch = 
        (t.transaction_id || "").toLowerCase().includes(search.toLowerCase()) || 
        String(t.student_id).includes(search);
      const matchesCourse = courseFilter === "all" ? true : t.course_title === courseFilter;
      return matchesSearch && matchesCourse;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "transaction_id") {
        cmp = (a.transaction_id || "").localeCompare(b.transaction_id || "");
      } else if (sortKey === "amount") {
        cmp = a.amount - b.amount;
      } else if (sortKey === "paid_at") {
        const timeA = a.paid_at ? new Date(a.paid_at).getTime() : 0;
        const timeB = b.paid_at ? new Date(b.paid_at).getTime() : 0;
        cmp = timeA - timeB;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [transactions, search, courseFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const pagedTransactions = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, page]);

  const clearFilters = () => {
    setSearchInput("");
    setStatusFilter("all");
    setCourseFilter("all");
  };
  
  const filtersActive = searchInput !== "" || statusFilter !== "all" || courseFilter !== "all";

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <th
      onClick={() => toggleSort(sortKeyName)}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
        {label}
        <SvgIcon
          name={sortKey === sortKeyName ? (sortDir === "asc" ? "chevron-up" : "chevron-down") : "chevrons-up-down"}
          size={12}
          style={{ opacity: sortKey === sortKeyName ? 1 : 0.35 }}
        />
      </span>
    </th>
  );

  return (
    <div>
      <div className="page-header">
        <h1>Payment Center</h1>
        <p>Monitor revenue, subscriptions, and manage student billing.</p>
      </div>

      {/* Stats Overview */}
      {overview && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
          <div className="card" style={{ padding: "1.5rem" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Total Revenue</p>
            <h3 style={{ margin: 0, fontSize: "1.75rem", color: "var(--text-primary)" }}>LKR {overview.total_revenue.toFixed(2)}</h3>
          </div>
          <div className="card" style={{ padding: "1.5rem" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Monthly Recurring (MRR)</p>
            <h3 style={{ margin: 0, fontSize: "1.75rem", color: "var(--text-primary)" }}>LKR {overview.monthly_recurring.toFixed(2)}</h3>
          </div>
          <div className="card" style={{ padding: "1.5rem" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Active Subscriptions</p>
            <h3 style={{ margin: 0, fontSize: "1.75rem", color: "var(--text-primary)" }}>{overview.active_subscriptions}</h3>
          </div>
          <div className="card" style={{ padding: "1.5rem" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Overdue Balance</p>
            <h3 style={{ margin: 0, fontSize: "1.75rem", color: "var(--error)" }}>LKR {overview.overdue_balance.toFixed(2)}</h3>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: "250px", position: "relative" }}>
          <div style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
            <SvgIcon name="search" size={16} />
          </div>
          <input 
            className="input" 
            style={{ paddingLeft: "2.5rem", paddingRight: searchInput ? "2.25rem" : undefined, width: "100%" }} 
            placeholder="Search transaction ID or student ID..." 
            value={searchInput} 
            onChange={(e) => setSearchInput(e.target.value)} 
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              style={{
                position: "absolute", right: "0.6rem", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                display: "flex", alignItems: "center", padding: "2px",
              }}
            >
              <SvgIcon name="x" size={14} />
            </button>
          )}
        </div>
        <select 
          className="input" 
          style={{ width: "auto", minWidth: "150px" }} 
          value={courseFilter} 
          onChange={(e) => setCourseFilter(e.target.value)}
        >
          <option value="all">All Courses</option>
          {uniqueCourses.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select 
          className="input" 
          style={{ width: "auto" }} 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {!loading && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Showing <strong style={{ color: "var(--text-secondary)" }}>{filteredTransactions.length}</strong> of {transactions.length} transactions
          </span>
          {filtersActive && (
            <button
              onClick={clearFilters}
              style={{ background: "none", border: "none", color: "var(--accent-primary)", fontSize: "0.8rem", cursor: "pointer", fontWeight: 500 }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="card" style={{ overflow: "hidden", padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr><th>Transaction ID</th><th>Student</th><th>Course</th><th>Plan</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map(i => (
                <tr key={i} className="skeleton-pulse">
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "60%" }}></div></td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "40%" }}></div></td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "50%" }}></div></td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "40%" }}></div></td>
                  <td><div style={{ height: "16px", background: "var(--border-subtle)", borderRadius: "4px", width: "50%" }}></div></td>
                  <td><div style={{ height: "24px", background: "var(--border-subtle)", borderRadius: "12px", width: "60px" }}></div></td>
                  <td><div style={{ height: "24px", background: "var(--border-subtle)", borderRadius: "4px", width: "30px" }}></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : filteredTransactions.length > 0 ? (
        <>
          <div className="card animate-fade-in" style={{ overflow: "auto", padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Transaction ID" sortKeyName="transaction_id" />
                  <th>Student ID</th>
                  <th>Course</th>
                  <th>Plan</th>
                  <SortHeader label="Amount" sortKeyName="amount" />
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedTransactions.map((txn) => (
                  <tr key={txn.id}>
                    <td>
                      <div style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        {txn.transaction_id || 'N/A'}
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "4px" }}>
                        {txn.paid_at ? new Date(txn.paid_at).toLocaleDateString() : 'Unpaid'}
                      </div>
                    </td>
                    <td><div style={{ fontWeight: 500 }}>{txn.student_id}</div></td>
                    <td>{txn.course_title}</td>
                    <td style={{ textTransform: "capitalize" }}>{txn.payment_plan.replace('_', ' ')}</td>
                    <td style={{ fontWeight: 500 }}>LKR {txn.amount.toFixed(2)}</td>
                    <td>
                      <span className={`badge ${
                        txn.status === 'completed' ? 'badge-success' : 
                        txn.status === 'overdue' ? 'badge-error' : 
                        'badge-warning'
                      }`} style={{ textTransform: "capitalize" }}>
                        {txn.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                      {txn.status === 'overdue' ? (
                        <button
                          onClick={() => handleSendReminder(txn.id)}
                          className="btn-secondary btn-sm"
                          title="Send Reminder"
                        >
                          Remind
                        </button>
                      ) : txn.status === 'completed' ? (
                        <button
                          onClick={() => addToast(`Receipt sent to student ${txn.student_id}`, "success")}
                          className="btn-secondary btn-sm"
                          title="Send Receipt"
                        >
                          Send Receipt
                        </button>
                      ) : (
                        <span style={{ color: "var(--text-muted)", opacity: 0.5 }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1.5rem" }}>
              <button
                className="btn-secondary"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ padding: "0.5rem", minWidth: "40px" }}
              >
                &larr;
              </button>
              <span style={{ display: "flex", alignItems: "center", fontSize: "0.9rem", color: "var(--text-muted)", padding: "0 0.5rem" }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn-secondary"
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{ padding: "0.5rem", minWidth: "40px" }}
              >
                &rarr;
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
          <SvgIcon name="search" size={48} style={{ opacity: 0.2, margin: "0 auto 1rem" }} />
          <h3>No transactions found</h3>
          <p>Try adjusting your search or filters to find what you're looking for.</p>
          {filtersActive && (
            <button className="btn-secondary" onClick={clearFilters} style={{ marginTop: "1rem" }}>
              Clear Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
