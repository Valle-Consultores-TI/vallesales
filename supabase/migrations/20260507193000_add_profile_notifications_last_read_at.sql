ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notifications_last_read_at timestamptz;
