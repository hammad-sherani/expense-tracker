# Spendwise — Personal Expense Tracker

A personal finance dashboard built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Prisma 6 and MongoDB. All amounts are in PKR (Rs.).

## Features

- **Dashboard:** summary cards (selected month, previous month, year, today, average daily spend), a 12-month trend, spending by category with percentages, daily spending, a month-over-month cumulative comparison, and recent expenses.
- **Month filters:** month and year selectors, previous/next arrows, a "This month" shortcut and an **All time** mode. The selected period is stored in the URL (`?period=2026-10` or `?period=all`), stays selected across pages, and drives every figure.
- **Expenses page:** search by description, filter by category, sort by date or amount, pagination, and CSV export of the current filters.
- **Add / edit / delete:** Quick Add dialog (press **N** anywhere), a full Add Expense page, a details panel with Edit and Delete, and a confirmation before deleting. Every change shows a toast and updates the dashboard without a page reload.
- **Accounts & roles:** sign up (username, email, password, confirm password) with **email OTP verification**, log in with email and password, log out. Two roles: **User** (their own private expense tracker) and **Admin** (only a user listing with search, a status filter and stats).
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

Also set:

- `SESSION_SECRET`: 32+ random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`: the mail server that sends OTP codes. For Gmail, use `smtp.gmail.com` on port `465` with a Google [App password](https://myaccount.google.com/apppasswords). **In development, if `SMTP_HOST` is empty, the code is printed in the terminal running `npm run dev`.**
- `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`: used by `npm run create-admin`.

### 3. Install, create indexes, create the admin, run

```bash
npm install            # also runs `prisma generate`
npm run db:push        # creates collections & indexes in MongoDB
npm run create-admin   # creates (or promotes) the admin from ADMIN_* in .env
npm run dev            # http://localhost:3000
```

There is no public admin signup. Everyone who signs up is a regular user, and the admin account comes only from `npm run create-admin`.

For production: `npm run build && npm start`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run db:push` | Sync the Prisma schema (indexes) to MongoDB |
| `npm run create-admin` | Create the admin account (or promote an existing one) from `ADMIN_*` in `.env` |
| `npm run db:studio` | Open Prisma Studio to browse data |
| `npm run typecheck` | Run TypeScript with no output |
| `npm run lint` | Run ESLint |

## How authentication works

| Step | What happens |
| --- | --- |
| Sign up | Validates the input, hashes the password with bcrypt, creates an **unverified** user and emails a 6-digit code. |
| Verify email | The code expires after 10 minutes, allows 5 attempts and can be resent after 60 s. Only an HMAC of the code is stored. Which account is being verified is remembered in a short-lived signed cookie, not in the URL. |
| Log in | A wrong email and a wrong password give the same error. An unverified account is sent to the verification step instead. |
| Session | A signed JWT (HS256, `jose`) in an httpOnly, SameSite=Lax cookie that lasts 7 days. |
| Protection | `src/proxy.ts` redirects by role. Every page, Server Action and the CSV route also re-check the user in the database (`src/lib/auth/dal.ts`). |
| Data isolation | Every expense query and mutation is filtered by the signed-in user's id. Admins can't open the expense pages or export expenses. |

## How dates work

An expense's `date` is a **calendar day**. It is stored as midnight UTC of that day, so `2026-10-31` is stored as `2026-10-31T00:00:00.000Z`. All month and year ranges are half-open UTC ranges, such as `[2026-10-01, 2026-11-01)`. As a result, an expense always appears in the month the user picked, whatever the timezone of the server or browser.

"Today" and "this month" are worked out in `NEXT_PUBLIC_APP_TIMEZONE` (default `Asia/Karachi`). `createdAt` and `updatedAt` are real timestamps and are shown in that timezone.

## Project structure

```
prisma/schema.prisma              User, EmailOtp, Expense models; Role, Category & PaymentMethod enums
scripts/create-admin.ts           Creates / promotes the admin account
src/
  proxy.ts                        Role-based redirects (Next 16 "proxy", formerly middleware)
  app/
    (auth)/                       Login, signup, verify-email pages + split-screen layout
    (app)/page.tsx                Dashboard (users)
    (app)/expenses/...            Expense list & Add Expense page (users)
    admin/users/page.tsx          User listing (admins)
    api/expenses/export/route.ts  CSV export
    error.tsx, not-found.tsx      Error & 404 states
  components/
    ui/                           shadcn/ui primitives
    auth/                         Login, signup, OTP forms
    admin/                        User listing filters
    layout/                       Sidebar, header, nav, quick add, providers
    dashboard/                    Summary cards, charts, recent expenses, skeletons
    expenses/                     Form, dialogs (add/edit/details/delete), table, filters, pagination
    period/period-picker.tsx      Month / year / all-time selector
    shared/                       Page header, empty state, navigation transition
  lib/
    auth/                         JWT, session cookies, passwords, OTP, data access layer
    email.ts                      SMTP sending (nodemailer)
    db.ts                         Prisma client singleton
    constants.ts                  Categories, payment methods, sort options
    dates.ts                      Period parsing, UTC ranges, formatting
    format.ts                     PKR formatting, rounding, % change
    validations/                  Zod schemas for expenses and auth (shared by forms and the server)
  server/
    actions/auth.ts               Signup, login, verify email, resend code, logout
    actions/expenses.ts           Server Actions: create / update / delete
    queries/expenses.ts           Expense list & export queries
    queries/dashboard.ts          Dashboard aggregations
    queries/users.ts              Admin user listing
  types/index.ts                  Shared DTO & result types
```

## Notes

- Cache Components is enabled. Data reads are uncached and stream in behind `<Suspense>` skeletons. Mutations call `revalidatePath` + `refresh()`, so every view shows fresh data immediately.
- Input is validated twice with the same Zod schema: in the form (React Hook Form) and again in each Server Action.
- Not included yet: login rate limiting, password reset, and admin actions on users (block or delete). These are good next steps before a public launch.
- Search text is regex-escaped before it reaches MongoDB. Exported CSV cells are protected against spreadsheet formula injection.
