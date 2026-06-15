# syntax=docker/dockerfile:1
# Railway-specific web image.
# Identical build to web.Dockerfile but uses railway.Caddyfile, which
# reverse-proxies /api/* to the internal `api` service so the SPA can use
# VITE_API_URL=/api without cross-origin requests.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
ARG VITE_API_URL=/api
ARG VITE_GAME_ORIGIN=https://games.example.com
ARG VITE_APP_MODE=real
ENV VITE_API_URL=$VITE_API_URL \
    VITE_GAME_ORIGIN=$VITE_GAME_ORIGIN \
    VITE_APP_MODE=$VITE_APP_MODE
COPY . .
RUN npm ci --no-audit --no-fund \
  && npm run build -w @vibeplay/shared -w @vibeplay/sdk \
  && npm run build -w @vibeplay/web

FROM caddy:2-alpine AS runtime
COPY infra/caddy/railway.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
EXPOSE 80
