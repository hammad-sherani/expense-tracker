# Spendwise — Personal Expense Tracker

A personal finance dashboard built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Prisma 6 and MongoDB. All amounts are in PKR (Rs.).

## Features

- **Dashboard:** summary cards (selected month, previous month, year, today, average daily spend), a 12-month trend, spending by category with percentages, daily spending, a month-over-month cumulative comparison, and recent expenses.
- **Month filters:** month and year selectors, previous/next arrows, a "This month" shortcut and an **All time** mode. The selected period is stored in the URL (`?period=2026-10` or `?period=all`), stays selected across pages, and drives every figure.
- **Expenses page:** search by description, filter by category, sort by date or amount, pagination, and CSV export of the current filters.
- **Add / edit / delete:** Quick Add dialog (press **N** anywhere), a full Add Expense page, a details panel with Edit and Delete, and a confirmation before deleting. Every change shows a toast and updates the dashboard without a page reload.
- **Polish:** skeleton loaders, empty and error states, responsive layout from mobile to desktop, light and dark mode.

## Getting started

### 1. MongoDB Atlas

Prisma's MongoDB connector needs a **replica set**. Atlas clusters, including the free M0 tier, already are one.

1. Create a cluster at <https://cloud.mongodb.com>.
2. Under **Database Access**, create a database user.
3. Under **Network Access**, allow your IP address.
4. Click **Connect → Drivers** and copy the connection string.

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL`. Put the database name (`expense-tracker`) before the `?`:

```
DATABASE_URL="mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/expense-tracker?retryWrites=true&w=majority"
NEXT_PUBLIC_APP_TIMEZONE="Asia/Karachi"
```

### 3. Install, create indexes, run

```bash
npm install        # also runs `prisma generate`
npm run db:push    # creates the collection indexes in MongoDB
npm run dev        # http://localhost:3000
```

For production: `npm run build && npm start`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run db:push` | Sync the Prisma schema (indexes) to MongoDB |
| `npm run db:studio` | Open Prisma Studio to browse data |
| `npm run typecheck` | Run TypeScript with no output |
| `npm run lint` | Run ESLint |

## How dates work

An expense's `date` is a **calendar day**. It is stored as midnight UTC of that day, so `2026-10-31` is stored as `2026-10-31T00:00:00.000Z`. All month and year ranges are half-open UTC ranges, such as `[2026-10-01, 2026-11-01)`. As a result, an expense always appears in the month the user picked, whatever the timezone of the server or browser.

"Today" and "this month" are worked out in `NEXT_PUBLIC_APP_TIMEZONE` (default `Asia/Karachi`). `createdAt` and `updatedAt` are real timestamps and are shown in that timezone.

## Project structure

```
prisma/schema.prisma              Expense model, Category & PaymentMethod enums, indexes
src/
  app/
    page.tsx                      Dashboard
    expenses/page.tsx             Expense list (search / filter / sort / paginate)
    expenses/new/page.tsx         Add Expense page
    api/expenses/export/route.ts  CSV export
    error.tsx, not-found.tsx      Error & 404 states
  components/
    ui/                           shadcn/ui primitives
    layout/                       Sidebar, header, nav, quick add, providers
    dashboard/                    Summary cards, charts, recent expenses, skeletons
    expenses/                     Form, dialogs (add/edit/details/delete), table, filters, pagination
    period/period-picker.tsx      Month / year / all-time selector
    shared/                       Page header, empty state, navigation transition
  lib/
    db.ts                         Prisma client singleton
    constants.ts                  Categories, payment methods, sort options
    dates.ts                      Period parsing, UTC ranges, formatting
    format.ts                     PKR formatting, rounding, % change
    validations/expense.ts        Zod schemas (shared by the form and the server)
  server/
    actions/expenses.ts           Server Actions: create / update / delete
    queries/expenses.ts           Expense list & export queries
    queries/dashboard.ts          Dashboard aggregations
  types/index.ts                  Shared DTO & result types
```

## Notes

- Cache Components is enabled. Data reads are uncached and stream in behind `<Suspense>` skeletons. Mutations call `revalidatePath` + `refresh()`, so every view shows fresh data immediately.
- Input is validated twice with the same Zod schema: in the form (React Hook Form) and again in each Server Action.
- Search text is regex-escaped before it reaches MongoDB. Exported CSV cells are protected against spreadsheet formula injection.
# expense-tracker
