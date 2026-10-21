import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../common/password';

const prisma = new PrismaClient();

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Credenciais do usuário dono criado pelo seed.
 * - Em desenvolvimento usa os valores de demonstração.
 * - Em produção exige SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD (nunca um valor fixo).
 */
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'ana@nexo.com.br';
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'axium123';
const adminName = process.env.SEED_ADMIN_NAME ?? 'Ana Ribeiro';
const tenantName = process.env.SEED_TENANT_NAME ?? 'Nexo Soluções Comerciais';
const tenantSlug = process.env.SEED_TENANT_SLUG ?? 'nexo';

function daysFromNow(days: number, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  if (isProduction) {
    if (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD) {
      throw new Error(
        'Em produção o seed exige SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (o seed cria um usuário OWNER).',
      );
    }
    if (process.env.SEED_ALLOW_TRUNCATE !== 'true') {
      throw new Error(
        'O seed APAGA todos os dados do banco (TRUNCATE). Em produção defina SEED_ALLOW_TRUNCATE=true para confirmar.',
      );
    }
  }

  console.log('Limpando dados existentes...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      notifications, file_links, file_versions, files, folders,
      card_comments, checklist_items, checklists, card_labels, labels, card_assignees, cards, lists, board_members, boards,
      habit_logs, habits, routine_item_checks, routine_runs, routine_items, routines,
      event_attendees, events, calendars,
      custom_field_values, custom_fields, goals, taggables, tags, notes, activities, deal_stage_history, deal_items, deals, pipeline_stages, pipelines, leads, contacts, companies, products,
      automation_rules, consent_records, data_requests, api_keys, subscriptions, invoices, calendar_integrations,
      audit_logs, sessions, users, teams, tenants
    RESTART IDENTITY CASCADE;
  `);

  console.log('Criando empresa (tenant)...');
  const tenant = await prisma.tenant.create({
    data: { name: tenantName, slug: tenantSlug, planCode: 'pro' },
  });

  const passwordHash = await hashPassword(adminPassword);

  const ana = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: adminEmail,
      passwordHash,
      name: adminName,
      role: 'OWNER',
      phone: '(11) 98876-1200',
    },
  });

  const bruno = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'bruno@nexo.com.br',
      passwordHash,
      name: 'Bruno Carvalho',
      role: 'MANAGER',
      phone: '(11) 99120-4433',
    },
  });

  const carla = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'carla@nexo.com.br',
      passwordHash,
      name: 'Carla Mendes',
      role: 'USER',
      phone: '(21) 98811-7654',
    },
  });

  const equipeComercial = await prisma.team.create({
    data: { tenantId: tenant.id, name: 'Comercial', leadId: bruno.id },
  });
  await prisma.user.update({ where: { id: bruno.id }, data: { teamId: equipeComercial.id } });
  await prisma.user.update({ where: { id: carla.id }, data: { teamId: equipeComercial.id } });

  console.log('Criando funil de vendas...');
  const pipeline = await prisma.pipeline.create({
    data: { tenantId: tenant.id, name: 'Funil comercial', isDefault: true },
  });
  const stageDefs = [
    { name: 'Novo lead', color: '#71717A', probability: 10 },
    { name: 'Contato feito', color: '#7C9CBF', probability: 25 },
    { name: 'Proposta enviada', color: '#A89BC9', probability: 50 },
    { name: 'Negociação', color: '#BFA27C', probability: 75 },
    { name: 'Fechado', color: '#8FBF9F', probability: 100 },
  ];
  const stages = [];
  for (let i = 0; i < stageDefs.length; i++) {
    stages.push(
      await prisma.pipelineStage.create({
        data: { pipelineId: pipeline.id, position: i, ...stageDefs[i] },
      }),
    );
  }

  console.log('Criando produtos...');
  await prisma.product.createMany({
    data: [
      { tenantId: tenant.id, name: 'Consultoria de vendas (mensal)', price: 3200, sku: 'CONS-M' },
      { tenantId: tenant.id, name: 'Treinamento de equipe comercial', price: 4800, sku: 'TRE-01' },
      { tenantId: tenant.id, name: 'Implantação de CRM', price: 1500, sku: 'IMP-CRM' },
    ],
  });

  console.log('Criando clientes...');
  const companies = [];
  const companySeed = [
    { name: 'Construtora Vitória LTDA', cnpj: '12.345.678/0001-90', city: 'São Paulo', state: 'SP', ownerId: bruno.id },
    { name: 'Clínica Bem Viver', cnpj: '98.765.432/0001-10', city: 'Campinas', state: 'SP', ownerId: carla.id },
    { name: 'TechFlow Software', cnpj: '45.678.912/0001-33', city: 'Rio de Janeiro', state: 'RJ', ownerId: bruno.id },
    { name: 'Distribuidora Norte Sul', cnpj: '33.221.144/0001-55', city: 'Belo Horizonte', state: 'MG', ownerId: carla.id },
  ];
  for (const c of companySeed) {
    companies.push(await prisma.company.create({ data: { tenantId: tenant.id, ...c } }));
  }

  const contacts = [];
  const contactSeed = [
    { fullName: 'Ricardo Alves', email: 'ricardo.alves@construtoravitoria.com.br', phone: '(11) 3344-1200', whatsapp: '+5511991230001', jobTitle: 'Diretor de Compras', company: 0, ownerId: bruno.id, source: 'Indicação' },
    { fullName: 'Juliana Prado', email: 'juliana@clinicabemviver.com.br', phone: '(19) 3222-8899', whatsapp: '+5519988120002', jobTitle: 'Gestora', company: 1, ownerId: carla.id, source: 'Site' },
    { fullName: 'Marcos Tanaka', email: 'marcos.tanaka@techflow.io', phone: '(21) 2555-7788', whatsapp: '+5521997540003', jobTitle: 'CTO', company: 2, ownerId: bruno.id, source: 'LinkedIn' },
    { fullName: 'Fernanda Lima', email: 'fernanda@nortesul.com.br', phone: '(31) 3111-2233', whatsapp: '+5531988450004', jobTitle: 'Gerente Comercial', company: 3, ownerId: carla.id, source: 'Feira' },
    { fullName: 'Paulo Roberto Souza', email: 'paulo.souza@gmail.com', phone: '(11) 90000-1122', jobTitle: 'Autônomo', company: null, ownerId: carla.id, source: 'Instagram' },
  ];
  for (const c of contactSeed) {
    contacts.push(
      await prisma.contact.create({
        data: {
          tenantId: tenant.id,
          fullName: c.fullName,
          email: c.email,
          phone: c.phone,
          whatsapp: (c as any).whatsapp ?? null,
          jobTitle: c.jobTitle,
          companyId: c.company != null ? companies[c.company].id : null,
          ownerId: c.ownerId,
          source: c.source,
        },
      }),
    );
  }

  console.log('Criando leads...');
  await prisma.lead.createMany({
    data: [
      { tenantId: tenant.id, contactId: contacts[4].id, ownerId: carla.id, source: 'Instagram', status: 'NOVO' },
      { tenantId: tenant.id, contactId: contacts[3].id, ownerId: carla.id, source: 'Feira', status: 'CONTATADO' },
      { tenantId: tenant.id, contactId: contacts[1].id, ownerId: bruno.id, source: 'Site', status: 'QUALIFICADO' },
    ],
  });

  console.log('Criando negócios...');
  const dealSeed = [
    { title: 'Consultoria anual — Construtora Vitória', company: 0, contact: 0, ownerId: bruno.id, amount: 38400, stage: 2, close: 20 },
    { title: 'Treinamento comercial — Clínica Bem Viver', company: 1, contact: 1, ownerId: carla.id, amount: 4800, stage: 1, close: 12 },
    { title: 'Implantação de CRM — TechFlow', company: 2, contact: 2, ownerId: bruno.id, amount: 12900, stage: 3, close: 8 },
    { title: 'Projeto logístico — Distribuidora Norte Sul', company: 3, contact: 3, ownerId: carla.id, amount: 25000, stage: 0, close: 30 },
  ];
  const deals = [];
  for (const d of dealSeed) {
    const deal = await prisma.deal.create({
      data: {
        tenantId: tenant.id,
        pipelineId: pipeline.id,
        stageId: stages[d.stage].id,
        companyId: companies[d.company].id,
        primaryContactId: contacts[d.contact].id,
        ownerId: d.ownerId,
        title: d.title,
        amount: d.amount,
        expectedCloseDate: daysFromNow(d.close),
      },
    });
    await prisma.dealItem.create({
      data: { dealId: deal.id, description: d.title.split(' — ')[0], quantity: 1, unitPrice: d.amount },
    });
    deals.push(deal);
  }

  await prisma.deal.create({
    data: {
      tenantId: tenant.id,
      pipelineId: pipeline.id,
      stageId: stages[4].id,
      companyId: companies[0].id,
      primaryContactId: contacts[0].id,
      ownerId: bruno.id,
      title: 'Diagnóstico comercial — Construtora Vitória',
      amount: 6500,
      status: 'GANHO',
      finalAmount: 6200,
      wonAt: daysFromNow(-14),
    },
  });

  console.log('Criando atividades...');
  await prisma.activity.createMany({
    data: [
      { tenantId: tenant.id, type: 'CALL', subject: 'Ligação de follow-up', dealId: deals[0].id, createdById: bruno.id, status: 'DONE', occurredAt: daysFromNow(-2, 15) },
      { tenantId: tenant.id, type: 'MEETING', subject: 'Reunião de apresentação da proposta', dealId: deals[0].id, createdById: bruno.id, status: 'PENDING', occurredAt: daysFromNow(1, 10), dueAt: daysFromNow(1, 10) },
      { tenantId: tenant.id, type: 'EMAIL', subject: 'Envio de orçamento', dealId: deals[1].id, createdById: carla.id, status: 'DONE', occurredAt: daysFromNow(-1, 11) },
      { tenantId: tenant.id, type: 'CALL', subject: 'Retornar contato (atrasado)', dealId: deals[2].id, createdById: bruno.id, status: 'PENDING', occurredAt: daysFromNow(-3, 9), dueAt: daysFromNow(-3, 9) },
      { tenantId: tenant.id, type: 'VISIT', subject: 'Visita técnica ao cliente', dealId: deals[3].id, createdById: carla.id, status: 'PENDING', occurredAt: daysFromNow(3, 14), dueAt: daysFromNow(3, 14) },
    ],
  });

  console.log('Criando notas...');
  await prisma.note.createMany({
    data: [
      { tenantId: tenant.id, entityType: 'deal', entityId: deals[0].id, body: 'Cliente demonstrou interesse na consultoria anual. Pediu proposta com condições de pagamento em 3x.', authorId: bruno.id },
      { tenantId: tenant.id, entityType: 'deal', entityId: deals[2].id, body: 'CTO quer integração com o ERP interno. Verificar viabilidade técnica antes de fechar.', authorId: bruno.id },
    ],
  });

  console.log('Criando agenda...');
  const calendar = await prisma.calendar.create({
    data: { tenantId: tenant.id, userId: bruno.id, name: 'Agenda — Bruno', isDefault: true },
  });
  const calendarCarla = await prisma.calendar.create({
    data: { tenantId: tenant.id, userId: carla.id, name: 'Agenda — Carla', isDefault: true },
  });

  const events = [
    { title: 'Reunião de alinhamento comercial', type: 'MEETING', calendarId: calendar.id, createdById: bruno.id, start: daysFromNow(0, 9), end: daysFromNow(0, 10), dealId: deals[0].id, color: '#7C9CBF' },
    { title: 'Ligação de follow-up — TechFlow', type: 'CALL', calendarId: calendar.id, createdById: bruno.id, start: daysFromNow(0, 11), end: daysFromNow(0, 11, 30), dealId: deals[2].id, color: '#8FBF9F' },
    { title: 'Apresentação de proposta — Construtora Vitória', type: 'MEETING', calendarId: calendar.id, createdById: bruno.id, start: daysFromNow(1, 10), end: daysFromNow(1, 11, 30), dealId: deals[0].id, color: '#A89BC9' },
    { title: 'Visita — Distribuidora Norte Sul', type: 'VISIT', calendarId: calendarCarla.id, createdById: carla.id, start: daysFromNow(3, 14), end: daysFromNow(3, 16), dealId: deals[3].id, color: '#BFA27C' },
    { title: 'Bloqueio — foco em prospecção', type: 'BLOCK', calendarId: calendarCarla.id, createdById: carla.id, start: daysFromNow(2, 8), end: daysFromNow(2, 12), color: '#71717A' },
  ];
  for (const e of events) {
    await prisma.event.create({
      data: {
        tenantId: tenant.id,
        calendarId: e.calendarId,
        createdById: e.createdById,
        title: e.title,
        type: e.type as any,
        color: e.color,
        startsAt: e.start,
        endsAt: e.end,
        reminderMinutes: 15,
        dealId: (e as any).dealId ?? null,
        attendees: {
          create: e.calendarId === calendar.id ? [{ userId: carla.id }] : [{ userId: bruno.id }],
        },
      },
    });
  }

  console.log('Criando quadro de tarefas...');
  const board = await prisma.board.create({
    data: {
      tenantId: tenant.id,
      createdById: bruno.id,
      name: 'Rotina comercial',
      visibility: 'TENANT',
      lists: {
        create: [
          { name: 'A fazer', position: 1000 },
          { name: 'Em andamento', position: 2000 },
          { name: 'Concluído', position: 3000 },
        ],
      },
    },
  });

  const boardFull = await prisma.board.findUnique({
    where: { id: board.id },
    include: { lists: { orderBy: { position: 'asc' } } },
  });
  const [todo, doing, done] = boardFull!.lists;

  const labels = await Promise.all([
    prisma.label.create({ data: { tenantId: tenant.id, boardId: board.id, name: 'Urgente', color: '#C98B8B' } }),
    prisma.label.create({ data: { tenantId: tenant.id, boardId: board.id, name: 'Proposta', color: '#8FAA9C' } }),
    prisma.label.create({ data: { tenantId: tenant.id, boardId: board.id, name: 'Follow-up', color: '#A89BC9' } }),
  ]);

  const cardSeeds = [
    { list: todo, title: 'Ligar para novos leads de Instagram', priority: 'HIGH', due: 0, assignee: carla.id, labels: [0], dealId: null },
    { list: todo, title: 'Preparar proposta — Construtora Vitória', priority: 'URGENT', due: 1, assignee: bruno.id, labels: [1], dealId: deals[0].id },
    { list: doing, title: 'Follow-up proposta — TechFlow', priority: 'MEDIUM', due: -1, assignee: bruno.id, labels: [2], dealId: deals[2].id },
    { list: doing, title: 'Enviar contrato — Clínica Bem Viver', priority: 'HIGH', due: 2, assignee: carla.id, labels: [], dealId: deals[1].id },
    { list: done, title: 'Qualificar leads do site', priority: 'LOW', due: -5, assignee: carla.id, labels: [], dealId: null, completed: true },
  ];

  for (const c of cardSeeds) {
    const card = await prisma.card.create({
      data: {
        tenantId: tenant.id,
        boardId: board.id,
        listId: c.list.id,
        createdById: bruno.id,
        title: c.title,
        description: 'Tarefa de exemplo gerada pelo seed do AXIUM.',
        priority: c.priority as any,
        dueDate: daysFromNow(c.due, 17, 0),
        position: 1000,
        completedAt: (c as any).completed ? daysFromNow(-5) : null,
        assignees: { create: [{ userId: c.assignee }] },
        dealId: (c as any).dealId ?? null,
        labels: { create: c.labels.map((i) => ({ labelId: labels[i].id })) },
        checklists: {
          create: [
            {
              title: 'Passos',
              items: {
                create: [
                  { title: 'Preparar material', checked: true, position: 1000 },
                  { title: 'Executar contato', checked: false, position: 2000 },
                ],
              },
            },
          ],
        },
      },
    });
    await prisma.cardComment.create({
      data: { cardId: card.id, authorId: bruno.id, body: 'Priorizar esta tarefa nesta semana.' },
    });
  }

  console.log('Criando meta do mês...');
  const startMonth = new Date();
  startMonth.setDate(1);
  const endMonth = new Date(startMonth.getFullYear(), startMonth.getMonth() + 1, 0);
  await prisma.goal.create({
    data: {
      tenantId: tenant.id,
      ownerId: bruno.id,
      metric: 'revenue',
      target: 60000,
      periodStart: startMonth,
      periodEnd: endMonth,
    },
  });

  console.log('Criando rotina e hábitos...');
  const routine = await prisma.routine.create({
    data: {
      tenantId: tenant.id,
      ownerId: bruno.id,
      name: 'Abertura do dia',
      frequency: 'DAILY',
      defaultTime: '08:00',
      isTemplate: true,
      sharedById: bruno.id,
      items: {
        create: [
          { title: 'Revisar compromissos do dia', position: 1000 },
          { title: 'Checar follow-ups atrasados', position: 2000 },
          { title: 'Definir as 3 prioridades', position: 3000 },
        ],
      },
    },
  });
  await prisma.habit.create({
    data: { tenantId: tenant.id, userId: carla.id, name: 'Prospectar 20 contatos', targetPerWeek: 5, color: '#8FBF9F' },
  });

  console.log('Criando notificações...');
  await prisma.notification.createMany({
    data: [
      { tenantId: tenant.id, userId: bruno.id, type: 'DUE', title: 'Follow-up atrasado', body: 'Retornar contato — TechFlow', url: `/crm/negocios/${deals[2].id}` },
      { tenantId: tenant.id, userId: bruno.id, type: 'ASSIGNMENT', title: 'Você foi atribuído a uma tarefa', body: 'Preparar proposta — Construtora Vitória', url: '/tarefas' },
      { tenantId: tenant.id, userId: carla.id, type: 'REMINDER', title: 'Reunião amanhã às 10h', body: 'Apresentação de proposta', url: '/agenda' },
    ],
  });

  console.log('\nSeed concluído com sucesso.');
  console.log('Login de demonstração:');
  console.log(`  Proprietária: ${adminEmail} / ${isProduction ? '(senha definida em SEED_ADMIN_PASSWORD)' : 'axium123'}`);
  console.log('  Gerente:      bruno@nexo.com.br / axium123');
  console.log('  Vendedora:    carla@nexo.com.br / axium123');
  console.log(`  Rotina criada: ${routine.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
