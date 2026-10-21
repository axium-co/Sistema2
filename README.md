# AXIUM

Sistema web SaaS multiusuário de **estruturação comercial e agenda previsível** — CRM + Agenda + Rotina + Tarefas (Kanban) + Arquivos para equipes comerciais de até 20 usuários por empresa (tenant).

Interface em português (BR), tema escuro por padrão, com foco em operação diária do time de vendas.

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript + TailwindCSS + TanStack Query + Zustand |
| Drag & drop | @dnd-kit |
| Backend | NestJS (Node) + Prisma ORM |
| Banco | PostgreSQL 16 |
| Cache / filas | Redis 7 |
| Arquivos | Disco local (padrão) ou S3/MinIO compatível |
| Auth | JWT (access) + refresh token com rotação de sessão (bcryptjs) |
| Monorepo | npm workspaces |

---

## Estrutura

```
axium/
├─ apps/
│  ├─ api/                 # API NestJS
│  │  ├─ prisma/           # schema + migrações + seed
│  │  ├─ src/modules/      # auth, users, crm, agenda, routines, boards, files, dashboard, automations, lgpd, api-keys, billing, integrations, notifications, search, import
│  │  ├─ src/common/       # tenant context, guards, RBAC, paginação, auditoria
│  │  └─ test/             # testes (isolamento de tenant)
│  └─ web/                 # Frontend Next.js
│     └─ src/
│        ├─ app/           # rotas (auth) e (app)
│        ├─ components/    # ui, layout, crm, boards
│        └─ lib/           # api client, store, utils, labels
├─ packages/
│  └─ shared/              # tipos, enums, papéis/permissões e rótulos pt-BR
└─ docker-compose.yml      # postgres (5433), redis (6379), minio (profile s3)
```

---

## Pré-requisitos

- Node.js >= 20
- Docker Desktop (para PostgreSQL/Redis)
- npm 10+

---

## Como rodar (do zero)

```bash
# 1. Dependências
npm install

# 2. Variáveis de ambiente
copy apps\api\.env.example apps\api\.env        # Windows
copy apps\web\.env.example apps\web\.env.local  # Windows

# 3. Infraestrutura (PostgreSQL na porta 5433 + Redis 6379)
npm run infra:up

# 4. Build do pacote compartilhado
npm run build -w @axium/shared

# 5. Migrações + dados de demonstração
npm run db:migrate
npm run db:seed

# 6. Subir API e Web (terminais separados)
npm run dev:api     # http://localhost:3333/api
npm run dev:web     # http://localhost:3000
```

> A porta **5433** é usada no host para não conflitar com instalações locais do PostgreSQL.

---

## Deploy (produção)

API em servidor sempre ativo (Railway/Render/VPS) + front na Vercel: instruções
completas, variáveis de ambiente, Dockerfile e checklist em **[DEPLOY.md](./DEPLOY.md)**.

---

## Contas de demonstração

Tenant **Nexo Soluções Comerciais** (slug `nexo`) — senha de todas: `axium123`

| E-mail | Papel |
| --- | --- |
| `ana@nexo.com.br` | OWNER (proprietária) |
| `bruno@nexo.com.br` | MANAGER (gerente) |
| `carla@nexo.com.br` | USER (vendedora) |

Também é possível criar uma empresa nova em `/cadastro` (cria automaticamente funil de vendas, agenda e quadro de tarefas).

---

## Scripts (raiz)

| Comando | Descrição |
| --- | --- |
| `npm run dev:api` | API em watch (nodemon + ts-node) |
| `npm run dev:web` | Frontend Next.js |
| `npm run build` | Build de shared + api + web |
| `npm run lint` | Typecheck (tsc --noEmit) de api e web |
| `npm test` | Testes da API (Vitest) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Popula dados de demonstração |
| `npm run infra:up` / `infra:down` | Sobe/derruba containers |

---

## Segurança e multi-tenant

- **Escopo por tenant**: todo acesso a dados passa por uma extensão do Prisma (`PrismaService.db`) que injeta `tenantId` automaticamente em criações e no `where` de leituras/updates. Sem contexto de tenant, a operação é bloqueada com `ForbiddenException`.
- **Contexto de requisição**: `AsyncLocalStorage` (`TenantContext`) carrega `tenantId`, `userId` e `role` durante a requisição. Guardas globais (`JwtAuthGuard`, `PermissionsGuard`) validam o token e a permissão por módulo/ação (`@RequirePermission`).
- **RBAC**: papéis OWNER / ADMIN / MANAGER / USER / VIEWER com matriz de permissões compartilhada em `@axium/shared`.
- **Sessões**: refresh token com rotação (cada uso revoga a sessão anterior) e hash SHA-256 do token no banco.
- **Arquivos**: validação de MIME e tamanho (máx. 100 MB), sanitização de nome, e acesso ao conteúdo via token assinado.
- **Isolamento testado**: `apps/api/test/tenant-isolation.spec.ts` garante que o tenant A nunca lê/atualiza dados do tenant B.

---

## Roadmap

- **Fase 2 — MVP**: autenticação/multi-tenant/RBAC, CRM (contatos, empresas, funis, negócios), Agenda, Tarefas (Kanban), Arquivos, Dashboard e design system.
- **Fase 3 (concluída)**: Rotina/hábitos (com estatísticas e sequências), integração **Google Calendar** (OAuth + sincronização), automações de CRM, campos personalizados, importação CSV.
- **Fase 4 (concluída)**: Billing (**Asaas**), relatórios avançados, API pública (`/api/v1`) e adequação **LGPD**.

---

## Integrações e recursos avançados

- **Automações de CRM**: regras quando/então por gatilho (`DEAL_WON`, `DEAL_LOST`, `DEAL_CREATED`, `LEAD_CREATED`) e ações (criar atividade/tarefa, notificar, atualizar negócio). CRUD em Configurações › CRM.
- **LGPD**: consentimentos, solicitações do titular, exportação completa dos dados e anonimização/exclusão. Tudo auditado. Aba **Privacidade** em Configurações.
- **API pública**: chaves com escopo `read`/`write` (formato `axk_...`, hash SHA-256) e endpoints em `/api/v1` (deals, contacts, pipelines) autenticados por `x-api-key`, com limite por minuto (`API_RATE_LIMIT_PER_MIN`). Aba **API** em Configurações.
- **Billing (Asaas)**: assinaturas e faturas com webhook; sem `ASAAS_API_KEY` opera em **modo simulado**. Aba **Plano** em Configurações.
- **Google Calendar**: OAuth por usuário, importação (idempotente por `externalId`) e exportação de eventos. Sem credenciais opera em **modo simulado**.

---

## Pendências conhecidas / decisões técnicas

Itens funcionais deixados explicitamente para iterações seguintes:

- **Scan antivírus de arquivos**: ciclo com estado `SCANNING` e evento `file.scan` (SSE). Usa **ClamAV** via `clamd` (INSTREAM) quando `CLAMAV_HOST` está definido, com fallback para verificação heurística local; `CLAMAV_STRICT=true` bloqueia o arquivo se o clamd estiver indisponível.
- **Upload**: buffer em memória no driver local; com storage `s3` o frontend usa URL pré-assinada (`/api/files/presign`). **Upload chunked/resumível** disponível em `POST /api/files/uploads` (partes de `UPLOAD_CHUNK_SIZE_MB`).
- **MinIO**: as imagens `minio/minio` e `minio/mc` não estão disponíveis no registry deste ambiente; o serviço fica sob o profile `s3` no `docker-compose` e o storage padrão é `local`. O driver S3 (endpoint + path-style + URL pré-assinada) é validado por `test/storage-s3.spec.ts`.
- **2FA**: fluxo completo implementado (TOTP com QR Code, ativar/desativar em Configurações › Segurança e desafio no login).
- **Recorrência de eventos**: expansão das ocorrências na listagem (janela padrão de 1 ano quando não há `from`/`to`), regras ricas na UI (frequência, intervalo, dias da semana, `COUNT`/`UNTIL`), remoção/edição de **uma única ocorrência** (EXDATE + evento pontual de exceção) e detecção de conflitos considerando séries. Limitações restantes: `BYMONTHDAY`/exceções por data (`RDATE`) fora do escopo e conflitos verificados apenas na criação.
- **Convite de usuários**: convite por e-mail com token (validação/aceite em `/convite`). Sem SMTP configurado, o link é copiado automaticamente.
- **Importação CSV**: disponível para contatos (template, modo `dryRun` e relatório de erros).
- **Tempo real**: notificações por SSE (`/api/notifications/stream`), com fallback de invalidação no cliente.
- **RLS do PostgreSQL**: enforcement habilitável via `RLS_ENABLED=true` — cada requisição autenticada roda em transação com `app.tenant_id` definido (`set_config`). Requer apontar `DATABASE_URL` para o papel `axium_app` e rodar `prisma/rls-enforce.sql`. A camada de aplicação (Prisma extension) continua ativa.
- **Hash de senha**: `argon2` (`@node-rs/argon2`) com fallback para `bcryptjs` e rehash automático no login.
- **Metas, campos personalizados e produtos/itens de negócio**: CRUD completo — produtos e itens no negócio, metas e campos personalizados editáveis em Configurações › CRM (aba **CRM**) e nos registros de contato/negócio.
- **Relatórios avançados**: `GET /api/dashboard/reports?days=` (janela configurável) com tela dedicada em `relatorios`.
- **Rotina — estatísticas**: `GET /api/routines/stats?days=` com taxa de adesão, sequência atual/melhor sequência por rotina e série diária, exibido na aba **Desempenho** da Rotina.
- **Google Calendar sem credenciais**: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ausentes ⇒ modo simulado (auth-url e sync não fazem chamadas externas).
- **Billing sem credenciais**: `ASAAS_API_KEY` ausente ⇒ modo simulado (checkout ativa o plano e emite fatura fictícia, sem chamadas externas).

> **RLS opcional**: por padrão `RLS_ENABLED=false` e o isolamento por tenant é garantido na camada de aplicação. Ao habilitar o RLS, rotas públicas sem tenant (login/cadastro) dependem do mesmo papel de banco; valide o fluxo de autenticação no seu ambiente antes de ativar em produção.

---

## Testes

```bash
npm test          # apps/api → Vitest (13 arquivos, 62 testes) — requer PostgreSQL no ar
npm run test -w @axium/web   # apps/web → Vitest (13 testes de recorrência)
```

> Os testes da API exigem a infraestrutura do passo 3 (`npm run infra:up`); usam o banco `axium` e criam/limpam tenants isolados (`allowUnscoped`).
