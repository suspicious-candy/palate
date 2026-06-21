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

> ⚠️ **Early stage / work in progress.** The data layer and UI are being built out; several screens currently render **hardcoded mock data** and the backend wiring is incomplete.

| Area | Status | Notes |
| --- | --- | --- |
| Mongoose data models | ✅ Implemented | `User`, `Restaurant`, `Reservation`, `Address` |
| Restaurant detail page | 🟡 UI complete, mock data | `getResturant()` returns hardcoded data — `TODO` real fetch |
| User profile page | 🟡 UI complete, mock data | `getUser()` returns hardcoded data — `TODO` real fetch |
| Login / Signup pages | 🟡 UI only | `onLogin()` / `onSignup()` handlers are empty stubs |
| Database connection | 🔴 Not implemented | `src/dbConfig/dbConfig.ts` is empty |
| API routes | 🔴 Not implemented | No `src/app/api` yet |
| Group matching | 🔴 Scaffold | `src/app/matching/group/page.tsx` is empty |
| Dashboard | 🔴 Scaffold | `src/app/dashboard/page.tsx` is empty |
| Home page | 🔴 Default starter | Still the `create-next-app` landing page |

This README documents both what exists today and the intended direction, so a new contributor can pick up work without reverse-engineering the codebase.

---

## Features

**Available now (UI):**

- 🔐 **Auth screens** — branded login and signup pages (email/password, plus placeholder "Continue with Google / Apple" buttons).
- 👤 **User profile** — avatar/initials, Star Member badge, upcoming reservations, favourites (top‑rated places visited), personal info, saved addresses, and a reservation‑history table.
- 🏚️ **Restaurant detail** — photo gallery, rating & price, description, crowd "tastes" tags, amenities, tips, contact card, social links, location, and opening hours (with an "Open now" indicator).

**Planned:**

- 🤝 **Group matching** — pool a group's preferences and surface restaurants everyone will enjoy.
- 📊 **Dashboard** — a personalized home for discovery and activity.
- 📅 **Reservations** — create, confirm, and manage bookings end‑to‑end.
- 🗺️ **Geo discovery** — "restaurants near me" powered by MongoDB `2dsphere` geo queries.

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
| Auth (planned) | [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) + [bcryptjs](https://github.com/dcodeIO/bcrypt.js) |
| Email (planned) | [nodemailer](https://nodemailer.com/) |
| Notifications | [react-hot-toast](https://react-hot-toast.com/) |
| Linting | ESLint 9 + `eslint-config-next` |

> **Restaurant data shape:** the `Restaurant` model and restaurant detail page are modelled on the [Foursquare Places API](https://docs.foursquare.com/developer/reference/places-api-overview) response (`fsqId`, categories, tips, tastes, photo `prefix`/`suffix`, etc.), making it straightforward to sync from Foursquare later.

> ⚠️ **Heads-up for contributors (`AGENTS.md`):** this project pins a build of Next.js whose APIs, conventions, and file structure may differ from older releases. For example, dynamic route `params` are now a `Promise` that must be `await`ed. When in doubt, consult the docs bundled in `node_modules/next/dist/docs/` for the exact installed version.

---

## Architecture Overview

```
Browser
  │
  ▼
Next.js App Router (src/app)
  ├─ Server Components ──────────► Mongoose models (src/models) ──► MongoDB
  │   (e.g. profile/[id], resturant/[id])      ▲
  │                                            │
  └─ Client Components                    dbConfig (planned:
      (login, signup, registry)           single shared connection)
```

- **Rendering:** pages are React Server Components by default; interactive screens (auth) opt into the client with `"use client"`.
- **Data access (planned):** server components/route handlers will call a shared Mongoose connection (`src/dbConfig/dbConfig.ts`) and read/write through the models in `src/models`.
- **Styling:** Tailwind utility classes app‑wide; `src/app/registry.tsx` wires up a `styled-jsx` registry so the scoped styles on the auth pages render correctly with SSR.

---

## Project Structure

```
palate/
├─ public/                     # Static assets (svg icons, resturant.jpg hero)
├─ src/
│  ├─ app/                     # Next.js App Router
│  │  ├─ layout.tsx            # Root layout (fonts, styled-jsx registry)
│  │  ├─ page.tsx              # Home (default starter — TODO replace)
│  │  ├─ globals.css           # Tailwind import + CSS theme variables
│  │  ├─ registry.tsx          # styled-jsx SSR registry (client component)
│  │  ├─ login/page.tsx        # Login screen (UI only)
│  │  ├─ signup/page.tsx       # Signup screen (UI only)
│  │  ├─ dashboard/page.tsx    # Dashboard (empty scaffold)
│  │  ├─ matching/group/page.tsx  # Group matching (empty scaffold)
│  │  ├─ profile/
│  │  │  ├─ page.tsx           # Profile index placeholder
│  │  │  └─ [id]/page.tsx      # User profile (mock data)
│  │  └─ resturant/
│  │     └─ [id]/page.tsx      # Restaurant detail (mock data)
│  ├─ dbConfig/
│  │  └─ dbConfig.ts           # DB connection (TODO: implement)
│  └─ models/                  # Mongoose schemas
│     ├─ userModel.js
│     ├─ restaurantModel.js
│     ├─ reservationModel.js
│     └─ addressModel.js
├─ .env                        # Local secrets (gitignored)
├─ .env.example                # Template for required env vars
├─ next.config.ts              # Next config (React Compiler on)
├─ tsconfig.json               # TS config (@/* → src/*)
├─ eslint.config.mjs
└─ postcss.config.mjs
```

> Note: the restaurant route is spelled **`resturant`** in the codebase — paths and IDs use that spelling.

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

| Path | Type | Description | State |
| --- | --- | --- | --- |
| `/` | Page | Home / landing | Default starter |
| `/login` | Page | Sign in | UI only |
| `/signup` | Page | Create account | UI only |
| `/dashboard` | Page | Personalized home | Empty |
| `/matching/group` | Page | Group restaurant matching | Empty |
| `/profile` | Page | Profile index | Placeholder |
| `/profile/[id]` | Page | A user's dining profile | UI + mock data |
| `/resturant/[id]` | Page | Restaurant detail | UI + mock data |

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

### 4. Run the dev server

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. The app hot‑reloads as you edit files.

To preview a built‑out screen right now, try a mock route such as `/profile/123` or `/resturant/abc`.

---

## Environment Variables

Environment variables are read from `.env` (gitignored). A committed `.env.example` documents the required keys.

| Variable | Required | Description |
| --- | --- | --- |
| `mongo_url` | ✅ | MongoDB connection string, e.g. `mongodb://127.0.0.1:27017/palate` or an Atlas SRV URI. |

**Planned** (as auth, email, and external data sync land):

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Sign/verify auth tokens (`jsonwebtoken`) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Transactional email (`nodemailer`) |
| `FOURSQUARE_API_KEY` | Sync restaurant data from Foursquare Places |

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

- [ ] Implement the shared Mongoose connection in `src/dbConfig/dbConfig.ts`
- [ ] Build auth API routes + wire up `onLogin` / `onSignup` (bcrypt hashing, JWT sessions)
- [ ] Replace mock `getUser` / `getResturant` with real DB reads (with populated refs)
- [ ] Reservation create/manage flow
- [ ] Group matching algorithm and `/matching/group` UI
- [ ] Dashboard
- [ ] Foursquare Places sync job
- [ ] Email verification & notifications via nodemailer
- [ ] Tests and CI

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
