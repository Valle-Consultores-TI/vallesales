DO $$
DECLARE
  tracking_lead record;
BEGIN
  FOR tracking_lead IN
    SELECT id
    FROM public.leads
    WHERE entity_kind = 'customer_tracking'
  LOOP
    PERFORM public.upsert_project_tracking_from_customer_lead(
      tracking_lead.id,
      'system',
      NULL
    );
  END LOOP;
END
$$;
