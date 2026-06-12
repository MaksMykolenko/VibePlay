# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /repo
ARG VITE_API_URL=/api
ARG VITE_GAME_ORIGIN=http://games.localhost:8080
ARG VITE_APP_MODE=real
ENV VITE_API_URL=$VITE_API_URL \
    VITE_GAME_ORIGIN=$VITE_GAME_ORIGIN \
    VITE_APP_MODE=$VITE_APP_MODE
COPY . .
RUN npm ci --no-audit --no-fund \
  && npm run build -w @vibeplay/shared -w @vibeplay/sdk \
  && npm run build -w @vibeplay/web

FROM caddy:2-alpine AS runtime
COPY infra/caddy/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
EXPOSE 80
