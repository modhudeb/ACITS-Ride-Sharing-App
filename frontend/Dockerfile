# Stage 1: build the web bundle. VITE_MAPBOX_TOKEN must come in as a build
# arg - frontend/.env is gitignored, so it doesn't exist in a fresh clone's
# build context on the server. VITE_API_BASE_URL is deliberately NOT set:
# the web build keeps the relative '/api' prefix and Caddy proxies it
# same-origin, so no CORS and no hardcoded backend URL in the web bundle.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_MAPBOX_TOKEN
ENV VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN}

# V8's default heap heuristic looks at the container's physical RAM (not
# swap) and caps itself far too low on a 1GB host like a t3.micro, aborting
# mid-build with "JavaScript heap out of memory". Raising it explicitly
# fixes that regardless of the host's actual memory size.
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build

# Stage 2: Caddy serves the static bundle, terminates HTTPS (automatic
# Let's Encrypt certificates for SITE_ADDRESS, renewed automatically), and
# proxies /api - including the WebSocket upgrade for /api/v1/ws - to the
# backend container.
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/build /srv
