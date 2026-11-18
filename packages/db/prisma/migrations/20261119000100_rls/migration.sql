-- Row-level security, roles' privileges, cross-organisation lookups and
-- append-only audit tables. Hand-written: Prisma does not model any of this.
-- Runs as careloop_owner (created by `pnpm db:bootstrap`).

CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Tenant context
-- ---------------------------------------------------------------------------

-- The organisation the current transaction acts for, set with
-- set_config('app.organisation_id', <uuid>, true). A pooled connection returns
-- '' once a transaction-local setting has been used, hence NULLIF.
CREATE FUNCTION app.current_org() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.organisation_id', true), '')::uuid $$;

-- One place that enables and forces RLS with the standard tenant policy, so
-- every tenant table, now and in later migrations, gets identical rules.
CREATE FUNCTION app.enable_tenant_rls(tbl regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s
       USING (organisation_id = (SELECT app.current_org()))
       WITH CHECK (organisation_id = (SELECT app.current_org()))',
    tbl
  );
END
$$;

SELECT app.enable_tenant_rls('public.location');
SELECT app.enable_tenant_rls('public.department');
SELECT app.enable_tenant_rls('public.membership');
SELECT app.enable_tenant_rls('public.audit_log');

-- Organisation has no organisation_id column; its policy is on its own id.
-- Creating an organisation means setting the context to the new id first.
ALTER TABLE public.organisation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation FORCE ROW LEVEL SECURITY;
CREATE POLICY organisation_self ON public.organisation
  USING (id = (SELECT app.current_org()))
  WITH CHECK (id = (SELECT app.current_org()));

-- ---------------------------------------------------------------------------
-- Cross-organisation membership lookup (sign-in, clinic picker, refresh)
-- ---------------------------------------------------------------------------

-- Forced RLS applies to table owners too, so the definer function below needs
-- a read-only policy for careloop_owner. Nothing connects as careloop_owner at
-- runtime; the application only reaches these rows through the function.
CREATE POLICY owner_read ON public.membership FOR SELECT TO careloop_owner USING (true);
CREATE POLICY owner_read ON public.organisation FOR SELECT TO careloop_owner USING (true);

CREATE FUNCTION app.user_memberships(p_user_id uuid)
  RETURNS TABLE (
    organisation_id uuid,
    organisation_name text,
    organisation_status organisation_status,
    roles role[],
    status membership_status
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT m.organisation_id, o.name, o.status, m.roles, m.status
    FROM public.membership m
    JOIN public.organisation o ON o.id = m.organisation_id
    WHERE m.user_id = p_user_id
    ORDER BY o.name
  $$;

-- ---------------------------------------------------------------------------
-- Membership integrity
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.roles_are_distinct(r role[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT cardinality(r) = (SELECT count(DISTINCT x) FROM unnest(r) AS x) $$;

ALTER TABLE public.membership
  ADD CONSTRAINT membership_roles_not_empty CHECK (cardinality(roles) > 0),
  ADD CONSTRAINT membership_roles_distinct CHECK (app.roles_are_distinct(roles));

-- ---------------------------------------------------------------------------
-- Append-only audit and security events
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.forbid_modification() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  -- The owner role may modify rows, for future retention jobs.
  IF current_user = 'careloop_owner' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION app.forbid_modification();
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_modification();
CREATE TRIGGER security_event_append_only
  BEFORE UPDATE OR DELETE ON public.security_event
  FOR EACH ROW EXECUTE FUNCTION app.forbid_modification();
CREATE TRIGGER security_event_no_truncate
  BEFORE TRUNCATE ON public.security_event
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_modification();

-- ---------------------------------------------------------------------------
-- Privileges for the application role
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO careloop_app;
GRANT USAGE ON SCHEMA app TO careloop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO careloop_app;
-- Tables added by later migrations are usable without a per-table grant.
ALTER DEFAULT PRIVILEGES FOR ROLE careloop_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO careloop_app;

-- Prisma's bookkeeping table is absent when migrations replay into a shadow database.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON public._prisma_migrations FROM careloop_app;
  END IF;
END
$$;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM careloop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON public.security_event FROM careloop_app;

REVOKE ALL ON FUNCTION app.user_memberships(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_org() TO careloop_app;
GRANT EXECUTE ON FUNCTION app.user_memberships(uuid) TO careloop_app;
GRANT EXECUTE ON FUNCTION app.roles_are_distinct(role[]) TO careloop_app;
