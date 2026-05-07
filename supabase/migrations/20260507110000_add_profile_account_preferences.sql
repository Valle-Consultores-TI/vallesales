ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT jsonb_build_object(
    'new_leads', true,
    'contact_changes', true,
    'tasks', true,
    'funnel_updates', true,
    'team_updates', false
  );

UPDATE public.profiles
SET
  notification_preferences = COALESCE(
    notification_preferences,
    jsonb_build_object(
      'new_leads', true,
      'contact_changes', true,
      'tasks', true,
      'funnel_updates', true,
      'team_updates', false
    )
  );
