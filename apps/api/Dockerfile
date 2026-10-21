# Build context = raiz do monorepo (não apps/api!)
# Railway/Render: aponte dockerContext para a raiz e dockerfilePath para apps/api/Dockerfile

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

FROM deps AS build
# `prisma generate` valida o schema: usa uma URL fictícia (nenhuma conexão é aberta).
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @axium/shared && npm run build -w @axium/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat wget

RUN addgroup -S nestjs && adduser -S nestjs -G nestjs \
  && mkdir -p /var/data/uploads \
  && chown -R nestjs:nestjs /var/data/uploads

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# `prisma` está em dependencies da API: o CLI de migrate fica disponível em runtime.
RUN npm ci --omit=dev --workspace @axium/api --workspace @axium/shared \
  && npm cache clean --force

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
# Prisma Client gerado no stage de build (mesma plataforma Alpine): evita
# baixar os engines novamente em runtime (~300 MB).
COPY --from=build /app/node_modules/@prisma/client node_modules/@prisma/client
# Sem `chown -R /app`: a API só escreve em /var/data/uploads (já donada do
# usuário nestjs). Reworkar /app duplicaria toda a camada (~330 MB).

USER nestjs
ENV UPLOAD_DIR=/var/data/uploads
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${PORT:-3333}/api/health" || exit 1
# `exec` repassa SIGTERM ao Node (a API usa enableShutdownHooks).
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && exec node dist/main.js"]
