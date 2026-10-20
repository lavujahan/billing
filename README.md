# Business Assistant · வணிக உதவி

A Tamil-first, mobile-first web app for small-business billing, purchases, expenses and collections. Owners install it to the phone's home screen like an app.

- **Spec:** [docs/PLAN.md](docs/PLAN.md)
- **UI reference:** the [Billing Voice Form canvas](https://claude.ai/artifact/FG6ahqjt6nijdQiUJNtd33)
- **Rules for contributors:** [CLAUDE.md](CLAUDE.md)

**Status: Phase 3 (Voice on Billing).**
- **Done:** login, Home, and the admin area (users, items, customers, customer review, item requests, business profile, AI key).
- **Billing:** works by typing, by voice one field at a time, or by speaking the whole bill at once. Bills open in a view where they can be edited or cancelled, and each has a GST invoice print page.
- **Not built yet:** Purchase, Expense, Collection and Reports.

Run `npm test` for the unit tests. They cover GST totals, Tamil number parsing and the voice merge rules.

## Stack
- Next.js 16 (App Router, Server Actions)
- TypeScript
- Tailwind CSS v4
- Supabase (Postgres, Auth, Storage)

There is no separate backend server.

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Environment.** Copy `.env.local.example` to `.env.local` and fill in the three keys from Supabase → Project Settings → API. The service-role key is only ever read on the server.

3. **Supabase Auth settings** (dashboard → Authentication):
   - Turn **off** "Allow new users to sign up". Users are created by an admin only.
   - Leave the Email provider enabled. Logins use a hidden per-user email internally, and no mail is ever sent.

4. **Database migrations** (`supabase/migrations/`):
   ```bash
   npx supabase login
   npm run db:link     # pick your project
   npm run db:push
   ```
   Or paste the three SQL files, in order, into the Supabase SQL editor.

5. **Create the first owner and business.** The code is printed once.
   ```bash
   npm run create-user -- --owner --business "Sri Lakshmi Hardware" --mobile 9876543210 --name "Senthil"
   ```
   Later users are added from **Admin → Users** in the app.

6. **Run**
   ```bash
   npm run dev       # http://localhost:3000
   ```

## How login works
The user enters a mobile number and a 5-digit code. Step by step:

1. The server checks the code against a bcrypt hash in `public.users`. After 5 wrong tries the account locks for 15 minutes.
2. If the code is right, the server mints a one-time Supabase magic-link token with the service-role key. No email is sent.
3. The server exchanges that token for a normal cookie session.

All data access after that uses the user's session and Row Level Security. Each user only ever sees their own business's rows.

## Voice and AI keys
Voice uses OpenAI. Speech-to-text is `gpt-4o-transcribe`; whole-bill understanding is one agent run (`gpt-5.4-mini`), and you can override either in `.env.local`. With no key, the mics are hidden and typing works as usual.

1. Set `AI_KEY_ENCRYPTION_KEY` in `.env.local`: 32 random bytes, base64. See `.env.local.example`. This master key encrypts stored OpenAI keys; it stays in the server environment and never goes in the database.
2. Restart the server. Then an owner or admin opens **Admin → AI · voice settings** and pastes the OpenAI key. The key is:
   - tested before it is saved
   - stored AES-256-GCM encrypted
   - never sent to any browser; only the last 4 characters are ever shown
3. Optionally, a vendor-wide `OPENAI_API_KEY` in the environment is used for businesses that haven't added their own key.

How voice works:
- **Field voice** (the small mic on a field) sends the audio for speech-to-text only. Code then turns the words into the value: Tamil, English and Tanglish numbers, units, dates and fuzzy name matching (`src/lib/voice/`).
- **Whole-bill voice** (hold the orange mic) runs the Billing agent once (`src/modules/billing/`).
  - The agent only reads the masters; it can't save anything.
  - Plain code then matches its result to your items and customers and merges it into the form. Spoken values never overwrite typed ones.

**Microphones need HTTPS.** `localhost` works. To test on a phone over Wi-Fi, run `npx next dev --experimental-https` and open the https address.

**Eval set:** `npm run eval:billing` runs sample bill sentences through the agent (needs `OPENAI_API_KEY`). The starter set is synthetic; replace it with real shop sentences from `src/modules/billing/evals/billing.json` before tuning the prompt.

## Scripts
| Script | Does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run create-user -- …` | Create a business owner or another user from the CLI |
| `npm test` | Unit tests |
| `npm run eval:billing` | Score the Billing agent on the eval set |
| `npm run db:link` / `db:push` | Link the Supabase project / apply migrations |

## PWA
- `src/app/manifest.ts` provides the manifest.
- `public/sw.js` is the service worker. It is registered in production builds only, so test with `npm run build && npm start`.
- Installing requires HTTPS, or `localhost`.
- The icons in `public/icons/` are placeholders.

## Layout
```
src/app/(public)/login     login page + server action
src/app/(app)/             signed-in area (AppShell: bottom bar on phones, side menu ≥ 640px)
src/app/(app)/admin/       owner/admin only
src/lib/auth/              login, session, user creation
src/lib/supabase/          browser / server / service-role clients
src/proxy.ts               session refresh and login redirects (Next 16 "proxy" = middleware)
supabase/migrations/       schema, RLS, storage
```
Each later phase adds its form under `src/app/(app)/<form>/`.
