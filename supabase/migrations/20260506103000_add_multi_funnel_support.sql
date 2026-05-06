-- Estrutura multi-funil/multi-negocio com backfill seguro do funil atual.

CREATE TABLE IF NOT EXISTS public.funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS funnels_updated_at ON public.funnels;
CREATE TRIGGER funnels_updated_at
BEFORE UPDATE ON public.funnels
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.funnels
  DROP CONSTRAINT IF EXISTS funnels_name_key;

ALTER TABLE public.funnels
  ADD CONSTRAINT funnels_name_key UNIQUE (name);

CREATE UNIQUE INDEX IF NOT EXISTS funnels_single_default_idx
  ON public.funnels (is_default)
  WHERE is_default = true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_all_funnel_access boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.user_funnel_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  funnel_id uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, funnel_id)
);

ALTER TABLE public.user_funnel_access ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  _default_funnel_id uuid;
BEGIN
  INSERT INTO public.funnels (name, is_default)
  VALUES ('Valle Consultores', true)
  ON CONFLICT (name) DO UPDATE
    SET is_default = true
  RETURNING id INTO _default_funnel_id;

  UPDATE public.funnels
  SET is_default = false
  WHERE id <> _default_funnel_id
    AND is_default = true;
END $$;

ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.funnels(id) ON DELETE CASCADE;

UPDATE public.pipeline_stages
SET funnel_id = (
  SELECT id
  FROM public.funnels
  WHERE is_default = true
  LIMIT 1
)
WHERE funnel_id IS NULL;

ALTER TABLE public.pipeline_stages
  ALTER COLUMN funnel_id SET NOT NULL;

ALTER TABLE public.pipeline_stages
  DROP CONSTRAINT IF EXISTS pipeline_stages_key_key;

ALTER TABLE public.pipeline_stages
  ADD CONSTRAINT pipeline_stages_funnel_key_unique UNIQUE (funnel_id, key);

CREATE INDEX IF NOT EXISTS pipeline_stages_funnel_idx
  ON public.pipeline_stages (funnel_id, position);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS funnel_id uuid REFERENCES public.funnels(id) ON DELETE RESTRICT;

UPDATE public.leads l
SET funnel_id = ps.funnel_id
FROM public.pipeline_stages ps
WHERE l.stage_id = ps.id
  AND l.funnel_id IS NULL;

UPDATE public.leads
SET funnel_id = (
  SELECT id
  FROM public.funnels
  WHERE is_default = true
  LIMIT 1
)
WHERE funnel_id IS NULL;

ALTER TABLE public.leads
  ALTER COLUMN funnel_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS leads_funnel_idx
  ON public.leads (funnel_id, created_at DESC);

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
    WHERE p.id = _user_id
      AND (
        p.has_all_funnel_access = true
        OR EXISTS (
          SELECT 1
          FROM public.user_funnel_access ufa
          WHERE ufa.user_id = _user_id
            AND ufa.funnel_id = _funnel_id
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_funnel_access(_funnel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.current_user_is_active()
    AND public.user_has_funnel_access(auth.uid(), _funnel_id)
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_access_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = _lead_id
      AND public.current_user_is_active()
      AND public.current_user_has_funnel_access(l.funnel_id)
      AND (
        public.current_user_has_any_role(ARRAY['admin','gestor','visualizador']::public.app_role[])
        OR (
          public.current_user_has_role('consultor')
          AND (l.owner_id = auth.uid() OR l.created_by = auth.uid())
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.storage_object_lead_id(_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _parts text[];
BEGIN
  _parts := storage.foldername(_name);
  IF _parts IS NULL OR array_length(_parts, 1) IS NULL OR _parts[1] IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN _parts[1]::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_assignable_users(_funnel_id uuid DEFAULT NULL)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_active() THEN
    RAISE EXCEPTION 'Sem permissao para listar responsaveis.'
      USING ERRCODE = '42501';
  END IF;

  IF _funnel_id IS NOT NULL AND NOT public.current_user_has_funnel_access(_funnel_id) THEN
    RAISE EXCEPTION 'Sem permissao para acessar este funil.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM public.profiles p
  WHERE p.access_status = 'active'
    AND p.is_active = true
    AND p.can_receive_leads = true
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role IN ('admin', 'gestor', 'consultor')
    )
    AND (
      _funnel_id IS NULL
      OR public.user_has_funnel_access(p.id, _funnel_id)
    )
  ORDER BY coalesce(p.full_name, p.email), p.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_assignable_users()
RETURNS SETOF public.profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.list_assignable_users(NULL::uuid)
$$;

CREATE OR REPLACE FUNCTION public.create_funnel(_name text)
RETURNS public.funnels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_name text := trim(coalesce(_name, ''));
  _created public.funnels;
  _template_funnel_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_active() OR NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Sem permissao para criar funis.'
      USING ERRCODE = '42501';
  END IF;

  IF _clean_name = '' THEN
    RAISE EXCEPTION 'Informe o nome do funil.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.funnels
    WHERE lower(trim(name)) = lower(_clean_name)
  ) THEN
    RAISE EXCEPTION 'Ja existe um funil com este nome.'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.funnels (name, is_default)
  VALUES (_clean_name, false)
  RETURNING * INTO _created;

  SELECT id
  INTO _template_funnel_id
  FROM public.funnels
  WHERE is_default = true
  LIMIT 1;

  INSERT INTO public.pipeline_stages (funnel_id, key, name, position, color, is_won, is_lost)
  SELECT
    _created.id,
    ps.key,
    ps.name,
    ps.position,
    ps.color,
    ps.is_won,
    ps.is_lost
  FROM public.pipeline_stages ps
  WHERE ps.funnel_id = _template_funnel_id
  ORDER BY ps.position, ps.created_at;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND has_all_funnel_access = false
  ) THEN
    INSERT INTO public.user_funnel_access (user_id, funnel_id)
    VALUES (auth.uid(), _created.id)
    ON CONFLICT (user_id, funnel_id) DO NOTHING;
  END IF;

  RETURN _created;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_funnel_scope(
  _target_user_id uuid,
  _has_all_funnel_access boolean,
  _funnel_id uuid DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result public.profiles;
  _target_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.current_user_can_manage_team() THEN
    RAISE EXCEPTION 'Sem permissao para alterar acesso por funil.'
      USING ERRCODE = '42501';
  END IF;

  SELECT email
  INTO _target_email
  FROM public.profiles
  WHERE id = _target_user_id;

  IF _target_email IS NULL THEN
    RAISE EXCEPTION 'Usuario nao encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF public.is_owner_email(_target_email) THEN
    UPDATE public.profiles
    SET has_all_funnel_access = true
    WHERE id = _target_user_id
    RETURNING * INTO _result;

    DELETE FROM public.user_funnel_access
    WHERE user_id = _target_user_id;

    RETURN _result;
  END IF;

  IF NOT _has_all_funnel_access THEN
    IF _funnel_id IS NULL THEN
      RAISE EXCEPTION 'Selecione um funil para acesso restrito.'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.funnels
      WHERE id = _funnel_id
    ) THEN
      RAISE EXCEPTION 'Funil nao encontrado.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE public.profiles
  SET has_all_funnel_access = _has_all_funnel_access
  WHERE id = _target_user_id
  RETURNING * INTO _result;

  DELETE FROM public.user_funnel_access
  WHERE user_id = _target_user_id;

  IF NOT _has_all_funnel_access THEN
    INSERT INTO public.user_funnel_access (user_id, funnel_id)
    VALUES (_target_user_id, _funnel_id)
    ON CONFLICT (user_id, funnel_id) DO NOTHING;
  END IF;

  RETURN _result;
END;
$$;

DROP POLICY IF EXISTS "Authenticated read stages" ON public.pipeline_stages;
CREATE POLICY "Authenticated read stages" ON public.pipeline_stages
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_has_funnel_access(funnel_id)
  );

DROP POLICY IF EXISTS "Admins manage stages - insert" ON public.pipeline_stages;
CREATE POLICY "Admins manage stages - insert" ON public.pipeline_stages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_active()
    AND public.current_user_has_role('admin')
    AND public.current_user_has_funnel_access(funnel_id)
  );

DROP POLICY IF EXISTS "Admins manage stages - update" ON public.pipeline_stages;
CREATE POLICY "Admins manage stages - update" ON public.pipeline_stages
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_has_role('admin')
    AND public.current_user_has_funnel_access(funnel_id)
  );

DROP POLICY IF EXISTS "Admins manage stages - delete" ON public.pipeline_stages;
CREATE POLICY "Admins manage stages - delete" ON public.pipeline_stages
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_has_role('admin')
    AND public.current_user_has_funnel_access(funnel_id)
  );

CREATE POLICY "Users view accessible funnels" ON public.funnels
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_has_funnel_access(id)
  );

CREATE POLICY "Admins create funnels" ON public.funnels
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_active()
    AND public.current_user_has_role('admin')
  );

CREATE POLICY "Admins update funnels" ON public.funnels
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_has_role('admin')
  );

CREATE POLICY "Admins delete funnels" ON public.funnels
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_has_role('admin')
    AND is_default = false
  );

CREATE POLICY "Users view own funnel access" ON public.user_funnel_access
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Managers view all funnel access" ON public.user_funnel_access
  FOR SELECT TO authenticated
  USING (public.current_user_can_manage_team());

CREATE POLICY "Managers insert funnel access" ON public.user_funnel_access
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_manage_team());

CREATE POLICY "Managers update funnel access" ON public.user_funnel_access
  FOR UPDATE TO authenticated
  USING (public.current_user_can_manage_team());

CREATE POLICY "Managers delete funnel access" ON public.user_funnel_access
  FOR DELETE TO authenticated
  USING (public.current_user_can_manage_team());

DROP POLICY IF EXISTS "Leads select by role" ON public.leads;
CREATE POLICY "Leads select by role" ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_has_funnel_access(funnel_id)
    AND (
      public.current_user_has_any_role(ARRAY['admin','gestor','visualizador']::public.app_role[])
      OR (
        public.current_user_has_role('consultor')
        AND (owner_id = auth.uid() OR created_by = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Leads insert by role" ON public.leads;
CREATE POLICY "Leads insert by role" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_active()
    AND public.current_user_has_funnel_access(funnel_id)
    AND (
      public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[])
      OR (
        public.current_user_has_role('consultor')
        AND (owner_id = auth.uid() OR owner_id IS NULL)
      )
    )
  );

DROP POLICY IF EXISTS "Leads update by role" ON public.leads;
CREATE POLICY "Leads update by role" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_has_funnel_access(funnel_id)
    AND (
      public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[])
      OR (
        public.current_user_has_role('consultor')
        AND (owner_id = auth.uid() OR created_by = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Leads delete by role" ON public.leads;
CREATE POLICY "Leads delete by role" ON public.leads
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_has_funnel_access(funnel_id)
    AND public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[])
  );

DROP POLICY IF EXISTS "Auth read notes" ON public.lead_notes;
CREATE POLICY "Auth read notes" ON public.lead_notes
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_lead(lead_id));

DROP POLICY IF EXISTS "Auth insert notes" ON public.lead_notes;
CREATE POLICY "Auth insert notes" ON public.lead_notes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND public.current_user_can_access_lead(lead_id));

DROP POLICY IF EXISTS "Auth update own notes" ON public.lead_notes;
CREATE POLICY "Auth update own notes" ON public.lead_notes
  FOR UPDATE TO authenticated
  USING (
    public.current_user_can_access_lead(lead_id)
    AND (created_by = auth.uid() OR public.current_user_has_role('admin'))
  );

DROP POLICY IF EXISTS "Auth delete own notes" ON public.lead_notes;
CREATE POLICY "Auth delete own notes" ON public.lead_notes
  FOR DELETE TO authenticated
  USING (
    public.current_user_can_access_lead(lead_id)
    AND (created_by = auth.uid() OR public.current_user_has_role('admin'))
  );

DROP POLICY IF EXISTS "Auth read activities" ON public.lead_activities;
CREATE POLICY "Auth read activities" ON public.lead_activities
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_lead(lead_id));

DROP POLICY IF EXISTS "Auth insert activities" ON public.lead_activities;
CREATE POLICY "Auth insert activities" ON public.lead_activities
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND public.current_user_can_access_lead(lead_id));

DROP POLICY IF EXISTS "Auth read attachments" ON public.lead_attachments;
CREATE POLICY "Auth read attachments" ON public.lead_attachments
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_lead(lead_id));

DROP POLICY IF EXISTS "Auth insert attachments" ON public.lead_attachments;
CREATE POLICY "Auth insert attachments" ON public.lead_attachments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND public.current_user_can_access_lead(lead_id));

DROP POLICY IF EXISTS "Auth delete own attachments" ON public.lead_attachments;
CREATE POLICY "Auth delete own attachments" ON public.lead_attachments
  FOR DELETE TO authenticated
  USING (
    public.current_user_can_access_lead(lead_id)
    AND (created_by = auth.uid() OR public.current_user_has_role('admin'))
  );

DROP POLICY IF EXISTS "Auth read lead attachments" ON storage.objects;
CREATE POLICY "Auth read lead attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lead-attachments'
    AND public.current_user_can_access_lead(public.storage_object_lead_id(name))
  );

DROP POLICY IF EXISTS "Auth upload lead attachments" ON storage.objects;
CREATE POLICY "Auth upload lead attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lead-attachments'
    AND public.current_user_can_access_lead(public.storage_object_lead_id(name))
  );

DROP POLICY IF EXISTS "Auth delete lead attachments" ON storage.objects;
CREATE POLICY "Auth delete lead attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lead-attachments'
    AND public.current_user_can_access_lead(public.storage_object_lead_id(name))
  );

REVOKE EXECUTE ON FUNCTION public.user_has_funnel_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_has_funnel_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_can_access_lead(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.storage_object_lead_id(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_funnel(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_user_funnel_scope(uuid, boolean, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_assignable_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_assignable_users(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_has_funnel_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_funnel(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_funnel_scope(uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_assignable_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_assignable_users(uuid) TO authenticated;
