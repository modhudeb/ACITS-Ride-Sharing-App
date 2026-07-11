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

RUN npm run build

# Stage 2: Caddy serves the static bundle, terminates HTTPS (automatic
# Let's Encrypt certificates for SITE_ADDRESS, renewed automatically), and
# proxies /api - including the WebSocket upgrade for /api/v1/ws - to the
# backend container.
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/build /srv
