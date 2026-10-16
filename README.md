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
│  │  ├─ src/modules/      # auth, users, crm, agenda, boards, files, dashboard, notifications, search
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

- **Fase 2 — MVP (atual)**: autenticação/multi-tenant/RBAC, CRM (contatos, empresas, funis, negócios), Agenda, Tarefas (Kanban), Arquivos, Dashboard e design system.
- **Fase 3**: Rotina/hábitos, integração **Google Calendar**, automações, campos personalizados, importação CSV.
- **Fase 4**: Billing (**Asaas**), relatórios avançados, API pública, adequação **LGPD**.

---

## Pendências conhecidas / decisões técnicas

Itens funcionais deixados explicitamente para iterações seguintes:

- **Scan antivírus de arquivos**: o status vai direto para `AVAILABLE` (sem etapa real de `SCANNING`).
- **Upload**: usa buffer em memória; ainda sem upload multipart/chunked nem URLs pré-assinadas para S3 (o driver local é o padrão).
- **MinIO**: as imagens `minio/minio` e `minio/mc` não estão disponíveis no registry local; o serviço está sob o profile `s3` no `docker-compose` e o storage padrão é `local`.
- **2FA**: campo `twoFactorEnabled` existe no modelo, mas o fluxo não foi implementado.
- **Recorrência de eventos**: `recurrenceRule` é armazenado, mas a expansão completa de RRULE ainda não é feita no backend.
- **Convite de usuários**: adição direta por senha inicial (sem envio de e-mail de convite).
- **Importação CSV**: ainda não disponível.
- **Tempo real**: notificações por polling (30s); sem SSE/WebSocket.
- **RLS do PostgreSQL**: o isolamento é garantido na camada de aplicação (Prisma extension); o enforcement por RLS a nível de transação ainda não está habilitado.
- **Hash de senha**: `bcryptjs` (considerar migração para `argon2`).
- **Regras futuras**: metas (`goals`), campos personalizados e produtos/itens de negócio já existem no schema, mas com UI/edição parcial.

---

## Testes

```bash
npm test
# apps/api → 5 testes de isolamento de tenant (Vitest)
```
