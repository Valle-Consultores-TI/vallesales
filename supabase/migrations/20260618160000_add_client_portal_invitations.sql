CREATE TABLE IF NOT EXISTS public.client_portal_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_tracking_lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  email text NOT NULL,
  email_normalized text NOT NULL,
  full_name text,
  document_number text,
  document_number_normalized text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  CONSTRAINT client_portal_invitations_token_hash_key
    UNIQUE (token_hash)
);

ALTER TABLE public.client_portal_invitations ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS client_portal_invitations_pending_lead_idx
  ON public.client_portal_invitations (customer_tracking_lead_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS client_portal_invitations_email_idx
  ON public.client_portal_invitations (email_normalized, status, created_at DESC);

CREATE INDEX IF NOT EXISTS client_portal_invitations_status_idx
  ON public.client_portal_invitations (status, expires_at, created_at DESC);

CREATE TRIGGER client_portal_invitations_updated_at
BEFORE UPDATE ON public.client_portal_invitations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.client_portal_invitation_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.client_portal_invitations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.project_tracking_projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_invitation_projects_unique
    UNIQUE (invitation_id, project_id)
);

ALTER TABLE public.client_portal_invitation_projects ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS client_portal_invitation_projects_project_idx
  ON public.client_portal_invitation_projects (project_id, invitation_id);

COMMENT ON TABLE public.client_portal_invitations IS
  'Convites de ativacao do portal do cliente, podendo incluir um ou mais projetos antes do primeiro acesso.';

COMMENT ON TABLE public.client_portal_invitation_projects IS
  'Projetos liberados por um convite do portal do cliente.';
