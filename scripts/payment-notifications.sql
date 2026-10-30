-- Additive, opt-in phone reminders. Review/apply explicitly, on Preview first.
-- No financial vault, password, recovery-code or auth-session schema changes.
BEGIN;
-- These two owner/action rows survive subscription deletion, transport rotation
-- and expired endpoints. They contain no notification address or financial data.
CREATE TABLE IF NOT EXISTS drip_push_rate_limits (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('update', 'test')),
  window_started_at timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  PRIMARY KEY (user_id, action)
);
CREATE TABLE IF NOT EXISTS drip_push_subscriptions (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  endpoint_hash text NOT NULL UNIQUE,
  envelope jsonb NOT NULL,
  schedule jsonb NOT NULL,
  next_due_day date,
  last_sent_day date,
  lease_token uuid,
  lease_until timestamptz,
  revision integer NOT NULL DEFAULT 0,
  rate_bucket timestamptz NOT NULL,
  rate_hits integer NOT NULL DEFAULT 1,
  last_test_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id),
  CHECK (jsonb_typeof(schedule) = 'object'),
  CHECK (jsonb_typeof(envelope) = 'object')
);
CREATE INDEX IF NOT EXISTS drip_push_due ON drip_push_subscriptions(next_due_day, id);
COMMIT;
