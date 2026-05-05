-- Expande o cadastro de leads com contatos adicionais e campos comerciais
-- sem criar uma base paralela de contatos.

alter table public.leads
  add column if not exists additional_contacts jsonb not null default '[]'::jsonb,
  add column if not exists segment_other text,
  add column if not exists tax_regime text,
  add column if not exists service_types text[] not null default '{}'::text[],
  add column if not exists service_details text;

comment on column public.leads.additional_contacts is
  'Contatos adicionais do lead, separados do contato principal.';

comment on column public.leads.segment_other is
  'Descricao complementar quando o segmento do lead for "Outro".';

comment on column public.leads.tax_regime is
  'Regime tributario informado no cadastro do lead.';

comment on column public.leads.service_types is
  'Servicos de interesse do lead.';

comment on column public.leads.service_details is
  'Descricao livre da necessidade do lead.';

alter table public.leads
  drop constraint if exists leads_additional_contacts_is_array;

alter table public.leads
  add constraint leads_additional_contacts_is_array
  check (jsonb_typeof(additional_contacts) = 'array');
