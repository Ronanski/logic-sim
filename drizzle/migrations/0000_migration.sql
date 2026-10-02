CREATE TABLE public.logic_diagrams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL DEFAULT 'Untitled diagram',
  description text,
  symbol_style text NOT NULL DEFAULT 'dcs' CHECK (symbol_style IN ('dcs','traditional','block')),
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  wires jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logic_diagrams TO authenticated;
GRANT ALL ON public.logic_diagrams TO service_role;
ALTER TABLE public.logic_diagrams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own diagrams select" ON public.logic_diagrams FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own diagrams insert" ON public.logic_diagrams FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own diagrams update" ON public.logic_diagrams FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own diagrams delete" ON public.logic_diagrams FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX logic_diagrams_user_updated ON public.logic_diagrams (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER logic_diagrams_touch BEFORE UPDATE ON public.logic_diagrams FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.logic_diagrams REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.logic_diagrams;

CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING; RETURN NEW; END; $$;
CREATE TRIGGER on_auth_user_created_role AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();