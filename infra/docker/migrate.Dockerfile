# syntax=docker/dockerfile:1
# Railway migration runner.
#
# Builds the full dependency tree (including `prisma`, which is a devDependency
# and therefore absent from the api runtime image) and runs
# `prisma migrate deploy`, then exits. Used as a one-shot `migrate` service that
# runs before api / worker / game-host on each deploy.
FROM node:22-bookworm-slim
WORKDIR /repo
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci --no-audit --no-fund \
  && npm run db:generate
WORKDIR /repo/packages/database
CMD ["npx", "prisma", "migrate", "deploy"]
