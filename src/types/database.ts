// =============================================================
// ExpenseDesk AI — TypeScript Database Types
// Generated: 2026-07-09
// These types mirror the Prisma schema exactly.
// Monetary amounts are stored as bigint (smallest currency unit).
// Helper types for display are at the bottom of this file.
// =============================================================

// =============================================================
// ENUMS
// =============================================================

export enum Role {
  EMPLOYEE = 'EMPLOYEE',
  MANAGER  = 'MANAGER',
  FINANCE  = 'FINANCE',
}

export enum AccountType {
  CHECKING   = 'CHECKING',
  SAVINGS    = 'SAVINGS',
  CREDIT     = 'CREDIT',
  CASH       = 'CASH',
  INVESTMENT = 'INVESTMENT',
  OTHER      = 'OTHER',
}

export enum CategoryType {
  INCOME  = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum TransactionType {
  INCOME   = 'INCOME',
  EXPENSE  = 'EXPENSE',
  TRANSFER = 'TRANSFER',
}

/** State machine: DRAFT -> PENDING -> APPROVED -> REIMBURSED
 *                              \-> REJECTED -> DRAFT (retract)  */
export enum TransactionStatus {
  DRAFT       = 'DRAFT',
  PENDING     = 'PENDING',
  APPROVED    = 'APPROVED',
  REJECTED    = 'REJECTED',
  REIMBURSED  = 'REIMBURSED',
}

export enum BudgetPeriod {
  WEEKLY  = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY  = 'YEARLY',
  CUSTOM  = 'CUSTOM',
}

export enum GoalStatus {
  ACTIVE    = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED  = 'ARCHIVED',
}

export enum NotificationType {
  EXPENSE_SUBMITTED  = 'EXPENSE_SUBMITTED',
  EXPENSE_APPROVED   = 'EXPENSE_APPROVED',
  EXPENSE_REJECTED   = 'EXPENSE_REJECTED',
  EXPENSE_REIMBURSED = 'EXPENSE_REIMBURSED',
  BUDGET_ALERT       = 'BUDGET_ALERT',
  BUDGET_EXCEEDED    = 'BUDGET_EXCEEDED',
  GOAL_REACHED       = 'GOAL_REACHED',
  GOAL_REMINDER      = 'GOAL_REMINDER',
  SYSTEM             = 'SYSTEM',
}

// =============================================================
// BASE MODELS (mirror DB rows exactly)
// =============================================================

/**
 * User row.
 * passwordHash is omitted from all API responses via server projection.
 */
export interface User {
  /** cuid() — SERVER-GENERATED */
  id: string
  /** Unique email — CLIENT on register */
  email: string
  /** Display name — CLIENT */
  name: string
  /** bcrypt hash — SERVER-GENERATED; NEVER returned in API responses */
  passwordHash: string
  /** SERVER-GENERATED — admin-assigned only; never trusted from client body */
  role: Role
  /** CLIENT — profile photo URL set server-side after upload */
  avatarUrl: string | null
  /** CLIENT — ISO 4217 currency code, default 'INR' */
  currency: string
  /** SERVER-GENERATED */
  isActive: boolean
  /** SERVER-GENERATED */
  emailVerified: boolean
  /** SERVER-GENERATED */
  emailVerifiedAt: Date | null
  /** SERVER-GENERATED — consecutive failed logins; reset on success */
  failedLoginCount: number
  /** SERVER-GENERATED — null means not locked */
  lockedUntil: Date | null
  createdAt: Date
  updatedAt: Date
}

/** User without sensitive fields — safe to return from API */
export type PublicUser = Omit<User, 'passwordHash' | 'failedLoginCount' | 'lockedUntil'>

// -------------------------------------------------------------

/**
 * Account row.
 * balance is stored in smallest currency unit (paise/cents).
 */
export interface Account {
  /** cuid() — SERVER-GENERATED */
  id: string
  /** SERVER-GENERATED — session.user.id */
  userId: string
  /** CLIENT — e.g. "HDFC Savings", "ICICI Credit Card" */
  name: string
  /** CLIENT */
  type: AccountType
  /** CLIENT — smallest currency unit (paise/cents). ₹100.50 = 10050n */
  balance: bigint
  /** CLIENT — ISO 4217 code */
  currency: string
  /** CLIENT — hex color #RRGGBB, nullable */
  color: string | null
  /** CLIENT — emoji or icon key, nullable */
  icon: string | null
  /** SERVER-GENERATED */
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// -------------------------------------------------------------

/**
 * Category row.
 * userId = null means this is a system-default category.
 */
export interface Category {
  /** cuid() — SERVER-GENERATED */
  id: string
  /** SERVER-GENERATED — null for system defaults */
  userId: string | null
  /** CLIENT */
  name: string
  /** CLIENT */
  type: CategoryType
  /** CLIENT — emoji or icon key */
  icon: string | null
  /** CLIENT — hex color #RRGGBB */
  color: string | null
  /** SERVER-GENERATED — only true for seeded defaults */
  isDefault: boolean
  createdAt: Date
}

// -------------------------------------------------------------

/**
 * Transaction row.
 * amount is always positive (smallest currency unit).
 *
 * NULLABLE FIELD NOTES:
 *   categoryId      — SHOULD be non-null; currently nullable for SET NULL on category delete
 *   receiptMimeType — MUST be set when receiptUrl is set; enforce at application layer
 *
 * AI FIELD SEPARATION:
 *   aiRaw* fields are frozen at extraction and NEVER authoritative.
 *   vendor/amount/transactionDate/categoryId are employee-confirmed and authoritative.
 */
export interface Transaction {
  /** cuid() — SERVER-GENERATED */
  id: string
  /** SERVER-GENERATED — session.user.id */
  userId: string
  /** CLIENT — which account this belongs to */
  accountId: string
  /**
   * CLIENT (employee confirms) — nullable.
   * ⚠️ SHOULD BE REQUIRED. Use "Uncategorized" default category
   * on deletion instead of SET NULL.
   */
  categoryId: string | null
  /** CLIENT */
  type: TransactionType
  /** CLIENT (employee confirms) — always positive, smallest currency unit */
  amount: bigint
  /** CLIENT — ISO 4217 code */
  currency: string
  /** CLIENT (employee confirms) — required, business purpose */
  description: string
  /** CLIENT — optional additional notes */
  notes: string | null
  /** CLIENT (employee confirms) — no future dates allowed */
  transactionDate: Date
  /** CLIENT — array of tag strings */
  tags: string[]

  // ── Transfer ──────────────────────────────────────────────
  /** CLIENT — only set when type = TRANSFER */
  transferToAccountId: string | null

  // ── Receipt (server-set after upload) ─────────────────────
  /** SERVER-GENERATED — object-store URL */
  receiptUrl: string | null
  /** SERVER-GENERATED — SHA-256 hex for duplicate guard */
  receiptHash: string | null
  /**
   * SERVER-GENERATED — nullable.
   * ⚠️ MUST be set whenever receiptUrl is set — enforce at app layer.
   */
  receiptMimeType: string | null

  // ── AI-SUGGESTED fields — IMMUTABLE after initial extraction ──
  // These are stored for audit only and are NEVER authoritative.
  /** AI-SUGGESTED — frozen at extraction; null if extraction failed */
  aiRawVendor: string | null
  /** AI-SUGGESTED — frozen at extraction; smallest currency unit */
  aiRawAmount: bigint | null
  /** AI-SUGGESTED — frozen at extraction */
  aiRawDate: Date | null
  /** AI-SUGGESTED — frozen at extraction */
  aiRawCategory: string | null
  /** SERVER-GENERATED — 0.0–1.0 from Claude; null if extraction not attempted */
  aiConfidence: number | null
  /** SERVER-GENERATED — full Claude Vision API JSON response for audit/debug */
  aiExtractionRaw: Record<string, unknown> | null

  // ── Approval Workflow ──────────────────────────────────────
  /**
   * SERVER-GENERATED — state machine; NEVER accepted from client body.
   * Personal finance transactions default to APPROVED.
   * Expense submissions start at DRAFT.
   */
  status: TransactionStatus
  /** SERVER-GENERATED — set on DRAFT→PENDING transition */
  submittedAt: Date | null

  // ── Recurring ─────────────────────────────────────────────
  /** CLIENT */
  isRecurring: boolean

  // ── Soft Delete ───────────────────────────────────────────
  /** SERVER-GENERATED */
  isDeleted: boolean
  /** SERVER-GENERATED */
  deletedAt: Date | null

  createdAt: Date
  updatedAt: Date
}

// -------------------------------------------------------------

/**
 * Budget row.
 * limitAmount in smallest currency unit.
 *
 * NULLABLE FIELD NOTE:
 *   name — SHOULD BE REQUIRED for user-facing identification.
 */
export interface Budget {
  /** cuid() — SERVER-GENERATED */
  id: string
  /** SERVER-GENERATED — session.user.id */
  userId: string
  /** CLIENT — must reference an EXPENSE-type category */
  categoryId: string
  /**
   * CLIENT — nullable.
   * ⚠️ SHOULD BE REQUIRED for user-facing identification.
   */
  name: string | null
  /** CLIENT — smallest currency unit; must be > 0 */
  limitAmount: bigint
  /** CLIENT */
  period: BudgetPeriod
  /** CLIENT */
  periodStart: Date
  /** CLIENT — must be after periodStart */
  periodEnd: Date
  /** CLIENT — carry unspent amount to next period */
  rollover: boolean
  /** CLIENT — percentage threshold for alert (1–100, default 80) */
  alertAtPercent: number
  /** SERVER-GENERATED */
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// -------------------------------------------------------------

/**
 * Goal row.
 * Amounts in smallest currency unit.
 *
 * NULLABLE FIELD NOTES:
 *   targetDate — SHOULD BE REQUIRED; projections impossible without it.
 *   accountId  — SHOULD BE REQUIRED if account-balance tracking is in scope.
 */
export interface Goal {
  /** cuid() — SERVER-GENERATED */
  id: string
  /** SERVER-GENERATED — session.user.id */
  userId: string
  /**
   * CLIENT — nullable.
   * ⚠️ SHOULD BE REQUIRED if account-balance tracking is in scope.
   */
  accountId: string | null
  /** CLIENT */
  name: string
  /** CLIENT */
  description: string | null
  /** CLIENT — smallest currency unit; must be > 0 */
  targetAmount: bigint
  /** SERVER-GENERATED — updated by contribution events */
  currentAmount: bigint
  /**
   * CLIENT — nullable.
   * ⚠️ SHOULD BE REQUIRED. Projected completion date impossible without it.
   */
  targetDate: Date | null
  /** CLIENT */
  icon: string | null
  /** CLIENT — hex color #RRGGBB */
  color: string | null
  /** SERVER-GENERATED — state machine */
  status: GoalStatus
  /** SERVER-GENERATED — set when status transitions to COMPLETED */
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// -------------------------------------------------------------

/**
 * Notification row.
 *
 * NULLABLE FIELD NOTE:
 *   entityId — logically always paired with entityType.
 *   Enforce that both are null or both are non-null at app layer.
 */
export interface Notification {
  /** cuid() — SERVER-GENERATED */
  id: string
  /** SERVER-GENERATED — recipient user id */
  userId: string
  /** SERVER-GENERATED */
  type: NotificationType
  /** SERVER-GENERATED */
  title: string
  /** SERVER-GENERATED */
  message: string
  /** SERVER-GENERATED — 'transaction' | 'budget' | 'goal' | null */
  entityType: string | null
  /**
   * SERVER-GENERATED — nullable.
   * ⚠️ SHOULD always be set when entityType is set — enforce at app layer.
   */
  entityId: string | null
  /** CLIENT — employee marks as read */
  isRead: boolean
  /** SERVER-GENERATED — set server-side on mark-read */
  readAt: Date | null
  createdAt: Date
}

// -------------------------------------------------------------

/**
 * ActivityLog row.
 * Immutable audit trail — insert only, never updated.
 */
export interface ActivityLog {
  /** cuid() — SERVER-GENERATED */
  id: string
  /** SERVER-GENERATED — null for system/cron actions */
  userId: string | null
  /** SERVER-GENERATED — e.g. 'transaction.created', 'expense.approved' */
  action: string
  /** SERVER-GENERATED — 'transaction' | 'budget' | 'goal' | 'user' | null */
  resourceType: string | null
  /** SERVER-GENERATED */
  resourceId: string | null
  /** SERVER-GENERATED — before-state snapshot for UPDATE actions; null for CREATE */
  oldValues: Record<string, unknown> | null
  /** SERVER-GENERATED — after-state snapshot; null for DELETE actions */
  newValues: Record<string, unknown> | null
  /** SERVER-GENERATED — from request headers */
  ipAddress: string | null
  /** SERVER-GENERATED — from request headers */
  userAgent: string | null
  /** SERVER-GENERATED — additional context */
  metadata: Record<string, unknown> | null
  createdAt: Date
}

// =============================================================
// RELATIONAL / JOINED TYPES
// Common shapes returned by queries with includes
// =============================================================

export interface TransactionWithRelations extends Transaction {
  account:           Account
  category:          Category | null
  transferToAccount: Account | null
}

export interface BudgetWithRelations extends Budget {
  category:    Category
  /** Computed at query time by summing transactions in the period */
  spentAmount: bigint
  /** Computed: (spentAmount / limitAmount) * 100 */
  percentUsed: number
}

export interface GoalWithRelations extends Goal {
  account: Account | null
  /** Computed: (currentAmount / targetAmount) * 100 */
  percentComplete: number
  /** Projected completion date based on average contribution rate */
  projectedDate: Date | null
}

export interface NotificationWithUser extends Notification {
  user: PublicUser
}

// =============================================================
// INPUT TYPES (client-submitted payloads, after Zod validation)
// These intentionally omit all SERVER-GENERATED fields.
// =============================================================

export interface CreateAccountInput {
  name:     string
  type:     AccountType
  balance:  bigint
  currency: string
  color?:   string
  icon?:    string
}

export interface UpdateAccountInput {
  name?:    string
  balance?: bigint
  color?:   string
  icon?:    string
  isActive?: boolean
}

export interface CreateCategoryInput {
  name:  string
  type:  CategoryType
  icon?: string
  color?: string
}

/**
 * The employee-confirmed fields submitted when finalising a transaction.
 * AI raw fields are explicitly excluded — they are set server-side only.
 */
export interface ConfirmTransactionInput {
  vendor:          string           // maps to description
  amount:          bigint
  transactionDate: Date
  categoryId:      string
  description:     string
  notes?:          string
  tags?:           string[]
}

export interface CreateBudgetInput {
  categoryId:     string
  name:           string
  limitAmount:    bigint
  period:         BudgetPeriod
  periodStart:    Date
  periodEnd:      Date
  rollover?:      boolean
  alertAtPercent?: number
}

export interface UpdateBudgetInput {
  name?:           string
  limitAmount?:    bigint
  periodEnd?:      Date
  rollover?:       boolean
  alertAtPercent?: number
}

export interface CreateGoalInput {
  name:         string
  targetAmount: bigint
  description?: string
  targetDate?:  Date
  accountId?:   string
  icon?:        string
  color?:       string
}

export interface UpdateGoalInput {
  name?:         string
  description?:  string
  targetAmount?: bigint
  targetDate?:   Date
  icon?:         string
  color?:        string
}

export interface ContributeToGoalInput {
  amount: bigint
  note?:  string
}

// =============================================================
// AI EXTRACTION RESULT TYPE
// Returned by src/lib/ai/receiptParser.ts
// =============================================================

export interface AIExtractionResult {
  /** Whether Claude returned a usable result */
  success: boolean
  /** 0.0–1.0; values < 0.7 are considered low-confidence */
  confidence: number
  /** Full raw Claude JSON response — stored in aiExtractionRaw for audit */
  raw: Record<string, unknown>

  // Extracted fields (null if not found or confidence too low)
  /** Raw vendor string as returned by Claude */
  vendor: string | null
  /**
   * Raw amount string including currency symbol, e.g. "₹1,250.00".
   * Must be passed through parseAmount.ts before storing as aiRawAmount.
   */
  rawAmountString: string | null
  /** ISO 8601 date string if parseable, otherwise null */
  date: string | null
  /** Suggested category — employee must confirm */
  category: string | null
}

// =============================================================
// UTILITY / DISPLAY TYPES
// =============================================================

/**
 * Convert a bigint amount (smallest currency unit) to a display decimal.
 * e.g. 10050n -> 100.50
 */
export type AmountDisplay = number

/** Map bigint monetary fields to number for serialisation over HTTP */
export type Serialized<T> = {
  [K in keyof T]: T[K] extends bigint
    ? number
    : T[K] extends bigint | null
    ? number | null
    : T[K]
}

/** Paginated API response wrapper */
export interface PaginatedResponse<T> {
  data:       T[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}

/** Action names recorded in activity_logs */
export type ActivityAction =
  | 'user.registered'
  | 'user.login'
  | 'user.logout'
  | 'user.password_changed'
  | 'account.created'
  | 'account.updated'
  | 'account.deleted'
  | 'transaction.created'
  | 'transaction.updated'
  | 'transaction.deleted'
  | 'transaction.submitted'
  | 'transaction.retracted'
  | 'expense.approved'
  | 'expense.rejected'
  | 'expense.reimbursed'
  | 'budget.created'
  | 'budget.updated'
  | 'budget.deleted'
  | 'goal.created'
  | 'goal.updated'
  | 'goal.contributed'
  | 'goal.completed'
  | 'goal.archived'
