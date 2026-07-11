<div align="center">

# ACITS — Ride Sharing & Pooled Cargo Platform

**A full-stack, production-deployed ride-sharing platform for Bangladesh with live GPS tracking, pooled truck cargo matching, surge pricing, an AI ride assistant, a full admin control panel, and a native Android app.**

![Banner](docs/screenshots/banner.png)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-acits.duckdns.org-2ea44f?style=for-the-badge)](https://acits.duckdns.org)
[![Android APK](https://img.shields.io/badge/Android-Capacitor%20APK-3DDC84?style=for-the-badge&logo=android&logoColor=white)](#-android-app-capacitor)

![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![AWS](https://img.shields.io/badge/AWS_EC2-FF9900?style=flat-square&logo=amazonwebservices&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-119EFF?style=flat-square&logo=capacitor&logoColor=white)
![Caddy](https://img.shields.io/badge/Caddy_HTTPS-1F88C0?style=flat-square)
![WebSocket](https://img.shields.io/badge/WebSockets-realtime-purple?style=flat-square)

</div>

---

## 📌 Table of Contents

- [Key Functionality](#-key-functionality)
- [How Key Components Work](#-how-key-components-work)
- [Live Demo](#-live-demo)
- [Screenshots](#-screenshots)
- [Tech Stack](#-tech-stack)
- [System Architecture](#-system-architecture)
- [Development Phases](#-development-phases)
- [AWS Deployment (with HTTPS)](#-aws-deployment-with-https)
- [Android App (Capacitor)](#-android-app-capacitor)
- [API Overview](#-api-overview)
- [Running Locally](#-running-locally)
- [Testing](#-testing)
- [Project Structure](#-project-structure)
- [What This Project Demonstrates](#-what-this-project-demonstrates)

---

## ⚡ Key Functionality

The platform serves **three roles** — Passenger, Driver, and Administrator — from one codebase, on both the web and a native Android app.

### 🧍 Passenger
- **Book a ride on a live map** — pick your location with GPS, search any destination in Bangladesh, or tap a point directly on the map.
- **Smart place search** — powered by OpenStreetMap (Photon) with an automatic Mapbox fallback, strictly limited to places inside Bangladesh.
- **Upfront fare estimate** — distance, duration, and full fare breakdown shown **before** you confirm, calculated on the server so it cannot be tampered with.
- **Pooled cargo (goods) rides** — travelling with goods? Enter the weight (kg) and volume (m³) and the system matches you with a pickup truck that has enough remaining capacity, sharing the vehicle with other cargo when possible.
- **Schedule rides for later** — book now, ride at a chosen future time.
- **Live driver tracking** — watch your driver approach in real time over WebSockets, with a traffic-aware ETA.
- **In-ride chat** — message your driver directly inside the app.
- **AI ride assistant** — a floating chat assistant that finds real places ("find the nearest pharmacy"), quotes a real fare ("how much to Gulshan?"), and can book the ride itself when you ask it to ("book a ride to Khwaja Yunus Ali University"). The assistant panel is draggable, minimizable, and expandable.
- **Ratings & history** — rate every ride and browse your full ride history.
- **Ride sharing link** — share a live ride status link with family so they can follow the trip.

### 🚗 Driver
- **Online/offline toggle** with continuous GPS location heartbeat.
- **Broadcast ride requests** — nearby requests appear instantly; the first driver to accept wins the ride (race-style matching, like real ride-hailing apps).
- **Route preview before accepting** — see the traffic-optimized route to the pickup point *before* committing to a ride.
- **Live turn-by-turn route line** to the pickup and then the destination, refreshed with live traffic data.
- **Demand heatmap** — see where ride requests are concentrated right now.
- **Earnings dashboard** — daily and total earnings, completed ride counts.
- **Vehicle profile** — car, bike, or pickup truck with cargo capacity for pooled goods rides.

### 🛠️ Administrator
- **Dashboard** with platform-wide statistics.
- **Live Ops map** — watch every active ride and online driver on one screen in real time.
- **Driver approval workflow** — review and approve or suspend drivers before they can take rides.
- **Passenger management** — activate or suspend accounts.
- **Ride management** — filter and inspect every ride on the platform.
- **Pricing control panel** — edit base fare, per-km / per-minute rates, peak-hour and night multipliers, and surge settings live, with no redeploy.

### ⚙️ Platform-Level
- **Multi-factor surge pricing engine** — the multiplier blends four independent, individually-capped signals per ~5km zone: live demand/supply pressure, demand momentum (last 15 min vs the 15 min before), deviation from the zone's own 4-week historical baseline, and live rainfall (Open-Meteo). Every component fails soft, and the admin-set cap always wins.
- **JWT authentication** with role-based access control, password reset over email, and rate limiting on sensitive endpoints.
- **Single WebSocket channel** carrying every realtime topic (ride status, driver location, chat, admin live ops) with per-topic authorization.
- **Fully containerized** — one `docker compose up -d` starts the entire production stack.

---

## 🔬 How Key Components Work

This section explains, in plain terms, how the platform actually does its core jobs — not just what it does. These are the parts that separate a real ride-hailing engine from a UI mockup.

### 🗺️ Route mapping & ETA

Every route (for a fare estimate, for a driver's live navigation line, for the "driver is 4 minutes away" ETA) goes through one function: `maps_service.compute_route(origin, destination)`. It calls **Mapbox's Directions API** with the `driving-traffic` profile — the one that factors in live road congestion, not just distance. Mapbox returns three things, and the app uses all three:

- `distance_meters` and `duration_seconds` — the numbers the fare formula runs on.
- `route_path` — the actual road-following line (not a straight line between two points), which is what draws the blue line on the passenger's map and the teal line on the driver's map.

The same function backs two different screens: `POST /routes/estimate` (used before booking, adds fare on top) and `POST /routes/eta` (used continuously during a live ride, no fare — just distance/time/path). This is deliberate — a passenger deciding whether to book needs a price, but a driver's live tracking line just needs to stay current, so the two are kept as separate lightweight calls instead of one bloated endpoint.

**Why the route is never computed on the client:** if the browser calculated distance itself (e.g. straight-line haversine), a rider could fake a shorter distance to pay less, or the number wouldn't match real roads at all. The server is the only thing that ever talks to Mapbox, so the distance a rider is charged for is the same distance Mapbox says the car will actually drive.

### 💰 Fare calculation

Fare is built in `fare_service.calculate_fare()` from simple, stacked pieces — the same shape real ride-hailing apps use:

```
metered = (base_fare + distance_km × per_km_rate + duration_min × per_min_rate)
          × peak_hour_multiplier
          × night_multiplier
          × surge_multiplier

metered = metered × (1 − pool_discount_pct)     # pooled-truck rides get a discount

goods_surcharge = weight_kg × per_kg_rate + volume_m3 × per_m3_rate   # never surged

fare = max(metered + goods_surcharge, minimum_fare) + booking_fee
```

A few choices worth calling out:

- **The booking fee is added last and is never multiplied by anything** — surge or peak pricing shouldn't inflate a flat platform fee, only the metered ride cost.
- **Goods handling charges are never surged** — surge reflects passenger demand for rides, not cargo weight, so it stays a flat rate regardless of how busy the zone is.
- **Peak-hour and night windows are evaluated in Asia/Dhaka time**, not server time — the server itself usually runs on UTC (that's how most cloud hosts are set up), so "is it currently peak hour" has to convert first or it would trigger multipliers at the wrong local time.
- **Every rate lives in the database, not in code.** An admin editing the pricing panel changes the actual numbers `calculate_fare()` reads — no redeploy needed. A short in-process cache (60 seconds) avoids hitting the database on every single fare estimate, since prices change rarely but get read constantly.

### 📈 Surge pricing

Surge is a **live multiplier**, not a fixed table — it reads real signals from the database and blends four of them, each one capped individually so no single input can send the price flying on its own:

```
surge = 1.0
      + 0.25 × excess pressure     (pending ride requests ÷ online drivers, right now, in this ~5km zone)
      + 0.10 × excess momentum     (rides requested in the last 15 min vs the 15 min before that)
      + 0.10 × excess vs baseline  (last 30 min vs this same zone's average at this exact time of day, over the past 4 weeks)
      + 0.15 × rain saturation     (live rainfall in the zone, from the free Open-Meteo API)
      → clamped to the admin-configured cap, rounded to the nearest 0.05
```

How each piece is measured:

| Signal | What it looks at | Why it matters |
|---|---|---|
| **Pressure** | Pending ride requests vs. online drivers with a GPS heartbeat less than 2 minutes old, inside the pickup's zone | The classic supply/demand ratio — this is the dominant signal, and it alone can push surge all the way to the cap |
| **Momentum** | Rides requested in the last 15 minutes vs. the 15 minutes before | Catches a demand spike a few minutes *before* it fully shows up as a wall of pending requests |
| **Baseline** | The last 30 minutes vs. this zone's own historical average at this same clock time, averaged over the past 4 weeks | Tells the difference between "busy for this zone right now" and "just a normally busy area" — a zone with almost no ride history yet skips this signal automatically instead of guessing |
| **Rain** | Live precipitation at the zone's coordinates | Rain reliably pushes demand up and driver willingness down — a real, well-known effect in ride-hailing, and Bangladesh gets heavy monsoon rain |

**"Zone" is a geohash cell** roughly 5km × 5km — every driver and every ride request gets encoded to a geohash, and a simple prefix range query finds everything in the same cell without needing a geospatial database extension.

Every one of the four signals **fails soft**: if the weather API is down, rain contributes zero instead of erroring; if a zone has too little ride history to trust, the baseline signal skips itself instead of guessing. The admin's configured cap always wins no matter what the four signals add up to, and surge can be switched off platform-wide from the pricing panel in one toggle.

### 🚚 Driver matching & pooled cargo

There's no central dispatcher deciding who gets which ride — the platform uses **broadcast matching**: when a ride is requested, it's written as a `ride_requests` row tagged with a geohash. Every online driver within range is independently listening for requests in their own zone, and whichever driver taps **Accept** first gets the ride — the same first-come model real ride-hailing apps use, because it stays instant and never needs a matching algorithm to run centrally.

For pooled truck rides, `capacity_service` keeps a live ledger of what a driver's vehicle already has committed (passengers on board, kg and m³ already loaded) before letting them accept one more. This is pure, dependency-free logic — no database calls inside it — specifically so it can be tested exhaustively: it's mathematically impossible for a truck to accept more weight or volume than its stated capacity, because every accept re-checks the real running total, not a cached guess.

### 🤖 AI ride assistant

The assistant is a **tool-calling agent**, not a script that pattern-matches sentences. Groq (running `llama-4-scout-17b-16e-instruct`) is given four real tools — `search_places`, `reverse_geocode_passenger`, `estimate_fare`, `start_booking` — and decides for itself which ones to call and in what order, based on what the passenger actually asked.

The model is never allowed to just *answer* with a place name or a coordinate from its own memory — every fact it states has to come from a tool result first. That one rule is what stops it from ever inventing an address that doesn't exist. A typical multi-step exchange:

```
"book a ride to the nearest university"
  → agent calls search_places("university")
  → gets back real OSM results, sorted by real distance
  → agent calls start_booking with the nearest one's real coordinates
  → app hands off straight to the booking screen — no extra tap needed
```

The loop is capped at 4 tool-call rounds so a confused generation can't spin forever, and if the AI provider itself rejects a malformed generation mid-conversation (a known rough edge of LLM tool-calling), the app falls back to whatever real results the tools already found that turn instead of showing an error.

---

## 🌐 Live Demo

| | |
|---|---|
| **Web App** | https://acits.duckdns.org |
| **Admin Panel** | https://acits.duckdns.org/admin |
| **API Health** | https://acits.duckdns.org/api/v1/health |
| **Android APK** | built with Capacitor — see [Android App](#-android-app-capacitor) |

> The demo runs on a real AWS EC2 instance with real HTTPS. It is not a mock or a localhost recording.

---

## 📸 Screenshots

> All images live in [`docs/screenshots/`](docs/screenshots/).

### Passenger — booking and live tracking

| Booking a ride | Live driver tracking |
|---|---|
| ![Booking](docs/screenshots/passenger-booking.png) | ![Live tracking](docs/screenshots/passenger-live-tracking.png) |

### AI assistant and the driver's route preview

| AI assistant finds real places | Driver route preview before accepting |
|---|---|
| ![Assistant search](docs/screenshots/assistant-search.png) | ![Driver route preview](docs/screenshots/driver-requests.png) |

### Admin panel

| Dashboard | Live Ops — every ride and driver, live |
|---|---|
| ![Admin dashboard](docs/screenshots/admin-dashboard.png) | ![Live ops](docs/screenshots/admin-live-ops.png) |

### Android app

<p align="center">
  <img src="docs/screenshots/android-booking.png" alt="Booking a ride on Android" width="320" />
</p>

---

## 🧰 Tech Stack

### Frontend
| Technology | Role |
|---|---|
| **React 19 + Vite 7** | SPA with fast builds and hot reload |
| **Tailwind CSS** | Utility-first, fully responsive styling |
| **react-map-gl + Mapbox GL JS** | Interactive live maps, markers, route lines |
| **Framer Motion** | Draggable/minimizable panels, smooth animations |
| **Zustand** | Lightweight global state |
| **SWR** | Data fetching with caching and revalidation |
| **Zod** | Client-side form validation matching backend rules |
| **Capacitor 8** | Wraps the same codebase into a native Android app |

### Backend
| Technology | Role |
|---|---|
| **FastAPI (async Python)** | REST API + WebSocket realtime layer |
| **PostgreSQL (Neon, cloud-hosted)** | Primary database |
| **SQLAlchemy 2 + Alembic** | ORM and versioned schema migrations |
| **Pydantic v2** | Strict request/response validation |
| **JWT (access tokens)** | Stateless authentication with role claims |
| **pytest** | Unit and lifecycle test suite |

### Maps & Geo Intelligence
| Technology | Role |
|---|---|
| **OpenStreetMap / Photon** | Primary place search — denser Bangladesh coverage than commercial datasets, free, no API key |
| **Overpass API** | Category searches ("nearest pharmacy") on OSM data |
| **Mapbox Directions (driving-traffic)** | Traffic-aware routing, ETAs, and fare distance |
| **Mapbox Search Box** | Automatic fallback when OSM is unavailable |
| **Geohash-based proximity** | Efficient nearby-driver lookups |

### AI
| Technology | Role |
|---|---|
| **Groq (Llama 4 Scout, tool-calling agent)** | Powers the ride assistant with real tools (place search, reverse geocoding, fare estimate, booking) that it calls itself; the model never answers from memory, only from tool results, so it can never invent an address |

### Infrastructure & DevOps
| Technology | Role |
|---|---|
| **Docker + Docker Compose** | Every service containerized; one file drives both local build and server run |
| **Docker Hub** | Image registry — build on a workstation, pull on the server |
| **AWS EC2 + Elastic IP** | Production host with a stable public IP |
| **Caddy 2** | Web server, reverse proxy, and **automatic HTTPS** (Let's Encrypt) |
| **DuckDNS** | Free domain pointing at the Elastic IP |
| **Neon** | Serverless PostgreSQL, separate from the app host |

---

## 🏗 System Architecture

```mermaid
flowchart TB
    subgraph clients["Clients"]
        WEB["🌐 React SPA<br/>(web browser)"]
        APK["📱 Android App<br/>(Capacitor — same codebase)"]
    end

    subgraph aws["☁️ AWS EC2 — Elastic IP + DuckDNS domain"]
        CADDY["Caddy (web container)<br/>serves the built React app<br/>automatic Let's Encrypt HTTPS"]
        API["FastAPI (backend container)<br/>REST API · WebSocket hub · JWT<br/>fare · surge · matching engines"]
        CADDY -->|"proxies /api/* + WebSockets<br/>internal Docker network"| API
    end

    WEB -->|"HTTPS / WSS (443)"| CADDY
    APK -->|"HTTPS / WSS (443)"| CADDY

    DB[("Neon PostgreSQL<br/>(cloud-hosted)")]
    GEO["🗺️ OSM Photon + Overpass<br/>place search"]
    MAPBOX["🚦 Mapbox<br/>traffic-aware routing"]
    LLM["🤖 Groq LLM<br/>tool-calling assistant agent"]

    API --> DB
    API --> GEO
    API --> MAPBOX
    API --> LLM
```

**Design decisions worth noting:**

- **Fares are computed only on the server.** The client never sends a price — it sends coordinates, and the backend calls the routing engine and applies the fare rules. A malicious client cannot lower its own fare.
- **Search and routing are deliberately split.** Place *search* uses OpenStreetMap (better local coverage in Bangladesh, free). Route *calculation* uses Mapbox's `driving-traffic` profile (live traffic data). Each provider does what it is best at, and each has an automatic fallback.
- **Broadcast/race matching instead of central dispatch.** Ride requests are broadcast to nearby online drivers and the first acceptance wins — the same model used by major ride-hailing apps, and it stays responsive with zero matching bottleneck.
- **One WebSocket, many topics.** A single authenticated socket carries ride status, driver locations, chat, and admin live-ops feeds. Every topic subscription is authorized per user, so a passenger can never listen to someone else's ride.
- **Pooled cargo capacity is a pure, tested service.** Truck capacity (kg / m³) is tracked in an isolated `capacity_service` with its own unit tests, so overbooking a truck is impossible.

---

## 🗂 Development Phases

The project was built in deliberate phases, each one shipped and verified before moving to the next.

### Phase 1 — Foundations
- FastAPI project skeleton, configuration management, health checks.
- React app structured with config-driven routing and role-based route guards (`PASSENGER`, `DRIVER`, `ADMIN`).
- Authentication: signup, signin, JWT issuance, password hashing, forgot/reset password over email.

### Phase 2 — Passenger Core Flow
- Live Mapbox map with GPS pickup detection and tap-to-set fallback.
- Destination search with autocomplete.
- Server-side route + fare estimation with a full fare breakdown shown before booking.

### Phase 3 — Matching & the Driver Side
- Driver online/offline status and GPS heartbeat with geohash indexing.
- Broadcast ride requests to nearby drivers; first-accept-wins race matching.
- Driver route preview before accept, live traffic-optimized route after accept.

### Phase 4 — Realtime Layer
- Single WebSocket endpoint with per-topic authorization.
- Live driver tracking for passengers, live ride status transitions, in-ride chat.
- Admin Live Ops: every active ride and driver on one realtime map.

### Phase 5 — Pooled Cargo & Pricing Engine
- Goods rides: weight/volume input, truck capacity ledger, pooled matching.
- Fare rules stored in the database and editable live from the admin panel.
- Multi-factor surge: live demand/supply pressure, demand momentum, 4-week zone baseline, and live rainfall — each capped and fail-soft; peak-hour and night multipliers computed in Asia/Dhaka time.

### Phase 6 — Admin Panel
- Dashboard statistics, driver approval workflow, passenger management, ride management with filters, pricing configuration UI.

### Phase 7 — Geo Upgrade & AI Assistant
- Switched place search to OpenStreetMap (Photon + Overpass) for far denser Bangladesh coverage, keeping Mapbox as automatic fallback and for traffic routing.
- Built the AI ride assistant: LLM parses intent only; real geocoders resolve real places; one tap hands the destination to the booking flow.
- Country-restricted every search path to Bangladesh.

### Phase 8 — Production Deployment (AWS)
- Containerized both services with multi-stage Docker builds.
- Deployed on AWS EC2 with Elastic IP, DuckDNS domain, and automatic HTTPS via Caddy.
- Set up the local-build → Docker Hub → server-pull release workflow.
- *(Full write-up in the [AWS Deployment](#-aws-deployment-with-https) section below.)*

### Phase 9 — Android App
- Wrapped the same frontend with Capacitor into a native Android APK.
- Build-time API base URL switching (relative `/api` on web, absolute HTTPS URL in the APK).
- Native GPS permission flow; entire build done from the command line — no Android Studio required.

### Phase 10 — Hardening & Polish
- Rate limiting, listener scoping, aggregate admin queries, self-cleaning background sweeps.
- Draggable / minimizable / expandable map panels sized for real phone screens.
- Profile cards for all three roles wired to live database stats.
- Test suite covering fares, capacity, geohash, auth, rate limits, realtime, and the full ride lifecycle.

### Phase 11 — Multi-Factor Surge & the AI Agent Rebuild
- Rebuilt surge pricing from a single demand/supply ratio into a 4-signal blend (pressure, momentum, historical baseline, live rainfall), each capped and fail-soft.
- Rebuilt the AI assistant from a one-shot intent parser into a real **tool-calling agent** — it can search, quote a fare, and book a ride itself across multiple turns, grounded entirely in real tool results.
- Fixed a class of place-search gaps found through real use: OSM queries were missing polygon-mapped places (university campuses, hospital grounds), dozens of everyday Bangladesh categories (mosque, market, coaching center, wedding hall) weren't recognized, and natural-language phrasing ("nearest university", "universities near me") wasn't normalized to the right category.

---

## ☁️ AWS Deployment (with HTTPS)

> This section documents, step by step, exactly how the platform went from `localhost` to a public HTTPS product on AWS. The result: **the app runs 24/7 on the internet even when my own computer is off.**

### 1. Provisioning the EC2 instance

- Launched an **Ubuntu EC2 instance** in `us-east-1`.
- Generated an SSH **key pair** and connected using key-based auth only — no passwords.
- Configured the **security group** with least-privilege inbound rules:

| Port | Purpose | Source |
|---|---|---|
| 22 (SSH) | Server administration | My ISP's CIDR range only |
| 80 (HTTP) | Let's Encrypt challenge + redirect to HTTPS | Anywhere |
| 443 (TCP + UDP) | HTTPS and HTTP/3 traffic | Anywhere |

> A real-world problem solved here: my ISP uses **CGNAT**, so my public IP changes frequently. Locking SSH to a single IP kept breaking access. The fix was scoping the SSH rule to the ISP's `/24` block — still far tighter than `0.0.0.0/0`, but stable across IP rotations.

### 2. A stable address: Elastic IP + DuckDNS

- Allocated an **AWS Elastic IP** and associated it with the instance, so the server's public IP never changes across restarts.
- Pointed a free **DuckDNS** domain (`acits.duckdns.org`) at that Elastic IP.

This gives a permanent, memorable URL without buying a domain — and a real domain is what makes real HTTPS certificates possible.

### 3. Automatic HTTPS with Caddy + Let's Encrypt

Instead of manually managing certificates with certbot and nginx, the frontend container runs **Caddy**:

```caddyfile
{$SITE_ADDRESS}          # acits.duckdns.org in production

handle /api/* {
    reverse_proxy backend:8000   # REST + WebSockets, Upgrade header passed through
}

handle {
    root * /srv
    try_files {path} /index.html # SPA fallback for client-side routes
    file_server
}
```

What Caddy does automatically with this tiny config:

- **Obtains a Let's Encrypt certificate** for the domain on first boot (HTTP-01 challenge over port 80).
- **Renews it forever** — zero cron jobs, zero manual steps.
- **Redirects all HTTP to HTTPS.**
- Serves **HTTP/3** over UDP 443.
- Proxies API and **WebSocket** traffic to the backend container over Docker's internal network — the backend is never exposed to the internet directly.

Certificates are stored on a **named Docker volume**, so container restarts never re-request certificates (Let's Encrypt has strict rate limits — this detail matters).

### 4. The Docker release pipeline: build locally, pull on the server

The EC2 instance is a small, cheap machine (~1 GB RAM). The frontend's Vite build **out-of-memoried** the server every time. Rather than paying for a bigger instance, I inverted the workflow:

```mermaid
flowchart LR
    PC["💻 My workstation<br/>(fast, plenty of RAM)"]
    HUB[("🐳 Docker Hub<br/>image registry")]
    EC2["☁️ AWS EC2<br/>(small, cheap)"]

    PC -->|"docker compose build<br/>docker compose push"| HUB
    HUB -->|"docker compose pull<br/>docker compose up -d"| EC2
```

One `docker-compose.yml` declares **both** `build:` and `image:` for each service, so the exact same file drives both sides:

**On the workstation (release):**
```bash
docker compose build     # multi-stage builds: Node build stage → Caddy runtime; Python slim
docker compose push      # push both images to Docker Hub
```

**On the server (deploy):**
```bash
git pull                 # only for compose/env changes
docker compose pull      # pull the new images
docker compose up -d     # recreate containers, ~seconds of downtime
```

Extra production details handled along the way:

- **Multi-stage Dockerfiles** keep the final images small — the web image contains only Caddy plus the built static files, none of `node_modules`.
- The backend container runs `alembic upgrade head` before starting, so **database migrations apply themselves** on every deploy.
- Added **swap** on the instance and tuned Node's heap (`NODE_OPTIONS=--max-old-space-size`) — and documented why V8's memory heuristic misreads containers on small hosts.
- `restart: unless-stopped` on every service, so the whole stack **survives server reboots** unattended.

### 5. Separating the database from the host

The database is **Neon serverless PostgreSQL**, not a container on the EC2 box. This means:

- The 1 GB instance spends its memory on the app, not on Postgres.
- Data survives even if the EC2 instance is terminated.
- Backups, connection pooling, and TLS to the database are managed by the database platform.

### 6. Production configuration hygiene

- All secrets live in `.env` files **on the server only** — never committed. `.env.example` files document every variable.
- Separate production `JWT_SECRET_KEY` and admin password, different from development.
- CORS locked to the production origin.
- The Android release-keystore patterns are git-ignored **before** any keystore exists — a leaked signing key can never be rotated, so this is guarded proactively.

### The result

```
https://acits.duckdns.org        → valid Let's Encrypt certificate, A-grade TLS, HTTP/3
https://acits.duckdns.org/api/…  → FastAPI over the same certificate
wss://acits.duckdns.org/api/v1/ws → secure WebSockets for realtime
```

A phone anywhere in the world can install the APK and book a ride — my computer can be off.

---

## 📱 Android App (Capacitor)

The same React codebase ships as a native Android app — no separate mobile codebase.

**How it works:**

- `npm run build:apk` builds the web bundle in "capacitor mode", where the API base URL switches from the relative `/api` (web) to the absolute production URL `https://acits.duckdns.org/api` (APK), then runs `npx cap sync android`.
- `./gradlew assembleDebug` produces the APK — the **entire build is command-line**; Android Studio is never opened.

```bash
cd frontend
npm run build:apk                # Vite build (capacitor mode) + cap sync
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

**Native integration:**

- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` permissions with the standard Android runtime permission prompt, handled through Capacitor's bridge and the `@capacitor/geolocation` plugin.
- All map panels are draggable, minimizable, and expandable — designed for real phone screens, from medium to large.
- The APK talks to the live HTTPS backend, so it works on any network.

---

## 🔌 API Overview

All endpoints live under `/api/v1`. A sample of the surface:

| Area | Endpoints |
|---|---|
| **Auth** | `POST /auth/signup` · `POST /auth/signin` · `POST /auth/forgot-password` · `POST /auth/reset-password` |
| **Rides** | `POST /rides` · `GET /rides/active` · `GET /rides/history` · `POST /rides/{id}/accept` · `/start` · `/complete` · `/cancel` · `/rate` · ride chat messages |
| **Routing** | `POST /routes/estimate` (fare + route) · `POST /routes/eta` (traffic-aware ETA + path) |
| **Drivers** | `POST /drivers/status` · `POST /drivers/location` · `GET /drivers/heatmap` · `GET /drivers/earnings` · `POST /drivers/vehicle` |
| **Assistant** | `POST /assistant/chat` (tool-calling AI agent — search, fare estimate, and booking, Bangladesh-restricted) |
| **Users** | `GET /users/me` (role-aware profile with live ride stats) |
| **Admin** | login · drivers approval · passengers · rides · live rides · `GET/PUT /admin/pricing` · dashboard stats |
| **Realtime** | `WS /ws` — one authenticated socket for ride status, locations, chat, live ops |

Interactive API docs (Swagger UI) are auto-generated by FastAPI at `/docs` when running locally.

---

## 💻 Running Locally

**Prerequisites:** Node 20+, Python 3.12+, and a PostgreSQL database (a free Neon project works).

```bash
# 1. Clone
git clone https://github.com/modhudeb/ACITS-Ride-Sharing-App.git
cd ACITS-Ride-Sharing-App

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET_KEY, MAPBOX_TOKEN, GROQ_API_KEY, ...
alembic upgrade head
python seed_demo_data.py    # demo passenger, driver, admin + fare rules

# 3. Frontend
cd ../frontend
npm install
cp .env.example .env        # set VITE_MAPBOX_TOKEN

# 4. Run both (from the repo root)
python run.py               # or run uvicorn and `npm run dev` separately
```

Or run the whole stack exactly like production:

```bash
docker compose build
docker compose up -d        # web on :80, API proxied at /api
```

---

## 🧪 Testing

```bash
cd backend
pytest
```

The suite covers the parts where a bug costs money or trust:

| Test file | What it protects |
|---|---|
| `test_fare_service.py` | Fare math, peak/night windows, surge multipliers |
| `test_surge_service.py` | Surge blend: component weights, caps, rain saturation, zone geometry |
| `test_capacity_service.py` | Pooled truck capacity — overbooking is impossible |
| `test_ride_lifecycle.py` | Every legal (and illegal) ride status transition |
| `test_auth.py` | Signup/signin, token handling, role enforcement |
| `test_rate_limit.py` | Abuse protection on sensitive endpoints |
| `test_realtime.py` | WebSocket topic authorization |
| `test_geohash.py` | Proximity encoding for driver matching |

---

## 📁 Project Structure

```
├── docker-compose.yml          # One file: local build+push AND server pull+run
├── backend/
│   ├── Dockerfile              # Python slim; runs migrations, then uvicorn
│   ├── app/
│   │   ├── api/v1/             # auth, rides, drivers, routes, admin, assistant, users, ws
│   │   ├── core/               # config, security (JWT), realtime hub, rate limiting
│   │   ├── db/                 # SQLAlchemy models + session
│   │   ├── models/             # Pydantic request/response schemas
│   │   └── services/           # fare, surge, capacity, maps, assistant, geohash, email
│   ├── migrations/             # Alembic versioned schema
│   └── tests/                  # pytest suite
└── frontend/
    ├── Dockerfile              # Multi-stage: Node build → Caddy runtime
    ├── Caddyfile               # Auto-HTTPS, SPA fallback, /api + WS proxy
    ├── android/                # Capacitor-generated native Android project
    └── src/
        ├── views/              # passenger / driver / admin / auth / rides
        ├── components/         # shared UI: map layers, chat, assistant, panels
        ├── services/           # axios API layer
        ├── auth/               # session + role handling
        └── utils/hooks/        # ride listeners, driver ETA, live locations
```

---

## 🎯 What This Project Demonstrates

- **Full-stack ownership** — database schema, async API, realtime layer, responsive UI, native mobile wrap, and cloud infrastructure, all built and connected by one person.
- **Real production deployment** — not a tutorial deploy: a live AWS server with automatic HTTPS, a registry-based release pipeline, self-applying migrations, and an app that stays up unattended.
- **Pragmatic engineering trade-offs** — OSM for search where commercial data is weak, Mapbox for traffic routing where it is strong; build images on the workstation because the server is small; broadcast matching because central dispatch adds no value at this scale.
- **Security thinking** — server-side fares, per-topic WebSocket authorization, least-privilege firewall rules, secret hygiene, rate limiting, and protecting the Android signing key before it even exists.
- **Domain depth** — surge pricing in the local timezone, pooled cargo capacity ledgers, and country-restricted geocoding are the kind of details real products need.

---

<div align="center">

**Built by [Modhu Deb](https://github.com/modhudeb)**

*ACITS — Advanced Cargo & Intelligent Transport System*

</div>
