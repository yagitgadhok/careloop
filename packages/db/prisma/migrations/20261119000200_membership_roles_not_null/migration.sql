-- A CHECK that evaluates to NULL passes, so cardinality(roles) > 0 alone let
-- NULL roles through. Every membership must carry at least one role.
-- (A NOT NULL column constraint would make Prisma report drift, because the
-- schema models roles as Role[].)
ALTER TABLE public.membership
  DROP CONSTRAINT membership_roles_not_empty,
  ADD CONSTRAINT membership_roles_not_empty CHECK (roles IS NOT NULL AND cardinality(roles) > 0);
