# Tamil Business AI Assistant — Consolidated Plan (MVP v1)

> Exported from the plan document on 16 Oct 2026 (updated with agent build plan and API key management) for use in Claude Code / the IDE extension.
> UI design reference (use during development): [Billing Voice Form canvas](https://claude.ai/artifact/FG6ahqjt6nijdQiUJNtd33)
> Live plan document: https://claude.ai/code/artifact/54db3a3c-07d8-47f6-b01f-0b0faa6294b9

## Contents

1. Overview
2. Mobile Web App
3. Agent Platform
4. Billing (Voice Form)
5. Purchase (Hybrid Form)
6. Expense (Hybrid Form)
7. Collection (Hybrid Form)
8. Reports Menu

# Tamil Business AI Assistant — Consolidated Plan (MVP v1)

Oct 15, 2026 · @Alpha Info Tech

## Vision and objectives

A Tamil-first, mobile-first web app (installable on the phone's home screen) where a small business owner runs daily operations through four voice-enabled hybrid forms (Billing, Purchase, Expense, Collection) instead of using ERP screens, and reads every report from a dedicated Reports menu. Every voice note, message, photo or document is turned into structured records in Supabase.

The MVP lets a user:

1. Create invoices (with PDF) by voice or text
2. Photograph a purchase bill and have vendor, amount and GST extracted
3. Record expenses and customer collections in one sentence
4. See sales, purchase, expense, collection, balance, profit and GST reports in a Reports menu
5. Get a daily business summary each evening and add a voice note to it

Success means a non-technical Tamil-speaking owner can do all five without typing into a form.

## Scope

**In MVP v1:** login, dashboard with business summary, four hybrid forms (Billing, Purchase with bill upload, Expense, Collection with payment proof), a Reports menu (16 reports with PDF/Excel export), Tamil/English/Tanglish voice and text, bill OCR, invoice PDF generation, daily summary, Supabase storage, and an audit trail of every entry.

**Out of MVP v1 (later phases):** GST e-invoicing and e-way bills, inventory/stock tracking, multi-business or multi-branch, payment gateway links, WhatsApp sharing automation, offline mode, Play Store / App Store listing (the web app can be wrapped later), and accounting exports (Tally etc.).

## Tech stack

| Layer | Choice | Used for |
| --- | --- | --- |
| Web app (front end) | Next.js (React, TypeScript), Tailwind CSS, installable PWA | One mobile-first app for phone, tablet and desktop, including the admin area |
| Browser features | MediaRecorder (mic), camera and file capture, Web Share and Share Target, Service Worker + IndexedDB, Web Push | Voice, bill photos and PDFs, sharing to WhatsApp and from GPay, offline drafts, notifications, blur check before upload |
| Backend | Node.js, Express.js, Socket.IO (optional) | API, agent router, tool execution, report endpoints, streaming replies |
| AI | OpenAI GPT-5 / GPT-4o, Whisper, Vision, OpenAI Agents SDK (TypeScript) on the Responses API | Intent + extraction, speech-to-text, bill OCR, tool selection |
| Database | Supabase PostgreSQL | All business records and chat history |
| Auth | Supabase Auth (admin-created users, 5-digit code) | Login and per-user data isolation |
| Files | Supabase Storage | Bills, invoice PDFs, voice notes, documents, profile images |
| PDF | Server-side generator (e.g. PDFKit or Puppeteer) | Tamil-capable invoice PDFs |

## System architecture

> Diagram: request path · app to Supabase and back (see the plan document)

Every message passes the same path; the agent only proposes a tool call, and the backend executor is the single place that touches the database and storage.

## Four hybrid forms and the Reports menu

All data entry is done in **hybrid forms** — a normal form that can be filled by typing, by voice one field at a time, by saying everything at once, or (where it fits) by uploading a document. There are no chat screens in MVP v1. Each form is shaped to its own job; the Reports menu is for reading.

| Area | Nature of the form | Ways to fill | Saves after | Detail |
| --- | --- | --- | --- | --- |
| Billing | Customer + item rows + GST totals | Type, field voice, free-form voice | Summary → Save | Billing (Voice Form) |
| Purchase | Built around the supplier's bill; items optional ("Total only") | **Bill photo, PDF upload**, type, field voice, free-form voice | Summary with bill thumbnail → Save | Purchase (Hybrid Form) |
| Expense | Quick rows (category, what for, amount) under one date | Category chips, "again" chips, field voice, free-form voice, receipt photo | One-tap save + Undo (check first if unsure) | Expense (Hybrid Form) |
| Collection | Centred on the customer's balance and open bills | Type, field voice, free-form voice, **UPI screenshot, cheque photo, bank SMS** | Summary with balance before → after → Save | Collection (Hybrid Form) |
| Reports menu | 16 fixed reports in 7 groups; daily summary | Taps, period chips, filters | Read-only | Reports Menu |

Agents are plug-in modules with database-driven configuration; each tab's values are the defaults. See Agent Platform for the module contract, config layers and plug-in/out lifecycle.

## The hybrid form pattern

All four forms run on one shared form engine (built once in the core), so behaviour is the same everywhere:

1. **Form spec** — each module describes its fields, types, units and labels; one React renderer draws the form on phone, tablet and desktop
2. **Type** — every field is a normal input with search where it helps
3. **Field voice** — a 🎤 in each field; short audio → speech-to-text → value parsed by code (numbers, Tamil number words, units, dates, fuzzy name match). No AI model call
4. **Free-form voice** — hold the big 🎤 and say everything; speech-to-text + one module agent run returns a **form patch**
5. **Document read** (Purchase, Expense, Collection) — photo, PDF, screenshot or pasted SMS → text layer or Vision → the same form patch
6. **Merge** — patches fill empty fields and add rows; they never overwrite a value the user typed or spoke without confirmation; Undo reverts the last voice or document action
7. **Confidence** — every filled field shows normal, orange (check this) or red (couldn't read)
8. **Validate and save** — module rules run as the user fills; Save shows a summary (Expense: only when unsure); the backend `save()` writes the record — no model call
9. **Drafts** — autosaved on phone and server; work offline and sync later

**Edit and cancel** work the same everywhere: by voice ("நேத்து diesel 3500 இல்ல 3800") or by opening the record from its list. Records are never hard-deleted; cancel sets `status = cancelled`, and every change is written to `audit_log` with old and new values.

**Many entries a day.** Each form opens on a list (today's bills, this month's purchases, today's expenses, today's collections) with a drafts strip for anything unsaved or waiting for the admin. After saving, "New" starts a blank form straight away. One spoken sentence naming several customers or vendors creates several drafts.

**Customers can be added from the forms; other masters are picked, not created.** A new customer name on a bill or payment is used as-is and the customer is created on Save (flagged for review in the admin area). Items, vendors and expense categories must exist in the master; if not, the agent offers close matches or **Request admin to add**, and the draft resumes once the admin adds it in the admin area.

## Master data and the admin area

Master data is **managed in the admin area of the app (owner/admin role, best on desktop); the one exception is customers, which can also be created from the Billing and Collection forms**. All other screens read it; agents match against it. This keeps item rates, units and GST rates clean. Customers added from the forms land in a review list in the admin area, where the admin adds GSTIN/address or merges duplicates.

| Master | Fields | Used by |
| --- | --- | --- |
| Customers | name, Tamil name, phone, GSTIN, state, address, credit limit, customer price list | Billing, Collection |
| Vendors | name, Tamil name, GSTIN, state, phone | Purchase |
| Items | name, Tamil name and spoken aliases, unit(s), default rate, GST rate, HSN | Billing, Purchase |
| Customer price list | customer × item → special rate | Billing |
| Expense categories | name, Tamil name, keywords | Expense |
| GST slabs, units, invoice prefix, financial year | business-level settings | All |
| Users | name, mobile, role, 5-digit code | Login |

**Master requests.** When an agent raises "Request admin to add", the admin area shows a request queue with the spoken/typed name and the draft that's waiting. The admin approves (creating the master entry, pre-filled), merges it into an existing entry, or rejects. The owner's phone gets a notification and the draft continues. Masters can also be bulk-imported from Excel.

**Which screen manages what:**

| Setting | Owner and staff screens | Admin area (same app) |
| --- | --- | --- |
| Masters (customers, vendors, items, price lists, categories) | View and search; new customers created from the forms | Create, edit, import, merge |
| Master requests | Raise from a form | Approve / merge / reject |
| Users and 5-digit codes, roles | — | Manage |
| Agents on/off, names, auto-save, card fields | Business owner can change | Business admin can change |
| Thresholds, required fields, warning limits | — | Business admin |
| Modules, prompts, models, evals, traces, rollback | — | Vendor (platform) only |
| Reports | Reports menu | Same reports + bulk export for the accountant |
| Bills | Billing form (type / voice) | Billing form for admin and office staff; same rules, same bill numbers, A4 / thermal print |

## Voice and language handling

The app accepts Tamil, English, Tanglish and mixed Tamil-English, and replies in the language the user spoke. "Invoice podu", "Create invoice" and "இன்வாய்ஸ் போடு" must all trigger the same intent.

1. Record voice in the browser (MediaRecorder), upload to `voice-notes`
2. Whisper transcribes to text (language hint: Tamil)
3. Router model detects intent and agent
4. Agent model extracts fields into a typed JSON schema
5. Backend validates and saves (after confirmation where required)
6. Reply is sent in the user's language, e.g. "✅ டீசல் செலவு பதிவு செய்யப்பட்டது. ₹3,500"

Number handling needs explicit tests: spoken Tamil numbers ("மூவாயிரத்து ஐநூறு"), "3.5k", lakh notation, and units like மூட்டை (bag), கிலோ, லிட்டர. Customer and vendor names are matched against existing records to avoid duplicates ("Kumar Stores" vs "குமார் ஸ்டோர்ஸ்").

## Function-calling tools

The model never writes to the database: it picks a tool and arguments, the backend validates and executes, and the model phrases the result. Each agent sees only its own tools plus the shared ones. Write tools run only after the user taps Save (or the Expense auto-save rule passes).

| Agent | Read / extract tools | Write tools |
| --- | --- | --- |
| Shared | find\_customer, find\_vendor, find\_product, get\_customer\_balance, open\_report\_link, request\_master\_entry | — |
| Billing | extract\_invoice, get\_last\_invoice | create\_invoice, update\_invoice, cancel\_invoice, generate\_invoice\_pdf |
| Purchase | extract\_purchase\_bill, check\_duplicate\_bill | save\_purchase, update\_purchase, cancel\_purchase, record\_vendor\_payment |
| Expense | extract\_expense | save\_expense, update\_expense, cancel\_expense |
| Collection | extract\_collection, check\_duplicate\_reference | save\_collection, update\_collection, cancel\_collection, mark\_cheque\_status |

Reports are not model tools. The Reports menu calls plain REST endpoints (`GET /reports/...`) that run fixed SQL; the only model-facing piece is `open_report_link`, which turns a balance or total shown on a form into a link to the matching report. Endpoints are listed in Reports Menu. Arguments and behaviour for each agent tool are in the agent's tab.

## Database schema

Every business table carries `business_id` with Row Level Security; every table has `id uuid`, `created_at`, and business records carry `status` (draft / confirmed / cancelled) and `created_by`. Shared tables are below; each agent's tables are defined in full in its tab.

| Table | Owner | Purpose |
| --- | --- | --- |
| businesses | Shared | Name, GSTIN, state code, address, invoice prefix, financial-year start, GST slabs in use |
| users | Shared | Name, mobile, role (owner / staff), language preference |
| customers | Shared | Name, Tamil name, phone, GSTIN, state code, credit limit |
| vendors | Shared | Name, Tamil name, GSTIN, state code, phone |
| products | Invoice | Item master: name, Tamil name, unit, default rate, GST rate, HSN |
| invoices, invoice\_items | Invoice | Sales invoices and lines with tax split |
| purchases, purchase\_items | Purchase | Purchase bills and lines with tax split |
| vendor\_payments | Purchase | Payments made to vendors |
| expense\_categories, expenses | Expense | Categories with Tamil keywords; expense entries |
| collections, collection\_allocations | Collection | Customer payments and how each is split across invoices |
| daily\_summaries | Reports | One row per day: computed totals + owner's notes |
| chat\_messages | Shared | Every message: agent, type, text, file, intent, tool called, tool result |
| audit\_log | Shared | Every edit and cancel: table, record, old values, new values, who, when |
| agent\_modules, agent\_configs, prompt\_versions | Platform | Registered agent modules, versioned config overrides, versioned prompts with eval scores |

```sql
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  action      TEXT NOT NULL,          -- update | cancel
  old_values  JSONB,
  new_values  JSONB,
  changed_by  UUID REFERENCES users(id),
  via         TEXT,                   -- voice | text | tap
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

Outstanding balances are never stored; they come from a view: confirmed invoice totals minus collection allocations per customer, and confirmed purchase totals minus vendor payments per vendor.

## Storage

Five private Supabase Storage buckets, paths prefixed by `business_id/`, accessed through signed URLs.

| Bucket | Holds | Written by |
| --- | --- | --- |
| purchase-bills | Bill photos and scanned PDFs | Purchase agent upload |
| invoice-pdfs | Generated invoice PDFs | generate\_invoice\_pdf |
| voice-notes | Recorded voice messages | Any form |
| documents | Other uploaded files | Any form |
| profile-images | User and business logos | Profile settings |

## App screens and user journey

The journey is: Login → Home → open a form → type, speak or upload → form fills → check → Save, with the dashboard and the Reports menu updating straight away.

| Screen | Contents |
| --- | --- |
| Splash | Logo, session check |
| Login | Admin Created user 5 digit code |
| Dashboard | Today's summary cards (Sales, Purchase, Expense, Collection), each opening its report, above quick buttons for the four forms; bottom navigation: Home · Billing · Purchase · Expense · Collection, with Reports and Settings in the top bar; on tablet and desktop the bottom bar becomes a side menu |
| Billing | Today's bills list with drafts strip → bill form (customer, item rows, totals, payment) with a mic in every field and a big hold-to-speak mic for the whole bill; summary → Save → PDF / Share / Print |
| Purchase, Expense, Collection forms | Each opens on its list (purchases, expenses, collections) with drafts strip → its own form with a mic in every field and a hold-to-speak mic; Purchase adds camera / gallery / PDF upload with split-view compare; Expense uses category chips and quick rows; Collection shows the customer's balance and open bills and reads UPI screenshots, cheque photos and bank SMS |
| Reports | 7 report groups → report screen with period chips, filters, chart, table, drill-down to the record, PDF / Excel / Share; Daily summary with voice note |
| Settings | Business profile, GSTIN, invoice prefix, users, language preference |
| Admin area (same app) | Shown to owner/admin roles with a side menu on desktop: the same four forms (keyboard-first), masters (customers, vendors, items, price lists, categories), customer review list, master request queue, users and codes, agent settings, reports export; vendor console for modules, prompts and evals |

## Gaps fixed and open decisions

Changes in v2, applying the Purchase Agent model to every agent:

- One shared pattern for all agents: extract → match → validate → confirm → save, with per-field confidence and blocking vs warning rules
- Every agent has its own tab with schema, validation, scenarios, edge cases, tools, tables and acceptance criteria
- Added product master (Invoice), category keywords (Expense), invoice allocation and cheque status (Collection), vendor payables and duplicate-bill checks (Purchase), and a Reports menu outside the chat with 16 fixed reports and no AI in the numbers
- Edit and cancel are uniform, never hard-delete, and are recorded in `audit_log`
- Balances (customer outstanding, vendor payables) are computed from records, never stored

Open decisions:

- [x] GPT-5 or GPT-4o as the default model (cost per message vs Tamil accuracy)
- [ ] Whisper accuracy on Kongu/regional Tamil speech — test with 50 real voice notes before committing
- [x] Invoice PDF layout: Tamil, English or bilingual; GST tax-invoice format required?
- [ ] Can staff users see reports, or only the owner?
- [x] Edit/cancel flow for a saved entry (by voice, or tap-to-edit on the card)
- [x] Pricing and per-business AI usage limits

## Delivery phases

Phase 1 (MVP) is built in this order, so each step is usable before the next starts:

1. Foundation — agent platform core (registry, config resolver, agent factory, shared hybrid form engine and renderer), Supabase schema, RLS, storage buckets, Next.js app shell (PWA install, responsive layout, offline drafts) with the admin area (masters, customer review, master requests, users; every form works on phone and desktop from the start), admin user creation and 5-digit code login, Express backend skeleton
2. Billing form by typing — the form engine, bill list, drafts, numbering, PDF; proves the shared form pattern end to end
3. Voice on forms — field voice (code parsing of Tamil numbers, units, dates, names) and free-form voice (one agent run → form patch), first on Billing
4. Expense and Collection forms — quick rows and chips; balance and bill allocation; receipt, UPI screenshot, cheque photo and SMS reading; all screens follow the Billing Voice Form design
5. Purchase form — bill photo and PDF upload, Vision reading, split-view compare, GST and duplicate checks, Pay vendor form
6. Reports menu and dashboard — 16 fixed reports with filters, drill-down and export; daily summary
7. Pilot — 3–5 real Tamil-speaking businesses for two weeks; fix extraction errors before wider release

Phase 2 candidates: WhatsApp sharing of invoices, payment reminders for outstanding customers, stock tracking, GST e-invoicing, Tally export, offline queueing.

## Development setup

- Build in **VS Code with the Claude Code extension** (diffs to accept or reject, @-mention files); use `claude` in the integrated terminal for long, hands-off runs
- Put this file in the repo as `docs/PLAN.md`; add a short `CLAUDE.md` with the stack (Next.js + TypeScript + Tailwind tokens, Supabase, Express, OpenAI Agents SDK) and the hard rules: no AI in report numbers, nothing saved without the user tapping Save, OpenAI key only on the server
- Build order: 1 Login + Home → 2 shared form engine (voice, mic, summary components) → 3 Billing → 4 Purchase → 5 Expense → 6 Collection → 7 Reports → 8 Admin area; commit after each phase

---

# Mobile Web App — Use Cases and Screens

## Why a mobile-first web app

The app needs no native Android features, so it is built as **one mobile-first web app** that also serves tablets and desktops, and that replaces both the Android app and the separate web admin dashboard. Owners install it to the phone's home screen (PWA), where it opens full screen like an app. Benefits: one codebase, no Play Store reviews, every fix live on the next page load, works on iPhone too, and the forms behave the same on every device. If a store listing is ever needed, the same app can be wrapped for the Play Store later.

## Front-end stack

| Part | Choice |
| --- | --- |
| Framework | Next.js (App Router), React, TypeScript |
| Styling | Tailwind CSS with the design tokens as CSS variables (see the Billing tab) |
| Data and auth | Supabase JS client (auth session, Realtime for live lists); calls to the Node backend for agents, documents and saves |
| Server state | TanStack Query (caching, retries, background refresh) |
| Forms | React Hook Form + Zod, driven by each module's form spec |
| Offline | Service worker (Workbox / next-pwa) + IndexedDB queue for drafts, photos and voice clips |
| PWA | Web app manifest, install prompt, Web Share Target, Web Push |
| Fonts | Hanken Grotesk + Noto Sans Tamil via next/font |
| Hosting | Next.js on Vercel or a Node server; backend API and Supabase as before |

## Browser features used

| Need | Browser feature | Android Chrome | iPhone Safari |
| --- | --- | --- | --- |
| Field and free-form voice | getUserMedia + MediaRecorder | Yes | Yes |
| Bill, receipt, cheque, UPI photos | Camera via file input with capture, or getUserMedia | Yes | Yes |
| PDF upload | File input | Yes | Yes |
| Share bill PDF / receipt to WhatsApp | Web Share API with files | Yes | Yes |
| Share a GPay screenshot into the app | Web Share Target (installed app) | Yes | No — use the upload button |
| Offline drafts and photo queue | Service worker + IndexedDB | Yes | Yes (sync when app opens) |
| Notifications | Web Push | Yes | Yes, once added to home screen |
| Blur check before upload | Canvas image check in the browser | Yes | Yes |
| Bluetooth thermal printer | Web Bluetooth | Some printers | No — share PDF or print |

## Responsive layout

| Width | Layout |
| --- | --- |
| Phone (< 640 px) | Designed first at 390 px: bottom bar, one column, big mics |
| Tablet (640–1023 px) | Side menu replaces the bottom bar; forms in a centred column |
| Desktop (≥ 1024 px) | Side menu; list and form side by side; keyboard-first entry; admin area pages use wide tables |

## Users and navigation

| Role | Who | Sees |
| --- | --- | --- |
| Owner | Business owner | Everything, including the admin area |
| Admin | Office manager or accountant the owner trusts | Admin area, all forms, all reports |
| Staff | Counter or office staff | The four forms; reports allowed by the role setting |
| Platform (you) | The vendor running the product | The /platform section only: modules, prompts, evals, traces |

Users are created in the admin area; the app has no public sign-up. One login works on every device, and drafts and lists stay in sync across them.

**Navigation:** Splash → Login → Home. On phones, a bottom bar of five tabs — **Home**, **Billing**, **Purchase**, **Expense**, **Collection** — with Reports, notifications and settings in the Home top bar. On tablet and desktop the same items sit in a side menu, with an **Admin** section added for owner and admin roles. Each tab opens on its list, and every list opens its hybrid form.

## Use case list

| ID | Use case | Actor | Input | Screens |
| --- | --- | --- | --- | --- |
| **Access** |  |  |  |  |
| UC-01 | Log in with mobile number and 5-digit code | Owner, staff | Type | S-01, S-02 |
| UC-02 | Stay logged in; lock after inactivity | Owner, staff | — | S-01 |
| UC-03 | Log out | Owner, staff | Tap | S-30 |
| **Home** |  |  |  |  |
| UC-04 | See today's sales, purchases, expenses, collections | Owner | Tap | S-03 |
| UC-05 | See drafts waiting and alerts | Owner, staff | Tap | S-03, S-31 |
| **Billing** |  |  |  |  |
| UC-06 | Create a bill by typing | Owner, staff | Type | S-05, S-08 |
| UC-07 | Fill a bill one field at a time by voice | Owner, staff | Field voice | S-05, S-06 |
| UC-08 | Create a whole bill by speaking once | Owner, staff | Free-form voice | S-07, S-05 |
| UC-09 | Create several bills from one sentence | Owner, staff | Free-form voice | S-07, S-04 |
| UC-10 | Add a new customer while billing | Owner, staff | Voice / type | S-06 |
| UC-11 | Request a missing item from the admin | Owner, staff | Tap | S-05 |
| UC-12 | Correct a field; undo last voice action | Owner, staff | Mixed | S-05 |
| UC-13 | Set payment: cash, credit, partial | Owner, staff | Tap / voice | S-05 |
| UC-14 | Save after summary; PDF; share on WhatsApp; print | Owner, staff | Tap | S-08, S-09 |
| UC-15 | Resume a draft bill | Owner, staff | Tap | S-04 |
| UC-16 | Find, view, edit or cancel a saved bill | Owner (staff: view) | Tap / search | S-04, S-09 |
| **Purchase** |  |  |  |  |
| UC-17 | Photograph a supplier bill (one or more pages) and let it fill the form | Owner, staff | Camera | S-11, S-12, S-13 |
| UC-18 | Upload a supplier PDF and let it fill the form | Owner, staff | PDF | S-12, S-13 |
| UC-19 | Compare the filled form with the bill in split view | Owner, staff | Tap / zoom | S-14 |
| UC-20 | Enter a purchase without a bill by voice or typing | Owner, staff | Voice / type | S-13 |
| UC-21 | Choose Items or Total only | Owner, staff | Tap | S-13 |
| UC-22 | Fix a misread field; handle duplicate and totals warnings | Owner, staff | Tap / voice | S-13, S-14 |
| UC-23 | Request a missing vendor or item from the admin | Owner, staff | Tap | S-13 |
| UC-24 | Pay a vendor and apply it to unpaid bills | Owner | Voice / type | S-15 |
| UC-25 | Find, view, edit or cancel a purchase; see its bill file | Owner | Tap / search | S-11, S-19 |
| **Expense** |  |  |  |  |
| UC-26 | Add an expense with a category chip and keypad | Owner, staff | Tap | S-16, S-17 |
| UC-27 | Repeat a frequent expense with one tap | Owner, staff | Tap | S-17 |
| UC-28 | Add several expenses by speaking once | Owner, staff | Free-form voice | S-17 |
| UC-29 | Add an expense from a receipt photo | Owner, staff | Camera | S-17, S-12 |
| UC-30 | Undo, edit or cancel an expense | Owner, staff | Tap | S-16, S-17 |
| **Collection** |  |  |  |  |
| UC-31 | Record a payment and see the balance update | Owner, staff | Type / voice | S-21 |
| UC-32 | Fill from a UPI screenshot (or share it from GPay) | Owner, staff | Image / share | S-21, S-12 |
| UC-33 | Fill from a cheque photo or pasted bank SMS | Owner, staff | Image / paste | S-21, S-12 |
| UC-34 | Change how a payment is applied to bills; save extra as advance | Owner, staff | Tap | S-21 |
| UC-35 | Share a payment receipt | Owner, staff | Tap | S-21 |
| UC-36 | Mark a cheque cleared or bounced | Owner | Tap | S-20 |
| **Reports** |  |  |  |  |
| UC-37 | Open any of the 16 reports with period and filters | Owner (staff: allowed) | Tap | S-25, S-26 |
| UC-38 | Drill down from a report row to the record | Owner | Tap | S-26 |
| UC-39 | Export a report as PDF or Excel; share it | Owner | Tap | S-26 |
| UC-40 | See a customer's statement and balance | Owner | Tap | S-27 |
| UC-41 | Read the daily summary and add a voice note | Owner | Voice / type | S-28 |
| **Masters and settings** |  |  |  |  |
| UC-42 | Look up a customer, vendor or item | Owner, staff | Search | S-22 |
| UC-43 | Track item and vendor requests sent to the admin | Owner, staff | Tap | S-23 |
| UC-44 | Change language; daily summary time; notifications | Owner, staff | Tap | S-30 |
| UC-45 | Pair a Bluetooth bill printer | Owner | Tap | S-30 |
| **Offline** |  |  |  |  |
| UC-46 | Keep filling forms and taking bill photos offline; sync later | Owner, staff | — | All forms |

**Admin area use cases** (owner and admin roles; best on desktop, also usable on a phone):

| ID | Use case | Actor | Screens |
| --- | --- | --- | --- |
| UC-47 | Create users, set roles and 5-digit codes; deactivate users | Owner, admin | A-02 |
| UC-48 | Add, edit, import (Excel) customers, vendors and items; set customer prices | Owner, admin | A-03, A-04 |
| UC-49 | Review customers created from forms; add GSTIN/address; merge duplicates | Owner, admin | A-05 |
| UC-50 | Approve, merge or reject master requests; the waiting draft resumes | Owner, admin | A-06 |
| UC-51 | Manage expense categories and keywords | Owner, admin | A-04 |
| UC-52 | Business profile: GSTIN, address, logo, invoice prefix, financial year, GST slabs | Owner | A-07 |
| UC-53 | Agent settings: on/off, auto-save, thresholds, required fields | Owner, admin | A-08 |
| UC-54 | Bulk export reports for the accountant | Owner, admin | A-09 |
| UC-55 | View the audit log of edits and cancellations | Owner | A-10 |
| UC-56 | Manage modules, prompts, models, evals, traces (platform only) | Platform | P-01 |

## Screen list

All screens follow the look of the [Billing Voice Form](https://claude.ai/artifact/FG6ahqjt6nijdQiUJNtd33) design. Gaps in the numbering (S-10, S-18, S-24, S-29) are kept free for future modules such as Stock or Quotation.

| ID | Screen | Purpose | Main elements | Actions | Goes to |
| --- | --- | --- | --- | --- | --- |
| **Access** |  |  |  |  |  |
| S-01 | Splash | Start, check session | Logo | — | S-02 or S-03 |
| S-02 | Login | Sign in | Mobile number, 5-digit code boxes, language switch | Log in | S-03 |
| **Home** |  |  |  |  |  |
| S-03 | Home | Today at a glance | 4 summary cards, drafts waiting, alerts, quick buttons (New bill, Scan purchase bill, Add expense, Record payment); top bar: Reports, notifications, settings | Tap card → report | S-04, S-11, S-16, S-20, S-25, S-30, S-31 |
| **Billing** |  |  |  |  |  |
| S-04 | Today's bills | Bill list | Day total, date, search, drafts strip, bill rows | New bill; speak a bill | S-05, S-07, S-09 |
| S-05 | Bill form | Create or edit a bill | Customer + balance, item cards with mics, totals, payment, Guided, Undo, Save, big mic | Type, field voice, free-form voice | S-06, S-07, S-08 |
| S-06 | Field voice + match chooser | One field by voice (shared by all forms) | Listening outline, waveform, matches, + New | Pick; "அடுத்து" | Back to the form |
| S-07 | Free-form voice sheet | Speak everything (shared by all forms) | Timer, waveform, live transcript, understood chips | Release to fill; slide to cancel | Back to the form |
| S-08 | Save summary | Confirm and finish (shared layout) | Key fields, warnings, balance before/after; after save: PDF, Share, Print, New | Confirm | Form or list |
| S-09 | Bill view | Saved bill | PDF preview, status, edit history | Share, Print, Edit, Cancel | S-05 |
| **Purchase** |  |  |  |  |  |
| S-11 | Purchases list | This month's purchases | Month total, drafts strip, Unpaid and Bills-without-photo filters, rows with bill thumbnail | Scan bill; New purchase; speak | S-12, S-13, S-15, S-19 |
| S-12 | Capture and upload (shared) | Photo, gallery or PDF | Camera with edge guide, blur warning, add page, page thumbnails, gallery, PDF picker | Capture, retake, add page, done | The calling form |
| S-13 | Purchase form | Create or edit a purchase | Bill strip with "Reading bill…", vendor, GSTIN, bill no/date, Items / Total only toggle, item rows, totals with GST split, payment, mics, Save | Upload, type, field voice, free-form voice | S-12, S-14, S-06, S-07, S-08 |
| S-14 | Split-view compare | Check figures against the bill | Bill image on top (zoom), form below, outlined fields to check | Fix fields | S-13 |
| S-15 | Pay vendor form | Pay a vendor | Vendor, payable, amount, mode, reference, unpaid bills with amounts | Type / voice; Save | S-08 |
| S-19 | Record view (shared) | Saved purchase, expense or collection | All fields, original file, edit history | Edit, Cancel | The form |
| **Expense** |  |  |  |  |  |
| S-16 | Today's expenses | Expense list | Day total, by-category strip, rows, date picker | Add expense; speak | S-17, S-19 |
| S-17 | Expense quick form | Add one or more expenses | Date and paid-by line, category chips, "again" chips, entry rows (category, what for, amount, 🧾, 🎤), total, Save | Tap, keypad, voice, receipt photo | S-12, S-06, S-07 |
| **Collection** |  |  |  |  |  |
| S-20 | Today's collections | Collection list | Totals by mode, pending cheques strip, rows | Record payment; speak; mark cheque | S-21, S-19, S-27 |
| S-21 | Collection form | Record a payment | Customer + outstanding, amount, mode chips, reference / cheque fields, proof upload, apply-to-bills list, advance, adjustment, outstanding after, Save | Type, voice, screenshot, cheque photo, SMS paste | S-12, S-06, S-07, S-08 |
| **Masters** |  |  |  |  |  |
| S-22 | Masters lookup | View customers, vendors, items | Tabs, search, details | Open statement | S-27 |
| S-23 | My requests | Requests sent to the admin | Status per request, linked draft | Open draft | S-05, S-13 |
| **Reports** |  |  |  |  |  |
| S-25 | Reports menu | Pick a report | 7 groups, 16 reports | Open | S-26, S-27, S-28 |
| S-26 | Report screen (shared layout) | Read a report | Period chips, filters, headline, chart, table | Filter, drill down, PDF, Excel, Share | S-09, S-19, S-27 |
| S-27 | Customer statement | One customer's ledger | Bills, payments, running balance, ageing | Share | S-09, S-19 |
| S-28 | Daily summary | Evening wrap-up | Day totals, drafts, owner note | Add note | S-26 |
| **Settings and alerts** |  |  |  |  |  |
| S-30 | Settings | Options | Profile, language, notifications, summary time, printer, log out | Change | S-02 |
| S-31 | Notifications | Alerts | Summary ready, request approved, cheque due, draft waiting, bill made on web | Open related screen | Any |

**Admin area screens** (same app, shown only to owner and admin roles; desktop layout with wide tables, still usable on a phone):

| ID | Screen | Purpose | Main elements |
| --- | --- | --- | --- |
| A-01 | Admin home | Admin to-do | Counts: customers to review, master requests waiting, users, last import |
| A-02 | Users | Manage logins | User list, role, active, reset 5-digit code |
| A-03 | Customers and vendors | Manage parties | Table with search and filters, GSTIN, state, credit limit, price list; Excel import |
| A-04 | Items and categories | Manage items and expense categories | Item table (unit, rate, GST, HSN, Tamil name, spoken aliases); categories with keywords |
| A-05 | Customer review | Clean up customers created from forms | New customers with suggested duplicates; edit, merge, approve |
| A-06 | Master requests | Handle requests from forms | Requested name, who asked, waiting draft; approve (pre-filled), merge, reject |
| A-07 | Business profile | Business details | GSTIN, address, logo, invoice prefix, financial year, GST slabs |
| A-08 | Agent settings | Per-business agent options | Generated from each module's config schema |
| A-09 | Exports | Accountant packs | Pick reports and period; PDF / Excel download |
| A-10 | Audit log | Who changed what | Filter by record, user, date; old → new values |
| P-01 | Platform console | Vendor only (/platform) | Modules, platform overrides, prompt versions, eval scores, traces, rollback |

**Common across screens:** bilingual labels; a mic on every input that takes voice; offline banner when there is no network; content descriptions on every icon button; pull to refresh on lists.

## Build order

| Sprint | Screens | Use cases covered |
| --- | --- | --- |
| 1 | Next.js app shell, PWA install, responsive layout; S-01, S-02, S-03 (static), S-30; A-02 Users | UC-01 to UC-03, UC-44, UC-47 |
| 2 | Shared form engine; S-04, S-05, S-08, S-09 by typing; A-03, A-04 masters with Excel import | UC-06, UC-13 to UC-16, UC-46, UC-48, UC-51 |
| 3 | S-06, S-07 shared voice on Billing; A-05, A-06 review and requests | UC-07 to UC-12, UC-49, UC-50 |
| 4 | S-16, S-17, S-20, S-21, S-19 | UC-26 to UC-36 |
| 5 | S-11 to S-15 (bill photo and PDF upload) | UC-17 to UC-25 |
| 6 | S-25 to S-28, S-03 live cards, A-09 exports | UC-04, UC-05, UC-37 to UC-41, UC-54 |
| 7 | S-22, S-23, S-31, A-07, A-08, A-10, P-01 | UC-42, UC-43, UC-45, UC-52, UC-53, UC-55, UC-56 |

The admin screens are built alongside the forms that need them (masters before Billing, requests with voice), so there is never a separate admin project. The form engine, voice sheet, field voice, capture screen and save summary are built once and reused by all four forms. Every screen is tested at 390 px first, then tablet and desktop.

---

# Agent Platform

## Principle

The backend is a fixed **core** plus a set of **agent modules**. Each agent (Billing, Purchase, Expense and any future one) is a self-contained module that plugs into the core through one contract. Its behaviour — prompt, model, thresholds, fields, categories — comes from **configuration stored in the database**, with the values in this plan as the defaults.

This gives three properties:

- **Modular:** adding a Stock or Quotation agent means adding one module folder and enabling it; removing one means disabling it. The core, the app and the other agents don't change
- **Dynamic:** a business (or you, as the vendor) can change an agent's prompt, model, confidence threshold, required fields or categories without a code release
- **Safe defaults:** a business that never touches settings gets exactly the behaviour specified in each agent's tab

The core owns everything shared: auth, chat storage, speech-to-text, file upload, OCR, the OpenAI Agents SDK runtime, the confirmation-card flow, audit log, and the Reports menu framework.

## Architecture

> Diagram: agent platform · code + config → factory → SDK → handlers (see the plan document)

The model sits in one layer only; everything that decides what is saved is module code driven by config.

## Module contract

Every agent module exports one object that implements this interface. The core never imports a specific agent; it only talks to `AgentModule`.

```ts
export interface AgentModule<Draft = unknown> {
  // identity
  id: string;                         // 'purchase'
  version: string;                    // '1.2.0'
  title: { en: string; ta: string };  // shown in the chat list
  icon: string;
  inputs: Array<'voice' | 'text' | 'image' | 'pdf'>;

  // defaults for every configurable value (see Dynamic configuration)
  defaultConfig: AgentConfig;
  configSchema: z.ZodType<AgentConfig>;   // validates overrides

  // AI side
  buildInstructions(cfg: AgentConfig, ctx: BusinessContext): string;
  tools(cfg: AgentConfig): Tool[];          // read/match tools only
  outputSchema: z.ZodType<Draft>;           // extraction schema
  handoffTargets?: string[];                // e.g. expense → ['purchase']

  // deterministic side (no AI)
  match(draft: Draft, ctx: BusinessContext): Promise<Draft>;
  validate(draft: Draft, cfg: AgentConfig): ValidationResult;  // blocking + warnings
  card(draft: Draft, v: ValidationResult, cfg: AgentConfig): CardSpec; // server-driven UI
  autoSave?(draft: Draft, v: ValidationResult, cfg: AgentConfig): boolean;

  // data side
  save(draft: Draft, user: User): Promise<RecordRef>;
  update(id: string, changes: Partial<Draft>, user: User): Promise<RecordRef>;
  cancel(id: string, reason: string, user: User): Promise<void>;

  // plug-ins into shared surfaces
  reports?: ReportDefinition[];       // added to the Reports menu
  dashboardCard?: DashboardCardDefinition;
  migrations: string[];               // SQL files this module owns
  evalSet: string;                    // path to golden test cases
}
```

The split matters: the model only ever produces a `Draft`. Matching, validation, the card, and saving are plain code in the module, so they are testable and can't be talked around by a prompt.

## Dynamic configuration

Configuration is resolved in three layers, each overriding the one before. Only the keys that differ are stored, so a module upgrade that improves a default reaches every business that hasn't overridden it.

1. **Module default** — `defaultConfig` in code, equal to this plan
2. **Platform override** — set by you (the vendor) for all businesses, e.g. switch every Purchase agent to a newer model
3. **Business override** — set by a business's admin in Settings → Agents

| Setting | Example (Purchase default) | Who can change |
| --- | --- | --- |
| enabled | true | Platform, business admin |
| title, icon | Purchase / கொள்முதல், 🧾 | Business admin |
| model | per Open decisions on the Overview | Platform |
| prompt template + version | purchase-prompt v3 | Platform (business can add notes appended to it) |
| reply language | follow user | Business admin |
| tool allowlist | find_vendor, check_duplicate_bill | Platform |
| confidence threshold | 0.8 | Platform, business admin |
| required fields | vendor, total | Business admin (can add, not remove core ones) |
| warning rules on/off + limits | large amount = 5× average | Business admin |
| auto-save rule | off (Expense: on, ≥ 0.9) | Business admin |
| categories / keywords | Expense categories table | Business admin |
| card fields shown | bill no, date, GST split, items | Business admin |
| guardrails | off-topic block on | Platform |

Every saved config is a new version with who and when; rollback is choosing an earlier version. The resolved config is cached per business for 5 minutes and cleared on save. Each override is checked against the module's `configSchema` before it is accepted, so a bad value can't break an agent.

## Request flow per message

1. App sends `POST /agents/{agentId}/messages` with text, voice file or image
2. Core checks the module is registered **and** enabled for this business; otherwise returns "agent not available"
3. Core resolves config (module default → platform → business) from cache
4. Core pre-processes input: speech-to-text, file upload, OCR text
5. **Agent factory** builds an OpenAI Agents SDK `Agent` from the module: `instructions = buildInstructions(cfg)`, `tools = tools(cfg)`, `outputType = outputSchema`, model from config, guardrails from config, handoffs to enabled `handoffTargets` only
6. Core calls `run(agent, input + last N chat turns)` → `Draft`
7. Module `match()` → `validate()` → `card()`; core returns the `CardSpec` to the app (or auto-saves if `autoSave()` says so)
8. User taps Save → `POST /agents/{agentId}/drafts/{id}/save` → module `save()` — no model call
9. Core writes `chat_messages`, `audit_log` and the run's trace id for debugging

Agents are built per request from config, so a config change takes effect on the next message with no restart.

## Plug in, plug out

| Step | Plug in a new agent | Plug out an agent |
| --- | --- | --- |
| Code | Add `modules/<id>/` implementing `AgentModule`; register it in `modules/index.ts` | Nothing (code stays until you choose to delete it) |
| Database | Core runs the module's `migrations` once; tables are prefixed or owned by the module | Tables and data are **kept**; nothing is dropped |
| Quality gate | Module's `evalSet` must pass before it can be enabled anywhere | — |
| Enable | Platform enables for all, or business admin turns it on in Settings → Agents | Turn off at platform or business level |
| App | Chat appears in the list, its reports in the Reports menu, its dashboard card on the dashboard — all from the registry, no redeploy | Chat, reports and card disappear; history stays viewable read-only |
| Handoffs | Other agents can hand off to it only once it is enabled | Handoffs to it are skipped automatically |

Modules depend only on the core, never on each other. Shared data (customers, vendors, products) is reached through core services, so removing one module never breaks another.

Example modules that fit this contract later:

| Module | Job | Plugs into |
| --- | --- | --- |
| Stock | Stock in/out by voice; low-stock alerts | Reads purchase and invoice items; adds stock reports |
| Quotation | Quotes by voice; convert to invoice | Hands off to Invoice |
| Attendance and wages | "இன்னைக்கு 6 பேர் வேலைக்கு வந்தாங்க" | Feeds Expense (Wages) |
| Delivery challan | Dispatch notes with vehicle no | Linked to invoices |
| Payment reminder | Drafts WhatsApp reminders for overdue customers | Reads outstanding report |

## Server-driven app

For plug-in/out to work without a code change, the app renders agents from data rather than hard-coding them:

- **Chat list:** `GET /agents` returns the enabled agents for this user with title, icon, input types and unread count
- **Confirmation card:** the module returns a `CardSpec` — a list of typed fields (text, money, date, choice, toggle, item table, image, warning) with values, confidence and messages. One generic React component renders any module's card
- **Reports menu:** `GET /reports/catalog` returns groups and reports from every enabled module; each report screen uses the shared layout with parameters from its `ReportDefinition`
- **Dashboard:** summary cards come from each module's `dashboardCard`
- **Settings → Agents:** a form generated from the module's `configSchema`, so new settings need no app change

**Chat modules and form modules.** A module declares its UI as `form (all four MVP modules: Billing, Purchase, Expense, Collection) or chat (kept for future modules that suit conversation`). A form module also provides a `formSpec` (fields, types, units, labels), a `parseField(field, transcript)` for field-by-field voice, and returns a **form patch** from free-form voice; modules that accept documents (Purchase bills and PDFs, Expense receipts, Collection payment proofs) also provide readDocument(file) returning the same patch. The same generic form renderer draws it on phone, tablet and desktop, so a future form-style module (for example Quotation) plugs in the same way.

The app needs a release only for a genuinely new field type or input type (for example, a barcode scanner).

## Database

```sql
CREATE TABLE agent_modules (            -- one row per registered module
  id           TEXT PRIMARY KEY,        -- 'purchase'
  version      TEXT NOT NULL,
  title_en     TEXT, title_ta TEXT, icon TEXT,
  platform_enabled BOOLEAN DEFAULT true,
  eval_passed_version TEXT,             -- last version that passed its eval set
  registered_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_configs (            -- versioned overrides
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id    TEXT NOT NULL REFERENCES agent_modules(id),
  scope        TEXT NOT NULL,           -- platform | business
  business_id  UUID REFERENCES businesses(id),  -- null for platform
  version      INT NOT NULL,
  overrides    JSONB NOT NULL,          -- only keys that differ from default
  is_active    BOOLEAN DEFAULT true,
  changed_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (module_id, scope, business_id, version)
);

CREATE TABLE prompt_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   TEXT NOT NULL REFERENCES agent_modules(id),
  version     INT NOT NULL,
  template    TEXT NOT NULL,            -- with {{business_name}}, {{categories}} …
  eval_score  NUMERIC(5,2),             -- result on the module's eval set
  status      TEXT DEFAULT 'draft',     -- draft | live | retired
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (module_id, version)
);
```

`chat_messages` gains `module_id`, `module_version`, `config_version` and `trace_id`, so any reply can be traced back to the exact prompt and settings that produced it.

## Backend folder structure

```
backend/
  core/
    agents/        registry.ts, factory.ts, config-resolver.ts
    pipeline/      speech.ts, ocr.ts, files.ts
    cards/         card-spec.ts
    reports/       catalog.ts, runner.ts
    services/      customers.ts, vendors.ts, products.ts, audit.ts
    http/          agents.routes.ts, reports.routes.ts, settings.routes.ts
  modules/
    index.ts       register([invoice, purchase, expense, collection])
    invoice/       module.ts, prompt.md, schema.ts, validate.ts, card.ts,
                   save.ts, reports.ts, migrations/, evals/
    purchase/      …same shape
    expense/       …
    collection/    …
```

## Admin screens

- **In the app, Settings → Agents** (business admin): turn agents on/off, rename, auto-save, card fields. Thresholds, required fields, masters and users are in the admin area of the same app. Forms generated from `configSchema`
- **Vendor console** (you only; a /platform section of the same web app, hidden from businesses): register modules, set platform overrides, edit and publish prompt versions, view eval scores, roll back a config or prompt, read traces

## Testing

- Each module ships an eval set (inputs + expected drafts) taken from its acceptance criteria
- A new prompt version or model can go `live` only if its eval score is at or above the current live version
- A business override is tested against the eval set's subset for that setting before it is saved (e.g. raising the confidence threshold)
- Contract tests check every registered module implements the interface and its migrations apply cleanly

## Building the OpenAI agents (how and when)

Agents are not created in the OpenAI dashboard. Each agent is a small piece of TypeScript in the backend (`@openai/agents` + `zod`), built per request from the module's config.

### Where AI is used

| Feature | AI? |
| --- | --- |
| Typing into forms, masters, login, saving | None |
| Field-by-field voice | Speech-to-text only; a code function (`parseField`) turns "இருபத்தஞ்சாயிரம்" into 25000 |
| **Free-form voice** ("Kumar Stores 10 bag cement 400 rate, credit") | **One agent run** → form patch |
| **Bill / receipt / UPI screenshot read** (Purchase, Expense, Collection) | **One agent run** with the image → same form patch |
| Reports | None, ever |

There are **four agents**, one per form: Billing, Purchase, Expense, Collection. Each does one job: turn messy Tamil/Tanglish speech or a picture into structured form data. Matching, validation and saving stay in plain code.

### Agent shape

```ts
// modules/billing/agent.ts
import { Agent, tool } from '@openai/agents';
import { z } from 'zod';

export const BillPatch = z.object({
  customer: z.object({ name: z.string(), confidence: z.number() }).nullable(),
  items: z.array(z.object({
    name: z.string(), qty: z.number(), unit: z.string().nullable(),
    rate: z.number().nullable(), confidence: z.number(),
  })),
  payment: z.enum(['paid', 'credit', 'partial']).nullable(),
  amount_paid: z.number().nullable(),
});

const findCustomer = tool({
  name: 'find_customer',
  description: 'Fuzzy search the customer master',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }, ctx) => searchCustomers(ctx.businessId, query), // read-only
});

export function buildBillingAgent(cfg: AgentConfig) {
  return new Agent({
    name: 'billing',
    model: cfg.model,
    instructions: cfg.prompt,          // prompt.md + business settings
    tools: [findCustomer, findItem],   // read-only tools only
    outputType: BillPatch,             // forces structured output
  });
}
```

Free-form voice endpoint:

```ts
const agent = buildBillingAgent(resolveConfig('billing', businessId));
const result = await run(agent, `Current form: ${JSON.stringify(form)}\nUser said: ${transcript}`);
const patch = result.finalOutput;            // typed BillPatch
const checked = billing.validate(patch);     // plain code, no AI
return billing.toFormPatch(checked);         // form fills on the phone
```

Check the current `@openai/agents` docs for exact API names before building; the SDK changes often.

### Rules

- The OpenAI key is used **only on the server**, never in the Next.js front end (see "OpenAI API key management" below)
- Agent tools are **read-only**: lookups only; saving happens only when the user taps Save
- Always use `outputType`, so the result is JSON the code can check, not free text
- Tracing on, so a misread Tamil phrase can be debugged

### When to build them

1. **Phases 1–2, no agents:** login, Home, masters, the shared form engine with typing and field voice. The app is already usable
2. **Phase 3, Billing agent first:** collect 20–30 real Tamil/Tanglish bill sentences with expected results (the eval set) *before* writing the prompt; tune until it passes
3. **Phase 4, Purchase agent:** add the document read (photo/PDF → same patch); test on 100 real bills
4. **Phases 5–6, Expense then Collection:** copy the Billing pattern
5. **Last:** move config into the database tables above, so prompts and limits change without a code release. Until then, `defaultConfig` in code is enough

## OpenAI API key management

The OpenAI key is **stored in the database and managed from the admin screen**. It is still used only by the server: the admin enters it once, the backend stores it encrypted, and it is never sent back to any browser or phone.

### Flow

1. **Admin saves the key:** Settings → AI → OpenAI key → paste → Save. Sent once over HTTPS to the backend
2. **Backend encrypts it:** stored in Supabase Vault, or in `ai_credentials` encrypted with AES-256-GCM
3. **Only the backend reads it:** decrypted into memory when an agent runs, cached for about 5 minutes
4. **The screen never shows it again:** only `sk-…a9F2`, date set, set by, and **Test** / **Replace** / **Remove**

One secret stays outside the database: the **master encryption key** (or the Supabase service key), in the server's environment variables — never in the database or the front end. Otherwise a database backup would expose the OpenAI key.

### Who manages which key

| Level | Who | Use |
| --- | --- | --- |
| **Platform key** | Vendor (vendor console) | Default for every business; vendor pays OpenAI and bills businesses |
| **Business key** (optional) | Business admin | A business using its own OpenAI account |

Resolution at run time: **business key → platform key → AI features off** (forms still work by typing).

### Table

```sql
CREATE TABLE ai_credentials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          TEXT NOT NULL,                 -- platform | business
  business_id    UUID REFERENCES businesses(id),
  provider       TEXT NOT NULL DEFAULT 'openai',
  key_encrypted  BYTEA NOT NULL,                -- or a Supabase Vault secret id
  key_last4      TEXT NOT NULL,
  is_active      BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMPTZ, last_test_ok BOOLEAN,
  set_by         UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (scope, business_id, provider)
);
-- RLS on, no policies for app users → only the backend (service role) can read it

CREATE TABLE ai_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id),
  module_id    TEXT NOT NULL,                  -- billing | purchase | expense | collection
  kind         TEXT NOT NULL,                  -- agent_run | transcription | vision
  input_tokens INT, output_tokens INT, audio_seconds NUMERIC(8,2),
  key_scope    TEXT NOT NULL,                  -- platform | business
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### Endpoints

| Endpoint | Who | Does |
| --- | --- | --- |
| GET /settings/ai-key | Business admin / vendor | Returns last4, date, set by, test status — never the key |
| PUT /settings/ai-key | Business admin / vendor | Encrypts and saves; clears the cache; writes audit_log |
| POST /settings/ai-key/test | Business admin / vendor | One cheap OpenAI call; saves the result |
| DELETE /settings/ai-key | Business admin / vendor | Removes the key; falls back to platform key |

### Safety rules

- No endpoint ever returns the key; logs and error messages never contain it
- Every save, replace and remove is written to `audit_log`; the cache is cleared on change
- Usage is recorded per business in `ai_usage`, so cost is visible and a monthly limit can be set per business
- Only admin roles can open Settings → AI; the backend enforces this, not just the menu

---

# Billing — Voice Form

## Purpose

Billing is a **form, not a chat**. The owner sees a normal bill — customer, item rows, totals — and fills it any way that suits the moment: typing, speaking one field at a time, or saying the whole bill in one go. Purchase, Expense and Collection are hybrid forms too, each shaped to its own job.

Why a form for billing:

- A bill is a fixed structure (customer, lines, tax, total) that the owner checks line by line; a form shows it all at once, a chat scatters it across bubbles
- Correcting one wrong rate is a single tap or a single word on that field, not another message
- Typing and voice mix naturally: say the items, type the GSTIN
- 5–10 bills a day become a bill list, not a long scroll of chat
- The same form works on phone, tablet and desktop in one web app

Rules carried over from the earlier plan: customers can be new (created on Save, flagged for review in the admin area); items come from the item master; nothing is saved until the owner taps Save; bill numbers are one sequence across every device.

## Screen layout

> Diagram: bill form mockup · phone (see the plan document)

Every input field carries its own mic; the big mic at the bottom takes the whole bill at once. Typing works in every field at any time.

## UI design reference (use during development)

The approved mobile-first design is the [Billing Voice Form](https://claude.ai/artifact/FG6ahqjt6nijdQiUJNtd33) canvas. Developers build the billing screens to match it; any visual change is made on the canvas first, then in code.

| Screen on the canvas | Build as | Notes |
| --- | --- | --- |
| 1 · Bill form (filled) | `BillFormScreen` | Customer card, item cards with Qty / Rate / Amount, totals, payment buttons, Save + hold-to-speak bar |
| 2 · Field voice: customer | Listening state of a field + `MatchChooser` | Teal outline, live waveform, best match first, + New customer last |
| 3 · Free-form voice: whole bill | `FreeVoiceSheet` (bottom sheet) | Live transcript, "understood" chips, slide to cancel, release to fill |
| 4 · Today's bills | `BillListScreen` | Day total, drafts strip, bill rows, + New bill and Speak a bill |

**Design tokens as CSS variables** (defined once in the global stylesheet, e.g. `--color-primary`, and mapped into the Tailwind theme so they change in one place):

| Token | Value | Used for |
| --- | --- | --- |
| background | #F6F5F1 | Screen background |
| surface | #FFFFFF | Cards, top and bottom bars |
| outline | #E6E3DB | Card and field borders |
| textPrimary | #1B1D1F | Main text |
| textSecondary | #5B5F63 | Labels, captions |
| primary (teal) | #0F6E66 | Save button, field mics, selected payment, listening outline |
| primaryContainer | #E8F3F1 | Field mic background, understood chips, selected payment |
| voice (orange) | #D97706 | Whole-bill mic, waveform, "check this" outline |
| warningContainer | #FFF7E8 | Low-confidence field, transcript box |
| warningText | #8A4B0F | Balance due, "check rate" hints, Credit / Partial tags |
| Fonts | Hanken Grotesk (Latin) + Noto Sans Tamil | Bundled as downloadable Google Fonts |

**Component sizes (CSS px):** touch targets ≥ 44 px; field mic 44 px circle; whole-bill mic 64 px (76 px while recording, with a light ring); Save 52 px tall, 14 px corners; cards 14 px corners; Qty / Rate / Amount boxes 10 px corners; payment buttons 44 px pill; page padding 16 px, gap between cards 12 px. Phone layout is designed at 390 px wide; on tablet and desktop the form sits in a centred column up to 720 px, with the bill list beside it from 1024 px.

**States to implement exactly as drawn:** field idle, field listening (teal 2 px outline + waveform), low confidence (orange 1.5 px outline, light orange fill, hint line under the card), selected payment, Save disabled until customer and one item exist, draft waiting for master (orange outline in the drafts strip). React components: `BillListPage`, `BillForm`, `FieldMic` + `MatchChooser`, `FreeVoiceSheet`, `SaveSummary` — the voice, mic and summary components are shared with the other three forms.

Labels are bilingual (English · Tamil) as on the canvas; the language setting can switch to Tamil-only. Content descriptions are required on every icon-only button (mics, back, undo, search).

## Three ways to fill the form

| Mode | How | Best for | AI used |
| --- | --- | --- | --- |
| **Type** | Tap a field, type; customer and item fields search as you type | GSTIN, corrections, quiet places | None |
| **Field voice** | Tap the 🎤 inside a field and say just that value ("Kumar Stores", "பத்து", "450") | Filling or fixing one field; noisy shop where short phrases are clearer | Speech-to-text only; values parsed by code |
| **Free-form voice** | Hold the big 🎤 at the bottom and say the whole bill: "Kumar Stores-க்கு 10 சிமெண்ட் மூட்டை 450, 5 கம்பி 680, credit" | Fast entry of a whole bill | Speech-to-text + one extraction call |

All three write into the same form, and they can be mixed freely on one bill: say the bill free-form, fix one rate by field voice, type the GSTIN. The form is always the single source of truth — what is on screen is what will be saved.

## Field-by-field voice

Every field has its own small 🎤. Tapping it records only that field's value, and the app knows exactly what kind of value to expect, so short words are understood reliably.

1. Tap 🎤 in a field → short recording (stops on 1.5 s silence)
2. Speech-to-text with a hint for the field type (name, number, date)
3. The value is parsed by **code, not AI**: numbers and Tamil number words ("பத்து", "நானூத்தி அம்பது", "4.5k"), units (மூட்டை → bag), dates ("நேத்து", "15th"), and fuzzy search for customer and item names
4. One clear match → filled; two or three close matches → a small chooser under the field; none → field stays empty with "புரியல, மறுபடியும் சொல்லுங்க"
5. Cursor moves to the next empty field

**Guided mode (hands-free).** One tap on "Guided" and the app walks through the fields itself: it highlights Customer and listens, then Item, Qty, Rate, then asks "இன்னும் item?". Optional spoken prompts (text-to-speech) for owners who don't want to look at the screen. Useful at the counter while handling goods.

**Voice commands** (work in any voice mode):

| Say | Does |
| --- | --- |
| "அடுத்து" / "next" | Next field or new item row |
| "இன்னொரு item" / "add item" | New item row |
| "கடைசி item எடு" / "delete last" | Removes the last row |
| "Rate 460" / "Qty 12" | Sets that field on the current row |
| "Cash" / "Credit" / "Partial 2000" | Payment status |
| "Save" / "சேமி" | Same as tapping Save (still shows the summary first) |
| "Cancel" / "வேண்டாம்" | Discards the current recording |

## Free-form voice

Hold the big 🎤 and say the bill naturally, in Tamil, English or Tanglish, in any order:

> "குமார் ஸ்டோர்ஸ்க்கு 10 சிமெண்ட் மூட்டை 450 ரூபாய், 5 கம்பி 680, credit-ல போடு"

1. Speech-to-text (whole utterance)
2. One Billing-agent run (OpenAI Agents SDK) returns a **form patch**, not a reply: the extraction schema below, plus which fields it is setting
3. The app applies the patch to the form; every filled field gets a confidence colour (normal, amber = check this, red = couldn't read)
4. Customer and items are matched to the customer list and item master as in field mode; ambiguous ones show the chooser
5. Totals and GST recalculate live

**How free-form merges with what's already on the form:**

| Situation | Result |
| --- | --- |
| Form is empty | Patch fills everything it found |
| Form has items, user says more items | New items are **added** as rows; existing rows untouched |
| User says a field that's already filled ("rate 460") | Overwrites that field only; old value shown as undo chip for 5 s |
| A field was **typed** by the user | Never overwritten by free-form unless the user names that field explicitly |
| User says "புதுசா போடு" / "start over" | Clears the form after confirm |
| Utterance names two customers | Splits into two drafts (see Many bills a day) |

Undo (↶) in the toolbar reverts the last voice action of any kind.

## Field reference

| Field | Type | Field voice understands | Default | Rules |
| --- | --- | --- | --- | --- |
| Bill no | auto | — | Next number on Save | Read-only; shown as "Draft" until saved |
| Date | date | "இன்னைக்கு", "நேத்து", "15th", "15 October" | Today | Not in future |
| Customer | search / new | Name in Tamil or English; matches customer list | Last customer (optional) | New name allowed → "New customer" tag |
| Customer GSTIN | text | Letters and digits spelled out | From customer | 15 chars, checksum; decides CGST/SGST vs IGST |
| Item (per row) | search | Item name or spoken alias ("கம்பி" → TMT rod) | — | Must be in item master, else Request admin to add |
| Qty | number | "பத்து", "10", "ten", "2.5" | 1 | > 0 |
| Unit | choice | "மூட்டை", "bag", "kg" | Item's unit | Must be one of the item's units |
| Rate | money | "450", "நானூத்தி அம்பது", "4.5k" | Customer price → last rate → item rate | Warning if > 20% from usual |
| Rate includes GST | toggle | "GST சேர்த்து" / "GST தனி" | Off | — |
| GST % | auto | — | From item master | Not editable on the form |
| Discount | money / % | "500 discount", "5 percent" | 0 | ≤ subtotal |
| Payment | choice | "Cash", "Credit", "Partial 2000", "GPay" | Credit | Partial needs amount; creates a linked collection |
| Notes | text | Free text | — | Printed on PDF |

Totals (taxable value, CGST/SGST or IGST, round-off, grand total) are calculated by the app and backend, never spoken or typed.

## Many bills a day

The Billing screen opens on **Today's bills**, not a chat:

- A list of today's bills (number, customer, total, Paid/Credit, PDF icon), with a date picker for earlier days and a search by customer
- **Drafts** strip at the top: bills started but not saved, and bills waiting for an item to be added by the admin ("Murugan ⏳ waiting for item")
- A big **+ New bill** button, plus a 🎤 on the list screen that starts a new bill straight in free-form voice

After Save, the form offers **New bill** (blank form, cursor on Customer) and **Same customer** (keeps the customer, clears items). So 5–10 bills a day is: + → speak → check → Save → + …

**Several customers in one utterance** ("Kumar 10 cement, Murugan 20 cement, Ravi 5 kambi") creates three drafts; the app opens the first and shows "2 more drafts" with Next / Save all.

**Editing a saved bill:** open it from the list → Edit → same form with its values; changes are tracked in `audit_log`, PDF is regenerated as "Revised". **Cancel** keeps the number.

## Billing on desktop

Office staff and the admin open the **same web app** on a computer and get the same form in a wider layout, so every device behaves identically:

- Keyboard-first: Tab between fields, type-ahead for customer and item, Enter adds a row — fastest for large bills
- Voice works on desktop too (computer microphone), both field and free-form
- Same validation, same customer creation, same bill-number sequence, same PDF
- A bill saved on any device appears on every other open device at once (Supabase Realtime), marked with who created it
- Direct A4 / thermal print

`invoices.source` records `app_type`, `app_voice` or `web`, and `invoices.entry_mode` records `type`, `field_voice`, `free_voice` or `mixed`, so you can see how people actually bill and tune the voice parsing.

## Extraction output

```json
{
  "customer": { "name": "Kumar Stores", "gstin": null, "confidence": 0.96 },
  "invoice_date": "2026-10-15",
  "items": [
    { "name": "Cement", "qty": 10, "unit": "bag", "rate": 450,
      "rate_includes_gst": false, "gst_rate": null, "hsn": null, "confidence": 0.94 }
  ],
  "discount": 0,
  "payment_status": "credit",
  "amount_received": 0,
  "repeat_last": false,
  "notes": null
}
```

The backend, not the model, fills GST rate and HSN from the product master, computes taxable value, tax and total, and decides CGST + SGST (same state) or IGST (customer GSTIN from another state).

## Invoice numbering

Numbers are `<prefix>/<FY>/<serial>` (e.g. INV/26-27/0001), consecutive within a financial year (April–March), assigned by the database on Save inside a transaction so two users can't get the same number. Cancelled invoices keep their number; numbers are never reused. Drafts have no number.

## Validation rules

| Check | Rule | Type | Agent says |
| --- | --- | --- | --- |
| Customer present | name not null | Blocking | "யாருக்கு invoice?" |
| At least one line | ≥ 1 item with qty > 0 | Blocking | "என்ன item, எத்தனை?" |
| Rate known | rate given, or found in history/master | Blocking | "Cement rate என்ன?" |
| GST inclusive? | ambiguous phrasing ("சேர்த்து") | Blocking | Two-button question |
| GST rate valid | rate is one of the business's configured slabs | Warning | Field highlighted |
| Customer GSTIN | 15 chars, valid checksum; state code decides IGST | Warning | GSTIN highlighted |
| Rate unusual | differs > 20% from this customer's last rate for the item | Warning | "வழக்கமா ₹420 தான்" |
| Credit limit | outstanding + this invoice > customer credit limit | Warning | "Kumar Stores ஏற்கனவே ₹48,000 பாக்கி" |
| Date | not in future; not before the last saved invoice's date | Warning | Date highlighted |

## Edge cases

| Situation | Handling |
| --- | --- |
| Noisy shop, voice misheard | Field shows red/amber; user re-taps the field 🎤 or types. Field voice is preferred in noise |
| Name close to an existing customer | Chooser: "Kumar Stores / புது customer Kumar Traders" |
| Item not in item master | Row marked; close matches or **Request admin to add**; bill saves only after the item exists |
| Free-form says a customer different from the one on the form | Asks "Customer-ஐ மாத்தணுமா?" — never switches silently |
| Long free-form with 10+ items | All rows added; form scrolls to the first amber field |
| "450 GST சேர்த்தா?" ambiguity | Rate-includes-GST toggle flashes; one tap sets it |
| No network | Type and field voice for numbers work offline (parsing in the browser); free-form and name search queue until online; draft saved on the device |
| Same bill edited on two devices | Second save refused: "updated just now by <user>"; form reloads |
| Microphone permission denied | Voice buttons hidden; typing works |
| Cash sale | Customer = "Cash" (walk-in) |

## Backend endpoints

The form talks to plain endpoints; only free-form calls the model.

| Endpoint | Used by | Does | AI? |
| --- | --- | --- | --- |
| GET /billing/form-spec | App, web | Field list, types, units, labels (Tamil/English) for rendering | No |
| POST /billing/voice/field | Field voice | Audio + field name → transcript → parsed value + candidates | Speech-to-text only |
| POST /billing/voice/free | Free-form voice | Audio + current form → transcript → form patch | Speech-to-text + one agent run |
| GET /customers/search, /items/search | Type and voice | Fuzzy search (Tamil + English + aliases) | No |
| GET /billing/price | Rate default | Customer price → last rate → item rate | No |
| POST /billing/drafts, PUT /billing/drafts/{id} | Autosave | Saves the draft every few seconds | No |
| POST /billing/drafts/{id}/save | Save | `validate()` + `save()`, assigns bill number | No |
| PUT /invoices/{id}, POST /invoices/{id}/cancel | Edit, cancel | Update with audit_log | No |
| POST /invoices/{id}/pdf | Save & PDF | Renders PDF | No |
| POST /master-requests | Item not found | Raises a request for the admin area | No |

The free-form agent has only read tools (find_customer, find_product, get_price) and its output type is the form patch, so it can't save anything.

## Database

```sql
CREATE TABLE products (            -- item master: managed in the admin area only
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL, name_ta TEXT,
  unit TEXT, default_rate NUMERIC(12,2),
  gst_rate NUMERIC(5,2), hsn_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_no TEXT,                 -- null while draft
  financial_year TEXT,             -- '26-27'
  invoice_date DATE NOT NULL DEFAULT current_date,
  taxable_value NUMERIC(12,2), discount NUMERIC(12,2) DEFAULT 0,
  cgst NUMERIC(12,2) DEFAULT 0, sgst NUMERIC(12,2) DEFAULT 0, igst NUMERIC(12,2) DEFAULT 0,
  round_off NUMERIC(6,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'credit',   -- paid | credit | partial
  status TEXT NOT NULL DEFAULT 'draft',             -- draft | confirmed | cancelled
  pdf_url TEXT, pdf_stale BOOLEAN DEFAULT false,
  extraction JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (business_id, financial_year, invoice_no)
);

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  item_name TEXT NOT NULL, hsn_code TEXT,
  qty NUMERIC(12,3) NOT NULL, unit TEXT,
  rate NUMERIC(12,2) NOT NULL, gst_rate NUMERIC(5,2),
  taxable_value NUMERIC(12,2), tax_amount NUMERIC(12,2), amount NUMERIC(12,2)
);
```

## Saving, PDF and share

- **Save** shows a one-screen summary first (customer, lines, GST, total, Paid/Credit) with any amber warnings; a second tap confirms. Saying "Save" does the same
- Buttons after saving: **PDF**, **Share** (WhatsApp via the phone's share sheet), **Print** (browser print to A4; Bluetooth thermal printer where Chrome supports it, otherwise share the PDF to the printer's app), **New bill**, **Same customer**
- The customer's balance before and after this bill is shown on the summary
- Drafts autosave on the device and server, so a call or app switch never loses a half-filled bill

## Invoice PDF

Layout follows the PDF decision on the Overview tab. Every PDF carries the fields a GST tax invoice needs: business name, address and GSTIN; invoice number and date; customer name, address and GSTIN (if registered); place of supply; per line HSN, qty, unit, rate, taxable value, GST rate and amount; tax split; total in figures and words; signature line. Tamil text needs an embedded Tamil font (e.g. Noto Sans Tamil).

## Reports fed by this agent

Sales by day / customer / item, invoice register, customer statement, GST output tax. These appear in the Reports menu, not on this form.

## Acceptance criteria

- [ ] Field voice: 200 short field utterances (names, Tamil and English numbers, units, dates) parsed correctly on ≥ 97%
- [ ] Free-form voice: 50 whole-bill utterances give the right customer, items, qty and rate on ≥ 95% with no edits
- [ ] Field voice result appears in under 1.5 s; free-form fills the form in under 5 s on 4G
- [ ] Typed values are never overwritten by free-form voice in 20 out of 20 mixed-mode tests
- [ ] A 3-item bill can be completed in under 30 seconds by voice in a pilot shop
- [ ] Tax split matches a hand calculation on 20 mixed-rate bills, to the rupee
- [ ] Two devices saving at the same moment never get the same bill number
- [ ] PDF renders Tamil names correctly and passes the accountant's GST-format check

---

# Purchase — Hybrid Form with Bill Upload

## Purpose and nature

Purchase is a **form, not a chat**, built around the supplier's bill. Most purchases start from a document the owner already holds — a printed bill, a handwritten kacha bill, or a PDF from the supplier — so the form's first job is to **read that document and fill itself**; typing and voice then correct and complete it. Purchases without a bill can still be entered by voice or typing. Nothing is saved until the owner checks the form against the bill and taps Save. (The earlier stand-alone chat spec is Purchase Agent — Detailed Plan (MVP v1); its extraction, matching and validation rules carry over.)

## Form layout

| Section | Fields | Notes |
| --- | --- | --- |
| Bill document | 📷 Camera · 🖼 Gallery · 📄 PDF; page thumbnails; "Reading bill…" progress | Top of the form; tap a thumbnail to compare (see Upload flow) |
| Vendor | Vendor (search, from master), vendor GSTIN | Not in master → **Request admin to add** (name + GSTIN from the bill pre-filled) |
| Bill header | Bill no, bill date | Bill date defaults to today when missing |
| Items (optional) | Item, qty, unit, rate, GST %, amount — one row each | Toggle **Items / Total only**: many small shops enter only totals |
| Totals | Subtotal, discount, CGST, SGST, IGST, round-off, **total** | Calculated from items when items are entered; typed or read from the bill when "Total only" |
| Payment | Paid / Credit / Partial; mode (cash, UPI, bank, cheque); amount paid | Credit by default |
| Notes | Free text | — |

Every field carries its own 🎤 for field voice; the big hold-to-speak mic sits beside Save, as on Billing.

## Five ways to fill the form

| Mode | How | Best for |
| --- | --- | --- |
| **Bill photo** | Camera with edge guide; one or several pages | Printed and handwritten bills |
| **PDF upload** | Pick a PDF from phone storage, WhatsApp or email download | Supplier e-invoices |
| **Type** | Any field; vendor and item search as you type | GSTIN, corrections |
| **Field voice** | 🎤 inside a field, say only that value | Fixing one misread figure |
| **Free-form voice** | Hold the big 🎤: "ABC Traders 12500 cement, GST 18, credit" | Purchases with no bill in hand |

The modes mix on one purchase. A typical flow: photograph the bill → form fills → fix one amber field by voice → Save.

## Bill upload flow

1. **Capture or pick:** camera (with page-edge guide and an in-browser blur/darkness check that asks for a retake before uploading), gallery, or PDF picker. JPG, PNG, WEBP, HEIC up to 20 MB each; PDF up to 20 MB and 10 pages. Images are compressed in the browser to about 2 MB
2. **Add pages:** "இன்னும் pages இருக்கா?" — more photos are added to the same purchase as pages
3. **Upload:** stored in the `purchase-bills` bucket; a SHA-256 hash of each file is kept for duplicate detection
4. **Read:** PDFs with a text layer are read directly; scanned PDFs and photos go to Vision; the Purchase extraction (schema below) returns a **form patch**
5. **Fill:** the form fills with confidence colours — normal, orange outline (check this), red (couldn't read). Items fill as rows when the bill has them
6. **Compare:** tapping the bill thumbnail opens a **split view** — bill image on top (pinch to zoom), form below — so the owner checks each figure against the paper
7. **Validate:** totals add up, GST split, GSTIN format, duplicate bill, vendor match — warnings shown on the fields
8. **Save:** summary → Save; the file stays linked to the purchase for ever

**Merge rules** match Billing: a document read fills empty fields and replaces earlier *read* values; it never overwrites a value the user **typed or spoke** unless the user confirms "bill-ல இருக்கிறதை போடு?". Uploading a different bill to a form that already has one asks: **Add as pages** or **Replace bill**.

## Purchases list and vendor payments

The Purchase screen opens on a list: this month's purchases, a drafts strip (unsaved, waiting for vendor/item master, waiting for upload while offline), and filters for **Unpaid** and **Bills without photo**. Buttons: **📷 Scan bill** (opens the camera straight into a new purchase), **+ New purchase**, and hold-to-speak.

**Pay vendor** is a small hybrid form of its own: vendor, amount, mode, reference, date, and the vendor's unpaid bills with amounts applied oldest first (editable). It fills by voice ("ABC Traders-க்கு 10,000 GPay") or typing.

## Extraction output

```json
{
  "source": "image",
  "vendor": { "name": "ABC Traders", "gstin": "33AAAAA0000A1Z5", "confidence": 0.97 },
  "bill_number": { "value": "INV-5678", "confidence": 0.95 },
  "bill_date": { "value": "2026-10-15", "confidence": 0.92 },
  "items": [{ "name": "Cement bag 50kg", "hsn": "2523", "qty": 25, "unit": "bag", "rate": 400, "gst_rate": 18, "amount": 10000 }],
  "subtotal": 10000, "discount": 0,
  "cgst": 900, "sgst": 900, "igst": 0, "round_off": 0,
  "total_amount": 11800,
  "payment_status": "credit", "amount_paid": 0,
  "handwritten": false
}
```

## Vendor matching

1. GSTIN exact match wins
2. Normalised name (drop M/s, Sri, punctuation; Tamil transliterated) fuzzy score ≥ 0.9 links automatically
3. Score 0.7–0.9 → two-button question
4. No match → "Not in master"; owner taps Request admin to add (GSTIN and name from the bill pre-filled). The bill waits and resumes once the admin adds the vendor in the admin area

## Validation rules

| Check | Rule | Type |
| --- | --- | --- |
| Vendor present | not null | Blocking |
| Amount present | total > 0 | Blocking |
| Duplicate bill | same vendor + bill number, or same file hash | Blocking (override allowed) |
| Totals add up | items = subtotal; subtotal − discount + tax + round-off = total (±₹1) | Warning |
| GST split | CGST = SGST; IGST only for other-state vendor | Warning |
| GSTIN format | 15 chars, checksum, state code | Warning |
| Date sane | not future, not > 12 months old | Warning |
| Low confidence | any field < 0.8 | Warning |
| Large amount | > 5× this vendor's average bill | Warning |

## Edge cases

| Situation | Handling |
| --- | --- |
| Blurry, dark or cut-off photo | In-browser check before upload: "Photo தெளிவா இல்ல, மறுபடியும் எடுங்க" |
| Handwritten (kacha) bill | Read anyway; every field outlined orange; split view opens automatically |
| Two bills in one photo or one PDF | Detected; creates two drafts and opens the first |
| PDF is password-protected | "PDF lock ஆகியிருக்கு" — ask for an unlocked copy or a photo |
| File is not a bill (selfie, chat screenshot) | "இது bill மாதிரி தெரியல" — nothing filled |
| Same bill uploaded again | Matching file hash or vendor + bill no → blocking warning with the earlier purchase; override allowed |
| Totals on bill don't add up | Mismatched figure outlined; owner chooses the bill's total or the computed one |
| Vendor not in master | Draft waits for the admin; owner can still attach pages and fill other fields |
| No network | Photos kept on the device (IndexedDB) and queued; form can be typed; reading happens when back online |
| Credit note from vendor | Detected from the heading; saved as a negative purchase linked to the original bill |
| Goods-for-resale entered in Expense | Expense form offers "Purchase-ல போடவா?" and moves the values here |

## Backend endpoints

| Endpoint | Does | AI? |
| --- | --- | --- |
| GET /forms/purchase/spec | Field list, labels, units for the renderer | No |
| POST /forms/purchase/documents | Upload image(s) or PDF; returns file ids and hash check | No |
| POST /forms/purchase/documents/{id}/read | Text layer or Vision → extraction → form patch with confidences | Yes |
| POST /forms/purchase/voice/field | Audio + field → value + candidates | Speech-to-text only |
| POST /forms/purchase/voice/free | Audio + current form → form patch | Speech-to-text + one agent run |
| GET /vendors/search, /items/search | Fuzzy search | No |
| POST/PUT /forms/purchase/drafts | Autosave | No |
| POST /forms/purchase/drafts/{id}/save | validate() + save() | No |
| PUT /purchases/{id}, POST /purchases/{id}/cancel | Edit, cancel with audit_log | No |
| POST /vendor-payments | Pay vendor form save | No |
| POST /master-requests | Vendor or item missing | No |

## Database

```sql
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  bill_number TEXT, bill_date DATE NOT NULL DEFAULT current_date,
  subtotal NUMERIC(12,2), discount NUMERIC(12,2) DEFAULT 0,
  cgst NUMERIC(12,2) DEFAULT 0, sgst NUMERIC(12,2) DEFAULT 0, igst NUMERIC(12,2) DEFAULT 0,
  round_off NUMERIC(6,2) DEFAULT 0, total_amount NUMERIC(12,2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'credit',
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT NOT NULL,              -- image | pdf | voice | text
  file_url TEXT, file_hash TEXT, extraction JSONB,
  original_of UUID REFERENCES purchases(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX purchases_no_dup ON purchases (business_id, vendor_id, bill_number)
  WHERE bill_number IS NOT NULL AND status <> 'cancelled';

CREATE TABLE purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL, hsn_code TEXT,
  quantity NUMERIC(12,3), unit TEXT,
  unit_price NUMERIC(12,2), gst_rate NUMERIC(5,2), total_price NUMERIC(12,2)
);

CREATE TABLE vendor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  amount NUMERIC(12,2) NOT NULL, mode TEXT, reference TEXT,
  payment_date DATE NOT NULL DEFAULT current_date,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now()
);
```

## Saving

- Save shows a one-screen summary: vendor, bill no and date, total, GST split, Paid/Credit, warnings, and the bill thumbnail; a second tap confirms
- After saving: **New purchase**, **Scan next bill**, **View purchase**
- Drafts autosave on the device and server, including uploaded pages
- The original bill file stays linked to the purchase and is visible in the purchase view and reports

## Reports fed by this agent

Monthly purchases, vendor-wise purchases, vendor payables, item price history, GST input tax, purchases without a bill photo. These appear in the Reports menu, not on this form.

## Acceptance criteria

- [ ] On 100 real printed bills, vendor and total are filled correctly on ≥ 95% without editing
- [ ] On 30 handwritten bills, every wrong field is outlined for checking
- [ ] 20 supplier PDFs (text and scanned) fill header and totals correctly on ≥ 95%
- [ ] Photo to filled form in under 10 seconds on 4G
- [ ] Typed or spoken values are never overwritten by a later bill read without confirmation
- [ ] No duplicate bill can be saved without explicit override
- [ ] Offline photos upload and fill automatically once the network returns
- [ ] Every saved purchase links to its original file when one was given

---

# Expense — Quick Hybrid Form

## Purpose and nature

Expense is a **quick form**: small, frequent entries that should take under five seconds each. Unlike Billing and Purchase it has no long header; it is a short list of rows — **category, what for, amount** — under one date and one payment mode, so "diesel, tea, loading" can be entered together. Receipts are optional; most expenses have none.

Goals: no petty-cash notebook, every rupee categorised, monthly expense by category ready for profit and the accountant.

## Form layout

| Section | Fields | Notes |
| --- | --- | --- |
| Header | Date (today), paid by (cash / UPI / bank) | One line; tap to change |
| Quick picks | Category chips: Fuel, Wages, Rent, EB, Transport, Tea & food, Repairs, Other | Top 8 by use; long-press for all |
| Repeat | "Again" chips for frequent entries ("Diesel ₹3,500", "Tea ₹200") | One tap adds the row |
| Entry rows | Category, description, amount, 🧾 receipt (optional), 🎤 | Add row with + or by voice |
| Total | Sum of rows | Calculated |

## Four ways to fill the form

| Mode | How | Example |
| --- | --- | --- |
| **Tap** | Category chip → amount keypad opens straight away | Fuel → 3500 → Save |
| **Field voice** | 🎤 on a row's amount or description | "மூவாயிரத்து ஐநூறு" |
| **Free-form voice** | Hold the big 🎤 | "இன்னைக்கு diesel 3500, tea 200, loading 800" → three rows |
| **Receipt photo** | 🧾 on a row, or the camera button for a new row | Fuel-bunk receipt → amount, date, GST, category |

Rows from voice and receipts are added, never merged into existing rows; a typed amount is never overwritten.

## Expense list

The Expense screen opens on today's entries with the day's total and a by-category strip (Fuel ₹3,500 · Tea ₹200 …), a date picker, and a big **+ Add expense** with hold-to-speak beside it. Tapping an entry opens it in the same form for edit or cancel.

## Extraction output

```json
{
  "expenses": [
    { "description": "டீசல்", "category": "Fuel", "amount": 3500,
      "expense_date": "2026-10-15", "paid_to": null,
      "payment_mode": "cash", "confidence": 0.98 }
  ],
  "looks_like_purchase": false
}
```

## Categories

Default categories ship with Tamil and Tanglish keywords; categories and keywords are managed in the admin area, and a correction on the form raises a keyword suggestion in the master request queue ("இது Fuel இல்ல, Vehicle repair" saves this entry as Vehicle repair and suggests the word for that category).

| Category | Keywords (sample) |
| --- | --- |
| Fuel | diesel, petrol, டீசல், பெட்ரோல் |
| Wages | salary, coolie, கூலி, சம்பளம் |
| Rent | rent, வாடகை |
| Electricity | EB, current bill, கரண்ட் பில் |
| Transport and loading | lorry, loading, unloading, லாரி |
| Tea and food | tea, snacks, சாப்பாடு, டீ |
| Repairs and maintenance | repair, service, ரிப்பேர் |
| Office and phone | stationery, recharge, internet |
| Bank charges | bank charge, commission |
| Other | anything unmatched |

## Validation rules

| Check | Rule | Type | Agent says |
| --- | --- | --- | --- |
| Amount present | amount > 0 | Blocking | "எவ்வளவு?" |
| Purpose clear | category found, or description is a person's name only | Blocking | "எதுக்கு?" with category buttons |
| Looks like purchase | goods bought for resale (material names, vendor names) | Blocking | Offer to move to Purchase |
| Possible duplicate | same category + amount already saved today | Warning | "இன்னைக்கு ஏற்கனவே diesel 3500 போட்டாச்சு. மறுபடியுமா?" |
| Unusual amount | > 3× this category's average entry | Warning → card instead of instant save | Amount highlighted |
| Date | not in future | Blocking | Asks date |

## Edge cases

| Situation | Handling |
| --- | --- |
| Salary advance to staff | Category Wages, "advance" toggle; listed under staff advances |
| Personal expense ("veetu grocery") | Row flagged: "இது business செலவா?" — not saved unless confirmed |
| Looks like goods for resale ("cement 12000") | "Purchase-ல போடவா?" — moves the values to a Purchase form |
| Receipt with GST | GST stored on the row so it can count as input tax |
| Amount spoken in words | Converted and shown on the row before saving |
| Same category and amount already saved today | Warning: "இன்னைக்கு ஏற்கனவே diesel 3500 போட்டாச்சு" |
| No network | Rows saved on the device; synced later; receipt photos queued |

## Backend endpoints

| Endpoint | Does | AI? |
| --- | --- | --- |
| GET /forms/expense/spec | Fields, categories, frequent entries | No |
| POST /forms/expense/voice/field | Audio + field → value | Speech-to-text only |
| POST /forms/expense/voice/free | Audio → one or more rows | Speech-to-text + one agent run |
| POST /forms/expense/receipts | Receipt photo → row patch | Yes (Vision) |
| POST /forms/expense/save | validate() + save() all rows | No |
| PUT /expenses/{id}, POST /expenses/{id}/cancel | Edit, cancel with audit_log | No |

## Database

```sql
CREATE TABLE expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL, name_ta TEXT,
  keywords TEXT[] DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  UNIQUE (business_id, name)
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  category_id UUID NOT NULL REFERENCES expense_categories(id),
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  gst_amount NUMERIC(12,2) DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT current_date,
  paid_to TEXT, payment_mode TEXT DEFAULT 'cash',
  is_advance BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'confirmed',
  source TEXT NOT NULL,          -- voice | text | image
  file_url TEXT, extraction JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Save behaviour

Expense saves with **one tap and no summary screen** when every row passes: category known, amount within 3× that category's average, no duplicate warning, and (for voice or receipt rows) confidence ≥ 0.9. Any row that fails is outlined and Save shows a short check first. After saving, an **Undo** bar stays for 10 seconds and the form clears for the next entry.

## Reports fed by this agent

Expense by category for a period, daily expense list, top categories this month vs last, staff advances. These appear in the Reports menu, not on this form, and feed the profit report.

## Acceptance criteria

- [ ] A one-row expense by chip + keypad takes under 5 seconds
- [ ] 50 Tamil/Tanglish free-form phrases get the right amount and category on ≥ 95%
- [ ] Multi-entry phrases split into the right rows in 20 out of 20 tests
- [ ] Purchase-like entries are caught and offered to Purchase in 10 out of 10 tests
- [ ] Fuel-bunk and EB receipts fill amount and date correctly on ≥ 90%
- [ ] Undo leaves no trace in reports

---

# Collection — Hybrid Form with Payment Proof

## Purpose and nature

Collection is a **form centred on the customer's balance**. As soon as a customer is chosen, the form shows what they owe and their open bills; entering an amount immediately shows how it will be applied and what remains. Proof of payment — a UPI screenshot, a cheque photo, or a bank SMS — can fill the form, because most payments now arrive that way.

Goals: every payment recorded the day it arrives, each tied to the bills it settles, cheques tracked until cleared, and a balance the owner can trust when chasing payment.

## Form layout

| Section | Fields | Notes |
| --- | --- | --- |
| Customer | Customer (search; new allowed), **outstanding now** | New customer flagged for review in the admin area |
| Payment | Amount, mode chips (Cash · UPI · Bank · Cheque), date | Mode changes the fields below |
| Reference | UPI / bank: UTR or reference no · Cheque: cheque no, bank, cheque date | Reference checked for duplicates |
| Proof | 📷 UPI screenshot / cheque photo, or paste bank SMS | Optional; stored with the payment |
| Apply to bills | Open bills with balance; checkbox + amount each; filled oldest first | Editable; leftover shown as **Advance** |
| Adjustment | Discount / short payment ("500 விட்டுட்டேன்") | Closes a bill without a balance |
| Result | Outstanding after this payment | Large, updates live |

Field 🎤 on customer, amount and reference; the big hold-to-speak mic beside Save.

## Five ways to fill the form

| Mode | How | Example |
| --- | --- | --- |
| **Type** | Customer search, amount keypad | — |
| **Field voice** | 🎤 in a field | "இருபத்தஞ்சாயிரம்" |
| **Free-form voice** | Hold the big 🎤 | "Kumar Stores 25000 GPay, INV 8-க்கு" |
| **UPI screenshot** | Photo or share-to-app from GPay / PhonePe / Paytm | Amount, payer name, UTR, date filled |
| **Cheque photo / bank SMS** | Photo of the cheque, or paste the SMS | Cheque no, bank, date, amount; or amount and reference |

Once installed on the phone, the web app also appears in Android's **Share** menu, so a payment screenshot can be shared straight from GPay into a new Collection form.

## Collections list

The Collection screen opens on today's collections with totals by mode (Cash · UPI · Bank · Cheque), a **Pending cheques** strip with due dates, and **+ Record payment** with hold-to-speak. Opening a customer from the list shows their statement.

## Extraction output

```json
{
  "customer": { "name": "Kumar Stores", "confidence": 0.95 },
  "amount": 25000,
  "mode": "upi",                 
  "reference": "UTR 6289XXXX4410",
  "collection_date": "2026-10-15",
  "cheque": null,
  "invoice_refs": [],
  "confidence": 0.93
}
```

`mode` is cash, upi, bank or cheque. For cheques, `cheque` holds bank, number and cheque date.

## Allocation to invoices

1. If the user names invoices, apply to those in the order named
2. Otherwise apply to the customer's oldest unpaid confirmed invoices first (FIFO)
3. A partly-paid invoice keeps its remaining balance
4. Anything left over after all invoices are paid is an **advance** and is used automatically against the customer's next invoice
5. Cheques are allocated at once but marked Pending; a bounce reverses the allocation

The form always shows the allocation, and the user can change it before saving.

## Validation rules

| Check | Rule | Type | Agent says |
| --- | --- | --- | --- |
| Customer present | name not null | Blocking | "யாரு கொடுத்தாங்க?" |
| Customer known | matches an existing customer | Blocking | "Kumar Stores-ஆ, Kumar Traders-ஆ?" or "புது customer-ஆ?" — a new customer is created on Save and flagged for review in the admin area |
| Amount present | amount > 0 | Blocking | "எவ்வளவு?" |
| Duplicate reference | same UTR / cheque no already saved | Blocking | "இந்த GPay payment ஏற்கனவே பதிவாச்சு" |
| More than outstanding | amount > customer balance | Warning | Offer to save excess as advance |
| Named invoice already paid | invoice balance = 0 | Warning | Suggest oldest unpaid instead |
| Payer name mismatch | screenshot name ≠ customer name | Warning | Ask to confirm customer |
| Date | not in future (except cheque date) | Blocking | Asks date |

## Edge cases

| Situation | Handling |
| --- | --- |
| Screenshot payer name differs from the chosen customer | "K. Kumar-ஆ Kumar Stores-ஆ?" — owner confirms |
| Same UTR or cheque already recorded | Blocking: "இந்த payment ஏற்கனவே பதிவாச்சு" |
| Amount more than outstanding | Leftover shown as Advance; used automatically on the next bill |
| Customer has no open bills | Whole amount saved as advance, flagged on the form |
| One payment for two shops of the same owner | Split button: apply part to another customer |
| Cheque dated in future | Status Pending; reminder on the cheque date |
| Cheque bounced | From the pending list: Mark bounced → bills reopen, balance restored |
| Bill cancelled after it was paid | Payment moves to advance; owner notified |
| No network | Form saved on the device; balance shown as of last sync |

## Backend endpoints

| Endpoint | Does | AI? |
| --- | --- | --- |
| GET /forms/collection/spec | Fields and modes | No |
| GET /customers/{id}/balance | Outstanding, open bills, advance held | No |
| POST /forms/collection/proofs | Screenshot / cheque photo / SMS text → form patch | Yes |
| POST /forms/collection/voice/field, /voice/free | Voice → value or form patch | Speech-to-text (+ one agent run for free-form) |
| POST /forms/collection/save | validate() + save() with allocations | No |
| PUT /collections/{id}, POST /collections/{id}/cancel | Edit, cancel with audit_log | No |
| POST /collections/{id}/cheque-status | Cleared or bounced | No |

## Database

```sql
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  amount NUMERIC(12,2) NOT NULL,
  mode TEXT NOT NULL DEFAULT 'cash',      -- cash | upi | bank | cheque
  reference TEXT,                         -- UTR or cheque number
  collection_date DATE NOT NULL DEFAULT current_date,
  cheque_bank TEXT, cheque_date DATE,
  cheque_status TEXT,                     -- pending | cleared | bounced
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT NOT NULL, file_url TEXT, extraction JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX collections_no_dup_ref ON collections (business_id, reference)
  WHERE reference IS NOT NULL AND status <> 'cancelled';

CREATE TABLE collection_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id),  -- null = advance
  amount NUMERIC(12,2) NOT NULL
);
```

## Saving

- Save shows a short summary: customer, amount, mode, bills settled, advance, and outstanding before → after; a second tap confirms
- After saving: **Share receipt** (a small PDF payment receipt on WhatsApp), **New payment**, **View statement**
- 10-second **Undo** after saving

## Reports fed by this agent

Collections by day and mode, outstanding by customer with ageing (0–30, 31–60, 61–90, 90+ days), customer statement, pending cheques. These appear in the Reports menu, not on this form. Phase 2 adds WhatsApp payment reminders from the outstanding list.

## Acceptance criteria

- [ ] 40 Tamil/Tanglish voice entries give the right customer, amount and mode on ≥ 95%
- [ ] 30 UPI screenshots from GPay, PhonePe and Paytm fill amount and UTR correctly
- [ ] Sharing a screenshot from GPay opens a filled Collection form
- [ ] Customer balance after every save matches a hand-kept ledger over a two-week pilot
- [ ] A reused UTR is always blocked
- [ ] A bounced cheque restores the exact bill balances it had cleared

---

# Reports Menu

## Purpose

All reports live in a dedicated **Reports** menu, opened from the Home top bar and the dashboard cards. The four hybrid forms are for entering data; the Reports menu is for reading it.

Why a menu of fixed screens instead of AI answers:

- **Exact numbers, no AI in the path.** Each report is a fixed backend query rendered by the app; the model never touches report figures, so nothing can be misread or mis-added
- **Faster and cheaper.** A report opens in under 2 seconds with no OpenAI call
- **Easier to scan.** Tables, charts, filters and drill-down fit a screen better than a text answer
- **Works offline.** The last loaded version of each report is cached on the device by the service worker with its "as of" time

Labels are bilingual (Tamil / English, following the user's language setting) so the menu needs no reading of English.

## Menu structure

> Diagram: Reports menu · 7 groups, 16 reports, 3 entry points (see the plan document)

The menu opens on the group list; each group opens its reports, and every report uses the same screen layout below.

## Report screen layout

Every report screen uses the same layout, so users learn it once:

1. **Period chips** across the top: Today · Yesterday · This week · This month · Last month · This FY · Custom (date picker). The selected period is always printed under the title ("1–15 Oct 2026")
2. **Filters** where they apply: customer, vendor, category, item, payment mode — each a searchable dropdown
3. **Headline numbers** in large type, with change vs the previous equal period (▲ 12% / ▼ 8%)
4. **Chart** when the report has a time series or a breakdown (bar by day, or top 5 as horizontal bars)
5. **Table** of rows, sortable, with "load more" for long lists
6. **Drill-down**: tapping a row opens the next level (customer → their invoices → the invoice card with PDF)
7. **Actions** bar: PDF · Excel · Share (WhatsApp)

The dashboard's four summary cards (Sales, Purchase, Expense, Collection) open the matching report already filtered to today.

## Report catalogue

| Group | Report | Filters | Shows | Drills into |
| --- | --- | --- | --- | --- |
| Sales | Sales summary | period, customer, item | Total, invoice count, by day | Invoice list → invoice |
| Sales | Item-wise sales | period, item | Qty and value per item | Invoices containing the item |
| Sales | Invoice register | period, status | Every invoice with number, customer, total, paid/credit | Invoice |
| Purchases | Purchase summary | period, vendor | Total, top vendors, by day | Bill list → bill with photo |
| Purchases | Item price history | item, vendor | Rate per bill over time | Bill |
| Purchases | Bills without photo | period | Voice/text purchases with no file | Purchase card (attach photo) |
| Expenses | Expense by category | period, category | Totals per category, by day | Entries in the category |
| Expenses | Staff advances | staff | Advances given | Entries |
| Collections | Collections | period, mode | Total by cash / UPI / bank / cheque | Collection list |
| Collections | Pending cheques | — | Cheques not yet cleared, by cheque date | Collection (mark cleared / bounced) |
| Balances | Customer outstanding | as-of date, customer | Balance per customer, ageing 0–30 / 31–60 / 61–90 / 90+ | Customer statement |
| Balances | Customer statement | customer, period | Invoices, payments, running balance | Invoice / collection |
| Balances | Vendor payables | as-of date, vendor | Balance per vendor, oldest bill | Vendor's bills |
| Profit & GST | Profit (estimate) | period | Sales − purchases − expenses | Each component's report |
| Profit & GST | GST summary | month | Output tax vs input tax = estimated net payable | Invoices / bills by tax |
| Daily | Daily summary | date | Sales, purchases, expenses, collections, owner's note, drafts waiting | Each component's report |

The profit report always shows the label "Estimate — does not account for unsold stock", because an accountant's profit will differ.

## Daily summary

At 9 PM (time set in Settings) the backend computes the day's sales, purchases, expenses and collections, saves them to `daily_summaries`, and sends a push notification that opens the **Daily summary** screen in the Reports menu.

On that screen the owner can add a note by holding the mic ("இன்னைக்கு மழை, கடை சீக்கிரம் மூடிட்டோம்") or typing. Whisper transcribes the voice note; this is the only AI used anywhere in the Reports menu, and it never touches the numbers. Drafts still waiting for confirmation are listed at the bottom ("2 bills, 1 invoice waiting"), each opening its form.

Past days are browsable by date, so the daily summary doubles as a business diary.

## Backend endpoints

Reports are plain REST endpoints called by the web app, not OpenAI tools. Each runs one fixed, tested SQL query over the views below and returns JSON the app renders.

| Endpoint | Query parameters |
| --- | --- |
| GET /reports/sales | from, to, customer_id, product_id, group_by (day / customer / item) |
| GET /reports/invoices | from, to, status |
| GET /reports/purchases | from, to, vendor_id, group_by |
| GET /reports/item-prices | product or item name, vendor_id |
| GET /reports/purchases-without-file | from, to |
| GET /reports/expenses | from, to, category_id |
| GET /reports/advances | staff name |
| GET /reports/collections | from, to, mode |
| GET /reports/cheques-pending | — |
| GET /reports/outstanding | as_of, customer_id |
| GET /reports/customer-statement | customer_id, from, to |
| GET /reports/vendor-payables | as_of, vendor_id |
| GET /reports/profit | from, to |
| GET /reports/gst | month |
| GET /reports/daily-summary | date |
| POST /reports/daily-summary/note | date, text or voice file |
| GET /reports/{name}/export | same parameters + format (pdf / xlsx) |

## Accuracy rules

- Only `confirmed` records count; drafts and cancelled records are excluded
- Every screen prints its period, and balances print their as-of date
- Each endpoint has an automated test comparing its output with a hand-built fixture
- Staff users see only the reports allowed by the role decision on the Overview tab; the backend enforces this, not just the menu

## Database

```sql
CREATE TABLE daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  summary_date DATE NOT NULL,
  sales NUMERIC(12,2), purchases NUMERIC(12,2),
  expenses NUMERIC(12,2), collections NUMERIC(12,2),
  notes TEXT, notes_voice_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (business_id, summary_date)
);
```

All other report data is read through views: `v_customer_balance`, `v_vendor_balance`, `v_daily_totals`, `v_invoice_balance`.

## Report shortcuts from the forms

The forms link straight to the right report with filters set: the customer's balance on the Billing and Collection forms opens their **Customer statement**; the vendor on the Purchase form opens **Vendor payables**; the day total on each list opens that list's report for today. All numbers still come from the Reports menu endpoints.

## Edge cases

| Situation | Handling |
| --- | --- |
| Period with no data | Empty state "இந்த காலத்தில் entry இல்லை" — never a ₹0 that looks like a real result |
| No network | Cached copy shown with "கடைசியா update: 6:40 PM" banner |
| Very long period (3 years) | Grouped by month; full detail via Excel export |
| Record edited after report was opened | Pull-to-refresh; screens refresh on open |
| Staff user opens a restricted report | Report hidden from the menu; endpoint returns 403 |

## Acceptance criteria

- [ ] Every report's totals match its SQL fixture exactly
- [ ] Any report for a period up to one year opens in under 2 seconds on 4G
- [ ] Dashboard cards and form shortcuts open the right report with the right filters in 20 out of 20 tests
- [ ] PDF and Excel exports match the on-screen numbers
- [ ] Daily summary notification arrives at the set time on 14 consecutive pilot days
- [ ] Tamil labels render correctly in Chrome on 5 common Android phones, Safari on iPhone, and desktop browsers
