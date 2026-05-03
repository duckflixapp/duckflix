# syntax=docker/dockerfile:1.7

FROM oven/bun:latest AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
RUN --mount=type=secret,id=node_auth_token \
    set -eu; \
    export NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token)"; \
    printf '@duckflixapp:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n' > .npmrc; \
    bun install --frozen-lockfile; \
    rm -f .npmrc

FROM oven/bun:latest
WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
CMD ["bun", "run", "start"]
