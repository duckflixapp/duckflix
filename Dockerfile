FROM oven/bun:latest AS deps
WORKDIR /app

ARG NODE_AUTH_TOKEN

COPY package.json bun.lock* .npmrc ./
RUN NODE_AUTH_TOKEN=$NODE_AUTH_TOKEN bun install --frozen-lockfile

FROM oven/bun:latest
WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
CMD ["bun", "run", "start"]