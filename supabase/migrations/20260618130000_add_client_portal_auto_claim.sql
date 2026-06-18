ALTER TABLE public.project_tracking_projects
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS client_email_normalized text,
  ADD COLUMN IF NOT EXISTS portal_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_claim_source text;

ALTER TABLE public.project_tracking_projects
  DROP CONSTRAINT IF EXISTS project_tracking_projects_portal_claim_source_check;

ALTER TABLE public.project_tracking_projects
  ADD CONSTRAINT project_tracking_projects_portal_claim_source_check
  CHECK (
    portal_claim_source IS NULL
    OR portal_claim_source IN ('manual', 'auto_email', 'auto_document', 'auto_email_document')
  );

CREATE INDEX IF NOT EXISTS project_tracking_projects_client_email_idx
  ON public.project_tracking_projects (client_email_normalized)
  WHERE client_email_normalized IS NOT NULL;

UPDATE public.project_tracking_projects AS project
SET
  client_email = matched.client_email,
  client_email_normalized = nullif(lower(trim(matched.client_email)), '')
FROM (
  SELECT
    p.id,
    coalesce(tracking_lead.email, source_lead.email) AS client_email
  FROM public.project_tracking_projects p
  LEFT JOIN public.leads tracking_lead
    ON tracking_lead.id = p.current_tracking_lead_id
  LEFT JOIN public.leads source_lead
    ON source_lead.id = coalesce(p.source_sales_lead_id, tracking_lead.source_lead_id)
) AS matched
WHERE matched.id = project.id
  AND matched.client_email IS NOT NULL
  AND (
    project.client_email IS DISTINCT FROM matched.client_email
    OR project.client_email_normalized IS DISTINCT FROM nullif(lower(trim(matched.client_email)), '')
  );

UPDATE public.project_tracking_projects
SET
  portal_claimed_at = coalesce(portal_claimed_at, now()),
  portal_claim_source = coalesce(portal_claim_source, 'manual')
WHERE client_portal_user_id IS NOT NULL;

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
    lead.email,
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
    source_lead.cnpj AS source_document_number,
    source_lead.email AS source_email
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
      client_email,
      client_email_normalized,
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
      coalesce(tracking_lead.email, tracking_lead.source_email),
      nullif(lower(trim(coalesce(tracking_lead.email, tracking_lead.source_email))), ''),
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
      client_email = coalesce(tracking_lead.email, tracking_lead.source_email, existing_project.client_email),
      client_email_normalized = nullif(
        lower(
          trim(
            coalesce(tracking_lead.email, tracking_lead.source_email, existing_project.client_email)
          )
        ),
        ''
      ),
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
