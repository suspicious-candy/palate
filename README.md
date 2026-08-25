# 🍽️ Palate

> Decide where to eat — together.

**Palate** is a social dining web app for groups. Instead of endless "where do you want to eat?" back-and-forth, Palate helps friends and coworkers discover restaurants, match on shared tastes, and book a table — all in one place. Each user has a rich dining profile (favourite dishes, visit history, saved addresses, upcoming reservations), and restaurants are modelled on real-world place data so listings feel complete and trustworthy.

<p align="left">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca?logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss" />
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb" />
  <img alt="Status" src="https://img.shields.io/badge/status-live-brightgreen" />
  <img alt="Deployed on Vercel" src="https://img.shields.io/badge/Vercel-deployed-black?logo=vercel" />
</p>

> **Live:** <https://palate-suspicious-candy.vercel.app/>

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
- [Deployment](#deployment)
- [Security Posture](#security-posture)
- [Available Scripts](#available-scripts)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Project Status

> **Shipped.** Palate is deployed on **Vercel**, with the
> [recommender service](https://github.com/suspicious-candy/Restaurant_Rec)
> running on **Google Cloud Run** and MongoDB Atlas behind both. Every feature
> below runs on real data in production — auth, email verification, discovery,
> lists, reservations with calendar invites, friends, post-meal reviews, and the
> full group-dinner flow from invite link through voting to a booked table.
>
> The serverless-specific work landed before the first deploy: connection
> pooling sized for many isolates, distributed rate limiting, security headers,
> a startup check for the environment variables that fail quietly. The last pass
> before going live fixed the three things a local dev server cannot show you —
> a route that only 404s on a case-sensitive filesystem, a datetime that only
> shifts when the server's clock is UTC, and an error object that only crashes
> the tree when the API returns 400. All three are written up in
> [What the first deploy broke](#what-the-first-deploy-broke), because each is
> the kind of bug that reaches production precisely by working on a laptop.
>
> What is still missing is **automated testing in CI** (there is a thorough
> manual smoke test, but nothing runs it on a push), an **enforced CSP** (it
> ships `Report-Only`), and a `LICENSE`. Those and the rest are in
> [Still open](#still-open).
>
> Ranking needs the recommender reachable at `RECOMMENDER_URL`. Without it,
> nearby results degrade to distance order after a 3-second timeout and group
> shortlists return 503.

| Area | Status | Notes |
| --- | --- | --- |
| **Production deploy** | 🟢 Live | Vercel · recommender on Cloud Run · Atlas · Upstash Redis |
| Mongoose data models | ✅ Implemented | `User`, `Restaurant`, `Reservation`, `Review`, `Friendship`, `Matching`, `Address` |
| Database connection | ✅ Implemented | `src/dbConfig/dbConfig.ts` — cached, fail-fast, `maxPoolSize` sized for serverless |
| Auth API (signup / login / logout) | ✅ Implemented | bcrypt hashing, Zod validation, JWT in an httpOnly `token` cookie, `secure` in production |
| Email verification | ✅ Implemented | `nodemailer`, POST-not-GET verify (mail scanners pre-fetch links), resend endpoint |
| Authorization wrapper | ✅ Implemented | `withAuth` / `withVerified` — identity re-derived per request, `x-request-id` echoed |
| Rate limiting | ✅ Implemented | `src/lib/rateLimit.ts` — Upstash Redis when configured, in-process Map otherwise |
| Security headers + CSP | 🟡 Report-only | `next.config.ts` — HSTS, nosniff, frame-deny, Permissions-Policy enforced; CSP is `Report-Only` by design |
| Route gate | ✅ Implemented | `src/proxy.ts` — UX redirect only; the real boundary is `withAuth` |
| Onboarding (preferences) | ✅ Implemented | `src/app/onBoarding/page.tsx` — diet / allergens / cuisines |
| Profile + editing | ✅ Implemented | `PATCH /api/user` with an allowlist schema; saved-address CRUD |
| Dashboard | ✅ Implemented | `src/app/dashboard/page.tsx` — "Bill of Fare" layout, live data |
| Lists / wishlist | ✅ Implemented | `src/app/lists/page.tsx` + `/api/Restaurants/lists`, `/api/user/lists` |
| Reservations | ✅ Implemented | Create / complete / cancel, confirmation email with an `.ics` attachment |
| Post-meal reviews | ✅ Implemented | `Review` model, prompt on next load, folded into `palateRating` + `tips[]` |
| Learned taste | ✅ Implemented | `src/lib/tasteSignal.ts` — recent 4★+ visits feed the taste query |
| Friends | ✅ Implemented | `/api/user/friends`, `FriendsModal`, invite links + QR |
| Group matching | ✅ Implemented | Create, invite, approve, vote, close, book — see below |
| Multiple groups | ✅ Implemented | `/matching/group` lists them; `/matching/group/[groupId]` is the detail view |
| Geo discovery | ✅ Implemented | `2dsphere` `$near`, paginated Foursquare sync, recommender re-rank |
| Branding + metadata | ✅ Implemented | `src/app/icon.svg`, `apple-icon.png`, `favicon.ico`; `title` uses `default` + `template` so a future per-route title appends rather than replaces |
| API smoke test | ✅ Implemented | `npm run test:api` — every endpoint, against a running dev server |
| Automated tests in CI | 🔴 Not built | The smoke test is manual. Nothing runs on push. |
| Error boundaries | 🔴 Not built | No `error.tsx` anywhere — a render-time throw unmounts the whole tree |
| `LICENSE` | 🔴 Not added | Until one exists, all rights reserved — see [License](#license) |
| Restaurant detail page | 🔴 Not built | `photos`, `hours` and `menuUrl` are stored and never rendered |
| Notifications | 🔴 Not built | Nothing tells an admin a join request is waiting, or a joiner they were approved |

This README documents what is running today, what it cost to get there, and where the work goes next — so a new contributor can pick that up without reverse-engineering either the codebase or the deploy.

---

## Features

**Available now:**

- 🔐 **Authentication** — signup and login: passwords hashed with bcrypt, requests validated with Zod, a signed JWT stored in an httpOnly `token` cookie (`secure` in production, `sameSite: lax`, 1-day expiry matching the JWT). Login accepts either an email or a username. Rate limited two ways at once — by IP, and more loosely by account, because the per-account key is a weapon anyone can point at a stranger.
- ✉️ **Email verification** — a verification mail on signup, a resend endpoint capped at three an hour, and a `withVerified` wrapper on the actions that reach other people: booking a table, creating a group, joining one. The verify endpoint is a **POST** issued by the landing page, not a GET on the link itself, because corporate mail scanners pre-fetch links and would silently consume the token before the user ever clicked.
- 🎯 **Taste onboarding** — dietary needs, allergens, and favourite cuisines, saved through a cookie-authenticated API. Only diet and cuisines feed ranking; allergens are stored for the user's own reference and the screen says so, because matching free text against cuisine names would look like allergen safety while providing none.
- 👤 **User profile** — avatar/initials, Star Member badge, upcoming reservations, favourites, personal info, saved addresses, reservation history. Editing goes through an allowlist schema: every field absent from it — `Role`, `isVerified`, `numVisits`, `password` — is a field a user cannot change about themselves.
- 📊 **Dashboard** — "Bill of Fare" home: tonight's feature, recommendations, wishlist and custom lists, friends rail, invite by link/QR.
- 🗺️ **Geo discovery** — "restaurants near me" via MongoDB `2dsphere` queries, seeded from Foursquare Places and re-ranked by the recommender. Cold areas are synced on demand, rate limited **per ~1km grid cell rather than per caller**, so ten neighbours opening the app in a new area cost one Foursquare sync between them instead of ten.
- 📅 **Reservations** — create, complete, and cancel bookings; a confirmation email carrying a real iCalendar (`.ics`) attachment; and a prompt that catches a booking after you follow a Maps link.
- ⭐ **Post-meal reviews** — after a meal completes, a prompt asks for 1–5 stars and optional text. One review per person per *meal* (enforced by a unique index, not a find-then-insert, which races), so going back in July after loving it in March is two verdicts. Each review is folded into the restaurant's `palateRating` and `tips[]`, then the recommender is asked to re-embed that place — which is how the index gets richer as the app is used.
- 🧠 **Learned taste** — the taste query sent to the recommender is built from stated cuisines and diet *plus* the cuisines you have actually gone out and rated 4★ or better recently, capped so eight reviews cannot drown out three stated preferences.
- 👥 **Friends** — request / accept / decline, invite links and QR.
- 🤝 **Group dinners** — the whole flow, end to end:
  - **Create** a group from your friends list, with a share code minted at creation. You can be in several at once.
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
    their accounts at once. Note that unlike a solo booking, this sends **no
    confirmation email and no calendar invite** to anyone; the group screen is
    currently the only place the result appears.

**Planned:**

- 🔔 **Notifications** — nothing currently tells an admin that someone is waiting
  in the join queue, or tells a joiner they were approved.
- 🏠 **Restaurant detail page** — `photos`, `hours` and `menuUrl` are synced and
  never shown.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, React Server Components) |
| UI library | [React 19](https://react.dev) with the [React Compiler](https://react.dev/learn/react-compiler) enabled |
| Language | [TypeScript 5](https://www.typescriptlang.org/) (Mongoose models are JavaScript) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/postcss`, plus **CSS Modules** per screen |
| Fonts | Geist Sans/Mono, Hanken Grotesk, Cormorant Garamond, IBM Plex Mono — self-hosted through `next/font` |
| Icons | [Phosphor Icons](https://phosphoricons.com/) (web font) |
| Database | [MongoDB](https://www.mongodb.com/) with [Mongoose 9](https://mongoosejs.com/) |
| Auth | [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) (httpOnly cookie) + [bcryptjs](https://github.com/dcodeIO/bcrypt.js) |
| Validation | [Zod](https://zod.dev/) on every API route |
| Email | [nodemailer](https://nodemailer.com/) — verification and reservation confirmations, with hand-rolled iCalendar |
| Rate limiting | [Upstash Redis](https://upstash.com/) over its REST API, with an in-memory fallback |
| Recommendations | [restarunt-Rec](https://github.com/suspicious-candy/Restaurant_Rec) — FastAPI + Chroma, called server-side |
| Notifications (UI) | [react-hot-toast](https://react-hot-toast.com/) |
| Linting | ESLint 9 + `eslint-config-next` |

> **Restaurant data shape:** the `Restaurant` model is modelled on the [Foursquare Places API](https://docs.foursquare.com/developer/reference/places-api-overview) response (`fsqId`, categories, tips, tastes, photo `prefix`/`suffix`, etc.).

> ⚠️ **Heads-up for contributors (`AGENTS.md`):** this project pins a build of Next.js whose APIs, conventions, and file structure may differ from older releases. For example, dynamic route `params` are now a `Promise` that must be `await`ed. When in doubt, consult the docs bundled in `node_modules/next/dist/docs/` for the exact installed version.

---

## Architecture Overview

```
Browser
  │  (httpOnly `token` cookie rides along with requests)
  ▼
proxy.ts ── UX gate: "is there a cookie?" → redirect. NOT an auth boundary.
  ▼
Next.js App Router (src/app)
  ├─ Route Handlers ──► withAuth / withVerified ──► Mongoose models ──► MongoDB
  │                      (verifies the JWT, per request, every time)
  │        │
  │        ├──► Upstash Redis (REST)      rate-limit counters, shared across instances
  │        ├──► SMTP (nodemailer)         verification + reservation mail (+ .ics)
  │        ├──► Foursquare Places API     on-demand sync of a cold area
  │        └──► FastAPI recommender       POST /recommend · /recommend/group · /index/missing
  │
  ├─ Server Components ──────► dbConfig (cached, pooled Mongoose connection)
  └─ Client Components ── fetch /api ──┘
      (auth, onboarding, dashboard, group screens, modals)
```

- **Rendering:** pages are React Server Components by default; interactive screens opt into the client with `"use client"`.
- **Data access:** route handlers call the shared, hot-reload-safe Mongoose connection (`src/dbConfig/dbConfig.ts`) and read/write through the models in `src/models`.
- **Authorization** lives in `src/lib/withAuth.ts`, not in `proxy.ts`. Proxy only checks that a cookie *named* `token` exists, never verifies its signature, and its matcher excludes `/api` entirely — so it decides where to send a browser and nothing more. Handing the verified `user` in as a handler parameter is the point: there is no signature in which a handler holds a user without the check having run, so a new route cannot be born unauthenticated by omission.
- **Session death** is handled at the transport layer (`src/lib/sessionExpiry.ts`), not in ~22 call sites, because a dead session is not a fact about the request that discovered it — it is a change in global state every later request will also hit.
- **The recommender is reached server-side only.** The browser never calls it, which is why `connect-src` in the CSP can stay `'self'`.

---

## Project Structure

```
palate/
├─ public/                     # Static assets
├─ scripts/                    # One-off and maintenance jobs (see Available Scripts)
│  ├─ syncFoursquareAreas.mjs  # Bulk city sync, paginated
│  ├─ seedRestaurants.mjs      # Yelp-derived seed load
│  ├─ apiSmokeTest.mjs         # End-to-end HTTP test of every endpoint
│  └─ backfillReviewEnrichment.mjs
├─ src/
│  ├─ instrumentation.ts       # Runs once per server process — the startup env check
│  ├─ proxy.ts                 # Route gate: redirects signed-out users, carries ?next=
│  ├─ app/                     # Next.js App Router
│  │  ├─ layout.tsx            # Root layout (fonts, providers, Toaster, metadata)
│  │  ├─ page.tsx              # Home — redirects to /dashboard
│  │  ├─ globals.css           # Tailwind import + CSS theme variables
│  │  ├─ icon.svg              # File-based metadata: Next generates the <link>
│  │  ├─ apple-icon.png        #   tags from these filenames. No manifest to keep
│  │  ├─ favicon.ico           #   in sync — the convention IS the wiring
│  │  ├─ api/
│  │  │  ├─ Restaurants/            # nearby (geo + sync + rank), search, lists, wishList
│  │  │  ├─ reservations/route.ts   # GET/POST/PATCH — bookings, auto-complete on read
│  │  │  ├─ reviews/                # POST a review · GET the pending queue
│  │  │  └─ user/
│  │  │     ├─ route.ts             # PATCH — edit your own profile (allowlist schema)
│  │  │     ├─ signup, login, logout, verifyemail, resend-verification
│  │  │     ├─ preferences, dashboard, lists, friends, addresses, visitedResturant
│  │  │     └─ matching/
│  │  │        ├─ route.ts                    # GET groups · POST create
│  │  │        ├─ join/route.ts               # POST — redeem an invite code
│  │  │        └─ [groupId]/
│  │  │           ├─ route.ts                 # GET one group · PATCH lock/unlock roster
│  │  │           ├─ requests/route.ts        # POST — approve or deny a join request
│  │  │           ├─ location/route.ts        # PATCH — this member's location
│  │  │           ├─ shortlist/route.ts       # POST — build the ballot, open voting
│  │  │           ├─ vote/route.ts            # PUT  — replace this member's approvals
│  │  │           ├─ close/route.ts           # POST — close the vote early
│  │  │           └─ reservation/route.ts     # POST — book the winner for everyone
│  │  ├─ login/ signup/ verifyemail/          # Auth screens
│  │  ├─ onBoarding/           # Taste onboarding (diet/allergens/cuisines)
│  │  ├─ dashboard/            # "Bill of Fare"
│  │  ├─ lists/ reservation/ profile/       # all-lowercase — the directory name
│  │  │                                     #   IS the URL, and Vercel builds on
│  │  │                                     #   a case-sensitive filesystem
│  │  ├─ add/[username]/       # Friend-add landing for invite links
│  │  ├─ join/[code]/          # Public group-invite landing
│  │  └─ matching/group/       # Group index + [groupId] detail (roster, ballot, winner)
│  ├─ components/              # Nav, modals, review + reservation prompts
│  ├─ lib/                     # Pure logic, shared hooks, and the cross-cutting concerns:
│  │  ├─ withAuth.ts           #   the authorization boundary
│  │  ├─ rateLimit.ts          #   Redis-or-memory limiter + every tuning
│  │  ├─ recommender.ts        #   the recommender's address and credentials, in one place
│  │  ├─ env.ts                #   startup check for variables that fail quietly
│  │  ├─ mailer.ts             #   one nodemailer transport, port-derived TLS
│  │  ├─ emailTemplates.ts     #   inline-styled HTML, the subset every mail client agrees on
│  │  ├─ calendar.ts           #   RFC 5545 .ics generation
│  │  ├─ tasteQuery.ts         #   what a person's taste "sounds like" to the recommender
│  │  └─ tasteSignal.ts        #   cuisines learned from recent high-rated visits
│  ├─ dbConfig/dbConfig.ts     # Shared, cached, pool-sized Mongoose connection
│  └─ models/                  # Mongoose schemas
│     ├─ userModel.js  restaurantModel.js  reservationModel.js
│     └─ reviewModel.js  friendshipModel.js  matching.js  addressModel.js
├─ .env                        # Local secrets (gitignored)
├─ .env.example                # Template for required env vars — the deploy checklist
├─ next.config.ts              # React Compiler, image allowlist, security headers, CSP
├─ tsconfig.json               # TS config (@/* → src/*)
├─ eslint.config.mjs
└─ postcss.config.mjs
```

---

## Data Models

All models live in `src/models` and guard against hot-reload recompilation with the `mongoose.models.X || mongoose.model(...)` pattern.

> ⚠️ **Restart the dev server after editing anything in `src/models/`.** The
> guard above returns the *already compiled* model, so a newly added field is
> silently dropped by strict mode until the process restarts.

### `User` — `users`
Diner profile and relationships.

| Field | Type | Notes |
| --- | --- | --- |
| `username` | String | required, unique |
| `email` | String | required, unique |
| `password` | String | required, bcrypt hash |
| `firstName`, `lastName`, `favDish`, `profilePic` | String | optional |
| `phone` | String | stored as string to keep `+`, spaces, leading zeros |
| `dob`, `firstOrderDate` | Date | |
| `timeZone` | String | the browser's IANA zone, so server-side time maths matches the user's evening |
| `StarmembershipStatus` | Boolean | loyalty flag |
| `numVisits` | Number | |
| `Role` | enum | `user` \| `admin` (default `user`) — included in the JWT payload |
| `isVerified` | Boolean | default `false`. Read from the **database**, never from the JWT — the token is minted at signup while the flag is still false and lives for a day |
| `verifyToken`, `verifyTokenExpiry` | String / Date | email verification |
| `forgotPasswordToken`, `forgotPasswordTokenExpiry` | String / Date | reserved; reset flow not built |
| `preferences` | Object | `likedCuisines[]` (`fsqid`, `name`), `allergines[]`, `diet[]`. Only `likedCuisines` and `diet` build the taste query; `allergines` is stored for the user's reference only. A `disliked[]` field existed and was removed — old documents may still carry it, inertly. |
| `matchingGroup` | Object | the soonest group, denormalised for the dashboard |
| `reservations` | `[ObjectId → reservations]` | active/upcoming |
| `reservationHistory` | `[ObjectId → reservations]` | past |
| `visitedResturants` | `[ObjectId → restaurants]` | |
| `savedAddresses` | `[ObjectId → address]` | |

### `Restaurant` — `restaurants`
Foursquare-shaped place document.

- Identity: `fsqId` (required, unique, indexed), `name`, `description`, `categories[]`, `cuisine[]`.
- Location: `location`, `geocodes`, and a GeoJSON `geo` **Point** with a **`2dsphere` index** for `$near` / `$geoWithin` queries (coordinates are `[lng, lat]`).
- Contact: `tel`, `email`, `website`, `socialMedia`.
- Signals: `rating` (0–10), `popularity` (0–1), `price` (1–4), `stats`, and `palateRating` (`{ avg, count }`) — this app's own aggregate, recomputed from the reviews collection on every write and deliberately left on the raw 1–5 star scale, unlike `rating`'s 0–10. The mismatch is the reminder that averaging the two would be meaningless.
- Content: `hours`, `photos[]` (`prefix`+`<size>`+`suffix`), `tips[]`, `tastes[]`, flexible `features` (Mixed), `menuUrl`. Tips carry their own `source` (`foursquare` \| `palate`), because Foursquare tips and Palate reviews share one array and nothing could recompute one without clobbering the other.
- Bookkeeping: `source` (`foursquare` \| `yelp_seed`), `verified`, `dateClosed`, `lastFetchedAt`, timestamps.

> `source` is what separates the two populations. The recommender's index and
> the group shortlist both select on `source: "foursquare"`, so a row written
> without it is invisible to ranking.

### `Reservation` — `reservations`
| Field | Type | Notes |
| --- | --- | --- |
| `users` | `[ObjectId → users]` | An **array**, not a single owner — a group booking is one reservation landing on every participant's account. Indexed with `date` as `{users: 1, date: -1}`. |
| `restaurant` | `ObjectId → restaurants` | required, indexed |
| `date` | Date | booked date + time |
| `partySize` | Number | required, min 1 |
| `status` | enum | `confirmed` (default) \| `cancelled` \| `completed`. `GET /api/reservations` promotes past bookings to `completed` on read, which is what makes a meal reviewable without a scheduled job. |
| `notes` | String | optional |

### `Review` — `reviews`
| Field | Type | Notes |
| --- | --- | --- |
| `user` | `ObjectId → users` | required |
| `restaurant` | `ObjectId → restaurants` | denormalised from the reservation, never from the request body |
| `reservation` | `ObjectId → reservations` | required |
| `rating` | Number | 1–5, whole stars (Mongoose has no integer type, so a validator enforces it) |
| `text` | String | ≤ 999 chars |

Indexes: `{user, reservation}` **unique** (one verdict per meal, enforced by the
database so a double-tapped button 409s instead of double-inserting),
`{user, createdAt: -1}` (the taste signal), `{restaurant, createdAt: -1}` (the
enrichment side).

### `Matching` — `matching`
A group dinner.

| Field | Notes |
| --- | --- |
| `name`, `date`, `createdBy` | The dinner itself. `date` also drives the voting deadline — 90 minutes before the table. |
| `participants[]` | Per member: `user`, `hasVoted`, `approvals[]`, `votedAt`, `location` (a GeoJSON Point) and `locationAt`. |
| `admins[]` | Who may start the vote, close it, approve joiners, and book. Each of those is irreversible for the whole group. |
| `status` | `open` → `voting` → `closed`. |
| `membershipOpen` | The roster lock, **orthogonal to `status`** — an admin can freeze the guest list at any point without moving the group forward. |
| `inviteCode` | Unique and **sparse**, so groups without one do not collide on `null`. |
| `pendingRequests[]` | The approval queue. Friends of an admin skip it; strangers do not, which is what stops a forwarded link from being a leaked group. |
| `restaurants[]` | The generated ballot — 7 places, frozen when voting opens. |
| `winner`, `reservation` | The result, and the single booking it produced. |

### `Address` — `address`
Structured address with a `label` enum (`Home` / `Office`) and a nested `address` object (`aptNumber`, `streetAddress`, `city`, `state`, `country`, `pincode`).

---

## Routes

### Pages

| Path | Description | Gate |
| --- | --- | --- |
| `/` | Redirects to `/dashboard` | — |
| `/login`, `/signup` | Auth | Public (redirects away if signed in) |
| `/verifyemail` | Landing page for the emailed link; POSTs the token | Public |
| `/onBoarding` | Taste onboarding | Protected |
| `/dashboard` | Personalized home ("Bill of Fare") | Protected |
| `/lists` | Wishlist and custom lists | Protected |
| `/reservation` | Reservations | Protected |
| `/profile` | A user's dining profile | Protected |
| `/matching/group` | Every group you are in | Protected |
| `/matching/group/[groupId]` | Roster, join queue, ballot, winner, booking | Protected |
| `/add/[username]` | Friend-add landing for invite links | Public |
| `/join/[code]` | Public invite landing for a group | Public |

Protection is prefix-matched from one list in `src/lib/protectedRoutes.ts`, read by both `proxy.ts` (no cookie) and `sessionExpiry.ts` (dead session).

### API (Route Handlers)

| Method & Path | Description | Auth |
| --- | --- | --- |
| `POST /api/user/signup` | Create an account, send verification mail, set the `token` cookie | Public · rate limited |
| `POST /api/user/login` | Authenticate by email **or** username | Public · rate limited by IP + account |
| `POST /api/user/logout` | Clear the cookie | Public |
| `POST /api/user/verifyemail` | Redeem an emailed token | Public · rate limited |
| `POST /api/user/resend-verification` | Re-send the mail (3/hour) | JWT cookie |
| `PATCH /api/user` | Edit your own profile — allowlist schema | JWT cookie |
| `PATCH /api/user/preferences` | Save dietary needs, allergens, cuisines | JWT cookie |
| `GET /api/user/dashboard` | The signed-in user, populated, plus active groups | JWT cookie |
| `POST/PATCH/DELETE /api/user/addresses` | Saved-address CRUD | JWT cookie |
| `GET/POST/DELETE /api/user/friends` | List, request/accept, decline/cancel | JWT cookie |
| `PATCH/DELETE /api/user/lists` | Create/rename/remove a custom list | JWT cookie |
| `PATCH/DELETE /api/Restaurants/lists` | Add/remove a restaurant on a list | JWT cookie |
| `PATCH/DELETE /api/Restaurants/wishList` | Wishlist toggle | JWT cookie |
| `PATCH /api/user/visitedResturant` | Record a visit | JWT cookie |
| `GET /api/Restaurants/nearby` | Geo search, on-demand Foursquare sync, recommender re-rank | Optional · rate limited |
| `GET /api/Restaurants/search` | Lexical name search within 70km | Public · rate limited |
| `GET/POST/PATCH /api/reservations` | Bookings; GET also completes past ones | JWT cookie · **POST requires a verified email** |
| `GET /api/reviews/pending` | Meals awaiting a verdict | JWT cookie |
| `POST /api/reviews` | Rate a completed meal | JWT cookie |
| `GET/POST /api/user/matching` | Your groups; create a group | JWT cookie · **POST requires a verified email** |
| `POST /api/user/matching/join` | Redeem an invite code — admits or queues | **Verified** |
| `GET/PATCH /api/user/matching/[groupId]` | Read one group · lock or reopen the roster | JWT cookie / Admin |
| `POST /api/user/matching/[groupId]/requests` | `{ targetId, action }` — approve or deny | Admin |
| `PATCH /api/user/matching/[groupId]/location` | Report this member's location | Member |
| `POST /api/user/matching/[groupId]/shortlist` | Build the ballot, move to `voting` | Admin |
| `PUT /api/user/matching/[groupId]/vote` | Replace this member's approvals | Member |
| `POST /api/user/matching/[groupId]/close` | Close the vote early | Admin |
| `POST /api/user/matching/[groupId]/reservation` | Book the winner for everyone | Admin |

> **Why so many routes are admin-only.** Starting a vote freezes the ballot,
> closing it discards un-cast votes, and booking writes a reservation onto every
> participant's account. Each is irreversible for the whole group, so each is
> gated — and every one of them re-derives identity from the JWT rather than
> trusting `proxy.ts`, which only checks that a cookie named `token` exists.

> **Why some routes require a verified email.** The line is drawn at actions
> that reach *other people* or commit a real-world resource: booking a table,
> forming a group, joining someone else's. Reading your own dashboard does not.
> The check reads `isVerified` from the database rather than the token, because
> a claim that can go stale must not be the thing an authorization check reads.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.18 (Node 20+ recommended)
- **npm** (or yarn / pnpm / bun)
- A **MongoDB** connection string — either a local `mongod` instance or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- Python 3.12 and the sibling [`restarunt-Rec/`](https://github.com/suspicious-candy/Restaurant_Rec) checkout, for ranking

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

```bash
cp .env.example .env
```

Only two are needed to boot: `mongo_url` and `TOKEN_SECRET`. Everything else has
a development fallback — that is deliberate, and it is also why
[the deploy checklist matters](#deployment): the same fallbacks are silently
wrong in production. `.env.example` documents each one and what breaks.

```bash
openssl rand -hex 32
```

### 4. Start the recommender service

**`npm run dev` alone is not enough for ranking.** Restaurant ranking lives in a
separate FastAPI service in the sibling [`restarunt-Rec/`](https://github.com/suspicious-candy/Restaurant_Rec)
repo:

```bash
cd ../restarunt-Rec && ./.venv/Scripts/python.exe -m uvicorn service:app --port 8000
```

Run it from that directory — its Chroma store defaults to a relative path. Port
8000 is what `RECOMMENDER_URL` falls back to.

Without it, nearby requests time out after 3 seconds and fall back to an
unranked distance-ordered list (the page still renders, so the only symptom is
worse recommendations), while starting a group vote returns 503 outright. See
that repo's README for the index and its rebuild.

**Or skip it and point at the deployed one.** Set `RECOMMENDER_URL` in your
`.env` to the Cloud Run service URL — the read endpoints are open, so no token
is needed to rank. Two things to know before you do: writes still need
`RECOMMENDER_TOKEN`, so `/index/missing` will 401 silently without it; and
you are then ranking against the **deployed** index, which is a snapshot in the
image rather than whatever your local Mongo holds. Fine for working on the UI,
misleading for working on ranking.

### 5. Run the dev server

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**.

### 6. (Optional) Check every endpoint still works

```bash
npm run test:api
```

Requires the dev server running. The recommender section reports SKIP rather
than FAIL if nothing answers on `RECOMMENDER_URL`.

---

## Environment Variables

Read from `.env` in development (gitignored) and from the platform's environment
in production. `.env.example` is the committed template.

**Every variable below fails quietly.** Forget one and the app still boots,
still serves pages, and still looks correct — the damage shows up later and
somewhere else. That is exactly why `src/lib/env.ts` exists: it runs once per
server process via `instrumentation.ts` and logs, in production only, which of
these are missing and what each one will break. It deliberately does **not**
throw, because an app that will not start is a worse outage than one running
without a cache.

| Variable | Dev | Prod | Description, and the failure mode |
| --- | :---: | :---: | --- |
| `mongo_url` | ✅ | ✅ | MongoDB connection string. Every request that touches the database fails without it. |
| `TOKEN_SECRET` | ✅ | ✅ | Signs and verifies auth JWTs. **The only fatal one** — `withAuth` answers 500 rather than 401, because a server that cannot verify a session is broken, and a 401 would send the whole userbase round a login loop that cannot succeed. |
| `APP_URL` | — | ✅ | Origin used to build absolute links in outgoing mail. Unset, every verification and reservation link points at `localhost`. No `NEXT_PUBLIC_` prefix: only the server builds these. |
| `RECOMMENDER_URL` | — | ✅ | Base URL of the FastAPI recommender — in production, the Cloud Run service URL. Falls back to `http://localhost:8000`, where nothing answers on a host — nearby silently degrades, group shortlists 503. |
| `RECOMMENDER_TOKEN` | — | ✅ | Shared secret for the recommender's write endpoint, sent as `x-recommender-token`. Must match the value set on the service. Wrong or missing → `/index/missing` 401s, and since `fetch` does not reject on 4xx, new restaurants simply never get vectors. |
| `UPSTASH_REDIS_REST_URL` | — | ✅ | Distributed rate-limit counters. |
| `UPSTASH_REDIS_REST_TOKEN` | — | ✅ | Paired with the above. Without both, limits are per-instance — which on serverless, where each invocation may get a fresh isolate, is approximately **no rate limiting at all** while continuing to look correct. |
| `SMTP_HOST` | — | ✅ | Mail server. Without it signup still succeeds and nobody can ever verify. |
| `SMTP_PORT` | — | ✅ | `465` = implicit TLS, `587`/`2525` = STARTTLS. `mailer.ts` derives `secure` from this value so the two cannot disagree. Getting it wrong does not error — the socket just hangs until it times out. |
| `SMTP_USER` / `SMTP_PASS` | — | ✅ | Credentials. Gmail needs an **App Password**, not the account password, with 2-Step Verification on. |
| `MAIL_FROM` | — | ✅ | A bare address, no display name — the "Palate" label is added in code, and env-file quoting rules are inconsistent enough that `"Palate" <a@b.com>` can parse as just `Palate`. Must be an address the SMTP account may send as. |
| `FOURSQUARE_API_KEY` | ✅ | ✅ | Used by `/api/Restaurants/nearby` for cold areas and by `npm run seed:foursquare`. |
| `FOURSQUARE_API_VERSION` | ✅ | ✅ | Sent as the `X-Places-Api-Version` header. |

Script-only knobs: `MIN_POPULATION`, `MAX_PAGES`, `DRY_RUN` (`seed:foursquare`),
and `BASE_URL` (`test:api`).

> 🔒 Never commit real secrets. `.env*` is gitignored, with an explicit
> exception for `.env.example`.

For local development, [ethereal.email](https://ethereal.email) generates a
throwaway inbox instantly and delivers nothing — `sendMail` logs a preview URL
to the **server terminal** instead:

```
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
```

---

## Deployment

**Live on [Vercel](https://palate-suspicious-candy.vercel.app/), with
the recommender on Google Cloud Run.** Nothing here is Vercel-specific by
construction, but the serverless-shaped decisions in the code — connection pool
size, Redis-backed rate limits, the two `maxDuration` exports — were made for
that shape, and the sections below are what they turned out to mean in practice.

| Piece | Where | Notes |
| --- | --- | --- |
| Web app | Vercel | Next.js 16 App Router, one project, deploys on push |
| Recommender | Google Cloud Run (`asia-south1`) | FastAPI + Chroma, scale-to-zero, index baked into the image — [details](https://github.com/suspicious-candy/Restaurant_Rec#deployment) |
| Database | MongoDB Atlas | Database name is literally `test`; both services must agree |
| Rate-limit store | Upstash Redis | REST API, so an isolate that cannot hold a socket still shares counters |
| Mail | SMTP provider | Verification + reservation confirmations with `.ics` |

### Deploy order

The order matters, because two of the values Vercel needs do not exist until the
other pieces do.

1. **MongoDB Atlas** — create the cluster and the database user. Note that the
   app's data historically lives in a database literally called `test` (the URI
   carried no name and Node's driver defaulted); the recommender's `MONGO_DB`
   must match whatever you use.
2. **Upstash Redis** — create a database, copy the **REST** URL and token (not
   the `redis://` connection string; the limiter uses HTTP so it works from an
   isolate that cannot hold a socket open).
3. **SMTP** — a provider and a verified sender address. See the deliverability
   note below.
4. **The recommender** — deploy it to Cloud Run first and note its URL. See
   [`restarunt-Rec/README.md`](https://github.com/suspicious-candy/Restaurant_Rec#deployment).
5. **This app** — import the repo into Vercel, set every variable from the table
   above, and deploy.

### Network access

Both Vercel and Cloud Run have **dynamic egress IPs**. Atlas's default posture
is an IP allowlist, so either allow `0.0.0.0/0` (acceptable when the connection
string is itself the credential and lives only in the platform's environment) or
put both services behind static IPs and allowlist those. Getting this wrong
produces a `MongoServerSelectionError` five seconds into every request, which
reads like an outage rather than a firewall.

### What is already sized for serverless

These are done — listed so nobody "fixes" them later without knowing why:

- **`maxPoolSize: 10`**, not Mongoose's default of 100. The connection cache is
  per-isolate, so every concurrent instance opens its own pool. Against a
  cluster that allows 500 connections, five cold instances answering a traffic
  spike can exhaust it between them — and the failure arrives exactly when
  traffic is highest and looks like a database outage. Revisit this number only
  alongside the cluster tier: **pool size × instance ceiling must stay under the
  connection limit.**
- **`maxIdleTimeMS: 60_000`**, so a frozen instance does not keep connections
  checked out at the cluster while doing nothing.
- **`serverSelectionTimeoutMS: 5000`** — fail fast rather than let model calls
  buffer.
- **Redis-backed rate limits**, with a documented fallback that degrades to
  per-instance rather than to unlimited or to locked-out.
- **Two `maxDuration` exports**, both sized *above* their own internal timeouts,
  because Vercel kills a function at `maxDuration` — and if the platform limit
  were the lower of the two it would abort the handler before its own
  `AbortSignal` fired, turning a slow dependency into a 504 with no log line and
  no chance to return the 503 the `catch` was written to produce:

  | Route | Internal timeout | `maxDuration` | Why |
  | --- | --- | --- | --- |
  | `/api/Restaurants/nearby` | 3s on the recommender | 30 | Degrades invisibly to distance order, so waiting is the worst option. The 30 covers three paginated Foursquare requests plus a bulk upsert on a cold area. |
  | `…/[groupId]/shortlist` | 60s on the recommender | 90 | **Cannot** degrade — it freezes a ballot people then vote on. Sized for a recommender cold start (measured at 14s locally, slower on a shared vCPU). |

  Vercel's Hobby plan allows up to 300s, so neither is near a ceiling.

### What the first deploy broke

Three bugs survived local development and surfaced on the first deployed build.
They are worth writing down together because they share a shape: **each one is
invisible on a laptop by construction.** Not "we forgot to test it" — the local
environment cannot produce the condition. A dev server on Windows has a
case-insensitive filesystem, a dev machine is rarely in UTC, and the happy path
never returns a 400.

**1 — A route that only exists in lowercase on Linux.**
The directory was `src/app/Profile/`, so the route it generated was `/Profile`.
Every link in the app pointed at `/profile`: `Nav.tsx`, and
`lib/protectedRoutes.ts` which is what `proxy.ts` and `sessionExpiry.ts` both
read. On Windows, NTFS is case-insensitive and module resolution follows it, so
`/profile` resolved to the `Profile/` directory and the page loaded. Vercel
builds on Linux, where it does not, and the profile page 404'd in production
while working perfectly in dev.

In the App Router **the directory name is the URL** — there is no route table to
disagree with, which is normally the point and here is the trap. Two habits fall
out of it: keep every route segment lowercase, and treat a path that renders
locally as unverified until it has been requested from a Linux build.

The fix has a second trap in it. `git mv Profile profile` on a case-insensitive
filesystem is a no-op — git already believes the path matches — so the rename
never reaches the repo and the next deploy 404s identically. Go through a
temporary name:

```bash
git mv src/app/Profile src/app/profile-tmp && git mv src/app/profile-tmp src/app/profile
```

You can see the case-sensitivity directly against the deployment — `/profile`
redirects a signed-out visitor to login, `/Profile` does not exist at all:

```bash
for p in /profile /Profile; do curl -s -o /dev/null -w "$p -> %{http_code}\n" "https://palate-suspicious-candy.vercel.app$p"; done
```

`307` and `404` respectively. Run the same loop against `localhost:3000` on
Windows and both return `307` — which is the entire bug, reproduced in two
lines.

**2 — A booking time that shifted by the user's UTC offset.**
`<input type="datetime-local">` produces a string with **no offset** —
`"2026-08-20T14:29"`. That string was posted raw. `new Date()` reads an
offset-less datetime as *local* time, and a Vercel function's local time is
**UTC**, so the server read the user's wall clock as a UTC instant and every
booking landed `offset` hours away from what was chosen. West of UTC that means
*earlier*: at GMT−5, a table booked for this evening arrived five hours in the
past, and the route's future-only refinement rejected it — a 400 that named the
date and explained nothing, on a machine where the same click had always worked.

The fix is to convert in the **browser**, where the same string is correctly
read as local time, and send a real instant:

```ts
date: new Date(entries[c.fsqId].date).toISOString()
```

The rule: a `datetime-local` value is a *wall clock*, not a moment. It only
becomes a moment when something that knows the user's offset resolves it, and
the only participant that reliably knows is the browser. (This is separate from
the `timeZone` field on `User` — that one exists so *server-side* time maths,
like the 90-minute voting deadline, lands on the user's evening rather than the
server's.)

**3 — A 400 that unmounted the app.**
Route handlers answer a validation failure with Zod's `fieldErrors`, which is an
**object** keyed by field name. That object was handed straight to
`toast.error()`, react-hot-toast rendered it as a React child, and React threw
*"Objects are not valid as a React child"* — from inside a render, where a
`try/catch` around the `await` cannot reach it.

The blank screen is the part worth understanding. **There is no `error.tsx`
anywhere in `src/app`**, so a throw during render has no boundary to stop at and
React unmounts the whole tree. A recoverable, correctly-reported 400 presented
as a dead page.

The immediate fix narrows the value instead of stringifying it — JSON in a toast
is not an error message, and the field name is already in the network tab for
anyone debugging:

```ts
const detail = err?.response?.data?.error;
toast.error(typeof detail === "string" ? detail : "Couldn't save — try again.");
```

The underlying cause is still open: **any render-time throw anywhere in this app
is still a white screen.** An `error.tsx` per route group is in
[Still open](#still-open) for that reason.

### Email deliverability

This is the part most likely to look broken on launch day. `MAIL_FROM` must be
an address the SMTP account is actually authorised to send as, on a domain with
SPF and DKIM published — otherwise verification mail lands in spam or is
rejected outright, and since signup succeeds regardless, the symptom is "nobody
can verify" with nothing in the logs. Send yourself a verification and a
reservation confirmation from the deployed app before announcing it, and check
the `.ics` attachment opens in a real calendar client.

### Verify after a deploy

Not a one-time list — these are the checks worth repeating, because each one
covers a failure that reports success everywhere else.

- [ ] **Load `/profile`, `/lists`, `/reservation` and a group detail page on the
      deployed URL**, not locally. Case-sensitivity and dynamic-route params only
      fail on the Linux build. See
      [What the first deploy broke](#what-the-first-deploy-broke).
- [ ] **Book a table and check the stored time.** The `.ics` attachment should
      open in a real calendar client at the hour the user chose — from a machine
      that is *not* in UTC, or the bug this catches cannot occur.
- [ ] **Read the first production log line.** `lib/env.ts` prints exactly which
      environment variables are missing and what each one breaks. It never
      throws, so nothing else tells you.
- [ ] Sign up with a real address end to end: mail arrives, `/verifyemail`
      accepts the token, `isVerified` flips, and a booking that previously 403'd
      now succeeds.
- [ ] Open the dashboard twice. The first load may be unranked — a recommender
      cold start, if that service is scaled to zero; the second should not be.
- [ ] Start a group vote. This is the one flow with no graceful degradation, so
      it is the real test that `RECOMMENDER_URL` is correct.
- [ ] Confirm the recommender's write endpoint still answers **401** without a
      token, and that `GET /health` on it returns a non-zero `count` — a deploy
      whose image shipped without an index starts cleanly and returns nothing.
- [ ] Fail a login 11 times from one address. The 11th should be a 429 carrying
      a `Retry-After` header. Note this proves the limiter *runs*, not that it is
      **shared** — the in-memory fallback produces the same result on a single
      instance. The proof that Upstash is actually wired up is the absence of the
      `[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN are not set` line in the boot log.
- [ ] Run `npm run test:api` against the deployment (`BASE_URL=...`), not just
      locally. It creates real accounts and real reservations, so point it at a
      database you are willing to have rows in — teardown deletes by run tag, but
      `--keep` exists for a reason.

Rebuilding the recommender's index is a **separate** cadence from deploying this
app: the index ships inside the Cloud Run image, so newly synced restaurants are
unranked until `rebuild_index.py` runs and that service redeploys. Monthly, or
after syncing a new city. See
[its README](https://github.com/suspicious-candy/Restaurant_Rec#the-index-ships-inside-the-image).

### Still open

Live does not mean finished. Carried over, in rough order of how much each one
would cost if it bit:

- [ ] **No CI.** `npm run test:api` covers every endpoint and a human has to
      remember to run it. The concurrency-sensitive paths — vote start, close,
      join, booking, reviewing — only fail under two simultaneous users, which is
      the case nobody reproduces by hand.
- [ ] **No `error.tsx` anywhere.** A render-time throw unmounts the entire tree;
      bug 3 above is what that looks like from the outside.
- [ ] **CSP is still `Report-Only`.** Walk every screen with the console open,
      collect the violation reports, fix them, *then* rename the header.
- [ ] **No `LICENSE`.** Until one exists, all rights are reserved and nobody can
      legally use or contribute to this.
- [ ] **No `robots.txt` and no per-route metadata.** The root layout now sets a
      real title and description; nothing sets Open Graph tags, so a shared
      invite link previews as bare text — on an app whose growth loop *is* people
      sending each other links.
- [ ] Group bookings still send no confirmation email and no calendar invite,
      though the mailer, template and `.ics` builder all exist.

---

## Security Posture

Worth stating plainly before going public, including the parts that are
deliberately incomplete.

**In place:**

- Passwords hashed with bcrypt; login compares in constant time.
- JWT in an httpOnly, `sameSite: lax` cookie, `secure` whenever
  `NODE_ENV === "production"`, expiring in a day to match the token.
- Identity re-derived from the token on **every** authenticated request. The
  proxy is a UX gate, not a boundary.
- Zod on every route; the profile-edit schema is an **allowlist**, so `Role`,
  `isVerified`, `numVisits` and `password` are unreachable from it.
- Ownership expressed in query **filters** rather than in `if` statements after
  the fact, and concurrency-sensitive transitions (vote start, close, join,
  booking, reviewing) done as compare-and-set or guarded by unique indexes.
- Rate limits on every unauthenticated endpoint and on outbound email, with
  tunings and their reasoning in `src/lib/rateLimit.ts`. No
  `X-RateLimit-Remaining` header — on an auth endpoint that is a live readout of
  how hard an attacker may push.
- Security headers on every response: HSTS (one year in production, **not**
  `preload` and **not** `includeSubDomains`, both of which are hard to undo),
  `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`,
  `Permissions-Policy`.
- A correlation id (`x-request-id`) on every authenticated response, tying a
  user's bug report to a stack trace.

**Deliberately not yet:**

- **CSP is `Content-Security-Policy-Report-Only`.** The browser evaluates it and
  logs violations but blocks nothing. Shipping an untested CSP straight to
  enforcement is how you white-screen production. Walk every screen, fix what it
  reports, *then* rename the header.
- **No nonce**, so `script-src` carries `'unsafe-inline'`. A nonce must be
  unique per request, which forces every page to render dynamically — static
  optimization, ISR and PPR all stop applying, and nine routes are currently
  static. That is a trade worth making deliberately, not as a side effect of
  turning CSP on.
- **`img-src` allows `https:`.** Profile pictures are arbitrary remote URLs in
  plain `<img>` tags. The tighter fix is to stop storing foreign URLs — upload
  to storage this app controls — which would also let `next/image` handle them
  without turning the image optimiser into an open proxy. See the long note in
  `next.config.ts`.
- **No password reset.** The token fields exist on the model; the flow does not.
- **No error boundaries.** There is no `error.tsx` anywhere under `src/app`, so
  a throw during render unmounts the whole tree rather than degrading to a
  message. Not a vulnerability, but it turns any small client-side mistake into
  a total outage for the user who hit it — which is exactly how a rendered
  validation object presented as a blank page. See
  [What the first deploy broke](#what-the-first-deploy-broke).
- **No CI, and no automated tests.** `npm run test:api` covers every endpoint,
  but a human has to run it. The concurrency-sensitive paths are exactly the
  kind of thing that only fails under two simultaneous users.

---

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server with hot reload |
| `npm run build` | Create an optimized production build |
| `npm run start` | Serve the production build (run `build` first) |
| `npm run lint` | Run ESLint |
| `npm run test:api` | End-to-end HTTP smoke test of every endpoint. `--only=auth,reviews`, `--keep`, `--no-ratelimit` |
| `npm run seed:foursquare` | Bulk-sync every US/India city above `MIN_POPULATION` from Foursquare. Paginated — `MAX_PAGES` (default 10) is the real coverage ceiling |
| `npm run seed:restaurants` | Load the Yelp-derived seed file |
| `npm run seed:testmeal` | Create a completed meal, for exercising the review prompt |
| `npm run inspect:reviews` | Report on review data |
| `npm run fix:reviews` | Backfill `palateRating` / `tips[]` enrichment for reviews written before it existed |

All scripts use `node --env-file=.env`, so they read the same `.env` the app does.

---

## Roadmap

- [x] Shared Mongoose connection, auth API, JWT cookie sessions
- [x] Taste onboarding + cookie-authenticated preferences API
- [x] Real DB reads with populated refs (profile, dashboard)
- [x] Reservation create/manage flow, dashboard, lists/wishlist
- [x] Foursquare Places sync job, paginated
- [x] Friends: requests, accept/decline, invite links and QR
- [x] Recommender wired into nearby (filter-then-rank against the vector index)
- [x] Group aggregation in the recommender (`POST /recommend/group`, least-misery)
- [x] Group creation, invite links, join-by-code with an approval queue
- [x] Roster lock, shortlist generation, approval voting, vote close
- [x] Group booking — one reservation across every participant
- [x] Multiple simultaneous groups, with a detail route per group
- [x] Post-meal reviews → `palateRating`, `tips[]`, and re-embedding
- [x] Learned taste from recent high-rated visits
- [x] Email verification, resend, and reservation confirmations with `.ics`
- [x] Profile editing and saved-address CRUD
- [x] Distributed rate limiting, security headers, startup environment check
- [x] Serverless-sized connection pooling and function timeouts
- [x] End-to-end API smoke test
- [x] Real page metadata, app icons, and a title `template` that survives a
      future per-route title
- [x] **Deployed** — Vercel + Cloud Run + Atlas + Upstash, and the three
      first-deploy bugs found and fixed
- [ ] **CI** — run `test:api` and `lint` on every push. The concurrency-sensitive
      paths only fail under two simultaneous users, which is the case nobody
      reproduces by hand
- [ ] **`error.tsx` boundaries**, so a render-time throw degrades to a message
      instead of unmounting the app
- [ ] **Enforce the CSP** once the console is clean on every screen
- [ ] **Confirmation mail for group bookings.** `POST /api/reservations` sends an
      email with an `.ics`; the group booking route writes the same reservation
      onto every participant and sends nothing. The mailer, template and
      calendar builder all already exist
- [ ] Notifications — nothing tells an admin a join request is waiting, or tells
      a joiner they were approved
- [ ] Restaurant detail page — `photos`, `hours` and `menuUrl` are stored and
      never rendered
- [ ] Password reset (the model fields exist; the flow does not)
- [ ] Per-person taste vectors feeding `/recommend/group` (the endpoint already
      accepts them; nothing builds them)
- [ ] Self-hosted avatars, so `img-src` can tighten from `https:` to `'self'`
- [ ] A `LICENSE`, a `robots.txt`, and Open Graph tags so a shared invite link
      previews as something other than bare text

---

## Contributing

1. Create a feature branch off `main`: `git checkout -b feat/your-feature`
2. Make your changes; run `npm run lint` before committing.
3. Run `npm run test:api` if you touched a route handler.
4. Keep commits focused and write clear messages.
5. Open a pull request describing the change and its rationale.

Please read `AGENTS.md` before writing code — this repo uses a Next.js build whose APIs may differ from what you expect. And restart the dev server after editing anything under `src/models/`.

---

## License

No license has been specified for this project yet. Until one is added, all rights are reserved by the authors. If you intend to open-source it, add an [MIT](https://choosealicense.com/licenses/mit/) `LICENSE` file — it is on the [Still open](#still-open) list for a reason: the app is public, and "public" and "reusable" are not the same permission.
