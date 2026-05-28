CREATE OR REPLACE FUNCTION public.archive_expired_terminal_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archive_expired_terminal_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_expired_terminal_leads() TO authenticated, service_role;

DO $$
DECLARE
  _job_id bigint;
BEGIN
  BEGIN
    SELECT jobid
    INTO _job_id
    FROM cron.job
    WHERE jobname = 'archive-expired-crm-leads'
    LIMIT 1;

    IF _job_id IS NOT NULL THEN
      PERFORM cron.unschedule(_job_id);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Agendamento via pg_cron nao configurado; nenhuma rotina automatica foi removida.';
  END;
END;
$$;
