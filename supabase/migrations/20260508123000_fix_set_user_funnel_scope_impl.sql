-- Corrige a funcao interna para usar apenas a lista de funis recebida,
-- sem referenciar o parametro legado _funnel_id.

CREATE OR REPLACE FUNCTION public.set_user_funnel_scope_impl(
  _target_user_id uuid,
  _has_all_funnel_access boolean,
  _funnel_ids uuid[] DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result public.profiles;
  _target_email text;
  _normalized_funnel_ids uuid[] := ARRAY(
    SELECT DISTINCT funnel_id
    FROM unnest(
      coalesce(_funnel_ids, ARRAY[]::uuid[])
    ) AS selected_funnels(funnel_id)
    WHERE funnel_id IS NOT NULL
  );
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
    IF coalesce(array_length(_normalized_funnel_ids, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Selecione ao menos um funil para acesso restrito.'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(_normalized_funnel_ids) AS selected_funnels(funnel_id)
      LEFT JOIN public.funnels f
        ON f.id = selected_funnels.funnel_id
      WHERE f.id IS NULL
    ) THEN
      RAISE EXCEPTION 'Um ou mais funis selecionados nao foram encontrados.'
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
    SELECT _target_user_id, selected_funnels.funnel_id
    FROM unnest(_normalized_funnel_ids) AS selected_funnels(funnel_id)
    ON CONFLICT (user_id, funnel_id) DO NOTHING;
  END IF;

  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_funnel_scope_impl(uuid, boolean, uuid[]) FROM PUBLIC, anon;
