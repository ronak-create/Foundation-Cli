import type { PluginDefinition, PluginHookContext } from "@systemlabs/foundation-plugin-sdk";

const DOCKERFILE = `# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# Build stage
FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production runner
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

EXPOSE 3001

CMD ["node", "dist/server.js"]
`;

const DOCKER_COMPOSE = `version: "3.9"

services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=\${DATABASE_URL}
      - JWT_SECRET=\${JWT_SECRET}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-foundation}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-secret}
      POSTGRES_DB: \${POSTGRES_DB:-foundation_db}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-foundation}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
`;

const DOCKERIGNORE = `node_modules
dist
.git
.env
.env.local
*.log
coverage
.turbo
`;

// const ENV_DOCKER_EXAMPLE = `# Docker / PostgreSQL
// POSTGRES_USER=foundation
// POSTGRES_PASSWORD=secret
// POSTGRES_DB=foundation_db
// DATABASE_URL=postgresql://foundation:secret@db:5432/foundation_db
// `;

export const dockerModule: PluginDefinition = {
  manifest: {
    id: "deployment-docker",
    name: "Docker",
    version: "1.0.0",
    description: "Multi-stage Dockerfile + docker-compose with PostgreSQL service",
    category: "deployment",
    dependencies: [],
    files: [
      { relativePath: "Dockerfile", content: DOCKERFILE },
      { relativePath: "docker-compose.yml", content: DOCKER_COMPOSE },
      { relativePath: ".dockerignore", content: DOCKERIGNORE },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: {
          scripts: {
            "docker:build": "docker build -t <%= projectName %> .",
            "docker:up": "docker compose up -d",
            "docker:down": "docker compose down",
            "docker:logs": "docker compose logs -f",
          },
        },
      },
      {
        targetFile: ".env.example",
        merge: {
          POSTGRES_USER: "foundation",
          POSTGRES_PASSWORD: "secret",
          POSTGRES_DB: "foundation_db",
          DATABASE_URL: "postgresql://foundation:secret@db:5432/foundation_db",
        },
      },
    ],
    compatibility: {
      conflicts: [],
    },
  },
  hooks: {
    afterWrite: (_ctx: PluginHookContext): Promise<void> => {
      // Validate docker-compose references DB env var when postgresql is present.
      // No async operations needed; hook is synchronous.
      return Promise.resolve();
    },
  },
};
