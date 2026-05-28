CREATE TABLE public.project_tracking_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  document_validation_mode text NOT NULL DEFAULT 'optional',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_tracking_settings_document_validation_mode_check
    CHECK (document_validation_mode IN ('disabled', 'optional', 'required'))
);

ALTER TABLE public.project_tracking_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER project_tracking_settings_updated_at
BEFORE UPDATE ON public.project_tracking_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.project_tracking_step_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type text NOT NULL,
  step_key text NOT NULL,
  internal_stage_key text,
  internal_name text NOT NULL,
  public_name text NOT NULL,
  public_description text NOT NULL,
  position integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_tracking_step_catalog_flow_type_check
    CHECK (flow_type IN ('existing_company', 'company_opening')),
  CONSTRAINT project_tracking_step_catalog_position_check
    CHECK (position > 0),
  CONSTRAINT project_tracking_step_catalog_unique_step
    UNIQUE (flow_type, step_key),
  CONSTRAINT project_tracking_step_catalog_unique_position
    UNIQUE (flow_type, position)
);

ALTER TABLE public.project_tracking_step_catalog ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX project_tracking_step_catalog_internal_stage_idx
  ON public.project_tracking_step_catalog (flow_type, internal_stage_key)
  WHERE internal_stage_key IS NOT NULL;

CREATE TRIGGER project_tracking_step_catalog_updated_at
BEFORE UPDATE ON public.project_tracking_step_catalog
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.project_tracking_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  current_tracking_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  source_sales_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  crm_deal_id text,
  client_name text,
  company_name text,
  tracking_code text NOT NULL,
  tracking_code_normalized text NOT NULL,
  document_number text,
  document_number_normalized text,
  crm_pipeline text,
  crm_stage text,
  flow_type text NOT NULL,
  current_step_key text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT project_tracking_projects_flow_type_check
    CHECK (flow_type IN ('existing_company', 'company_opening')),
  CONSTRAINT project_tracking_projects_status_check
    CHECK (status IN ('active', 'completed', 'paused')),
  CONSTRAINT project_tracking_projects_tracking_code_key
    UNIQUE (tracking_code_normalized)
);

ALTER TABLE public.project_tracking_projects ENABLE ROW LEVEL SECURITY;

CREATE INDEX project_tracking_projects_status_idx
  ON public.project_tracking_projects (status, flow_type, updated_at DESC);

CREATE UNIQUE INDEX project_tracking_projects_current_tracking_lead_idx
  ON public.project_tracking_projects (current_tracking_lead_id)
  WHERE current_tracking_lead_id IS NOT NULL;

CREATE UNIQUE INDEX project_tracking_projects_source_sales_lead_idx
  ON public.project_tracking_projects (source_sales_lead_id)
  WHERE source_sales_lead_id IS NOT NULL;

CREATE UNIQUE INDEX project_tracking_projects_crm_deal_idx
  ON public.project_tracking_projects (crm_deal_id)
  WHERE crm_deal_id IS NOT NULL;

CREATE TRIGGER project_tracking_projects_updated_at
BEFORE UPDATE ON public.project_tracking_projects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.project_tracking_step_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.project_tracking_projects(id) ON DELETE CASCADE,
  flow_type text NOT NULL,
  step_key text NOT NULL,
  status text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'system',
  CONSTRAINT project_tracking_step_history_flow_type_check
    CHECK (flow_type IN ('existing_company', 'company_opening')),
  CONSTRAINT project_tracking_step_history_status_check
    CHECK (status IN ('pending', 'current', 'completed')),
  CONSTRAINT project_tracking_step_history_source_check
    CHECK (source IN ('crm', 'manual', 'automation', 'system')),
  CONSTRAINT project_tracking_step_history_project_step_key
    UNIQUE (project_id, flow_type, step_key),
  CONSTRAINT project_tracking_step_history_catalog_fkey
    FOREIGN KEY (flow_type, step_key)
    REFERENCES public.project_tracking_step_catalog(flow_type, step_key)
    ON DELETE CASCADE
);

ALTER TABLE public.project_tracking_step_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX project_tracking_step_history_project_idx
  ON public.project_tracking_step_history (project_id, flow_type, updated_at DESC);

CREATE TRIGGER project_tracking_step_history_updated_at
BEFORE UPDATE ON public.project_tracking_step_history
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.project_tracking_settings (singleton, document_validation_mode)
VALUES (true, 'optional')
ON CONFLICT (singleton) DO UPDATE
SET document_validation_mode = EXCLUDED.document_validation_mode;

INSERT INTO public.project_tracking_step_catalog (
  flow_type,
  step_key,
  internal_stage_key,
  internal_name,
  public_name,
  public_description,
  position,
  is_active
)
VALUES
  (
    'existing_company',
    'document_review',
    'tracking_conferencia_documentacao',
    'Conferencia da documentacao',
    'Analise dos documentos',
    'Estamos conferindo os documentos enviados para garantir que esta tudo certo para iniciar o atendimento.',
    1,
    true
  ),
  (
    'existing_company',
    'contract_signature',
    'tracking_assinatura_contrato',
    'Assinatura do contrato',
    'Assinatura do contrato',
    'Nesta etapa, formalizamos nossa parceria com a assinatura do contrato de prestacao de servicos.',
    2,
    true
  ),
  (
    'existing_company',
    'accounting_responsibility',
    'tracking_termo_responsabilidade',
    'Termo de responsabilidade tecnica contabil',
    'Regularizacao contabil',
    'Estamos cuidando dos registros necessarios para assumir a responsabilidade tecnica contabil da sua empresa.',
    3,
    true
  ),
  (
    'existing_company',
    'systems_setup',
    'tracking_cadastros',
    'Cadastros: Dominio > Gestta > Sieg > ContaAzul > Intranet > Copilot',
    'Configuracao dos sistemas',
    'Estamos preparando os sistemas e acessos que serao usados no acompanhamento da sua empresa.',
    4,
    true
  ),
  (
    'existing_company',
    'team_introduction',
    'tracking_apresentacao_equipe',
    'Apresentacao da equipe',
    'Apresentacao da equipe',
    'Vamos apresentar as pessoas que cuidarao da sua empresa e explicar como sera a rotina de atendimento.',
    5,
    true
  ),
  (
    'company_opening',
    'document_collection',
    'tracking_docs',
    'Juntada de documentacao',
    'Envio dos documentos',
    'Estamos reunindo as informacoes e documentos necessarios para iniciar a abertura da sua empresa.',
    1,
    true
  ),
  (
    'company_opening',
    'feasibility_check',
    'tracking_viabilidade',
    'Viabilidade',
    'Consulta de viabilidade',
    'Estamos verificando se a atividade, endereco e nome empresarial podem ser aprovados pelos orgaos responsaveis.',
    2,
    true
  ),
  (
    'company_opening',
    'official_registration',
    'tracking_redesim',
    'Redesim/Sincronizado',
    'Registro nos orgaos oficiais',
    'Estamos preenchendo e enviando as informacoes da sua empresa para os sistemas oficiais de registro.',
    3,
    true
  ),
  (
    'company_opening',
    'fee_payment',
    'tracking_taxa',
    'Pagamento e compensacao da taxa',
    'Taxas de abertura',
    'Nesta etapa, acompanhamos o pagamento e a compensacao das taxas necessarias para continuar o processo.',
    4,
    true
  ),
  (
    'company_opening',
    'document_signatures',
    'tracking_assinaturas',
    'Assinaturas',
    'Assinatura dos documentos',
    'Os documentos de abertura precisam ser assinados para que o processo avance nos orgaos responsaveis.',
    5,
    true
  ),
  (
    'company_opening',
    'government_review',
    'tracking_analise',
    'Em analise',
    'Analise pelos orgaos responsaveis',
    'Seu processo esta em analise pelos orgaos publicos. Estamos acompanhando o andamento ate a aprovacao.',
    6,
    true
  ),
  (
    'company_opening',
    'municipal_license',
    'tracking_alvara',
    'Alvara',
    'Liberacao municipal',
    'Estamos verificando ou solicitando as liberacoes municipais necessarias para o funcionamento da empresa.',
    7,
    true
  ),
  (
    'company_opening',
    'digital_certificate',
    'tracking_certificado',
    'Certificado Digital',
    'Certificado digital',
    'Estamos orientando ou acompanhando a emissao do certificado digital, que sera usado em obrigacoes e acessos oficiais.',
    8,
    true
  ),
  (
    'company_opening',
    'client_onboarding',
    'tracking_onboarding',
    'Onboarding do cliente',
    'Inicio do atendimento',
    'Sua empresa foi aberta e agora vamos iniciar a organizacao dos acessos, sistemas e rotina de atendimento.',
    9,
    true
  )
ON CONFLICT (flow_type, step_key) DO UPDATE
SET
  internal_stage_key = EXCLUDED.internal_stage_key,
  internal_name = EXCLUDED.internal_name,
  public_name = EXCLUDED.public_name,
  public_description = EXCLUDED.public_description,
  position = EXCLUDED.position,
  is_active = EXCLUDED.is_active;

CREATE OR REPLACE FUNCTION public.normalize_tracking_code(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(regexp_replace(trim(coalesce(_value, '')), '\s+', '', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.normalize_document_number(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(coalesce(_value, ''), '\D', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.normalize_tracking_text(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(coalesce(_value, '')), '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.generate_project_tracking_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  generated_code text;
  candidate text;
  index_position integer;
BEGIN
  LOOP
    generated_code := '';
    FOR index_position IN 1..6 LOOP
      generated_code := generated_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    END LOOP;

    candidate := 'VALLE-' || generated_code;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.project_tracking_projects
      WHERE tracking_code_normalized = public.normalize_tracking_code(candidate)
    );
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_project_tracking_step_key(
  _flow_type text,
  _stage_key text DEFAULT NULL,
  _stage_name text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  resolved_step_key text;
  normalized_stage_key text := public.normalize_tracking_text(_stage_key);
  normalized_stage_name text := public.normalize_tracking_text(_stage_name);
BEGIN
  IF _flow_type NOT IN ('existing_company', 'company_opening') THEN
    RETURN NULL;
  END IF;

  IF normalized_stage_key LIKE '%concluido%' OR normalized_stage_name = 'concluido' THEN
    SELECT step_key
    INTO resolved_step_key
    FROM public.project_tracking_step_catalog
    WHERE flow_type = _flow_type
      AND is_active = true
    ORDER BY position DESC
    LIMIT 1;

    RETURN resolved_step_key;
  END IF;

  SELECT step_key
  INTO resolved_step_key
  FROM public.project_tracking_step_catalog
  WHERE flow_type = _flow_type
    AND is_active = true
    AND (
      public.normalize_tracking_text(internal_stage_key) = normalized_stage_key
      OR public.normalize_tracking_text(internal_name) = normalized_stage_name
      OR public.normalize_tracking_text(internal_name) = normalized_stage_key
    )
  ORDER BY position
  LIMIT 1;

  RETURN resolved_step_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_project_tracking_history(
  _project_id uuid,
  _flow_type text,
  _current_step_key text,
  _source text DEFAULT 'system',
  _updated_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  current_position integer;
BEGIN
  SELECT position
  INTO current_position
  FROM public.project_tracking_step_catalog
  WHERE flow_type = _flow_type
    AND step_key = _current_step_key
    AND is_active = true
  LIMIT 1;

  INSERT INTO public.project_tracking_step_history (
    project_id,
    flow_type,
    step_key,
    status,
    started_at,
    completed_at,
    updated_at,
    updated_by,
    source
  )
  SELECT
    _project_id,
    catalog.flow_type,
    catalog.step_key,
    CASE
      WHEN current_position IS NULL THEN 'pending'
      WHEN catalog.position < current_position THEN 'completed'
      WHEN catalog.position = current_position THEN 'current'
      ELSE 'pending'
    END,
    CASE
      WHEN current_position IS NULL OR catalog.position > current_position THEN NULL
      ELSE now()
    END,
    CASE
      WHEN current_position IS NOT NULL AND catalog.position < current_position THEN now()
      ELSE NULL
    END,
    now(),
    _updated_by,
    _source
  FROM public.project_tracking_step_catalog catalog
  WHERE catalog.flow_type = _flow_type
    AND catalog.is_active = true
  ON CONFLICT (project_id, flow_type, step_key) DO UPDATE
  SET
    status = EXCLUDED.status,
    started_at = CASE
      WHEN EXCLUDED.status = 'pending' THEN NULL
      ELSE coalesce(public.project_tracking_step_history.started_at, EXCLUDED.started_at, now())
    END,
    completed_at = CASE
      WHEN EXCLUDED.status = 'completed' THEN coalesce(public.project_tracking_step_history.completed_at, EXCLUDED.completed_at, now())
      ELSE NULL
    END,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by,
    source = EXCLUDED.source;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_project_tracking_flow(
  _project_id uuid,
  _flow_type text,
  _source text DEFAULT 'system',
  _updated_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.project_tracking_step_history (
    project_id,
    flow_type,
    step_key,
    status,
    started_at,
    completed_at,
    updated_at,
    updated_by,
    source
  )
  SELECT
    _project_id,
    catalog.flow_type,
    catalog.step_key,
    'completed',
    now(),
    now(),
    now(),
    _updated_by,
    _source
  FROM public.project_tracking_step_catalog catalog
  WHERE catalog.flow_type = _flow_type
    AND catalog.is_active = true
  ON CONFLICT (project_id, flow_type, step_key) DO UPDATE
  SET
    status = 'completed',
    started_at = coalesce(public.project_tracking_step_history.started_at, now()),
    completed_at = coalesce(public.project_tracking_step_history.completed_at, now()),
    updated_at = now(),
    updated_by = EXCLUDED.updated_by,
    source = EXCLUDED.source;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_project_tracking_from_customer_lead(
  _tracking_lead_id uuid,
  _source text DEFAULT 'system',
  _updated_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  tracking_lead record;
  existing_project record;
  resolved_flow_type text;
  resolved_step_key text;
  resolved_status text;
  generated_tracking_code text;
  project_id uuid;
BEGIN
  SELECT
    lead.id,
    lead.source_lead_id,
    lead.contact_name,
    lead.company_or_person,
    lead.cnpj,
    lead.is_archived,
    lead.tracking_flow_key,
    lead.stage_id,
    lead.funnel_id,
    lead.updated_by,
    stage.key AS stage_key,
    stage.name AS stage_name,
    stage.is_won,
    stage.is_lost,
    funnel.name AS funnel_name,
    source_lead.contact_name AS source_contact_name,
    source_lead.company_or_person AS source_company_name,
    source_lead.cnpj AS source_document_number
  INTO tracking_lead
  FROM public.leads lead
  LEFT JOIN public.pipeline_stages stage ON stage.id = lead.stage_id
  LEFT JOIN public.funnels funnel ON funnel.id = lead.funnel_id
  LEFT JOIN public.leads source_lead ON source_lead.id = lead.source_lead_id
  WHERE lead.id = _tracking_lead_id
    AND lead.entity_kind = 'customer_tracking'
  LIMIT 1;

  IF tracking_lead IS NULL THEN
    RETURN NULL;
  END IF;

  resolved_flow_type := CASE tracking_lead.tracking_flow_key
    WHEN 'opening_company' THEN 'company_opening'
    WHEN 'existing_company' THEN 'existing_company'
    ELSE NULL
  END;

  IF resolved_flow_type IS NULL THEN
    RETURN NULL;
  END IF;

  resolved_step_key := public.resolve_project_tracking_step_key(
    resolved_flow_type,
    tracking_lead.stage_key,
    tracking_lead.stage_name
  );

  resolved_status := CASE
    WHEN tracking_lead.is_archived THEN 'paused'
    WHEN tracking_lead.is_won AND resolved_flow_type = 'existing_company' THEN 'completed'
    ELSE 'active'
  END;

  SELECT *
  INTO existing_project
  FROM public.project_tracking_projects
  WHERE current_tracking_lead_id = tracking_lead.id
     OR source_sales_lead_id IS NOT DISTINCT FROM tracking_lead.source_lead_id
  ORDER BY updated_at DESC
  LIMIT 1;

  IF existing_project IS NULL THEN
    generated_tracking_code := public.generate_project_tracking_code();

    INSERT INTO public.project_tracking_projects (
      current_tracking_lead_id,
      source_sales_lead_id,
      client_name,
      company_name,
      tracking_code,
      tracking_code_normalized,
      document_number,
      document_number_normalized,
      crm_pipeline,
      crm_stage,
      flow_type,
      current_step_key,
      status,
      completed_at
    )
    VALUES (
      tracking_lead.id,
      tracking_lead.source_lead_id,
      coalesce(tracking_lead.contact_name, tracking_lead.source_contact_name),
      coalesce(tracking_lead.company_or_person, tracking_lead.source_company_name),
      generated_tracking_code,
      public.normalize_tracking_code(generated_tracking_code),
      coalesce(tracking_lead.cnpj, tracking_lead.source_document_number),
      nullif(public.normalize_document_number(coalesce(tracking_lead.cnpj, tracking_lead.source_document_number)), ''),
      tracking_lead.funnel_name,
      tracking_lead.stage_name,
      resolved_flow_type,
      resolved_step_key,
      resolved_status,
      CASE WHEN resolved_status = 'completed' THEN now() ELSE NULL END
    )
    RETURNING id INTO project_id;
  ELSE
    UPDATE public.project_tracking_projects
    SET
      current_tracking_lead_id = tracking_lead.id,
      source_sales_lead_id = coalesce(existing_project.source_sales_lead_id, tracking_lead.source_lead_id),
      client_name = coalesce(tracking_lead.contact_name, tracking_lead.source_contact_name, existing_project.client_name),
      company_name = coalesce(tracking_lead.company_or_person, tracking_lead.source_company_name, existing_project.company_name),
      document_number = coalesce(tracking_lead.cnpj, tracking_lead.source_document_number, existing_project.document_number),
      document_number_normalized = nullif(
        public.normalize_document_number(
          coalesce(tracking_lead.cnpj, tracking_lead.source_document_number, existing_project.document_number)
        ),
        ''
      ),
      crm_pipeline = tracking_lead.funnel_name,
      crm_stage = tracking_lead.stage_name,
      flow_type = resolved_flow_type,
      current_step_key = resolved_step_key,
      status = resolved_status,
      completed_at = CASE
        WHEN resolved_status = 'completed' THEN coalesce(existing_project.completed_at, now())
        ELSE NULL
      END
    WHERE id = existing_project.id
    RETURNING id INTO project_id;
  END IF;

  IF resolved_flow_type = 'existing_company'
     AND existing_project IS NOT NULL
     AND existing_project.flow_type = 'company_opening' THEN
    PERFORM public.complete_project_tracking_flow(project_id, 'company_opening', _source, _updated_by);
  END IF;

  IF resolved_status = 'completed' THEN
    PERFORM public.complete_project_tracking_flow(project_id, resolved_flow_type, _source, _updated_by);
  ELSE
    PERFORM public.sync_project_tracking_history(project_id, resolved_flow_type, resolved_step_key, _source, _updated_by);
  END IF;

  RETURN project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_tracking_sync_from_lead_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.entity_kind <> 'customer_tracking' THEN
    RETURN NEW;
  END IF;

  PERFORM public.upsert_project_tracking_from_customer_lead(
    NEW.id,
    'automation',
    NEW.updated_by
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_tracking_sync_from_lead ON public.leads;

CREATE TRIGGER project_tracking_sync_from_lead
AFTER INSERT OR UPDATE OF stage_id, funnel_id, tracking_flow_key, is_archived, contact_name, company_or_person, cnpj, source_lead_id
ON public.leads
FOR EACH ROW
WHEN (NEW.entity_kind = 'customer_tracking')
EXECUTE FUNCTION public.project_tracking_sync_from_lead_trigger();

CREATE OR REPLACE FUNCTION public.project_tracking_transition_opening_flow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_funnel record;
  target_stage record;
BEGIN
  IF NEW.entity_kind <> 'customer_tracking' THEN
    RETURN NEW;
  END IF;

  IF coalesce(OLD.tracking_flow_key, '') <> 'opening_company' THEN
    RETURN NEW;
  END IF;

  IF NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  IF NEW.tracking_flow_key IS DISTINCT FROM 'opening_company' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pipeline_stages stage
    WHERE stage.id = NEW.stage_id
      AND stage.is_won = true
  ) THEN
    RETURN NEW;
  END IF;

  SELECT funnel.id, funnel.name
  INTO target_funnel
  FROM public.funnels current_funnel
  JOIN public.funnels funnel
    ON funnel.access_funnel_id = coalesce(current_funnel.access_funnel_id, current_funnel.id)
   AND funnel.module = 'customer_tracking'
   AND funnel.tracking_flow_key = 'existing_company'
  WHERE current_funnel.id = NEW.funnel_id
  LIMIT 1;

  IF target_funnel IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT stage.id, stage.name
  INTO target_stage
  FROM public.pipeline_stages stage
  WHERE stage.funnel_id = target_funnel.id
    AND stage.is_won = false
    AND stage.is_lost = false
  ORDER BY stage.position ASC, stage.created_at ASC
  LIMIT 1;

  IF target_stage IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.funnel_id := target_funnel.id;
  NEW.stage_id := target_stage.id;
  NEW.tracking_flow_key := 'existing_company';
  NEW.is_archived := false;
  NEW.archived_at := NULL;
  NEW.archived_by := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_tracking_transition_opening_flow ON public.leads;

CREATE TRIGGER project_tracking_transition_opening_flow
BEFORE UPDATE OF stage_id ON public.leads
FOR EACH ROW
WHEN (OLD.entity_kind = 'customer_tracking')
EXECUTE FUNCTION public.project_tracking_transition_opening_flow();
