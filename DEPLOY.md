# Deploy da API AXIUM

Guia para publicar a API NestJS em um servidor sempre ativo e conectar o front
(Next.js) já hospedado na Vercel. O front se comunica por **Bearer token** em
`localStorage` (não cookies), então `credentials: 'include'` **não** é necessário.

```
Vercel (apps/web)  ──HTTPS──▶  Plataforma da API (Railway/Render/VPS)  ──▶  Postgres
     NEXT_PUBLIC_API_URL                PORT (0.0.0.0)                        Redis (opcional)
                                        CORS_ORIGIN                            S3/MinIO (opcional)
```

O repositório já inclui: `apps/api/Dockerfile` (multi-stage), `.dockerignore`,
`railway.json`, `render.yaml` e o CI em `.github/workflows/ci.yml`
(`npm run verify`: lint + testes + build + smoke).

---

## 1. Pré-requisitos

- Repositório no GitHub conectado à plataforma escolhida.
- **Postgres gerenciado** (Railway Postgres, Render Database, Neon, Supabase…).
- **Redis gerenciado** (opcional, mas recomendado — notificações em tempo real).
- **Bucket S3** ou MinIO (opcional — sem ele use `STORAGE_DRIVER=local` com volume).

> O Dockerfile espera o **contexto na raiz do monorepo** e o caminho
> `apps/api/Dockerfile`. Railway e Render já estão configurados para isso.

---

## 2. Variáveis de ambiente da API

A API **falha no boot em produção** se faltar cada item marcado como obrigatório
abaixo (validação em `apps/api/src/config/env.ts`).

### Obrigatórias em produção

| Variável             | Descrição                                                                 |
| -------------------- | ------------------------------------------------------------------------- |
| `NODE_ENV`           | `production`                                                              |
| `DATABASE_URL`       | String de conexão do Postgres (`postgresql://user:pass@host:5432/db`)     |
| `JWT_SECRET`         | Segredo forte. **Não pode** ser `dev-jwt-secret-change-me`.               |
| `JWT_REFRESH_SECRET` | Segredo forte **diferente** do `JWT_SECRET`.                              |
| `CORS_ORIGIN`        | Domínio(s) do front, separados por vírgula. Ex.: `https://app.vercel.app` |
| `REDIS_URL`          | `redis://…` — pub/sub das notificações em tempo real.                     |

O `PORT` é injetado automaticamente pela plataforma; a API escuta em `0.0.0.0`.

> Gere segredos com `openssl rand -hex 32` (um valor distinto para cada um).

### Condicionais

| Variável                                                       | Quando é obrigatória              |
| -------------------------------------------------------------- | --------------------------------- |
| `STORAGE_DRIVER=s3` + `S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY` | Uploads em nuvem (recomendado)    |

### Opcionais

| Variável                | Padrão             | Observação                                                          |
| ----------------------- | ------------------ | ------------------------------------------------------------------- |
| `WEB_URL`               | `http://localhost:3000` | Usada em links de convite/e-mail.                              |
| `JWT_ACCESS_TTL`        | `15m`              |                                                                     |
| `JWT_REFRESH_TTL_DAYS`  | `30`               |                                                                     |
| `UPLOAD_DIR`            | `./uploads`        | Com `local`, aponte para o volume (Render: `/var/data/uploads`).    |
| `UPLOAD_CHUNK_SIZE_MB`  | `5`                | Tamanho das partes do upload resumível.                             |
| `S3_FORCE_PATH_STYLE`   | `true`             | Mantenha `true` para MinIO; providers AWS usam `false`.             |
| `VALIDATION_STRICT`     | `false`            | `true` passa a **rejeitar** campos extras nos DTOs (400). O padrão descarta o campo (whitelist). |
| `CLAMAV_HOST` / `CLAMAV_PORT` | —            | Antivírus. **Vazio = API sobe apenas com heurística** (aviso no log).|
| `CLAMAV_STRICT`         | `false`            | `true` bloqueia upload se o clamd estiver configurado e cair.       |
| `FILE_SCAN_ENABLED`     | `true`             | `false` desliga o bloqueio heurístico de arquivos.                  |
| `RLS_ENABLED`           | `false`            | Row Level Security por tenant. Ver seção 6.                         |
| `SMTP_*` / `MAIL_FROM`  | modo console       | Sem `SMTP_HOST`, convites são apenas logados.                       |
| `ASAAS_*`               | modo simulado      | Sem `ASAAS_API_KEY`, o billing não cobra de verdade.                |
| `GOOGLE_*`              | modo simulado      | OAuth do Google Calendar.                                           |
| `API_PUBLIC_URL`        | `http://localhost:PORT` | URL pública da API (callback OAuth).                           |

> Nunca versione segredos. Use o painel de variáveis da plataforma (ou Secrets).
> O nome `S3_ACCESS_KEY` / `S3_SECRET_KEY` é intencional e deve ser mantido.
> `STORAGE_DRIVER` aceita apenas `local` ou `s3` (sem diferenciar maiúsculas);
> qualquer outro valor **aborta o boot em produção** em vez de cair
> silenciosamente em `local` (upload efêmero).

---

## 3. Deploy no Railway

1. **New Project → Deploy from GitHub repo** e selecione o repositório.
2. O `railway.json` na raiz já define builder Dockerfile, contexto e
   `healthcheckPath: /api/health`.
3. Adicione os serviços de **PostgreSQL** e **Redis** (New → Database) e copie
   as URLs para `DATABASE_URL` e `REDIS_URL`.
4. Em **Variables**, defina as variáveis obrigatórias da seção 2.
5. Em **Settings → Networking**, gere o domínio público (ex.:
   `https://axium-api.up.railway.app`).
6. Deploy. O container roda `prisma migrate deploy` antes de subir a API.

## 4. Deploy no Render

1. **New → Blueprint** apontando para o repositório (usa o `render.yaml`) **ou**
   **New → Web Service → Docker**, com Dockerfile `apps/api/Dockerfile` e
   contexto `.`.
2. Crie um **PostgreSQL** e um **Key Value (Redis)** no Render e use as
   Internal URLs em `DATABASE_URL` / `REDIS_URL`.
3. Preencha as variáveis obrigatórias. `JWT_SECRET` e `JWT_REFRESH_SECRET` podem
   ser gerados automaticamente (`generateValue: true` no blueprint).
4. O volume de uploads (`/var/data/uploads`) já é declarado no `render.yaml`;
   defina `UPLOAD_DIR=/var/data/uploads` se usar `STORAGE_DRIVER=local`.
5. Health check: `/api/health`.

## 5. Deploy em VPS (docker compose / docker run)

```bash
git clone <repo> && cd <repo>
docker build -f apps/api/Dockerfile -t axium-api .
```

A imagem (~775 MB) é multi-stage: instala só as dependências de produção, gera o
Prisma Client no stage de build, roda como usuário `nestjs` e já traz
`HEALTHCHECK` para `/api/health`. O start aplica as migrações e sobe a API
(`exec node` para repassar SIGTERM).

```bash
docker run -d --name axium-api -p 3333:3333 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://user:pass@host:5432/axium?schema=public" \
  -e JWT_SECRET="<segredo-forte>" \
  -e JWT_REFRESH_SECRET="<outro-segredo-forte>" \
  -e CORS_ORIGIN="https://seu-front.vercel.app" \
  -e REDIS_URL="redis://host:6379" \
  -e STORAGE_DRIVER=local \
  -v /var/axium/uploads:/var/data/uploads \
  -e UPLOAD_DIR=/var/data/uploads \
  axium-api
```

Coloque um proxy reverso (Nginx/Caddy) com HTTPS na frente. O health check fica
em `GET /api/health`.

---

## 6. Migrações e RLS

O container executa `prisma migrate deploy` automaticamente no start. Para rodar
manualmente (ou em pipeline):

```bash
npm run db:deploy -w @axium/api   # alias: npm run db:deploy
```

### Seed (dados de demonstração)

```bash
npm run db:seed -w @axium/api
```

> ⚠️ **O seed é destrutivo**: faz `TRUNCATE` de todas as tabelas antes de criar a
> empresa de demonstração. **Nunca rode contra o banco de produção.**
>
> Em produção o seed exige confirmação explícita e credenciais próprias:
>
> ```bash
> SEED_ALLOW_TRUNCATE=true \
> SEED_ADMIN_EMAIL=admin@empresa.com.br \
> SEED_ADMIN_PASSWORD='<senha-forte>' \
> npm run db:seed -w @axium/api
> ```
>
> Opcionais: `SEED_ADMIN_NAME`, `SEED_TENANT_NAME`, `SEED_TENANT_SLUG`.
> Sem `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` o seed aborta em produção.

### Row Level Security (opcional)

O RLS é **isolamento por `app.tenant_id` no Postgres** (defesa em profundidade
além do filtro por empresa na camada de serviço):

1. Aplique as migrações (criam a policy `tenant_isolation` nas 35 tabelas com
   `tenant_id` — `20261015194051_rls_policies` e `20261021150000_rls_policies_tenant_extra`).
2. Ative o enforcement no banco (aplica o papel sem privilégios de dono):

   ```bash
   npm run db:rls:enforce -w @axium/api   # executa prisma/rls-enforce.sql
   ```

3. Defina `RLS_ENABLED=true` nas variáveis da API e aponte a `DATABASE_URL` para
   o papel `axium_app` (criado sem senha pelo script — defina-a com
   `ALTER ROLE axium_app PASSWORD '<SENHA_FORTE>'`).

Sem os dois passos (enforce + `RLS_ENABLED=true`), o RLS fica inativo.
O script avisa (WARNING) e **pula** tabelas sem a policy `tenant_isolation`:
aplicar `FORCE` sem policy negaria todo acesso à tabela.

---

## 7. Front na Vercel

Variáveis do projeto (Production/Preview):

| Variável             | Valor                                                  |
| -------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`| URL pública da API **sem** barra final, ex.: `https://axium-api.up.railway.app` |

O `apps/web/src/lib/api.ts` usa `NEXT_PUBLIC_API_URL` e normaliza a barra final;
com o default local (`http://localhost:3333`) funciona em desenvolvimento.
`apps/web/next.config.js` já define `poweredByHeader: false` e os cabeçalhos de
segurança (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`).

> Lembre de incluir o domínio da Vercel em `CORS_ORIGIN` da API. Se usar
> Preview deploys com URL aleatória, adicione o domínio do projeto e/ou o padrão
> de wildcard suportado pela plataforma.

---

## 8. Testes locais antes do deploy

```bash
# Infra local (Postgres 5433, Redis 6379) + opcionais
npm run infra:up          # Postgres + Redis
npm run infra:up:s3       # + MinIO (perfil s3)
npm run infra:up:full     # + MinIO + ClamAV

npm run db:generate       # Prisma Client
npm run db:deploy         # migrações
npm run verify            # lint + testes (API e web) + build
npm run smoke             # sobe a API compilada e valida /api/health + CORS
```

`npm run verify` é o mesmo gate do CI (`.github/workflows/ci.yml`): lint
(typecheck), testes da API + do front, build e smoke test. O CI sobe um Postgres
de serviço e aplica as migrações antes dos testes.

> Para reproduzir produção localmente, copie `apps/api/.env.example`, preencha os
> segredos e rode com `NODE_ENV=production` (a API aborta se faltar obrigatória).

---

## 9. Checklist antes de publicar

- [ ] `JWT_SECRET` e `JWT_REFRESH_SECRET` fortes e distintos (não `change-me`).
- [ ] `CORS_ORIGIN` com o domínio exato do front.
- [ ] `DATABASE_URL` e `REDIS_URL` de produção apontando para serviços gerenciados.
- [ ] `STORAGE_DRIVER=s3` (ou volume persistente em `UPLOAD_DIR` se `local`).
- [ ] `GET https://<api>/api/health` retorna `{"status":"ok"}`.
- [ ] `NEXT_PUBLIC_API_URL` na Vercel sem barra final, apontando para a API.
- [ ] ClamAV configurado (`CLAMAV_HOST`) **ou** ciência de que só a heurística roda.
- [ ] `SEED_ALLOW_TRUNCATE` **não** definido (protege o banco de produção).
