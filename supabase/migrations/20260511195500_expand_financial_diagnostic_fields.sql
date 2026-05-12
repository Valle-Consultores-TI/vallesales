alter table public.leads
  add column if not exists cnpj text,
  add column if not exists monthly_revenue_managerial text,
  add column if not exists monthly_revenue_fiscal text,
  add column if not exists monthly_invoice_count text,
  add column if not exists employee_count_clt text,
  add column if not exists employee_count_pj text,
  add column if not exists payroll_gross_value text,
  add column if not exists bank_account_count text,
  add column if not exists bank_accounts_split text,
  add column if not exists financial_system text,
  add column if not exists accounting_pain_points text;

comment on column public.leads.cnpj is
  'CNPJ informado pela empresa no cadastro do lead.';

comment on column public.leads.monthly_revenue_managerial is
  'Faturamento médio mensal gerencial informado pelo lead.';

comment on column public.leads.monthly_revenue_fiscal is
  'Faturamento médio mensal fiscal informado pelo lead.';

comment on column public.leads.monthly_invoice_count is
  'Quantidade média de notas fiscais emitidas por mês.';

comment on column public.leads.employee_count_clt is
  'Quantidade média de funcionários CLT.';

comment on column public.leads.employee_count_pj is
  'Quantidade média de prestadores PJ.';

comment on column public.leads.payroll_gross_value is
  'Valor bruto médio da folha de pagamentos.';

comment on column public.leads.bank_account_count is
  'Quantidade de contas bancárias informada pela empresa.';

comment on column public.leads.bank_accounts_split is
  'Indica se as contas bancárias são separadas por projeto ou centro de custo.';

comment on column public.leads.financial_system is
  'Sistema financeiro atualmente utilizado pela empresa.';

comment on column public.leads.accounting_pain_points is
  'Principais dores contábeis atuais e motivação para troca.';
