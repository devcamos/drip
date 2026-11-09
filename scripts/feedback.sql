-- Private feedback inbox. Message text is readable to authorised database operators.
BEGIN;
CREATE TABLE IF NOT EXISTS drip_feedback (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('bug', 'improvement')),
  area text NOT NULL CHECK (area IN ('accounts', 'portfolio', 'credit', 'payments', 'signin', 'settings', 'other')),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drip_feedback_triage ON drip_feedback(status, created_at, id);
CREATE TABLE IF NOT EXISTS drip_feedback_limits (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0)
);
COMMIT;
