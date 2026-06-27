
CREATE TABLE public.access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  label TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  used_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_access_tokens_token ON public.access_tokens(token);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_tokens TO authenticated;
GRANT ALL ON public.access_tokens TO service_role;
ALTER TABLE public.access_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage access tokens" ON public.access_tokens
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
