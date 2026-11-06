# Spendwise — Personal Expense Tracker

A personal finance dashboard built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Prisma 6 and MongoDB. All amounts are in PKR (Rs.).

## Features

- **Dashboard:** summary cards (selected month, previous month, year, today, average daily spend), a 12-month trend, spending by category with percentages, daily spending, a month-over-month cumulative comparison, and recent expenses.
- **Month filters:** month and year selectors, previous/next arrows, a "This month" shortcut and an **All time** mode. The selected period is stored in the URL (`?period=2026-10` or `?period=all`), stays selected across pages, and drives every figure.
- **Expenses page:** search by description, filter by category, sort by date or amount, pagination, and CSV export of the current filters.
- **Add / edit / delete:** Quick Add dialog (press **N** anywhere), a full Add Expense page, a details panel with Edit and Delete, and a confirmation before deleting. Every change shows a toast and updates the dashboard without a page reload.
- **Split bills & dues:** turn on "Split with friends" when adding an expense. Enter the total bill, add friends (saved once, reused later), split equally or with custom amounts, and choose who paid. **Only your share counts as your expense.** If you paid, each friend gets a due for what they owe you; if a friend paid, you get a due for what you owe them. The **Dues** page shows per-friend balances (owed to you / you owe / net), records full or partial repayments with history and undo, and has a "Settle all" button. The dashboard shows a Dues summary.
- **Income & savings:** record salary and other income; the dashboard and Income page show income, how much you saved and your savings rate. The monthly trend shows income next to spending.
- **Wallets:** Cash, bank accounts, JazzCash/Easypaisa, cards. Each expense says which wallet paid (this replaced "Payment method"), and balances update from income, expenses (the whole bill when you paid a split), transfers between wallets and repayments. Each wallet has its own activity page.
- **Custom categories:** add, rename, recolour, pick an icon, reorder, archive. Deleting a category that has expenses moves them to another one first. Manage them in Settings → Categories.
- **Budgets:** a monthly limit per category or for all spending, with progress bars. You get a toast and an email the first time a budget passes 80% and 100% in a month.
- **Recurring bills:** rent, internet, subscriptions (weekly, monthly or yearly, every N). Nothing is added by itself: when a bill is due it shows under Upcoming bills (and a red badge in the menu) with **Mark paid** (opens the expense form prefilled) or **Skip**. A bill due on the 31st stays on the 31st, or the last day of shorter months.
- **Due dates:** an optional "pay back by" date on split bills and dues. Overdue dues get a red marker, an Overdue filter and a note on the dashboard.
- **Groups & trips:** put bills in a group (e.g. "Murree trip"). The group page shows what everyone paid and owes, and the fewest payments needed to settle up, including between friends.
- **Insights:** this month vs last month by category, a 6-month category trend, a spending calendar, unusual-spending alerts and where the money went.
- **PDF monthly report:** download any month as a PDF, email it to yourself, or turn on Settings → "Monthly PDF report by email" to get last month's report automatically the first time you open the app in a new month.
- **Install on phone:** Spendwise is a PWA. Use "Install app" in the account menu (or Safari → Share → Add to Home Screen on iPhone). An offline page shows when there's no connection; your financial data is never cached on the device.
- **Accounts & roles:** sign up (username, email, password, confirm password) with **email OTP verification**, log in, **forgot password** (reset by email code), and **Settings** to change your username, email (confirmed with a code) or password, or delete your account. Two roles: **User** (their own private tracker) and **Admin** (an overview of signups and activity, a user list, and per-user pages to block/unblock, resend verification or delete an account; admins only ever see counts, never anyone's amounts).
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
| `npm run migrate:v2` | Optional: upgrade every account's older data now (fixed categories → your own categories, payment methods → wallets). Accounts are also upgraded automatically the first time they're opened. |
| `node scripts/generate-icons.mjs` | Regenerate the app icons in `public/` |
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
| Forgot password | Sends a reset code to the email (the page looks the same whether or not the email has an account). A correct code sets the new password and logs you in. |
| Logging out other devices | Each session carries a version number. Changing or resetting the password, or an admin blocking the account, bumps it, so every other session stops working. |

## How splitting works

| Situation | Your expense | Dues created |
| --- | --- | --- |
| You paid Rs. 3,000 for you, Ali and Sara (equal) | Rs. 1,000 | Ali owes you Rs. 1,000, Sara owes you Rs. 1,000 |
| Ali paid Rs. 1,500, your share Rs. 500 | Rs. 500 | You owe Ali Rs. 500 |

- Equal splits are exact to the paisa, and any leftover paisa goes to your share (Rs. 1,000 / 3 gives 333.34 + 333.33 + 333.33).
- Shares must add up to the total bill before you can save.
- Editing a split keeps repayments already recorded, and a friend's share can't be reduced below what they've already paid.
- Deleting a split expense removes its dues.
- A friend can be removed only once nothing is pending with them.

### Paid fully for someone else (e.g. family)

When you pay for something that someone will pay back **in full**, like groceries for home, record it as a **due** instead of an expense. Use **Add due** on the Dues page, or the **"Paid fully for someone else?"** link in the expense form, which carries over the amount, description and date you typed.

Choose the person, **They owe me** or **I owe them**, the amount, what it was for, and the date. These dues are tagged **Not an expense** and don't appear in your expense totals or charts. Record, Settle all and Undo work on them just like on split dues, and they can be deleted from the Dues page.

## How dates work

An expense's `date` is a **calendar day**. It is stored as midnight UTC of that day, so `2026-10-31` is stored as `2026-10-31T00:00:00.000Z`. All month and year ranges are half-open UTC ranges, such as `[2026-10-01, 2026-11-01)`. As a result, an expense always appears in the month the user picked, whatever the timezone of the server or browser.

"Today" and "this month" are worked out in `NEXT_PUBLIC_APP_TIMEZONE` (default `Asia/Karachi`). `createdAt` and `updatedAt` are real timestamps and are shown in that timezone.

## Project structure

```
prisma/schema.prisma              User, EmailOtp, Expense, Friend, Due, DuePayment models + enums
scripts/create-admin.ts           Creates / promotes the admin account
src/
  proxy.ts                        Role-based redirects (Next 16 "proxy", formerly middleware)
  app/
    (auth)/                       Login, signup, verify-email pages + split-screen layout
    (app)/page.tsx                Dashboard (users)
    (app)/expenses/...            Expense list & Add Expense page (users)
    (app)/dues/page.tsx           Dues: who owes whom, repayments (users)
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
    split.ts                      Equal-split & dues planning (paisa-exact)
    validations/                  Zod schemas for expenses and auth (shared by forms and the server)
  server/
    actions/auth.ts               Signup, login, verify email, resend code, logout
    actions/expenses.ts           Server Actions: create / update / delete (incl. split dues, transactional)
    actions/friends.ts, dues.ts   Friends CRUD; record / settle / undo repayments
    queries/expenses.ts           Expense list & export queries
    queries/dashboard.ts          Dashboard aggregations
    queries/users.ts              Admin user listing
    queries/dues.ts, friends.ts   Dues summary & per-friend balances; friends list
  types/index.ts                  Shared DTO & result types
```

## Notes

- Cache Components is enabled. Data reads are uncached and stream in behind `<Suspense>` skeletons. Mutations call `revalidatePath` + `refresh()`, so every view shows fresh data immediately.
- Input is validated twice with the same Zod schema: in the form (React Hook Form) and again in each Server Action.
- Not included yet: login rate limiting, password reset, and admin actions on users (block or delete). These are good next steps before a public launch.
- Search text is regex-escaped before it reaches MongoDB. Exported CSV cells are protected against spreadsheet formula injection.
