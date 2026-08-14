# 🍽️ Palate

> Decide where to eat — together.

**Palate** is a social dining web app for groups. Instead of endless "where do you want to eat?" back-and-forth, Palate helps friends and coworkers discover restaurants, match on shared tastes, and book a table — all in one place. Each user has a rich dining profile (favourite dishes, visit history, saved addresses, upcoming reservations), and restaurants are modelled on real-world place data so listings feel complete and trustworthy.

<p align="left">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca?logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss" />
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb" />
  <img alt="Status" src="https://img.shields.io/badge/status-WIP-orange" />
</p>

---

## Table of Contents

- [Project Status](#project-status)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Data Models](#data-models)
- [Routes](#routes)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Project Status

> ⚠️ **Work in progress.** Every feature listed below runs on real data — auth, discovery, lists, reservations, friends, and the full group-dinner flow from invite link through voting to a booked table. What is missing is polish and proof: there are no tests, no CI, and no email. Note that the app needs the [recommender service](../restarunt-Rec) running to rank restaurants; without it nearby results silently degrade to distance order, and starting a group vote fails outright.

| Area | Status | Notes |
| --- | --- | --- |
| Mongoose data models | ✅ Implemented | `User`, `Restaurant`, `Reservation`, `Address` |
| Database connection | ✅ Implemented | `src/dbConfig/dbConfig.ts` — cached connection, fail-fast timeout |
| Auth API (signup / login) | ✅ Implemented | bcrypt hashing, Zod validation, JWT issued in an httpOnly `token` cookie |
| Preferences API | ✅ Implemented | `PATCH /api/user/preferences`, authenticated via the JWT cookie |
| Login / Signup pages | ✅ Wired | Post to the auth API, then redirect (signup → onboarding) |
| Onboarding (preferences) | ✅ Implemented | `src/app/onBoarding/page.tsx` — diet / allergens / cuisines |
| User profile page | ✅ Implemented | `src/app/profile/page.tsx`, real DB reads via `useUser()` |
| Dashboard | ✅ Implemented | `src/app/dashboard/page.tsx` — "Bill of Fare" layout, live data |
| Lists / wishlist | ✅ Implemented | `src/app/lists/page.tsx` + `/api/Restaurants/lists` |
| Reservations | ✅ Implemented | `src/app/reservation/page.tsx` + `/api/reservations` |
| Friends | ✅ Implemented | `/api/user/friends`, `FriendsModal`, invite links + QR |
| Group matching | ✅ Implemented | Create, invite, approve, vote, close, book — see below |
| Group join by link | ✅ Implemented | `/join/[code]`; friends of an admin auto-admit, strangers queue for approval |
| Group booking | ✅ Implemented | `POST /api/user/matching/[groupId]/reservation` — one reservation, every participant |
| Restaurant detail page | 🔴 Not built | Nothing renders `photos`, `hours`, `tips` or `menuUrl` |
| Auth middleware / `/api/user/me` | 🟡 Partial | `proxy.ts` gates pages; `/api/user/dashboard` doubles as the session read |
| Home page | ✅ Implemented | `/` redirects to `/dashboard` — the dashboard is the front door |

This README documents both what exists today and the intended direction, so a new contributor can pick up work without reverse-engineering the codebase.

---

## Features

**Available now:**

- 🔐 **Authentication** — working signup and login: passwords hashed with bcrypt, requests validated with Zod, and a signed JWT stored in an httpOnly `token` cookie. Login accepts either an email or a username as the identifier. (Plus placeholder "Continue with Google / Apple" buttons.)
- 🎯 **Taste onboarding** — after signup, users pick dietary needs, allergens, and favourite cuisines; preferences are saved to their account through a cookie-authenticated API. Only diet and cuisines feed ranking — allergens are stored for the user's own reference and the screen says so, because matching free text against cuisine names would look like allergen safety while providing none.
- 👤 **User profile** — avatar/initials, Star Member badge, upcoming reservations, favourites (top‑rated places visited), personal info, saved addresses, and reservation history.

- 📊 **Dashboard** — "Bill of Fare" home: tonight's feature, recommendations, wishlist and custom lists, friends rail, invite by link/QR.
- 🗺️ **Geo discovery** — "restaurants near me" via MongoDB `2dsphere` queries, seeded from Foursquare Places and re-ranked by the recommender service.
- 📅 **Reservations** — create, complete, and cancel bookings, plus a prompt that catches a booking after you follow a Maps link.
- 👥 **Friends** — request / accept / decline, invite links and QR.
- 🤝 **Group dinners** — the whole flow, end to end:
  - **Create** a group from your friends list, with a share code minted at creation.
  - **Join by link** (`/join/[code]`). Friends of an admin are admitted straight
    away; anyone else queues for approval, which is what stops a forwarded link
    from being a leaked group. Admins can freeze the guest list at any point.
  - **Shortlist** — the organiser starts the vote and the server builds a
    7-restaurant ballot: a search radius covering everyone who shared a location,
    then `POST /recommend/group` ranking those candidates by the group's
    aggregated taste (least-misery, not the average).
  - **Approval voting** — everyone ticks every place they would be happy with,
    rather than picking a favourite. Live tally, and a deadline 90 minutes before
    the table that closes the vote whether or not anyone opens the page.
  - **Book** — one reservation carrying every participant, landing on all of
    their accounts at once.

**Planned:**

- ⭐ **Post-meal reviews** — prompt after a reservation completes, to supply the
  "did you actually like it" signal and enrich restaurant text.
- 🔔 **Notifications** — nothing currently tells an admin that someone is waiting
  in the join queue, or tells a joiner they were approved.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, React Server Components) |
| UI library | [React 19](https://react.dev) with the [React Compiler](https://react.dev/learn/react-compiler) enabled |
| Language | [TypeScript 5](https://www.typescriptlang.org/) (models are JavaScript) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/postcss`, plus scoped `styled-jsx` on auth pages |
| Fonts | [Geist Sans & Geist Mono](https://vercel.com/font) via `next/font` |
| Database | [MongoDB](https://www.mongodb.com/) with [Mongoose 9](https://mongoosejs.com/) |
| Auth | [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) (httpOnly cookie) + [bcryptjs](https://github.com/dcodeIO/bcrypt.js) |
| Validation | [Zod](https://zod.dev/) on every API route |
| Email (planned) | [nodemailer](https://nodemailer.com/) |
| Notifications | [react-hot-toast](https://react-hot-toast.com/) |
| Linting | ESLint 9 + `eslint-config-next` |

> **Restaurant data shape:** the `Restaurant` model is modelled on the [Foursquare Places API](https://docs.foursquare.com/developer/reference/places-api-overview) response (`fsqId`, categories, tips, tastes, photo `prefix`/`suffix`, etc.), making it straightforward to sync from Foursquare later.

> ⚠️ **Heads-up for contributors (`AGENTS.md`):** this project pins a build of Next.js whose APIs, conventions, and file structure may differ from older releases. For example, dynamic route `params` are now a `Promise` that must be `await`ed. When in doubt, consult the docs bundled in `node_modules/next/dist/docs/` for the exact installed version.

---

## Architecture Overview

```
Browser
  │  (httpOnly `token` cookie rides along with requests)
  ▼
Next.js App Router (src/app)
  ├─ Route Handlers ────────────► Mongoose models (src/models) ──► MongoDB
  │   (api/user/signup, login,                 ▲
  │    preferences)                            │
  ├─ Server Components ─────────────────► dbConfig (cached shared connection)
  │   (e.g. dashboard, profile)                ▲
  │                                            │
  └─ Client Components ── fetch /api ──────────┘
      (login, signup, onBoarding, registry)
```

- **Rendering:** pages are React Server Components by default; interactive screens (auth, onboarding) opt into the client with `"use client"`.
- **Data access:** route handlers under `src/app/api` call the shared, hot-reload-safe Mongoose connection (`src/dbConfig/dbConfig.ts`) and read/write through the models in `src/models`.
- **Auth:** signup/login hash with bcrypt and issue a JWT (`jsonwebtoken`) set as an httpOnly `token` cookie. Protected routes (e.g. preferences) read and verify that cookie server-side rather than trusting any client-supplied id.
- **Styling:** Tailwind utility classes app‑wide; `src/app/registry.tsx` wires up a `styled-jsx` registry so the scoped styles on the auth pages render correctly with SSR.

---

## Project Structure

```
palate/
├─ public/                     # Static assets (svg icons, resturant.jpg hero)
├─ src/
│  ├─ app/                     # Next.js App Router
│  │  ├─ layout.tsx            # Root layout (fonts, styled-jsx registry)
│  │  ├─ page.tsx              # Home — redirects to /dashboard
│  │  ├─ globals.css           # Tailwind import + CSS theme variables
│  │  ├─ registry.tsx          # styled-jsx SSR registry (client component)
│  │  ├─ api/
│  │  │  ├─ Restaurants/            # nearby (geo + recommender), search, lists, wishList
│  │  │  ├─ reservations/route.ts   # GET/POST/PATCH — bookings, auto-complete on read
│  │  │  └─ user/
│  │  │     ├─ signup, login, logout, preferences, dashboard, lists, friends
│  │  │     └─ matching/
│  │  │        ├─ route.ts                    # GET active group · POST create
│  │  │        ├─ join/route.ts               # POST — redeem an invite code
│  │  │        └─ [groupId]/
│  │  │           ├─ route.ts                 # PATCH — lock/unlock the guest list
│  │  │           ├─ requests/route.ts        # POST — approve or deny a join request
│  │  │           ├─ location/route.ts        # PATCH — this member's location
│  │  │           ├─ shortlist/route.ts       # POST — build the ballot, open voting
│  │  │           ├─ vote/route.ts            # PUT  — replace this member's approvals
│  │  │           ├─ close/route.ts           # POST — close the vote early
│  │  │           └─ reservation/route.ts     # POST — book the winner for everyone
│  │  ├─ login/page.tsx        # Login screen (wired to API)
│  │  ├─ signup/page.tsx       # Signup screen (wired to API)
│  │  ├─ onBoarding/page.tsx   # Taste onboarding (diet/allergens/cuisines)
│  │  ├─ dashboard/page.tsx    # Dashboard ("Bill of Fare")
│  │  ├─ lists/page.tsx        # Wishlist + custom lists
│  │  ├─ reservation/page.tsx  # Reservations
│  │  ├─ add/[username]/       # Friend-add landing for invite links
│  │  ├─ join/[code]/          # Public group-invite landing
│  │  ├─ matching/group/page.tsx  # The group screen (roster, ballot, winner)
│  │  ├─ profile/page.tsx      # User profile
│  ├─ components/              # Nav, modals (search, friends, invite, create group)
│  ├─ lib/                     # Pure logic + shared hooks — see below
│  ├─ dbConfig/
│  │  └─ dbConfig.ts           # Shared, cached Mongoose connection
│  ├─ proxy.ts                 # Route gate: redirects signed-out users, carries ?next=
│  └─ models/                  # Mongoose schemas
│     ├─ userModel.js
│     ├─ restaurantModel.js
│     ├─ reservationModel.js
│     ├─ friendshipModel.js
│     ├─ matching.js
│     └─ addressModel.js
├─ .env                        # Local secrets (gitignored)
├─ .env.example                # Template for required env vars
├─ next.config.ts              # Next config (React Compiler on)
├─ tsconfig.json               # TS config (@/* → src/*)
├─ eslint.config.mjs
└─ postcss.config.mjs
```

---

## Data Models

All models live in `src/models` and guard against hot‑reload recompilation with the `mongoose.models.X || mongoose.model(...)` pattern.

### `User` — `users`
Diner profile and relationships.

| Field | Type | Notes |
| --- | --- | --- |
| `username` | String | required, unique |
| `email` | String | required, unique |
| `firstName`, `lastName`, `favDish`, `profilePic` | String | optional |
| `phone` | String | stored as string to keep `+`, spaces, leading zeros |
| `dob`, `firstOrderDate` | Date | |
| `StarmembershipStatus` | Boolean | loyalty flag |
| `numVisits` | Number | |
| `Role` | enum | `user` \| `admin` (default `user`) — included in the JWT payload |
| `isVerified` | Boolean | email-verification flag (default `false`) |
| `preferences` | Object | `likedCuisines[]` (`fsqid`, `name`), `allergines[]`, `diet[]` — set via onboarding. Only `likedCuisines` and `diet` build the taste query; `allergines` is stored for the user's reference only. A `disliked[]` field existed and was removed — old documents may still carry it, inertly. |
| `reservations` | `[ObjectId → reservations]` | active/upcoming |
| `reservationHistory` | `[ObjectId → reservations]` | past |
| `visitedResturants` | `[ObjectId → restaurants]` | |
| `savedAddresses` | `[ObjectId → address]` | |

### `Restaurant` — `restaurants`
Foursquare‑shaped place document.

- Identity: `fsqId` (required, unique, indexed), `name`, `description`, `categories[]`, `cuisine[]`.
- Location: `location` (formatted address, locality, region, etc.), `geocodes`, and a GeoJSON `geo` **Point** with a **`2dsphere` index** for `$near` / `$geoWithin` queries (coordinates are `[lng, lat]`).
- Contact: `tel`, `email`, `website`, `socialMedia`.
- Signals: `rating` (0–10), `popularity` (0–1), `price` (1–4), `stats`.
- Content: `hours`, `photos[]` (`prefix`+`<size>`+`suffix`), `tips[]`, `tastes[]`, flexible `features` (Mixed), `menuUrl`.
- Bookkeeping: `verified`, `dateClosed`, `lastFetchedAt`, timestamps.

### `Reservation` — `reservations`
| Field | Type | Notes |
| --- | --- | --- |
| `user` | `ObjectId → users` | required, indexed |
| `restaurant` | `ObjectId → restaurants` | required, indexed |
| `date` | Date | booked date + time |
| `partySize` | Number | required, min 1 |
| `status` | enum | `pending` \| `confirmed` \| `cancelled` \| `completed` |
| `notes` | String | optional |

### `Address` — `address`
Structured address with a `label` enum (`Home` / `Office`) and a nested `address` object (`aptNumber`, `streetAddress`, `city`, `state`, `country`, `pincode`).

---

## Routes

### Pages

| Path | Type | Description | State |
| --- | --- | --- | --- |
| `/` | Page | Redirects to `/dashboard` | Implemented |
| `/login` | Page | Sign in | Wired to API |
| `/signup` | Page | Create account | Wired to API |
| `/onBoarding` | Page | Taste onboarding | Implemented |
| `/dashboard` | Page | Personalized home ("Bill of Fare") | Implemented |
| `/lists` | Page | Wishlist and custom lists | Implemented |
| `/reservation` | Page | Reservations | Implemented |
| `/add/[username]` | Page | Friend-add landing for invite links | Implemented |
| `/profile` | Page | A user's dining profile | Implemented |
| `/matching/group` | Page | The group screen — roster, join queue, ballot, winner, booking | Implemented |
| `/join/[code]` | Page | Public invite landing for a group | Implemented |

### API (Route Handlers)

| Method & Path | Description | Auth |
| --- | --- | --- |
| `POST /api/user/signup` | Create an account; returns `userId` and sets the `token` cookie | Public |
| `POST /api/user/login` | Authenticate by email **or** username; sets the `token` cookie | Public |
| `PATCH /api/user/preferences` | Save dietary needs, allergens, and favourite cuisines | JWT cookie |
| `GET /api/user/dashboard` | The signed-in user, populated, plus their active group | JWT cookie |
| `GET/POST/DELETE /api/user/friends` | List, request/accept, decline/cancel | JWT cookie |
| `GET /api/Restaurants/nearby` | Geo search, re-ranked by the recommender | Optional |
| `GET /api/Restaurants/search` | Lexical name search within 70km | Public |
| `GET/POST/PATCH /api/reservations` | Bookings; GET also completes past ones | JWT cookie |
| `GET/POST /api/user/matching` | The active group; create a group | JWT cookie |
| `POST /api/user/matching/join` | Redeem an invite code — admits or queues | JWT cookie |
| `PATCH /api/user/matching/[groupId]` | Lock or reopen the guest list | Admin |
| `POST /api/user/matching/[groupId]/requests` | `{ targetId, action }` — approve or deny | Admin |
| `PATCH /api/user/matching/[groupId]/location` | Report this member's location once | Member |
| `POST /api/user/matching/[groupId]/shortlist` | Build the ballot, move to `voting` | Admin |
| `PUT /api/user/matching/[groupId]/vote` | Replace this member's approvals | Member |
| `POST /api/user/matching/[groupId]/close` | Close the vote early | Admin |
| `POST /api/user/matching/[groupId]/reservation` | Book the winner for everyone | Admin |

> **Why so many routes are admin-only.** Starting a vote freezes the ballot,
> closing it discards un-cast votes, and booking writes a reservation onto every
> participant's account. Each is irreversible for the whole group, so each is
> gated — and every one of them re-derives identity from the JWT rather than
> trusting `proxy.ts`, which only checks that a cookie named `token` exists.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.18 (Node 20+ recommended)
- **npm** (or yarn / pnpm / bun)
- A **MongoDB** connection string — either a local `mongod` instance or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

### 1. Clone

```bash
git clone https://github.com/suspicious-candy/palate.git
cd palate
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Copy the template and fill in your values:

```bash
cp .env.example .env
```

Then set `mongo_url` to your MongoDB connection string (see [Environment Variables](#environment-variables)).

### 4. Start the recommender service

**`npm run dev` alone is not enough.** Restaurant ranking lives in a separate
FastAPI service in the sibling [`restarunt-Rec/`](../restarunt-Rec) repo, and
`/api/Restaurants/nearby` calls it on every request:

```bash
cd ../restarunt-Rec
./.venv/Scripts/python.exe -m uvicorn service:app --port 8000
```

Run it from that directory — its Chroma store is a relative path. Port 8000 is
what `RECOMMENDER_URL` defaults to.

Without it, nearby requests log `ECONNREFUSED` and **silently** fall back to an
unranked distance-ordered list. The page still renders, so the only symptom is
worse recommendations. See that repo's README for the index and its rebuild.

### 5. Run the dev server

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. The app hot‑reloads as you edit files.

---

## Environment Variables

Environment variables are read from `.env` (gitignored). A committed `.env.example` documents the required keys.

| Variable | Required | Description |
| --- | --- | --- |
| `mongo_url` | ✅ | MongoDB connection string, e.g. `mongodb://127.0.0.1:27017/palate` or an Atlas SRV URI. |
| `TOKEN_SECRET` | ✅ | Secret used to sign and verify auth JWTs. Required for signup, login, and cookie-protected routes. Generate a long random value, e.g. `openssl rand -hex 32`. |

> **Note:** the JWT secret is read as `TOKEN_SECRET` (not `JWT_SECRET`). Without it, signup/login/preferences return `500 Server misconfigured`.

| `FOURSQUARE_API_KEY` | ✅ | Foursquare Places key. Used at runtime by `/api/Restaurants/nearby` when an area has no cached restaurants, and by `npm run seed:foursquare`. |
| `FOURSQUARE_API_VERSION` | ✅ | Sent as the `X-Places-Api-Version` header. |
| `RECOMMENDER_URL` | — | Base URL of the FastAPI recommender. Defaults to `http://localhost:8000`; set it if the service runs elsewhere. |

**Planned** (as email lands):

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Transactional email (`nodemailer`) |

> 🔒 Never commit real secrets. `.env*` is gitignored (with an explicit exception for `.env.example`).

---

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server with hot reload |
| `npm run build` | Create an optimized production build |
| `npm run start` | Serve the production build (run `build` first) |
| `npm run lint` | Run ESLint |

---

## Roadmap

- [x] Shared Mongoose connection, auth API, JWT cookie sessions
- [x] Taste onboarding + cookie-authenticated preferences API
- [x] Real DB reads with populated refs (profile, dashboard)
- [x] Reservation create/manage flow, dashboard, lists/wishlist
- [x] Foursquare Places sync job (`npm run seed:foursquare`)
- [x] Friends: requests, accept/decline, invite links and QR
- [x] Recommender wired into nearby (filter-then-rank against the vector index)
- [x] Group aggregation in the recommender (`POST /recommend/group`, least-misery)
- [x] Group creation, invite links, join-by-code with an approval queue
- [x] Roster lock, shortlist generation, approval voting, vote close
- [x] Group booking — one reservation across every participant
- [x] `/` redirects to the dashboard
- [ ] **Tests and CI** — there are none, and the concurrency-sensitive parts
      (compare-and-set on vote start, close, join and booking) are exactly the
      kind of thing that only fails under two simultaneous users
- [ ] Notifications — nothing tells an admin a join request is waiting, or tells
      a joiner they were approved
- [ ] Restaurant detail page — `photos`, `hours`, `tips`, `price` and `menuUrl`
      are stored and never rendered
- [ ] Per-person taste vectors feeding `/recommend/group` (the endpoint already
      accepts them; nothing builds them)
- [ ] Post-meal review prompt (rating + optional text)
- [ ] Paginate the Foursquare sync — a hardcoded `limit=50` in two places is
      what caps coverage, not geography
- [ ] Profile editing, saved-address CRUD, and the dead "Book Again" button
- [ ] Email verification & notifications via nodemailer
- [ ] A `LICENSE` file

---

## Contributing

1. Create a feature branch off `main`: `git checkout -b feat/your-feature`
2. Make your changes; run `npm run lint` before committing.
3. Keep commits focused and write clear messages.
4. Open a pull request describing the change and its rationale.

Please read `AGENTS.md` before writing code — this repo uses a Next.js build whose APIs may differ from what you expect.

---

## License

No license has been specified for this project yet. Until one is added, all rights are reserved by the authors. If you intend to open‑source it, consider adding an [MIT](https://choosealicense.com/licenses/mit/) `LICENSE` file.
