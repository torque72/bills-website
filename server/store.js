import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { JSONFile } from "lowdb/node";
import { Low } from "lowdb";

const dueDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultData = {
  bills: [],
  paidStatus: {},
};

const clone = (value) => JSON.parse(JSON.stringify(value));

export async function createBillsStore(filename = "data/bills.json") {
  const file = join(__dirname, filename);
  const adapter = new JSONFile(file, defaultData);
  const db = new Low(adapter, defaultData);
  await db.read();
  db.data ||= clone(defaultData);

  async function write() {
    await db.write();
  }

  const withDefaults = (bill) => ({
    ...bill,
    isRecurring: bill.isRecurring ?? true,
  });

  const computeDueMeta = (bill, monthKey) => {
    if (!monthKey || typeof monthKey !== "string") {
      return {};
    }

    const [yearStr, monthStr] = monthKey.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
      return {};
    }

    const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const desiredDay = Number(bill.dueDay) || 1;
    const normalizedDay = Math.min(
      Math.max(1, Math.round(desiredDay)),
      lastDayOfMonth,
    );
    const dueDate = new Date(Date.UTC(year, monthIndex, normalizedDay));

    return {
      dueDate: `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(
        normalizedDay,
      ).padStart(2, "0")}`,
      dueDateLabel: dueDateFormatter.format(dueDate),
    };
  };

  const withDueMeta = (bill, monthKey) => ({
    ...withDefaults(bill),
    ...computeDueMeta(bill, monthKey),
  });

  return {
    async listBills() {
      await db.read();
      return db.data.bills.map(withDefaults);
    },

    async listBillsWithStatus(monthKey) {
      await db.read();
      const monthStatus = db.data.paidStatus[monthKey] || {};
      return db.data.bills.map((bill) => ({
        ...withDueMeta(bill, monthKey),
        isPaid: Boolean(monthStatus[bill.id]),
      }));
    },

    async getBill(id) {
      await db.read();
      return db.data.bills.find((bill) => bill.id === id) || null;
    },

    async upsertBill(input) {
      await db.read();
      const existing = db.data.bills.find((bill) => bill.id === input.id);
      if (existing) {
        Object.assign(existing, input);
        existing.isRecurring = existing.isRecurring ?? true;
      } else {
        db.data.bills.push(withDefaults(input));
      }
      await write();
      return withDefaults(input);
    },

    async deleteBill(id) {
      await db.read();
      db.data.bills = db.data.bills.filter((bill) => bill.id !== id);
      for (const month of Object.keys(db.data.paidStatus)) {
        delete db.data.paidStatus[month][id];
      }
      await write();
    },

    async setPaidStatus(monthKey, id, isPaid) {
      await db.read();
      if (!db.data.paidStatus[monthKey]) {
        db.data.paidStatus[monthKey] = {};
      }
      if (isPaid) {
        db.data.paidStatus[monthKey][id] = true;
      } else {
        delete db.data.paidStatus[monthKey][id];
      }
      await write();
      return Boolean(db.data.paidStatus[monthKey]?.[id]);
    },

    async getMonthlySummary(monthKey) {
      const bills = await this.listBillsWithStatus(monthKey);
      const sumAmounts = (acc, bill) => acc + Number(bill.amount || 0);
      const totalDue = bills.reduce(sumAmounts, 0);
      const recurringDue = bills.filter((bill) => bill.isRecurring).reduce(sumAmounts, 0);
      const paid = bills.filter((bill) => bill.isPaid).reduce(sumAmounts, 0);
      const paidRecurring = bills
        .filter((bill) => bill.isPaid && bill.isRecurring)
        .reduce(sumAmounts, 0);
      const remaining = bills.filter((bill) => !bill.isPaid).reduce(sumAmounts, 0);
      const remainingRecurring = bills
        .filter((bill) => !bill.isPaid && bill.isRecurring)
        .reduce(sumAmounts, 0);
      return {
        bills,
        totals: {
          total: totalDue,
          totalDue,
          recurringDue,
          oneTimeDue: totalDue - recurringDue,
          paid,
          remaining,
          paidRecurring,
          remainingRecurring,
        },
      };
    },
  };
}
