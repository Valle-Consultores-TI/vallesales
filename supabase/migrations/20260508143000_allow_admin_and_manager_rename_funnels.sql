-- Permite renomear funis por admin e gestor, mantendo criacao restrita a admin.

CREATE OR REPLACE FUNCTION public.rename_funnel(_funnel_id uuid, _name text)
RETURNS public.funnels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_name text := trim(coalesce(_name, ''));
  _result public.funnels;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_can_manage_team() THEN
    RAISE EXCEPTION 'Sem permissao para renomear funis.'
      USING ERRCODE = '42501';
  END IF;

  IF _clean_name = '' THEN
    RAISE EXCEPTION 'Informe o nome do funil.'
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

  IF EXISTS (
    SELECT 1
    FROM public.funnels
    WHERE lower(trim(name)) = lower(_clean_name)
      AND id <> _funnel_id
  ) THEN
    RAISE EXCEPTION 'Ja existe um funil com este nome.'
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.funnels
  SET name = _clean_name
  WHERE id = _funnel_id
  RETURNING * INTO _result;

  RETURN _result;
END;
$$;

DROP POLICY IF EXISTS "Admins update funnels" ON public.funnels;
CREATE POLICY "Managers update funnels" ON public.funnels
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_active()
    AND public.current_user_can_manage_team()
  );

REVOKE EXECUTE ON FUNCTION public.rename_funnel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_funnel(uuid, text) TO authenticated;
