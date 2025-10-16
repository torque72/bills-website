import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { createBillsStore } from "./store.js";
import { askBillsAssistant, isChatAvailable } from "./openai.js";

const PORT = process.env.PORT || 4000;
const app = express();
const store = await createBillsStore();

app.use(cors());
app.use(express.json());

function validateBillPayload(payload) {
  const errors = [];
  if (!payload.name || typeof payload.name !== "string") {
    errors.push("'name' is required");
  }
  if (
    typeof payload.dueDay !== "number" ||
    Number.isNaN(payload.dueDay) ||
    payload.dueDay < 1 ||
    payload.dueDay > 31
  ) {
    errors.push("'dueDay' must be a number between 1 and 31");
  }
  if (
    typeof payload.amount !== "number" ||
    Number.isNaN(payload.amount) ||
    payload.amount < 0
  ) {
    errors.push("'amount' must be a non-negative number");
  }
  if (payload.notes && typeof payload.notes !== "string") {
    errors.push("'notes' must be a string if provided");
  }
  return errors;
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    chat: isChatAvailable(),
  });
});

app.get("/api/bills", async (req, res) => {
  const month = req.query.month;
  const bills = month
    ? await store.listBillsWithStatus(month)
    : await store.listBills();
  res.json(bills);
});

app.post("/api/bills", async (req, res) => {
  const payload = req.body || {};
  const errors = validateBillPayload(payload);
  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const id = payload.id?.trim() || nanoid(8);
  const bill = {
    id,
    name: payload.name.trim(),
    dueDay: Number(payload.dueDay),
    amount: Number(payload.amount),
    notes: payload.notes?.trim() || "",
  };

  await store.upsertBill(bill);
  res.status(201).json(bill);
});

app.put("/api/bills/:id", async (req, res) => {
  const id = req.params.id;
  const existing = await store.getBill(id);
  if (!existing) {
    return res.status(404).json({ error: "Bill not found" });
  }

  const payload = { ...existing, ...req.body, id };
  const errors = validateBillPayload(payload);
  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const updated = {
    id,
    name: payload.name.trim(),
    dueDay: Number(payload.dueDay),
    amount: Number(payload.amount),
    notes: payload.notes?.trim() || "",
  };

  await store.upsertBill(updated);
  res.json(updated);
});

app.delete("/api/bills/:id", async (req, res) => {
  const id = req.params.id;
  const existing = await store.getBill(id);
  if (!existing) {
    return res.status(404).json({ error: "Bill not found" });
  }

  await store.deleteBill(id);
  res.status(204).end();
});

app.post("/api/bills/:id/paid", async (req, res) => {
  const id = req.params.id;
  const existing = await store.getBill(id);
  if (!existing) {
    return res.status(404).json({ error: "Bill not found" });
  }

  const { isPaid, month } = req.body || {};
  if (!month || typeof month !== "string") {
    return res.status(400).json({ error: "'month' is required" });
  }

  const status = await store.setPaidStatus(month, id, Boolean(isPaid));
  res.json({ id, month, isPaid: status });
});

app.post("/api/chat", async (req, res) => {
  const { message, month } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "'message' is required" });
  }
  const monthKey = typeof month === "string" ? month : undefined;
  const activeMonth = monthKey || new Date().toISOString().slice(0, 7);
  const { bills, totals } = await store.getMonthlySummary(activeMonth);
  try {
    const reply = await askBillsAssistant({
      message,
      month: activeMonth,
      bills,
      totals,
    });
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`Bills API listening on http://localhost:${PORT}`);
});
