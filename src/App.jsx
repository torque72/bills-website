import React, { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

const API = (path, opts = {}) =>
  fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "omit",
    ...opts,
  }).then(async (r) => {
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`HTTP ${r.status}: ${text}`);
    }
    const contentType = r.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return r.json();
    }
    return {};
  });

function currency(n) {
  return Number(n || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function startOfMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function BillsAgentDashboard() {
  const monthKey = startOfMonthKey();
  const [rows, setRows] = useState([]); // {id,name,dueDay,amount,notes,isPaid,isRecurring}
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi! I'm your bills assistant. Ask me anything about what's due, what's been paid, or how much you owe this month.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await API(`/api/bills?month=${monthKey}`);
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const paidAmt = rows.reduce(
      (s, r) => s + (r.isPaid ? Number(r.amount || 0) : 0),
      0
    );
    return { total, paidAmt, remaining: total - paidAmt };
  }, [rows]);

  const upcomingThisWeek = useMemo(() => {
    const now = new Date();
    const within = new Date(now);
    within.setDate(now.getDate() + 7);
    return rows
      .filter((r) => {
        const due = new Date(now.getFullYear(), now.getMonth(), r.dueDay);
        return due >= now && due <= within;
      })
      .sort((a, b) => a.dueDay - b.dueDay);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = rows.slice().sort((a, b) => a.dueDay - b.dueDay);
    if (!q) return sorted;
    return sorted.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        String(r.dueDay).includes(q) ||
        String(r.amount).includes(q) ||
        (r.notes || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  async function togglePaid(id, next) {
    await API(`/api/bills/${encodeURIComponent(id)}/paid`, {
      method: "POST",
      body: JSON.stringify({ isPaid: next, month: monthKey }),
    });
    refresh();
  }

  function openNew() {
    setEditing({
      id: "",
      name: "",
      dueDay: 1,
      amount: 0,
      notes: "",
      isRecurring: true,
    });
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing({ ...row, isRecurring: row.isRecurring ?? true });
    setShowForm(true);
  }

  async function saveRow(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      id: (form.get("id") || "").toString().trim() || undefined,
      name: (form.get("name") || "").toString().trim(),
      dueDay: Number(form.get("dueDay") || 1),
      amount: Number(form.get("amount") || 0),
      notes: (form.get("notes") || "").toString(),
      isRecurring: form.get("isRecurring") === "on",
    };

    if (payload.id) {
      await API(`/api/bills/${encodeURIComponent(payload.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await API(`/api/bills`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

    setShowForm(false);
    setEditing(null);
    refresh();
  }

  async function deleteRow(id) {
    await API(`/api/bills/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    refresh();
  }

  async function sendChat(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const message = chatInput.trim();
    const nextMessages = [
      ...chatMessages,
      { role: "user", content: message },
    ];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);

    try {
      const response = await API(`/api/chat`, {
        method: "POST",
        body: JSON.stringify({ message, month: monthKey }),
      });
      if (response?.reply) {
        setChatMessages([
          ...nextMessages,
          { role: "assistant", content: response.reply },
        ]);
      } else {
        throw new Error("No reply received");
      }
    } catch (err) {
      setChatError(err.message);
      setChatMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            "I couldn't reach the assistant service. Please check the server logs and ensure an OpenAI API key is configured.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Bills Agent</h1>
            <p className="text-slate-400">
              Month: <span className="font-mono">{monthKey}</span>
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search bills…"
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-700"
            />
            <button
              onClick={openNew}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500"
            >
              Add Bill
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          <KPI label="Total Due" value={currency(totals.total)} />
          <KPI label="Paid So Far" value={currency(totals.paidAmt)} />
          <KPI label="Remaining" value={currency(totals.remaining)} highlight />
          <div className="rounded-2xl border border-slate-800 p-4 bg-slate-900/40">
            <h2 className="text-slate-400 text-sm mb-2">Ask the assistant</h2>
            <p className="text-sm text-slate-300">
              Curious about your bills? Open the chat below and ask anything.
            </p>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-6">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Due in the next 7 days</h2>
                <span className="text-slate-400 text-sm">
                  {upcomingThisWeek.length} bill(s)
                </span>
              </div>
              {upcomingThisWeek.length === 0 ? (
                <div className="border border-slate-800 rounded-2xl p-4 text-slate-400">
                  Nothing due in the next week 🎉
                </div>
              ) : (
                <ul className="grid gap-2">
                  {upcomingThisWeek.map((b) => (
                    <li
                      key={b.id}
                      className="border border-slate-800 rounded-2xl p-3 flex items-center justify-between bg-slate-900"
                    >
                      <div>
                        <div className="font-medium">{b.name}</div>
                        <div className="text-slate-400 text-sm">
                          Due on {b.dueDay} • {currency(b.amount)} •
                          {" "}
                          {b.isRecurring ? "Recurring" : "One-time"}
                        </div>
                      </div>
                      <button
                        onClick={() => togglePaid(b.id, !b.isPaid)}
                        className={`px-3 py-1 rounded-xl border ${
                          b.isPaid
                            ? "bg-emerald-600 border-emerald-500"
                            : "bg-slate-800 border-slate-700"
                        }`}
                      >
                        {b.isPaid ? "Paid" : "Mark Paid"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl overflow-hidden border border-slate-800">
              <table className="min-w-full bg-slate-950">
                <thead className="bg-slate-900">
                  <tr>
                    <Th>Name</Th>
                    <Th>Due Day</Th>
                    <Th>Amount</Th>
                    <Th>Notes</Th>
                    <Th>Recurring</Th>
                    <Th>Status</Th>
                    <Th className="text-right pr-4">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <Td colSpan={7}>Loading…</Td>
                    </tr>
                  ) : (
                    filtered.map((r) => (
                      <tr
                        key={r.id}
                        className="border-t border-slate-800 hover:bg-slate-900/60"
                      >
                        <Td>{r.name}</Td>
                        <Td>{r.dueDay}</Td>
                        <Td>{currency(Number(r.amount))}</Td>
                        <Td className="max-w-[24ch] truncate" title={r.notes}>
                          {r.notes}
                        </Td>
                        <Td>
                          <span
                            className={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium ${
                              r.isRecurring
                                ? "bg-emerald-600/20 text-emerald-300"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {r.isRecurring ? "Recurring" : "One-time"}
                          </span>
                        </Td>
                        <Td>
                          <button
                            onClick={() => togglePaid(r.id, !r.isPaid)}
                            className={`px-2 py-1 rounded-lg border text-sm ${
                              r.isPaid
                                ? "bg-emerald-600 border-emerald-500"
                                : "bg-slate-800 border-slate-700"
                            }`}
                          >
                            {r.isPaid ? "Paid" : "Mark Paid"}
                          </button>
                        </Td>
                        <Td className="text-right pr-4">
                          <div className="inline-flex gap-2">
                            <button
                              onClick={() => openEdit(r)}
                              className="px-2 py-1 rounded-lg bg-slate-800"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteRow(r.id)}
                              className="px-2 py-1 rounded-lg bg-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </div>

          <aside className="rounded-2xl border border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-900">
              <h2 className="text-lg font-semibold">Bills Assistant</h2>
              <p className="text-xs text-slate-400">
                Ask natural-language questions about your bills this month.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === "assistant"
                      ? "bg-slate-900 text-slate-200"
                      : "bg-emerald-600/80 text-slate-50"
                  }`}
                >
                  {msg.content}
                </div>
              ))}
              {chatLoading && (
                <div className="text-xs text-slate-400 animate-pulse">
                  Thinking…
                </div>
              )}
              {chatError && (
                <div className="text-xs text-red-400">{chatError}</div>
              )}
            </div>
            <form onSubmit={sendChat} className="border-t border-slate-800 p-3 bg-slate-900">
              <label className="sr-only" htmlFor="chat-input">
                Ask the bills assistant
              </label>
              <textarea
                id="chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="e.g. How much do I owe this month?"
                className="w-full resize-none rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                rows={2}
                disabled={chatLoading}
              />
              <button
                type="submit"
                disabled={chatLoading}
                className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-60"
              >
                {chatLoading ? "Asking…" : "Ask"}
              </button>
            </form>
          </aside>
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/60 grid place-items-center p-4">
            <form
              onSubmit={saveRow}
              className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl p-5 grid gap-3"
            >
              <h3 className="text-xl font-semibold mb-1">
                {editing?.id ? "Edit Bill" : "Add Bill"}
              </h3>
              <label className="grid gap-1">
                <span className="text-sm text-slate-400">
                  ID (leave blank to auto-generate)
                </span>
                <input
                  name="id"
                  defaultValue={editing?.id || ""}
                  placeholder="e.g. internet"
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-400">Name</span>
                <input
                  name="name"
                  defaultValue={editing?.name || ""}
                  required
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-400">Due Day (1–31)</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  name="dueDay"
                  defaultValue={editing?.dueDay ?? 1}
                  required
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-400">Amount (USD)</span>
                <input
                  type="number"
                  step="0.01"
                  name="amount"
                  defaultValue={editing?.amount ?? 0}
                  required
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-400">Notes</span>
                <input
                  name="notes"
                  defaultValue={editing?.notes || ""}
                  className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  name="isRecurring"
                  defaultChecked={editing?.isRecurring ?? true}
                  className="h-4 w-4 rounded border border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-600"
                />
                Recurring every month
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl bg-emerald-600"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function KPI({ label, value, highlight }) {
  return (
    <div
      className={`rounded-2xl border border-slate-800 p-4 ${
        highlight ? "bg-slate-900/60" : "bg-slate-900/40"
      }`}
    >
      <div className="text-slate-400 text-sm">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Th({ children, className = "" }) {
  return (
    <th
      className={`text-left text-slate-300 font-medium px-4 py-3 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "", colSpan }) {
  return (
    <td className={`px-4 py-3 align-middle ${className}`} colSpan={colSpan}>
      {children}
    </td>
  );
}
