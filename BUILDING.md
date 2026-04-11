# Duckflix Backend — Deployment & Development Guide

## 1. Prerequisites

### Local Development

- **Bun**: [https://bun.sh/](https://bun.sh/)
- **PostgreSQL**: [https://www.postgresql.org/](https://www.postgresql.org/)
- **rqbit**: [https://github.com/ikatson/rqbit](https://github.com/ikatson/rqbit)
- **FFmpeg**: [https://ffmpeg.org/](https://ffmpeg.org/)

### Containerized

- **Docker & Docker Compose**: [https://www.docker.com/](https://www.docker.com/)

## 2. Security Configuration (JWT Keys)

The backend uses **ECDSA (ES384)** for JWT signing. Generate keys before starting:

```bash
mkdir -p certs

openssl ecparam -name secp384r1 -genkey -noout -out certs/private.pem

openssl ec -in certs/private.pem -pubout -out certs/public.pem
```

Expected files:

- `certs/private.pem`
- `certs/public.pem`

## 3. Environment Variables

Copy `.example.env` to `.env` and fill in the values:

```bash
cp .example.env .env
```

For Docker, use `.docker.env` instead.

## 4. Running via Docker

```bash
docker compose up --build -d
```

```bash
docker compose down
```

The backend waits for Postgres health check before starting. The `certs/` folder is mounted as read-only volume.

## 5. Local Development

### Install Dependencies

```bash
bun install
```

### Database Migration

```bash
bun db:migrate
```

> **Note:** Runs in docker automatically via `start` script.

### Start

```bash
bun dev
```

### Database UI (Optional)

```bash
bun db:studio
```

Open [local.drizzle.studio](https://local.drizzle.studio).

## 6. Endpoints

- API: http://localhost:3000
- API Documentation: http://localhost:3000/swagger
- rqbit API: http://localhost:3030
- Database: port 5432
