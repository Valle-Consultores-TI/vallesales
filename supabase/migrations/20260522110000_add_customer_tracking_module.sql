ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS tracking_flow_key text,
  ADD COLUMN IF NOT EXISTS access_funnel_id uuid REFERENCES public.funnels(id) ON DELETE SET NULL;

UPDATE public.funnels
SET module = 'sales',
    tracking_flow_key = NULL,
    access_funnel_id = NULL
WHERE module IS DISTINCT FROM 'sales'
   OR tracking_flow_key IS NOT NULL
   OR access_funnel_id IS NOT NULL;

ALTER TABLE public.funnels
  DROP CONSTRAINT IF EXISTS funnels_module_check;

ALTER TABLE public.funnels
  ADD CONSTRAINT funnels_module_check
  CHECK (module IN ('sales', 'customer_tracking'));

ALTER TABLE public.funnels
  DROP CONSTRAINT IF EXISTS funnels_tracking_flow_key_check;

ALTER TABLE public.funnels
  ADD CONSTRAINT funnels_tracking_flow_key_check
  CHECK (
    tracking_flow_key IS NULL
    OR tracking_flow_key IN ('opening_company', 'existing_company')
  );

ALTER TABLE public.funnels
  DROP CONSTRAINT IF EXISTS funnels_tracking_module_consistency_check;

ALTER TABLE public.funnels
  ADD CONSTRAINT funnels_tracking_module_consistency_check
  CHECK (
    (
      module = 'sales'
      AND tracking_flow_key IS NULL
      AND access_funnel_id IS NULL
    )
    OR (
      module = 'customer_tracking'
      AND tracking_flow_key IS NOT NULL
      AND access_funnel_id IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS funnels_module_idx
  ON public.funnels (module, name);

CREATE INDEX IF NOT EXISTS funnels_access_funnel_idx
  ON public.funnels (access_funnel_id, tracking_flow_key);

CREATE UNIQUE INDEX IF NOT EXISTS funnels_customer_tracking_unique_idx
  ON public.funnels (access_funnel_id, tracking_flow_key)
  WHERE module = 'customer_tracking';

COMMENT ON COLUMN public.funnels.module IS
  'Define se o funil pertence ao CRM comercial (sales) ou ao acompanhamento de clientes (customer_tracking).';

COMMENT ON COLUMN public.funnels.tracking_flow_key IS
  'Identificador do fluxo de acompanhamento quando o funil pertence ao modulo customer_tracking.';

COMMENT ON COLUMN public.funnels.access_funnel_id IS
  'Funil comercial cuja permissao deve ser herdada por este funil.';

CREATE OR REPLACE FUNCTION public.user_has_funnel_access(_user_id uuid, _funnel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.funnels f ON f.id = _funnel_id
    WHERE p.id = _user_id
      AND (
        p.has_all_funnel_access = true
        OR EXISTS (
          SELECT 1
          FROM public.user_funnel_access ufa
          WHERE ufa.user_id = _user_id
            AND ufa.funnel_id = coalesce(f.access_funnel_id, f.id)
        )
      )
  )
$$;

DROP FUNCTION IF EXISTS public.list_funnels_with_access();

CREATE FUNCTION public.list_funnels_with_access()
RETURNS TABLE (
  id uuid,
  name text,
  is_default boolean,
  created_at timestamptz,
  updated_at timestamptz,
  module text,
  tracking_flow_key text,
  access_funnel_id uuid,
  has_access boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id,
    f.name,
    f.is_default,
    f.created_at,
    f.updated_at,
    f.module,
    f.tracking_flow_key,
    f.access_funnel_id,
    public.user_has_funnel_access(auth.uid(), f.id) AS has_access
  FROM public.funnels f
  WHERE auth.uid() IS NOT NULL
    AND public.current_user_is_active()
  ORDER BY
    CASE WHEN f.module = 'sales' THEN 0 ELSE 1 END,
    f.is_default DESC,
    f.name;
$$;

REVOKE EXECUTE ON FUNCTION public.list_funnels_with_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_funnels_with_access() TO authenticated;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS entity_kind text NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS tracking_flow_key text,
  ADD COLUMN IF NOT EXISTS source_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

UPDATE public.leads
SET entity_kind = 'lead',
    tracking_flow_key = NULL,
    source_lead_id = NULL
WHERE entity_kind IS DISTINCT FROM 'lead'
   OR tracking_flow_key IS NOT NULL
   OR source_lead_id IS NOT NULL;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_entity_kind_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_entity_kind_check
  CHECK (entity_kind IN ('lead', 'customer_tracking'));

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_tracking_flow_key_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_tracking_flow_key_check
  CHECK (
    tracking_flow_key IS NULL
    OR tracking_flow_key IN ('opening_company', 'existing_company')
  );

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_entity_kind_consistency_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_entity_kind_consistency_check
  CHECK (
    (
      entity_kind = 'lead'
      AND tracking_flow_key IS NULL
      AND source_lead_id IS NULL
    )
    OR (
      entity_kind = 'customer_tracking'
      AND tracking_flow_key IS NOT NULL
      AND source_lead_id IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS leads_entity_kind_idx
  ON public.leads (entity_kind, funnel_id, position);

CREATE INDEX IF NOT EXISTS leads_source_lead_id_idx
  ON public.leads (source_lead_id, entity_kind);

COMMENT ON COLUMN public.leads.entity_kind IS
  'Indica se o registro pertence ao funil comercial tradicional ou ao acompanhamento de clientes.';

COMMENT ON COLUMN public.leads.tracking_flow_key IS
  'Fluxo de acompanhamento do cliente quando entity_kind = customer_tracking.';

COMMENT ON COLUMN public.leads.source_lead_id IS
  'Lead comercial original que originou este acompanhamento de cliente.';

DO $$
DECLARE
  valle_funnel_id uuid;
  opening_funnel_id uuid;
  existing_funnel_id uuid;
BEGIN
  SELECT id
  INTO valle_funnel_id
  FROM public.funnels
  WHERE module = 'sales'
    AND lower(trim(name)) = lower('Valle Consultores')
  ORDER BY is_default DESC, created_at
  LIMIT 1;

  IF valle_funnel_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id
  INTO opening_funnel_id
  FROM public.funnels
  WHERE module = 'customer_tracking'
    AND access_funnel_id = valle_funnel_id
    AND tracking_flow_key = 'opening_company'
  LIMIT 1;

  IF opening_funnel_id IS NULL THEN
    INSERT INTO public.funnels (
      name,
      is_default,
      module,
      tracking_flow_key,
      access_funnel_id
    )
    VALUES (
      'Valle Acompanhamento - Abertura de Empresa',
      false,
      'customer_tracking',
      'opening_company',
      valle_funnel_id
    )
    RETURNING id INTO opening_funnel_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pipeline_stages
    WHERE funnel_id = opening_funnel_id
  ) THEN
    INSERT INTO public.pipeline_stages (funnel_id, key, name, position, color, is_won, is_lost)
    VALUES
      (opening_funnel_id, 'tracking_docs', 'Juntada de documentacao', 1, NULL, false, false),
      (opening_funnel_id, 'tracking_viabilidade', 'Viabilidade', 2, NULL, false, false),
      (opening_funnel_id, 'tracking_redesim', 'Redesim/Sincronizado', 3, NULL, false, false),
      (opening_funnel_id, 'tracking_taxa', 'Pagamento e compensacao da taxa', 4, NULL, false, false),
      (opening_funnel_id, 'tracking_assinaturas', 'Assinaturas', 5, NULL, false, false),
      (opening_funnel_id, 'tracking_analise', 'Em analise', 6, NULL, false, false),
      (opening_funnel_id, 'tracking_alvara', 'Alvara', 7, NULL, false, false),
      (opening_funnel_id, 'tracking_certificado', 'Certificado Digital', 8, NULL, false, false),
      (opening_funnel_id, 'tracking_onboarding', 'Onboarding do cliente', 9, NULL, false, false),
      (opening_funnel_id, 'tracking_concluido', 'Concluido', 10, NULL, true, false);
  END IF;

  SELECT id
  INTO existing_funnel_id
  FROM public.funnels
  WHERE module = 'customer_tracking'
    AND access_funnel_id = valle_funnel_id
    AND tracking_flow_key = 'existing_company'
  LIMIT 1;

  IF existing_funnel_id IS NULL THEN
    INSERT INTO public.funnels (
      name,
      is_default,
      module,
      tracking_flow_key,
      access_funnel_id
    )
    VALUES (
      'Valle Acompanhamento - Ja Possui CNPJ',
      false,
      'customer_tracking',
      'existing_company',
      valle_funnel_id
    )
    RETURNING id INTO existing_funnel_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pipeline_stages
    WHERE funnel_id = existing_funnel_id
  ) THEN
    INSERT INTO public.pipeline_stages (funnel_id, key, name, position, color, is_won, is_lost)
    VALUES
      (existing_funnel_id, 'tracking_conferencia_documentacao', 'Conferencia da documentacao', 1, NULL, false, false),
      (existing_funnel_id, 'tracking_assinatura_contrato', 'Assinatura do contrato', 2, NULL, false, false),
      (existing_funnel_id, 'tracking_termo_responsabilidade', 'Termo de responsabilidade tecnica contabil', 3, NULL, false, false),
      (existing_funnel_id, 'tracking_cadastros', 'Cadastros: Dominio > Gestta > Sieg > ContaAzul > Intranet > Copilot', 4, NULL, false, false),
      (existing_funnel_id, 'tracking_apresentacao_equipe', 'Apresentacao da equipe', 5, NULL, false, false),
      (existing_funnel_id, 'tracking_concluido', 'Concluido', 6, NULL, true, false);
  END IF;
END
$$;
