alter table public.leads
  add column if not exists company_maturity text;

comment on column public.leads.company_maturity is
  'Indica se o lead ja possui empresa ativa ou se busca abertura de empresa.';

alter table public.leads
  drop constraint if exists leads_company_maturity_check;

alter table public.leads
  add constraint leads_company_maturity_check
  check (company_maturity in ('existing_company', 'opening_company') or company_maturity is null);

update public.leads
set company_maturity = 'existing_company'
where company_maturity is null
  and (
    cnpj is not null
    or tax_regime is not null
    or employee_count_clt is not null
    or employee_count_pj is not null
    or monthly_revenue_managerial is not null
  );
