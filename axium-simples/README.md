# AXIUM Interno

Sistema web interno (uma empresa, poucos usuários) construído com **Next.js (App Router) +
TypeScript + Tailwind + shadcn/ui** e **Supabase** (PostgreSQL + Auth + Storage).
Sem API separada, sem NestJS, sem Prisma, sem Redis, sem Docker.

> Projeto **independente** do monorepo antigo (`apps/web`, `apps/api`, `packages/shared`).
> O que não é usado aqui continua intacto no repositório.

---

## 1. Rodar localmente

```bash
cd axium-simples
npm install
cp .env.example .env.local   # preencha com os dados do seu projeto Supabase
npm run dev                  # http://localhost:3000
```

Comandos disponíveis:

| Comando           | O que faz                                        |
| ----------------- | ------------------------------------------------ |
| `npm run dev`     | Servidor de desenvolvimento (porta 3000)         |
| `npm run build`   | Build de produção                                |
| `npm start`       | Sobe o build de produção                         |
| `npm run lint`    | Typecheck (`tsc --noEmit`)                       |
| `npm test`        | Testes (Vitest)                                  |

Sem o `.env.local` preenchido o app **não quebra**: ele mostra uma tela explicando
o que falta (e é assim que a Etapa 1 foi validada sem credenciais).

---

## 2. Passo a passo do Supabase

### 2.1 Criar o projeto

1. Acesse <https://supabase.com> → **New project**.
2. **Organization / Name**: `axium-interno` (o nome define o subdomínio:
   `https://<ref>.supabase.co`).
3. **Database Password**: defina uma senha forte (ela é sua do Postgres — guarde no
   gerenciador de senhas).
4. **Region**: escolha a mais próxima (ex.: `South America (São Paulo)`).
5. Aguarde a criação (~2 min).

### 2.2 Pegar as variáveis de ambiente

Menu lateral → **Project Settings** → **API** (ou **Data API** em projetos novos):

| Valor do painel        | Variável                       |
| ---------------------- | ------------------------------ |
| Project URL            | `NEXT_PUBLIC_SUPABASE_URL`     |
| `anon` `public` key    | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

Copie para `axium-simples/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> A `anon` key é pública por design: a segurança real está nas policies de RLS
> (Etapa 2). A `service_role` **nunca** deve ir para o front — este projeto
> não usa nenhuma chave secreta.

### 2.3 Desativar o cadastro público

**Authentication** → **Providers** → **Email**:

- **Enable Signup**: **desligado** — só entra quem foi criado por você.
- **Confirm email**: ligado (recomendado).

### 2.4 Criar o primeiro usuário (você, admin)

**Authentication** → **Users** → **Add user** → **Create new user**:

- marque **Auto Confirm User** (para não precisar confirmar e-mail agora);
- e-mail e senha que você usará no primeiro login.

Repita para os demais membros (Etapa 2 define o papel `admin` / `membro`).

### 2.5 Storage (Etapa 6)

**Storage** → **New bucket** → nome `arquivos` → **Private** (obrigatório: o
download usa URL assinada temporária).

---

## 3. Estrutura

```
axium-simples/
├── src/
│   ├── app/
│   │   ├── (auth)/login/      # login (servidor) + formulário (cliente)
│   │   ├── (app)/             # área logada (guard + shell com sidebar)
│   │   │   ├── dashboard/     # "Meu dia" (Etapa 7)
│   │   │   ├── crm/           # Etapa 3
│   │   │   ├── agenda/        # Etapa 5
│   │   │   ├── rotina/        # Etapa 5
│   │   │   ├── tarefas/       # Etapa 4
│   │   │   ├── arquivos/      # Etapa 6
│   │   │   └── configuracoes/ # Etapa 2
│   │   ├── globals.css        # tokens do tema AXIUM (dark)
│   │   ├── layout.tsx         # layout raiz (fonte Inter)
│   │   └── providers.tsx      # toasts (sonner)
│   ├── components/
│   │   ├── layout/            # sidebar, topbar, page-header, logo
│   │   └── ui/                # design system (button, card, input, modal…)
│   ├── lib/
│   │   ├── supabase/          # client, server, middleware, env
│   │   ├── labels.ts          # constantes (tipos de evento, prioridades…)
│   │   └── utils.ts           # cn(), brl(), datas
│   └── middleware.ts          # revalida a sessão e protege as rotas
├── components.json            # shadcn/ui pronto para `npx shadcn add <componente>`
├── tailwind.config.ts         # tokens AXIUM + nomes shadcn
└── .env.example
```

### Tema

Dark por padrão, com os tokens do AXIUM: fundo `#0A0A0A`, superfícies `#111`/`#1A1A1A`,
borda `rgba(255,255,255,0.08)`, texto `#FFFFFF`, secundário `#A1A1AA`, cantos de
12/16/24 px, brilho radial no topo dos cards e fonte Inter.

Os nomes do shadcn (`bg-background`, `text-muted-foreground`, `border-border`…) e os
nomes AXIUM (`bg-surface`, `text-fg`, `text-faint`…) apontam para as mesmas variáveis
CSS — dá para misturar os dois sem conflito.

---

## 4. Plano de trabalho

| Etapa | Conteúdo                                        | Estado |
| ----- | ----------------------------------------------- | ------ |
| 1     | Base: tema, layout, login Supabase, rotas       | ✅     |
| 2     | Banco: migrações SQL, RLS, perfis, dados exemplo | ⏳     |
| 3     | CRM: contatos, empresas, funil Kanban, timeline | ⏳     |
| 4     | Tarefas: quadros estilo Trello                  | ⏳     |
| 5     | Calendário e Rotina                             | ⏳     |
| 6     | Arquivos e busca global                          | ⏳     |
| 7     | Dashboard "Meu dia" e acabamento                | ⏳     |
| 8     | Deploy na Vercel + checklist                    | ⏳     |

As migrações SQL da Etapa 2 serão em `supabase/migrations/`, para colar no
**SQL Editor** do Supabase.
