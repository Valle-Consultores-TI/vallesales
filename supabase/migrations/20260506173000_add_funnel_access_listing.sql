-- Permite listar todos os funis com o indicador de acesso do usuario atual.
-- Isso suporta o seletor visual com opcoes bloqueadas sem enfraquecer o acesso aos dados.

CREATE OR REPLACE FUNCTION public.list_funnels_with_access()
RETURNS TABLE (
  id uuid,
  name text,
  is_default boolean,
  created_at timestamptz,
  updated_at timestamptz,
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
    public.user_has_funnel_access(auth.uid(), f.id) AS has_access
  FROM public.funnels f
  WHERE auth.uid() IS NOT NULL
    AND public.current_user_is_active()
  ORDER BY f.is_default DESC, f.name;
$$;

REVOKE EXECUTE ON FUNCTION public.list_funnels_with_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_funnels_with_access() TO authenticated;
