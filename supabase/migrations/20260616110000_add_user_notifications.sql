CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  href text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS user_notifications_recipient_created_idx
  ON public.user_notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_notifications_recipient_unread_idx
  ON public.user_notifications (recipient_user_id, read_at)
  WHERE read_at IS NULL;

DROP TRIGGER IF EXISTS user_notifications_updated_at ON public.user_notifications;
CREATE TRIGGER user_notifications_updated_at
BEFORE UPDATE ON public.user_notifications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "Users view own notifications" ON public.user_notifications;
CREATE POLICY "Users view own notifications" ON public.user_notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = recipient_user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.user_notifications;
CREATE POLICY "Users update own notifications" ON public.user_notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_user_id)
  WITH CHECK (auth.uid() = recipient_user_id);
