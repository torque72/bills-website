import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { JSONFile } from "lowdb/node";
import { Low } from "lowdb";

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

  return {
    async listBills() {
      await db.read();
      return db.data.bills;
    },

    async listBillsWithStatus(monthKey) {
      await db.read();
      const monthStatus = db.data.paidStatus[monthKey] || {};
      return db.data.bills.map((bill) => ({
        ...bill,
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
      } else {
        db.data.bills.push(input);
      }
      await write();
      return input;
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
      const total = bills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
      const paid = bills
        .filter((bill) => bill.isPaid)
        .reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
      return {
        bills,
        totals: {
          total,
          paid,
          remaining: total - paid,
        },
      };
    },
  };
}
