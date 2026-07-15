CREATE OR REPLACE FUNCTION public.current_user_can_access_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.current_user_is_active()
    AND EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = _lead_id
        AND public.user_has_funnel_access(auth.uid(), l.funnel_id)
        AND (
          l.entity_kind = 'customer_tracking'
          OR public.current_user_has_any_role(ARRAY['admin','gestor','visualizador']::public.app_role[])
          OR (
            public.current_user_has_role('consultor')
            AND (l.owner_id = auth.uid() OR l.created_by = auth.uid())
          )
        )
    )
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_access_lead(uuid) TO authenticated;
