@AGENTS.md

# Tamil Business AI Assistant

Product spec: `docs/PLAN.md`. UI reference: the Billing Voice Form canvas (https://claude.ai/artifact/FG6ahqjt6nijdQiUJNtd33). Match it, and change the canvas first for any visual change.

## Stack
- Next.js 16 (App Router, `src/`, Cache Components on), TypeScript, Tailwind v4.
  - Design tokens live as CSS variables in `src/app/globals.css` and are exposed through `@theme`.
  - Use token classes (`bg-surface`, `text-ink-muted`, `border-outline`, `bg-primary`…), never raw hex.
- There is no separate Express backend. Server logic is Server Actions and Route Handlers.
- Supabase (Postgres + Auth + Storage). Migrations are in `supabase/migrations/`.
- Auth is mobile number + 5-digit code. See `src/lib/auth/login.ts`.
  - A bcrypt-hashed code in `public.users` is bridged to a Supabase session with `generateLink` + `verifyOtp`.
- Request-time reads (cookies/session) must sit inside `<Suspense>`, because Cache Components requires it.
- `src/proxy.ts` is the Next 16 name for middleware.

## Hard rules
- No AI anywhere in report numbers. Reports are fixed SQL.
- Nothing is saved until the user taps Save. AI tools are read-only.
- Secrets stay server-only. This covers `SUPABASE_SERVICE_ROLE_KEY`, the OpenAI key and anything imported from `src/lib/supabase/admin.ts`, which uses `server-only`.
- Every business table has `business_id` + RLS via `current_business_id()`.
  - Records are never hard-deleted: cancelled records get `status = 'cancelled'`.
  - Edits and cancels are written to `audit_log`.
- Server Actions re-check the caller's role. A hidden menu item is not authorization.
- UI labels are bilingual (English · Tamil). Touch targets ≥ 44px. Design at 390px first.
