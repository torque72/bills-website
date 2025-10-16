import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

let client = null;
if (apiKey) {
  client = new OpenAI({ apiKey });
}

export const isChatAvailable = () => Boolean(client);

export async function askBillsAssistant({ message, month, bills, totals }) {
  if (!client) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const summaryLines = bills
    .map((bill) => {
      const dueText =
        bill.dueDateLabel ||
        (bill.dueDate
          ? new Date(`${bill.dueDate}T00:00:00`).toLocaleDateString("en-US")
          : `day ${bill.dueDay}`);
      return `- ${bill.name} (due ${dueText}) for $${Number(bill.amount).toFixed(
        2
      )} — ${bill.isPaid ? "paid" : "unpaid"} (${bill.isRecurring ? "recurring" : "one-time"})`;
    })
    .join("\n");

  const systemPrompt = `You are Bills Agent, a helpful assistant that answers questions about household bills. Always base your answers solely on the data provided, and respond with helpful financial insights. Keep responses concise and actionable.`;

  const totalDue = Number(totals.totalDue ?? totals.total ?? 0);
  const paidTotal = Number(totals.paid ?? 0);
  const remainingTotal = Number(totals.remaining ?? totalDue - paidTotal);
  const recurringDue = Number(totals.recurringDue ?? 0);
  const recurringRemaining = Number(
    totals.remainingRecurring ?? recurringDue - Number(totals.paidRecurring ?? 0)
  );

  const userPrompt = `Month: ${month}\nTotal due: $${totalDue.toFixed(
    2
  )}\nRecurring due: $${recurringDue.toFixed(
    2
  )}\nPaid so far: $${paidTotal.toFixed(2)}\nRemaining: $${remainingTotal.toFixed(
    2
  )}\nRecurring remaining: $${recurringRemaining.toFixed(
    2
  )}\nBills:\n${summaryLines}\n\nQuestion: ${message}`;

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error("No text returned from OpenAI");
  }
  return text;
}
