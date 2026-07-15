DROP POLICY IF EXISTS "Leads select by role" ON public.leads;
CREATE POLICY "Leads select by role" ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_has_funnel_access(funnel_id)
    AND (
      entity_kind = 'customer_tracking'
      OR public.current_user_has_any_role(ARRAY['admin','gestor','visualizador']::public.app_role[])
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
      entity_kind = 'customer_tracking'
      OR public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[])
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
      entity_kind = 'customer_tracking'
      OR public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[])
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
    AND (
      entity_kind = 'customer_tracking'
      OR public.current_user_has_any_role(ARRAY['admin','gestor']::public.app_role[])
    )
  );
