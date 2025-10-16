# Bills Agent

A minimal full-stack bills manager featuring a modern React dashboard, a Node/Express API with file-based storage, and an optional ChatGPT-powered assistant for asking questions about your bills.

## Features

- 📊 Dashboard with totals, upcoming bills, search, and CRUD management
- ✅ Track paid status per bill per month
- 🤖 Ask natural-language questions about your bills using OpenAI (optional)
- 💾 Lightweight JSON storage powered by LowDB
- ⚡️ Vite + Tailwind CSS frontend

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file (or export environment variables) to provide your OpenAI credentials if you want to use the chat assistant.

```bash
export OPENAI_API_KEY="sk-..."
# Optional: choose a model (defaults to gpt-4o-mini)
export OPENAI_MODEL="gpt-4o-mini"
```

If you skip this step the dashboard still works, but the chat endpoint will return a 503 error when invoked.

### 3. Run the app in development

```bash
npm run dev
```

This command starts both the API (http://localhost:4000) and the Vite dev server (http://localhost:5173) simultaneously.

### 4. Build for production

```bash
npm run build
```

The frontend production bundle is generated in `dist/`. Serve it with your preferred static host and point it at the API running on port 4000.

## API overview

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET    | `/api/bills?month=YYYY-MM` | List bills with paid status for the given month. |
| POST   | `/api/bills` | Create a bill. Optional `id` field auto-generates when omitted. |
| PUT    | `/api/bills/:id` | Update an existing bill. |
| DELETE | `/api/bills/:id` | Delete a bill and remove its paid history. |
| POST   | `/api/bills/:id/paid` | Toggle paid status for a bill in a month. Body: `{ "month": "YYYY-MM", "isPaid": true }`. |
| POST   | `/api/chat` | Ask the assistant a question about the current month’s bills. Requires OpenAI credentials. |

The API persists data to `server/data/bills.json`. You can edit this file directly to seed default bills.

## License

MIT
