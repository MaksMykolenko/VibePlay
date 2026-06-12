# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY . .
RUN npm ci --no-audit --no-fund \
  && npm run db:generate \
  && npm run build -w @vibeplay/shared -w @vibeplay/config -w @vibeplay/database -w @vibeplay/storage \
  && npm run build -w @vibeplay/worker

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/worker ./apps/worker
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts \
  && cd packages/database && npx prisma generate && cd ../..
USER node
EXPOSE 3002
CMD ["node", "apps/worker/dist/index.js"]
