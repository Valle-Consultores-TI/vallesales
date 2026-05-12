alter table public.leads
  add column if not exists employee_count text;

comment on column public.leads.employee_count is
  'Quantidade de funcionarios informada pela empresa ou lead.';
