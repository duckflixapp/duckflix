FROM oven/bun:latest
WORKDIR /app

# install ffmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 make g++ \ 
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

WORKDIR /app/packages/backend

RUN bun install

# RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "start"]