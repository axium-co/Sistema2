import type {
  CardPriority,
  DealStatus,
  EventType,
  FinanceKind,
  FinanceStatus,
} from './labels';

export type Company = {
  id: string;
  name: string;
  cnpj: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  company_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  job_title: string | null;
  source: string | null;
  company_name: string | null;
  company_cnpj: string | null;
  company_website: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Pipeline = {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
};

export type PipelineStage = {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  position: number;
  probability: number;
};

export type Deal = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  company_id: string | null;
  contact_id: string | null;
  title: string;
  amount: number | string;
  expected_close_date: string | null;
  status: DealStatus;
  loss_reason: string | null;
  created_at: string;
  updated_at: string;
  company?: Pick<Company, 'id' | 'name'> | null;
  contact?: Pick<Contact, 'id' | 'full_name' | 'company_name'> | null;
};

export type Event = {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  color: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  created_at: string;
  updated_at: string;
};

export type Board = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type BoardList = {
  id: string;
  board_id: string;
  name: string;
  position: number | string;
  created_at: string;
};

export type Card = {
  id: string;
  board_id: string;
  list_id: string;
  title: string;
  description: string;
  priority: CardPriority;
  due_date: string | null;
  position: number | string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceCategory = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type FinanceEntry = {
  id: string;
  kind: FinanceKind;
  description: string;
  amount: number | string;
  category_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  due_date: string;
  status: FinanceStatus;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  category?: Pick<FinanceCategory, 'id' | 'name' | 'color'> | null;
  contact?: Pick<Contact, 'id' | 'full_name' | 'company_name'> | null;
  deal?: Pick<Deal, 'id' | 'title'> | null;
};

export type FileRecord = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number | string;
  storage_key: string;
  created_at: string;
};
