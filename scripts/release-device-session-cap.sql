-- RELEASE-ONLY: review and authorize the intended database before executing.
-- Run after the new code is deployed and retired deployments cannot create
-- Production sessions. Keeps the two newest unexpired sign-ins per account.
-- This signs out older sessions; it never changes vaults or financial records.
BEGIN;
LOCK TABLE "session" IN SHARE ROW EXCLUSIVE MODE;
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY "userId" ORDER BY "createdAt" DESC, id DESC
  ) AS position
  FROM "session" WHERE "expiresAt" > now()
)
DELETE FROM "session" USING ranked
WHERE "session".id = ranked.id AND ranked.position > 2;
COMMIT;
