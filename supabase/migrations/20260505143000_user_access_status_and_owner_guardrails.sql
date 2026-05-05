-- Introduz status de acesso separado da role operacional, protege a conta
-- owner e impede autoalteracao de funcao por usuarios com poderes de gestao.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'user_access_status'
  ) THEN
    CREATE TYPE public.user_access_status AS ENUM ('pending', 'active', 'suspended', 'inactive');
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_status public.user_access_status NOT NULL DEFAULT 'pending';

CREATE OR REPLACE FUNCTION public.is_owner_email(_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(_email, ''))) = 'marketing@valleconsultores.com.br'
$$;

CREATE OR REPLACE FUNCTION public.is_owner_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND public.is_owner_email(email)
  )
$$;

-- Remove o papel legado "user" do fluxo operacional.
DELETE FROM public.user_roles
WHERE role = 'user';

-- Conta owner sempre ativa e admin quando existir no projeto.
DELETE FROM public.user_roles
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE public.is_owner_email(email)
)
AND role <> 'admin';

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM public.profiles
WHERE public.is_owner_email(email)
ON CONFLICT (user_id, role) DO NOTHING;

-- Usuarios com role operacional continuam operacionais; legados sem role viram pending.
UPDATE public.profiles p
SET access_status = CASE
  WHEN public.is_owner_email(p.email) THEN 'active'::public.user_access_status
  WHEN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role IN ('admin', 'gestor', 'consultor', 'visualizador')
  ) THEN CASE
    WHEN coalesce(p.is_active, true) THEN 'active'::public.user_access_status
    ELSE 'inactive'::public.user_access_status
  END
  ELSE 'pending'::public.user_access_status
END;

UPDATE public.profiles
SET is_active = (access_status = 'active');

UPDATE public.profiles p
SET can_receive_leads = false
WHERE p.access_status <> 'active'
   OR NOT EXISTS (
     SELECT 1
     FROM public.user_roles ur
     WHERE ur.user_id = p.id
       AND ur.role IN ('admin', 'gestor', 'consultor')
   );

UPDATE public.profiles
SET can_receive_leads = true
WHERE public.is_owner_email(email);

CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT access_status = 'active'::public.user_access_status AND is_active = true
      FROM public.profiles
      WHERE id = auth.uid()
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_status()
RETURNS public.user_access_status
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT access_status FROM public.profiles WHERE id = auth.uid()),
    'pending'::public.user_access_status
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_team()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_is_active()
    AND public.current_user_has_any_role(ARRAY['admin', 'gestor']::public.app_role[])
$$;

CREATE OR REPLACE FUNCTION public.list_assignable_users()
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
  ORDER BY coalesce(p.full_name, p.email), p.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_role(_target_user_id uuid, _role public.app_role)
RETURNS public.user_roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result public.user_roles;
  _target_email text;
  _actor_is_admin boolean;
  _target_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF _role NOT IN ('admin', 'gestor', 'consultor', 'visualizador') THEN
    RAISE EXCEPTION 'Funcao operacional invalida.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.current_user_can_manage_team() THEN
    RAISE EXCEPTION 'Sem permissao para alterar funcoes de usuarios.'
      USING ERRCODE = '42501';
  END IF;

  IF _target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Voce nao pode alterar a propria funcao.'
      USING ERRCODE = '42501';
  END IF;

  SELECT email INTO _target_email
  FROM public.profiles
  WHERE id = _target_user_id;

  IF _target_email IS NULL THEN
    RAISE EXCEPTION 'Usuario nao encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF public.is_owner_email(_target_email) THEN
    RAISE EXCEPTION 'A conta owner nao pode ter a funcao alterada.'
      USING ERRCODE = '42501';
  END IF;

  _actor_is_admin := public.current_user_has_role('admin');

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _target_user_id
      AND role = 'admin'
  ) INTO _target_is_admin;

  IF NOT _actor_is_admin THEN
    IF _target_is_admin THEN
      RAISE EXCEPTION 'Gestores nao podem alterar administradores.'
        USING ERRCODE = '42501';
    END IF;

    IF _role = 'admin' THEN
      RAISE EXCEPTION 'Gestores nao podem conceder perfil Admin.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _target_user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, _role)
  RETURNING * INTO _result;

  UPDATE public.profiles
  SET access_status = 'active',
      is_active = true,
      can_receive_leads = CASE
        WHEN _role = 'visualizador' THEN false
        WHEN access_status = 'pending' THEN true
        ELSE can_receive_leads
      END
  WHERE id = _target_user_id;

  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_status(_target_user_id uuid, _status public.user_access_status)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result public.profiles;
  _target_email text;
  _actor_is_admin boolean;
  _target_is_admin boolean;
  _has_operational_role boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.current_user_can_manage_team() THEN
    RAISE EXCEPTION 'Sem permissao para alterar o status do usuario.'
      USING ERRCODE = '42501';
  END IF;

  IF _target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Voce nao pode alterar o proprio status.'
      USING ERRCODE = '42501';
  END IF;

  SELECT email INTO _target_email
  FROM public.profiles
  WHERE id = _target_user_id;

  IF _target_email IS NULL THEN
    RAISE EXCEPTION 'Usuario nao encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF public.is_owner_email(_target_email) THEN
    RAISE EXCEPTION 'A conta owner nao pode ter o status alterado.'
      USING ERRCODE = '42501';
  END IF;

  _actor_is_admin := public.current_user_has_role('admin');

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _target_user_id
      AND role = 'admin'
  ) INTO _target_is_admin;

  IF NOT _actor_is_admin AND _target_is_admin THEN
    RAISE EXCEPTION 'Gestores nao podem alterar administradores.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _target_user_id
      AND role IN ('admin', 'gestor', 'consultor', 'visualizador')
  ) INTO _has_operational_role;

  IF _status = 'active' AND NOT _has_operational_role THEN
    RAISE EXCEPTION 'Defina uma funcao operacional antes de ativar o usuario.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET access_status = _status,
      is_active = (_status = 'active'),
      can_receive_leads = CASE
        WHEN _status = 'active' THEN can_receive_leads
        ELSE false
      END
  WHERE id = _target_user_id
  RETURNING * INTO _result;

  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_user_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _target_user_id uuid := coalesce(NEW.user_id, OLD.user_id);
  _actor_is_admin boolean;
  _actor_is_gestor boolean;
  _target_is_admin boolean;
BEGIN
  IF _actor_id IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _actor_id AND role = 'admin'
  ) INTO _actor_is_admin;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _actor_id AND role = 'gestor'
  ) INTO _actor_is_gestor;

  IF NOT (_actor_is_admin OR _actor_is_gestor) THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF _target_user_id = _actor_id THEN
    RAISE EXCEPTION 'Voce nao pode alterar a propria funcao.'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_owner_user(_target_user_id) THEN
    RAISE EXCEPTION 'A conta owner nao pode ter a funcao alterada.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _target_user_id AND role = 'admin'
  ) INTO _target_is_admin;

  IF NOT _actor_is_admin THEN
    IF _target_is_admin THEN
      RAISE EXCEPTION 'Gestores nao podem alterar administradores.'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP <> 'DELETE' AND NEW.role = 'admin' THEN
      RAISE EXCEPTION 'Gestores nao podem conceder perfil Admin.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_access_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _actor_is_admin boolean;
  _actor_is_gestor boolean;
  _target_is_admin boolean;
  _sensitive_change boolean :=
    NEW.access_status IS DISTINCT FROM OLD.access_status
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.can_receive_leads IS DISTINCT FROM OLD.can_receive_leads;
BEGIN
  IF NOT _sensitive_change THEN
    RETURN NEW;
  END IF;

  IF public.is_owner_email(OLD.email) THEN
    RAISE EXCEPTION 'A conta owner nao pode ter status, funcao operacional ou atribuicao alterados.'
      USING ERRCODE = '42501';
  END IF;

  IF _actor_id IS NOT NULL AND OLD.id = _actor_id THEN
    RAISE EXCEPTION 'Voce nao pode alterar o proprio status ou atribuicao operacional.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.can_receive_leads THEN
    IF NEW.access_status <> 'active' THEN
      RAISE EXCEPTION 'Somente usuarios ativos podem receber leads.'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = OLD.id
        AND role IN ('admin', 'gestor', 'consultor')
    ) THEN
      RAISE EXCEPTION 'Apenas Admin, Gestor ou Consultor ativos podem receber leads.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _actor_id AND role = 'admin'
  ) INTO _actor_is_admin;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _actor_id AND role = 'gestor'
  ) INTO _actor_is_gestor;

  IF _actor_is_gestor AND NOT _actor_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = OLD.id AND role = 'admin'
    ) INTO _target_is_admin;

    IF _target_is_admin THEN
      RAISE EXCEPTION 'Gestores nao podem alterar administradores.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_role_changes ON public.user_roles;
CREATE TRIGGER trg_guard_user_role_changes
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_user_role_changes();

DROP TRIGGER IF EXISTS trg_guard_profile_access_updates ON public.profiles;
CREATE TRIGGER trg_guard_profile_access_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_access_updates();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_owner boolean := public.is_owner_email(NEW.email);
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    avatar_url,
    access_status,
    is_active,
    can_receive_leads
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN _is_owner THEN 'active'::public.user_access_status ELSE 'pending'::public.user_access_status END,
    _is_owner,
    _is_owner
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    access_status = CASE
      WHEN public.is_owner_email(EXCLUDED.email) THEN 'active'::public.user_access_status
      ELSE public.profiles.access_status
    END,
    is_active = CASE
      WHEN public.is_owner_email(EXCLUDED.email) THEN true
      ELSE public.profiles.is_active
    END,
    can_receive_leads = CASE
      WHEN public.is_owner_email(EXCLUDED.email) THEN true
      ELSE public.profiles.can_receive_leads
    END;

  IF _is_owner THEN
    DELETE FROM public.user_roles
    WHERE user_id = NEW.id
      AND role <> 'admin';

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Policies: pendentes so podem ver o proprio perfil; usuarios ativos mantem o acesso.
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);
CREATE POLICY "Active users can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.current_user_is_active());

DROP POLICY IF EXISTS "Authenticated users view roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Managers view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.current_user_can_manage_team());

DROP POLICY IF EXISTS "Admin/gestor update any profile" ON public.profiles;
CREATE POLICY "Admin/gestor update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.current_user_can_manage_team());

DROP POLICY IF EXISTS "Admin/gestor manage roles - insert" ON public.user_roles;
DROP POLICY IF EXISTS "Admin/gestor manage roles - update" ON public.user_roles;
DROP POLICY IF EXISTS "Admin/gestor manage roles - delete" ON public.user_roles;
CREATE POLICY "Admin/gestor manage roles - insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_manage_team());
CREATE POLICY "Admin/gestor manage roles - update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.current_user_can_manage_team());
CREATE POLICY "Admin/gestor manage roles - delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.current_user_can_manage_team());

DROP POLICY IF EXISTS "Authenticated read stages" ON public.pipeline_stages;
CREATE POLICY "Authenticated read stages" ON public.pipeline_stages
  FOR SELECT TO authenticated
  USING (public.current_user_is_active());
DROP POLICY IF EXISTS "Admins manage stages - insert" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Admins manage stages - update" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Admins manage stages - delete" ON public.pipeline_stages;
CREATE POLICY "Admins manage stages - insert" ON public.pipeline_stages
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_active() AND public.current_user_has_role('admin'));
CREATE POLICY "Admins manage stages - update" ON public.pipeline_stages
  FOR UPDATE TO authenticated
  USING (public.current_user_is_active() AND public.current_user_has_role('admin'));
CREATE POLICY "Admins manage stages - delete" ON public.pipeline_stages
  FOR DELETE TO authenticated
  USING (public.current_user_is_active() AND public.current_user_has_role('admin'));

DROP POLICY IF EXISTS "Leads select by role" ON public.leads;
DROP POLICY IF EXISTS "Leads insert by role" ON public.leads;
DROP POLICY IF EXISTS "Leads update by role" ON public.leads;
DROP POLICY IF EXISTS "Leads delete by role" ON public.leads;
CREATE POLICY "Leads select by role" ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_active()
    AND (
      public.current_user_has_any_role(ARRAY['admin','gestor','visualizador']::public.app_role[])
      OR (
        public.current_user_has_role('consultor')
        AND (owner_id = auth.uid() OR created_by = auth.uid())
      )
    )
  );
CREATE POLICY "Leads insert by role" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_active()
    AND (
      public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[])
      OR (
        public.current_user_has_role('consultor')
        AND (owner_id = auth.uid() OR owner_id IS NULL)
      )
    )
  );
CREATE POLICY "Leads update by role" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_active()
    AND (
      public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[])
      OR (
        public.current_user_has_role('consultor')
        AND (owner_id = auth.uid() OR created_by = auth.uid())
      )
    )
  );
CREATE POLICY "Leads delete by role" ON public.leads
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[])
  );

DROP POLICY IF EXISTS "Auth read notes" ON public.lead_notes;
DROP POLICY IF EXISTS "Auth insert notes" ON public.lead_notes;
DROP POLICY IF EXISTS "Auth update own notes" ON public.lead_notes;
DROP POLICY IF EXISTS "Auth delete own notes" ON public.lead_notes;
CREATE POLICY "Auth read notes" ON public.lead_notes
  FOR SELECT TO authenticated
  USING (public.current_user_is_active());
CREATE POLICY "Auth insert notes" ON public.lead_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_active() AND auth.uid() IS NOT NULL);
CREATE POLICY "Auth update own notes" ON public.lead_notes
  FOR UPDATE TO authenticated
  USING (public.current_user_is_active() AND (created_by = auth.uid() OR public.current_user_has_role('admin')));
CREATE POLICY "Auth delete own notes" ON public.lead_notes
  FOR DELETE TO authenticated
  USING (public.current_user_is_active() AND (created_by = auth.uid() OR public.current_user_has_role('admin')));

DROP POLICY IF EXISTS "Auth read activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Auth insert activities" ON public.lead_activities;
CREATE POLICY "Auth read activities" ON public.lead_activities
  FOR SELECT TO authenticated
  USING (public.current_user_is_active());
CREATE POLICY "Auth insert activities" ON public.lead_activities
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_active() AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Auth read attachments" ON public.lead_attachments;
DROP POLICY IF EXISTS "Auth insert attachments" ON public.lead_attachments;
DROP POLICY IF EXISTS "Auth delete own attachments" ON public.lead_attachments;
CREATE POLICY "Auth read attachments" ON public.lead_attachments
  FOR SELECT TO authenticated
  USING (public.current_user_is_active());
CREATE POLICY "Auth insert attachments" ON public.lead_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_active() AND auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete own attachments" ON public.lead_attachments
  FOR DELETE TO authenticated
  USING (public.current_user_is_active() AND (created_by = auth.uid() OR public.current_user_has_role('admin')));

DROP POLICY IF EXISTS "Auth read lead attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload lead attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete lead attachments" ON storage.objects;
CREATE POLICY "Auth read lead attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'lead-attachments' AND public.current_user_is_active());
CREATE POLICY "Auth upload lead attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-attachments' AND public.current_user_is_active());
CREATE POLICY "Auth delete lead attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'lead-attachments' AND public.current_user_is_active());

REVOKE EXECUTE ON FUNCTION public.current_user_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_can_manage_team() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_owner_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_assignable_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_user_status(uuid, public.user_access_status) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_owner_email(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_user_role_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_access_updates() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.current_user_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_assignable_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_status(uuid, public.user_access_status) TO authenticated;
