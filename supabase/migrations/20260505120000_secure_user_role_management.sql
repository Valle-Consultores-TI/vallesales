-- Corrige o gerenciamento de usuários sem reabrir helpers genéricos via API.
-- As policies passam a usar funções do usuário autenticado, e a troca de role
-- acontece em uma RPC transacional com verificação explícita de admin/gestor.

CREATE OR REPLACE FUNCTION public.current_user_has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_any_role(_roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT is_active
      FROM public.profiles
      WHERE id = auth.uid()
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.set_user_role(_target_user_id uuid, _role public.app_role)
RETURNS public.user_roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result public.user_roles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.current_user_has_any_role(ARRAY['admin', 'gestor']::public.app_role[]) THEN
    RAISE EXCEPTION 'Sem permissão para alterar funções de usuários.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _target_user_id
    AND role <> _role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, _role)
  ON CONFLICT (user_id, role) DO UPDATE
  SET role = EXCLUDED.role
  RETURNING * INTO _result;

  RETURN _result;
END;
$$;

DROP POLICY IF EXISTS "Admin/gestor update any profile" ON public.profiles;
CREATE POLICY "Admin/gestor update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[]));

DROP POLICY IF EXISTS "Admin/gestor manage roles - insert" ON public.user_roles;
DROP POLICY IF EXISTS "Admin/gestor manage roles - update" ON public.user_roles;
DROP POLICY IF EXISTS "Admin/gestor manage roles - delete" ON public.user_roles;
CREATE POLICY "Admin/gestor manage roles - insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[]));
CREATE POLICY "Admin/gestor manage roles - update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[]));
CREATE POLICY "Admin/gestor manage roles - delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[]));

DROP POLICY IF EXISTS "Admins manage stages - insert" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Admins manage stages - update" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Admins manage stages - delete" ON public.pipeline_stages;
CREATE POLICY "Admins manage stages - insert" ON public.pipeline_stages
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_role('admin'));
CREATE POLICY "Admins manage stages - update" ON public.pipeline_stages
  FOR UPDATE TO authenticated
  USING (public.current_user_has_role('admin'));
CREATE POLICY "Admins manage stages - delete" ON public.pipeline_stages
  FOR DELETE TO authenticated
  USING (public.current_user_has_role('admin'));

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

DROP POLICY IF EXISTS "Auth update own notes" ON public.lead_notes;
DROP POLICY IF EXISTS "Auth delete own notes" ON public.lead_notes;
CREATE POLICY "Auth update own notes" ON public.lead_notes
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.current_user_has_role('admin'));
CREATE POLICY "Auth delete own notes" ON public.lead_notes
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.current_user_has_role('admin'));

DROP POLICY IF EXISTS "Auth delete own attachments" ON public.lead_attachments;
CREATE POLICY "Auth delete own attachments" ON public.lead_attachments
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.current_user_has_role('admin'));

REVOKE EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_has_any_role(public.app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_is_active() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, public.app_role) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_any_role(public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.app_role) TO authenticated;
