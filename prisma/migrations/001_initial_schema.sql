-- =============================================================
-- ExpenseDesk AI — Initial Database Migration
-- Migration: 001_initial_schema
-- Generated: 2026-07-09
-- Database: PostgreSQL 15+
-- =============================================================

-- Enable UUID generation via pgcrypto
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- ENUMS
-- =============================================================

CREATE TYPE user_role AS ENUM (
  'EMPLOYEE',
  'MANAGER',
  'FINANCE'
);

CREATE TYPE account_type AS ENUM (
  'CHECKING',
  'SAVINGS',
  'CREDIT',
  'CASH',
  'INVESTMENT',
  'OTHER'
);

CREATE TYPE category_type AS ENUM (
  'INCOME',
  'EXPENSE'
);

CREATE TYPE transaction_type AS ENUM (
  'INCOME',
  'EXPENSE',
  'TRANSFER'
);

-- Workflow state machine:
-- DRAFT -> PENDING -> APPROVED -> REIMBURSED
--                 \> REJECTED -> DRAFT (retract)
CREATE TYPE transaction_status AS ENUM (
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REIMBURSED'
);

CREATE TYPE budget_period AS ENUM (
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
  'CUSTOM'
);

CREATE TYPE goal_status AS ENUM (
  'ACTIVE',
  'COMPLETED',
  'ARCHIVED'
);

CREATE TYPE notification_type AS ENUM (
  'EXPENSE_SUBMITTED',
  'EXPENSE_APPROVED',
  'EXPENSE_REJECTED',
  'EXPENSE_REIMBURSED',
  'BUDGET_ALERT',
  'BUDGET_EXCEEDED',
  'GOAL_REACHED',
  'GOAL_REMINDER',
  'SYSTEM'
);

-- =============================================================
-- TABLE: users
-- =============================================================
-- SERVER-GENERATED : id, password_hash, role, failed_login_count,
--                    locked_until, email_verified, email_verified_at,
--                    is_active, created_at, updated_at
-- CLIENT-SUBMITTED : email (register), name, avatar_url, currency
-- =============================================================

CREATE TABLE users (
  id                  TEXT          NOT NULL DEFAULT gen_random_uuid()::TEXT,
  email               VARCHAR(255)  NOT NULL,
  name                VARCHAR(100)  NOT NULL,
  password_hash       TEXT          NOT NULL,
  role                user_role     NOT NULL DEFAULT 'EMPLOYEE',
  avatar_url          TEXT,
  currency            VARCHAR(10)   NOT NULL DEFAULT 'INR',
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  email_verified      BOOLEAN       NOT NULL DEFAULT FALSE,
  email_verified_at   TIMESTAMPTZ,
  failed_login_count  INT           NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT users_pkey             PRIMARY KEY (id),
  CONSTRAINT users_email_unique     UNIQUE (email),
  CONSTRAINT users_email_format     CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT users_name_not_empty   CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT users_login_count_nneg CHECK (failed_login_count >= 0)
);

CREATE INDEX idx_users_role      ON users (role);
CREATE INDEX idx_users_is_active ON users (is_active) WHERE is_active = TRUE;

COMMENT ON TABLE  users                    IS 'Application users. Role is admin-assigned only.';
COMMENT ON COLUMN users.password_hash      IS 'bcrypt hash — never returned in API responses';
COMMENT ON COLUMN users.role               IS 'EMPLOYEE | MANAGER | FINANCE — never trusted from client body';
COMMENT ON COLUMN users.failed_login_count IS 'Consecutive failed logins; reset to 0 on success';
COMMENT ON COLUMN users.locked_until       IS 'Lockout expiry; NULL means account is not locked';

-- =============================================================
-- TABLE: accounts
-- =============================================================
-- Financial accounts owned by a user (bank, credit, cash, etc.)
-- balance: stored in smallest currency unit (paise/cents) per plan A4
-- =============================================================

CREATE TABLE accounts (
  id          TEXT          NOT NULL DEFAULT gen_random_uuid()::TEXT,
  user_id     TEXT          NOT NULL,
  name        VARCHAR(100)  NOT NULL,
  type        account_type  NOT NULL,
  balance     BIGINT        NOT NULL DEFAULT 0,
  currency    VARCHAR(10)   NOT NULL DEFAULT 'INR',
  color       VARCHAR(7),
  icon        VARCHAR(50),
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT accounts_pkey         PRIMARY KEY (id),
  CONSTRAINT accounts_user_fkey    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT accounts_color_hex    CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT accounts_name_nonempty CHECK (LENGTH(TRIM(name)) > 0)
);

CREATE INDEX idx_accounts_user_id    ON accounts (user_id);
CREATE INDEX idx_accounts_user_active ON accounts (user_id) WHERE is_active = TRUE;
CREATE INDEX idx_accounts_type        ON accounts (type);

COMMENT ON COLUMN accounts.balance IS 'Smallest currency unit (paise/cents). ₹100.50 = 10050';

-- =============================================================
-- TABLE: categories
-- =============================================================
-- user_id = NULL  -> system-seeded default category
-- user_id = value -> user-defined custom category
-- NULLABLE NOTE: none. All required fields are NOT NULL.
-- =============================================================

CREATE TABLE categories (
  id          TEXT          NOT NULL DEFAULT gen_random_uuid()::TEXT,
  user_id     TEXT,
  name        VARCHAR(80)   NOT NULL,
  type        category_type NOT NULL,
  icon        VARCHAR(50),
  color       VARCHAR(7),
  is_default  BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT categories_pkey          PRIMARY KEY (id),
  CONSTRAINT categories_user_fkey     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT categories_color_hex     CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT categories_name_nonempty CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT categories_default_check CHECK (NOT (is_default = TRUE AND user_id IS NOT NULL))
);

-- Custom categories: unique name per user (case-insensitive)
CREATE UNIQUE INDEX idx_categories_user_name_unique
  ON categories (user_id, LOWER(name))
  WHERE user_id IS NOT NULL;

CREATE INDEX idx_categories_user_id   ON categories (user_id);
CREATE INDEX idx_categories_defaults  ON categories (is_default) WHERE is_default = TRUE;
CREATE INDEX idx_categories_type      ON categories (type);

COMMENT ON COLUMN categories.user_id   IS 'NULL = system default; non-null = user custom category';
COMMENT ON COLUMN categories.is_default IS 'Only seeded categories; cannot be true for user-owned rows';

-- =============================================================
-- TABLE: transactions
-- =============================================================
-- Central table for both personal finance (default status=APPROVED)
-- and the expense approval workflow (starts DRAFT->PENDING).
--
-- NULLABLE FIELD FLAGS (fields that SHOULD be NOT NULL):
--   category_id     -- Should be required; use Uncategorized default
--                      category on category deletion instead of SET NULL
--   receipt_mime_type -- Must be set whenever receipt_url is set;
--                        enforce at application layer
--
-- AI field separation:
--   ai_raw_* = frozen at extraction, never updated, never authoritative
--   vendor/amount/date/category = employee-confirmed, authoritative
-- =============================================================

CREATE TABLE transactions (
  id                      TEXT                NOT NULL DEFAULT gen_random_uuid()::TEXT,
  user_id                 TEXT                NOT NULL,
  account_id              TEXT                NOT NULL,
  category_id             TEXT,                                -- NULLABLE: SHOULD BE NOT NULL (see flags)
  type                    transaction_type    NOT NULL,
  amount                  BIGINT              NOT NULL,
  currency                VARCHAR(10)         NOT NULL DEFAULT 'INR',
  description             VARCHAR(255)        NOT NULL,
  notes                   TEXT,
  transaction_date        DATE                NOT NULL,
  tags                    TEXT[]              NOT NULL DEFAULT '{}',

  -- Transfer target (only set when type = 'TRANSFER')
  transfer_to_account_id  TEXT,

  -- Receipt (set server-side after upload)
  receipt_url             TEXT,
  receipt_hash            VARCHAR(64),                        -- SHA-256 hex
  receipt_mime_type       VARCHAR(50),                        -- NULLABLE: SHOULD be set with receipt_url

  -- AI-SUGGESTED fields — immutable after initial extraction
  -- These are NEVER authoritative; stored for audit only
  ai_raw_vendor           VARCHAR(200),
  ai_raw_amount           BIGINT,
  ai_raw_date             DATE,
  ai_raw_category         VARCHAR(80),
  ai_confidence           FLOAT,                              -- 0.0 to 1.0
  ai_extraction_raw       JSONB,                              -- full Claude JSON response

  -- Approval workflow (server-controlled)
  status                  transaction_status  NOT NULL DEFAULT 'APPROVED',
  submitted_at            TIMESTAMPTZ,

  -- Recurring
  is_recurring            BOOLEAN             NOT NULL DEFAULT FALSE,

  -- Soft delete
  is_deleted              BOOLEAN             NOT NULL DEFAULT FALSE,
  deleted_at              TIMESTAMPTZ,

  created_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT transactions_pkey              PRIMARY KEY (id),
  CONSTRAINT transactions_user_fkey         FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT transactions_account_fkey      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CONSTRAINT transactions_category_fkey     FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT transactions_transfer_fkey     FOREIGN KEY (transfer_to_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CONSTRAINT transactions_amount_positive   CHECK (amount > 0),
  CONSTRAINT transactions_confidence_range  CHECK (ai_confidence IS NULL OR (ai_confidence >= 0.0 AND ai_confidence <= 1.0)),

  -- Transfer consistency: transfer type <=> target account set
  CONSTRAINT transactions_transfer_target   CHECK (
    (type = 'TRANSFER' AND transfer_to_account_id IS NOT NULL) OR
    (type <> 'TRANSFER' AND transfer_to_account_id IS NULL)
  ),

  -- Cannot transfer to the same account
  CONSTRAINT transactions_no_self_transfer  CHECK (account_id <> transfer_to_account_id),

  -- submitted_at must be set for all non-DRAFT statuses
  CONSTRAINT transactions_submitted_at_set  CHECK (
    (status IN ('PENDING', 'APPROVED', 'REJECTED', 'REIMBURSED') AND submitted_at IS NOT NULL) OR
    (status = 'DRAFT')
  ),

  -- Soft delete consistency
  CONSTRAINT transactions_delete_consistent CHECK (
    (is_deleted = TRUE  AND deleted_at IS NOT NULL) OR
    (is_deleted = FALSE AND deleted_at IS NULL)
  )
);

-- Duplicate receipt guard
CREATE UNIQUE INDEX idx_transactions_receipt_hash
  ON transactions (receipt_hash)
  WHERE receipt_hash IS NOT NULL;

-- Core query patterns
CREATE INDEX idx_transactions_user_date     ON transactions (user_id, transaction_date DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_transactions_user_category ON transactions (user_id, category_id)           WHERE is_deleted = FALSE;
CREATE INDEX idx_transactions_user_account  ON transactions (user_id, account_id)            WHERE is_deleted = FALSE;
CREATE INDEX idx_transactions_user_status   ON transactions (user_id, status)                WHERE is_deleted = FALSE;
CREATE INDEX idx_transactions_user_type     ON transactions (user_id, type)                  WHERE is_deleted = FALSE;

-- Full-text search on description + notes
CREATE INDEX idx_transactions_fts
  ON transactions
  USING GIN (to_tsvector('english', description || ' ' || COALESCE(notes, '')));

COMMENT ON COLUMN transactions.amount           IS 'Always positive. Smallest currency unit. ₹100.50 = 10050';
COMMENT ON COLUMN transactions.category_id      IS 'NULLABLE: Should be NOT NULL. Use Uncategorized category on delete instead of SET NULL';
COMMENT ON COLUMN transactions.receipt_mime_type IS 'NULLABLE: Must be set whenever receipt_url is set — enforce at app layer';
COMMENT ON COLUMN transactions.ai_raw_vendor    IS 'AI-SUGGESTED. Frozen at extraction. Never authoritative.';
COMMENT ON COLUMN transactions.ai_raw_amount    IS 'AI-SUGGESTED. Frozen at extraction. Never authoritative.';
COMMENT ON COLUMN transactions.ai_raw_date      IS 'AI-SUGGESTED. Frozen at extraction. Never authoritative.';
COMMENT ON COLUMN transactions.ai_raw_category  IS 'AI-SUGGESTED. Frozen at extraction. Never authoritative.';
COMMENT ON COLUMN transactions.ai_extraction_raw IS 'Full Claude Vision API JSON response — stored for audit and debugging';
COMMENT ON COLUMN transactions.status           IS 'Server-controlled state machine. Never accepted from client body.';

-- =============================================================
-- TABLE: budgets
-- =============================================================
-- NULLABLE FIELD FLAGS:
--   name -- SHOULD BE NOT NULL; required for user-facing identification
-- =============================================================

CREATE TABLE budgets (
  id              TEXT          NOT NULL DEFAULT gen_random_uuid()::TEXT,
  user_id         TEXT          NOT NULL,
  category_id     TEXT          NOT NULL,
  name            VARCHAR(100),                               -- NULLABLE: SHOULD BE NOT NULL
  limit_amount    BIGINT        NOT NULL,
  period          budget_period NOT NULL,
  period_start    DATE          NOT NULL,
  period_end      DATE          NOT NULL,
  rollover        BOOLEAN       NOT NULL DEFAULT FALSE,
  alert_at_percent INT          NOT NULL DEFAULT 80,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT budgets_pkey             PRIMARY KEY (id),
  CONSTRAINT budgets_user_fkey        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT budgets_category_fkey    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT budgets_limit_positive   CHECK (limit_amount > 0),
  CONSTRAINT budgets_period_order     CHECK (period_end > period_start),
  CONSTRAINT budgets_alert_range      CHECK (alert_at_percent > 0 AND alert_at_percent <= 100)
);

-- One active budget per category per period start date
CREATE UNIQUE INDEX idx_budgets_unique_active
  ON budgets (user_id, category_id, period_start)
  WHERE is_active = TRUE;

CREATE INDEX idx_budgets_user_id    ON budgets (user_id);
CREATE INDEX idx_budgets_user_active ON budgets (user_id, is_active);
CREATE INDEX idx_budgets_category   ON budgets (category_id);
CREATE INDEX idx_budgets_period     ON budgets (period_start, period_end);

COMMENT ON COLUMN budgets.name              IS 'NULLABLE: Should be NOT NULL. Required for user-facing identification';
COMMENT ON COLUMN budgets.limit_amount      IS 'Smallest currency unit (paise/cents)';
COMMENT ON COLUMN budgets.alert_at_percent  IS 'Percentage at which budget alert notification fires (default 80%)';

-- =============================================================
-- TABLE: goals
-- =============================================================
-- NULLABLE FIELD FLAGS:
--   target_date -- SHOULD BE NOT NULL; projections impossible without it
--   account_id  -- SHOULD BE NOT NULL if account-balance tracking in scope
-- =============================================================

CREATE TABLE goals (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  user_id         TEXT        NOT NULL,
  account_id      TEXT,                                       -- NULLABLE: SHOULD BE NOT NULL
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  target_amount   BIGINT      NOT NULL,
  current_amount  BIGINT      NOT NULL DEFAULT 0,
  target_date     DATE,                                       -- NULLABLE: SHOULD BE NOT NULL
  icon            VARCHAR(50),
  color           VARCHAR(7),
  status          goal_status NOT NULL DEFAULT 'ACTIVE',
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT goals_pkey               PRIMARY KEY (id),
  CONSTRAINT goals_user_fkey          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT goals_account_fkey       FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  CONSTRAINT goals_target_positive    CHECK (target_amount > 0),
  CONSTRAINT goals_current_non_neg    CHECK (current_amount >= 0),
  CONSTRAINT goals_current_lte_target CHECK (current_amount <= target_amount),
  CONSTRAINT goals_color_hex          CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT goals_completed_at_set   CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL) OR
    (status <> 'COMPLETED' AND completed_at IS NULL)
  )
);

CREATE INDEX idx_goals_user_id     ON goals (user_id);
CREATE INDEX idx_goals_user_status ON goals (user_id, status);
CREATE INDEX idx_goals_target_date ON goals (target_date) WHERE status = 'ACTIVE';

COMMENT ON COLUMN goals.target_date   IS 'NULLABLE: SHOULD BE NOT NULL. Projected completion date impossible without it';
COMMENT ON COLUMN goals.account_id    IS 'NULLABLE: SHOULD BE NOT NULL if account-balance tracking is in scope';
COMMENT ON COLUMN goals.target_amount IS 'Smallest currency unit (paise/cents)';
COMMENT ON COLUMN goals.current_amount IS 'Smallest currency unit. Updated by contribution events server-side.';

-- =============================================================
-- TABLE: notifications
-- =============================================================
-- In-app only for MVP. Email delivery layer can be added later.
-- NULLABLE FIELD FLAGS:
--   entity_id -- logically always paired with entity_type;
--                enforce as a pair at application layer
-- =============================================================

CREATE TABLE notifications (
  id          TEXT                NOT NULL DEFAULT gen_random_uuid()::TEXT,
  user_id     TEXT                NOT NULL,
  type        notification_type   NOT NULL,
  title       VARCHAR(200)        NOT NULL,
  message     TEXT                NOT NULL,
  entity_type VARCHAR(50),
  entity_id   TEXT,                                           -- NULLABLE: SHOULD always be set with entity_type
  is_read     BOOLEAN             NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT notifications_pkey           PRIMARY KEY (id),
  CONSTRAINT notifications_user_fkey      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT notifications_read_consistent CHECK (
    (is_read = TRUE  AND read_at IS NOT NULL) OR
    (is_read = FALSE AND read_at IS NULL)
  ),
  CONSTRAINT notifications_entity_pair    CHECK (
    (entity_type IS NULL AND entity_id IS NULL) OR
    (entity_type IS NOT NULL AND entity_id IS NOT NULL)
  )
);

CREATE INDEX idx_notifications_user_id      ON notifications (user_id);
CREATE INDEX idx_notifications_user_unread  ON notifications (user_id, created_at DESC) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_entity       ON notifications (entity_type, entity_id) WHERE entity_id IS NOT NULL;

COMMENT ON COLUMN notifications.entity_id IS 'NULLABLE: SHOULD always be set when entity_type is set — enforce at app layer';

-- =============================================================
-- TABLE: activity_logs
-- =============================================================
-- Immutable audit trail — INSERT only, never UPDATE or DELETE.
-- user_id is nullable for system-initiated actions (cron jobs,
-- automated state transitions, etc.).
-- =============================================================

CREATE TABLE activity_logs (
  id            TEXT          NOT NULL DEFAULT gen_random_uuid()::TEXT,
  user_id       TEXT,
  action        VARCHAR(100)  NOT NULL,
  resource_type VARCHAR(50),
  resource_id   TEXT,
  old_values    JSONB,
  new_values    JSONB,
  ip_address    INET,
  user_agent    TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT activity_logs_pkey      PRIMARY KEY (id),
  CONSTRAINT activity_logs_user_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_activity_logs_user_id   ON activity_logs (user_id);
CREATE INDEX idx_activity_logs_resource  ON activity_logs (resource_type, resource_id);
CREATE INDEX idx_activity_logs_action    ON activity_logs (action);
CREATE INDEX idx_activity_logs_created   ON activity_logs (created_at DESC);

COMMENT ON TABLE  activity_logs          IS 'Immutable audit trail — INSERT only';
COMMENT ON COLUMN activity_logs.user_id  IS 'NULL for system/cron actions';
COMMENT ON COLUMN activity_logs.old_values IS 'JSON snapshot of record BEFORE update. NULL for CREATE actions';
COMMENT ON COLUMN activity_logs.new_values IS 'JSON snapshot of record AFTER update. NULL for DELETE actions';

-- =============================================================
-- TRIGGERS: auto-update updated_at columns
-- =============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================
-- SEED: system-default categories
-- =============================================================

INSERT INTO categories (id, user_id, name, type, icon, color, is_default) VALUES
  -- EXPENSE defaults
  (gen_random_uuid()::TEXT, NULL, 'Food & Dining',     'EXPENSE', '🍔', '#F59E0B', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Transportation',    'EXPENSE', '🚗', '#3B82F6', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Utilities',         'EXPENSE', '💡', '#8B5CF6', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Rent & Housing',    'EXPENSE', '🏠', '#EC4899', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Healthcare',        'EXPENSE', '🏥', '#EF4444', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Entertainment',     'EXPENSE', '🎬', '#06B6D4', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Shopping',          'EXPENSE', '🛒', '#F97316', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Education',         'EXPENSE', '📚', '#10B981', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Travel',            'EXPENSE', '✈️', '#0EA5E9', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Personal Care',     'EXPENSE', '💅', '#A855F7', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Subscriptions',     'EXPENSE', '📱', '#64748B', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Insurance',         'EXPENSE', '🛡️', '#78716C', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Uncategorized',     'EXPENSE', '📦', '#6B7280', TRUE),
  -- INCOME defaults
  (gen_random_uuid()::TEXT, NULL, 'Salary',            'INCOME',  '💼', '#22C55E', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Freelance',         'INCOME',  '💻', '#84CC16', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Investment Returns','INCOME',  '📈', '#16A34A', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Rental Income',     'INCOME',  '🏘️', '#15803D', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Gift',              'INCOME',  '🎁', '#D97706', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Refund',            'INCOME',  '↩️', '#0891B2', TRUE),
  (gen_random_uuid()::TEXT, NULL, 'Other Income',      'INCOME',  '💰', '#166534', TRUE);
