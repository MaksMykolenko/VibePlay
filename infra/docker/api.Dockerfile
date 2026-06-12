# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci --no-audit --no-fund \
  && npm run db:generate \
  && npm run build -w @vibeplay/shared -w @vibeplay/config -w @vibeplay/database -w @vibeplay/storage \
  && npm run build -w @vibeplay/api

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api ./apps/api
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
