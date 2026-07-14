# ExpenseDesk AI — Product Plan

> **Version**: 1.0.0
> **Date**: 2026-07-09
> **Stack**: Next.js 14 (App Router) · TypeScript · Prisma · PostgreSQL · Claude Vision API
> **Status**: ⏳ Awaiting approval — No code will be written until explicitly approved.

---

## Table of Contents

1. [Product Summary](#1-product-summary)
2. [Assumptions](#2-assumptions)
3. [User Roles & RBAC](#3-user-roles--rbac)
4. [User Stories](#4-user-stories)
5. [Data Shapes / Schema](#5-data-shapes--schema)
6. [Core Flow & Acceptance Criteria](#6-core-flow--acceptance-criteria)
7. [Edge Cases](#7-edge-cases)
8. [Affected Files & Modules](#8-affected-files--modules)
9. [Open Questions](#9-open-questions)

---

## 1. Product Summary

ExpenseDesk AI is an internal enterprise expense management platform with three distinct personas:

| Persona | Core Job |
|---------|---------|
| **Employee** | Upload a receipt; AI pre-fills fields; confirm and submit for approval |
| **Manager** | Review pending expenses in a queue; approve or reject with a required reason |
| **Finance / Admin** | View all approved expenses; export to CSV; mark as reimbursed |

The defining UX differentiator is the **AI-assisted extraction step**: the system calls Claude's vision API to parse a receipt image and pre-populate vendor, amount, date, and category. The employee reviews and confirms these suggestions before the expense becomes a formal submission. The AI's raw output is never authoritative — only the employee's confirmed values are.

---

## 2. Assumptions

| # | Assumption |
|---|-----------|
| A1 | Single-approver model for MVP (one manager approves; no multi-step chains). |
| A2 | AI extraction runs **server-side** on upload (not on submit), so the employee sees pre-filled fields immediately after the file is accepted. |
| A3 | Receipt images are stored in an **S3-compatible object store** (e.g., AWS S3 or Cloudflare R2); only the URL is persisted in the DB. For a local trial, `public/uploads/` on the Next.js server is a valid fallback. |
| A4 | All monetary amounts are stored as **integers in the smallest currency unit** (paise / cents) to avoid floating-point errors. Display formatting is done at the presentation layer. |
| A5 | The application is single-tenant (one company per deployment). |
| A6 | Authentication is handled by **NextAuth.js** (Credentials + email providers). Role assignment is managed by an admin directly in the DB or via a simple admin UI not in scope for MVP. |
| A7 | Currency is single (configurable per deployment; default: INR). Multi-currency support is explicitly out of scope for MVP. |
| A8 | "Finance/Admin" is a single merged role for MVP. It can be split into separate `finance` and `admin` roles in a future iteration. |
| A9 | Managers are assigned at the department/organization level; for MVP any user with role `MANAGER` can see **all** pending expenses in the queue. |
| A10 | Duplicate detection is hash-based (SHA-256 of the raw file bytes), computed server-side on upload. |

---

## 3. User Roles & RBAC

### Role Definitions

```
EMPLOYEE  — Can submit, view, and retract their own expenses (before approval).
MANAGER   — Inherits EMPLOYEE permissions + can view/approve/reject all pending expenses.
FINANCE   — Read-only view of all approved/reimbursed expenses + CSV export + mark-as-reimbursed.
ADMIN     — All FINANCE permissions + user management (role assignment). Not in MVP scope.
```

### Permission Matrix

| Action | EMPLOYEE | MANAGER | FINANCE |
|--------|----------|---------|---------|
| Upload receipt & trigger AI extraction | ✅ own | ✅ | ✅ |
| Create/edit draft expense | ✅ own | ✅ | ✅ |
| Submit expense for approval | ✅ own | ✅ | ✅ |
| Retract a PENDING expense (before decision) | ✅ own | ✅ own | ✅ own |
| Edit/delete a PENDING expense | ✅ own | ✅ own | ✅ own |
| View own expense history | ✅ | ✅ | ✅ |
| View ALL expenses (pending/approved/rejected) | ❌ | ✅ | ✅ |
| Approve or reject expense | ❌ | ✅ | ❌ |
| Mark expense as reimbursed | ❌ | ❌ | ✅ |
| Export approved expenses to CSV | ❌ | ❌ | ✅ |

> **RBAC boundary rule**: Employees can only query expenses where `submitted_by === session.user.id`. Any server action or API route that returns expense data must enforce this at the database query level — not as a client-side filter.

---

## 4. User Stories

### 4.1 Employee Stories

| ID | Story | Acceptance Summary |
|----|-------|--------------------|
| E-01 | As an employee, I want to upload a receipt image so the system can extract expense details automatically. | File accepted → extraction triggered → pre-filled form shown within 10s. |
| E-02 | As an employee, I want to review the AI-extracted fields and correct any errors before submitting. | I can edit vendor, amount, date, category, and description. Submitted values are mine, not the AI's. |
| E-03 | As an employee, I want to add a description / business purpose to my expense. | Description field is free-text, required on submission. |
| E-04 | As an employee, I want to submit my expense for manager approval. | Clicking Submit changes status to `PENDING`. I receive a confirmation. |
| E-05 | As an employee, I want to see a list of all my expenses and their current statuses. | Expense list shows status badges: DRAFT / PENDING / APPROVED / REJECTED / REIMBURSED. |
| E-06 | As an employee, I want to see the rejection reason if my expense is rejected so I know what to fix. | Rejection reason visible on the expense detail page. |
| E-07 | As an employee, I want to retract a pending expense so I can correct and resubmit it. | Retract only available while status = PENDING. Returns to DRAFT. |
| E-08 | As an employee, I want to be notified (in-app) when my expense is approved or rejected. | Notification badge increments; notification row shows decision + reason. |

### 4.2 Manager Stories

| ID | Story | Acceptance Summary |
|----|-------|--------------------|
| M-01 | As a manager, I want to see all pending expenses in a queue sorted by submission date (oldest first). | Queue shows submitter name, vendor, amount, date, category, receipt thumbnail. |
| M-02 | As a manager, I want to open an expense and view its receipt image alongside the submitted details. | Detail page shows original receipt image + all confirmed fields side-by-side. |
| M-03 | As a manager, I want to approve an expense with one click. | Click Approve → status becomes APPROVED → employee notified. |
| M-04 | As a manager, I want to reject an expense and must provide a reason. | Reject button opens a modal with a required reason text field. Submission blocked if reason is empty. |
| M-05 | As a manager, I want to see a history of expenses I have previously approved or rejected. | Filtered view: "Decided by me" showing past approvals/rejections with timestamps. |
| M-06 | As a manager, I want to submit my own expenses (same as any employee). | Manager UI shows both the approval queue and the personal expense submission flow. |

### 4.3 Finance / Admin Stories

| ID | Story | Acceptance Summary |
|----|-------|--------------------|
| F-01 | As a finance user, I want to view all approved expenses across all employees. | Full table with filters: date range, employee, category, status. |
| F-02 | As a finance user, I want to mark one or many approved expenses as reimbursed. | Checkbox multi-select → "Mark Reimbursed" bulk action. Status updates to REIMBURSED. |
| F-03 | As a finance user, I want to export filtered expenses to a CSV file. | CSV download includes: expense ID, employee name, vendor, amount, category, date, status, approved by, decided at, reimbursed at. |
| F-04 | As a finance user, I want to see a summary dashboard: total pending amount, total approved (unreimbursed), total reimbursed for the current month. | Three KPI cards on the Finance dashboard. |
| F-05 | As a finance user, I want to see the original receipt image for any approved expense. | Clicking a row opens a detail drawer with the receipt thumbnail/link. |
| F-06 | As a finance user, I cannot approve or reject expenses (read-only on decision state). | Approve/Reject buttons are not rendered; the action server route returns 403 if called. |

---

## 5. Data Shapes / Schema

### Legend

| Symbol | Meaning |
|--------|---------|
| 🔒 SERVER | Field must be set/overridden server-side; client input ignored |
| 🤖 AI-SUGGESTED | AI populates this; employee must confirm; raw value preserved separately |
| ✏️ CLIENT | Client submits this field; validated server-side |
| 🔑 PK / FK | Primary / Foreign Key |

---

### 5.1 `User`

```prisma
model User {
  id            String    @id @default(cuid())           // 🔒 SERVER — generated
  email         String    @unique                        // ✏️ CLIENT (set on signup)
  name          String                                   // ✏️ CLIENT
  passwordHash  String                                   // 🔒 SERVER — never exposed
  role          Role      @default(EMPLOYEE)             // 🔒 SERVER — admin-assigned only
  createdAt     DateTime  @default(now())                // 🔒 SERVER
  updatedAt     DateTime  @updatedAt                     // 🔒 SERVER

  // Relations
  submittedExpenses  Expense[]  @relation("SubmittedBy")
  approvals          Approval[]
}

enum Role {
  EMPLOYEE
  MANAGER
  FINANCE
}
```

**Field notes**:
- `role` is never accepted from any client payload. It is set by an admin directly or via a protected internal route.
- `passwordHash` is bcrypt-hashed server-side and never returned in any API response.

---

### 5.2 `Expense`

```prisma
model Expense {
  id              String        @id @default(cuid())     // 🔒 SERVER
  
  // --- Receipt ---
  receiptUrl      String                                 // 🔒 SERVER — set after upload to object store
  receiptHash     String        @unique                  // 🔒 SERVER — SHA-256 of raw bytes (duplicate guard)
  receiptMimeType String                                 // 🔒 SERVER — validated MIME type

  // --- AI Extraction (raw, never authoritative) ---
  aiRawVendor     String?                                // 🤖 AI-SUGGESTED — stored for audit
  aiRawAmount     Int?          // smallest currency unit // 🤖 AI-SUGGESTED
  aiRawDate       DateTime?                              // 🤖 AI-SUGGESTED
  aiRawCategory   Category?                              // 🤖 AI-SUGGESTED
  aiConfidence    Float?        // 0.0 – 1.0             // 🔒 SERVER — from Claude response
  aiExtractionRaw Json?         // full Claude JSON resp  // 🔒 SERVER — debug/audit blob

  // --- Employee-Confirmed Fields (authoritative) ---
  vendor          String                                 // ✏️ CLIENT — confirmed by employee
  amount          Int           // smallest currency unit // ✏️ CLIENT — confirmed by employee
  date            DateTime                               // ✏️ CLIENT — confirmed by employee
  category        Category                               // ✏️ CLIENT — confirmed by employee
  description     String                                 // ✏️ CLIENT — required, business purpose

  // --- Workflow ---
  status          ExpenseStatus @default(DRAFT)          // 🔒 SERVER — state machine enforced server-side
  submittedAt     DateTime?                              // 🔒 SERVER — set on PENDING transition
  createdAt       DateTime      @default(now())          // 🔒 SERVER
  updatedAt       DateTime      @updatedAt               // 🔒 SERVER

  // --- Relations ---
  submittedById   String                                 // 🔒 SERVER — session.user.id
  submittedBy     User          @relation("SubmittedBy", fields: [submittedById], references: [id])
  approval        Approval?
}

enum ExpenseStatus {
  DRAFT       // Created, AI run, not yet submitted
  PENDING     // Submitted for manager review
  APPROVED    // Manager approved
  REJECTED    // Manager rejected
  REIMBURSED  // Finance marked as paid
}

enum Category {
  TRAVEL
  MEALS
  ACCOMMODATION
  SOFTWARE
  HARDWARE
  OFFICE_SUPPLIES
  TRAINING
  ENTERTAINMENT
  MARKETING
  OTHER
}
```

**Critical field notes**:

| Field | Why server-generated |
|-------|---------------------|
| `receiptUrl` | Determined by object-store upload on the server; client never controls storage path. |
| `receiptHash` | Computed from raw bytes server-side; cannot be faked by client to bypass duplicate check. |
| `status` | Follows a strict state machine (see §6). Client can never directly write this field. |
| `submittedById` | Always `session.user.id` from the server session; never trusted from request body. |
| `aiConfidence` | Returned from Claude; client has no input here. |
| `aiExtractionRaw` | Full raw JSON blob from Claude stored for audit/debugging; never displayed to user. |

**AI vs. Confirmed field separation** — rationale:

The `aiRaw*` fields are frozen at extraction time and never updated. The `vendor`, `amount`, `date`, `category` fields start as copies of the AI suggestions but can be freely edited by the employee. On submission, only the non-`aiRaw*` fields flow into the approval and reimbursement pipeline. This design means:

1. We can always audit what the AI originally said vs. what the employee actually submitted.
2. If the AI is wrong and the employee corrects it, the system works correctly regardless.
3. We can compute AI accuracy metrics by comparing `aiRaw*` to final confirmed values.

---

### 5.3 `Approval`

```prisma
model Approval {
  id          String           @id @default(cuid())     // 🔒 SERVER
  expenseId   String           @unique                  // 🔒 SERVER — FK, one approval per expense
  expense     Expense          @relation(fields: [expenseId], references: [id])

  approverId  String                                    // 🔒 SERVER — session.user.id of manager
  approver    User             @relation(fields: [approverId], references: [id])

  decision    ApprovalDecision                          // 🔒 SERVER — set when manager acts
  reason      String?                                   // ✏️ CLIENT — required if REJECTED; optional if APPROVED
  decidedAt   DateTime         @default(now())          // 🔒 SERVER

  // Reimbursement (set by finance)
  reimbursedbById  String?                              // 🔒 SERVER — finance user's session.user.id
  reimbursedAt     DateTime?                            // 🔒 SERVER — set when Finance marks reimbursed
}

enum ApprovalDecision {
  APPROVED
  REJECTED
}
```

**Field notes**:
- `reason` is enforced as **required** for `REJECTED` decisions in the server action's Zod schema, even though Prisma marks it as optional (to accommodate `APPROVED` rows where a reason is unnecessary).
- `approverId` is always the session user; a manager cannot submit an approval in someone else's name.
- `reimbursedbById` is set by the Finance user performing the mark-reimbursed action.

---

### 5.4 `Notification` (optional but recommended for MVP)

```prisma
model Notification {
  id          String   @id @default(cuid())            // 🔒 SERVER
  userId      String                                   // 🔒 SERVER — recipient
  user        User     @relation(fields: [userId], references: [id])
  
  type        String   // "APPROVED" | "REJECTED" | "REIMBURSED"
  expenseId   String                                   // FK for deep-link
  message     String                                   // Human-readable
  isRead      Boolean  @default(false)
  createdAt   DateTime @default(now())                 // 🔒 SERVER
}
```

---

### 5.5 AI Extraction Metadata — Summary

| Field | Location in Schema | Origin | Authoritative? |
|-------|--------------------|--------|---------------|
| `aiRawVendor` | `Expense` | Claude response | ❌ — audit only |
| `aiRawAmount` | `Expense` | Claude response | ❌ — audit only |
| `aiRawDate` | `Expense` | Claude response | ❌ — audit only |
| `aiRawCategory` | `Expense` | Claude response | ❌ — audit only |
| `aiConfidence` | `Expense` | Claude response | N/A — metadata |
| `aiExtractionRaw` | `Expense` | Full Claude JSON | N/A — audit blob |
| `vendor` | `Expense` | Employee confirms | ✅ |
| `amount` | `Expense` | Employee confirms | ✅ |
| `date` | `Expense` | Employee confirms | ✅ |
| `category` | `Expense` | Employee confirms | ✅ |

---

## 6. Core Flow & Acceptance Criteria

### State Machine

```
[DRAFT] ──(submit)──▶ [PENDING] ──(approve)──▶ [APPROVED] ──(mark reimbursed)──▶ [REIMBURSED]
                          │
                       (reject)
                          │
                          ▼
                      [REJECTED]
                          │
                       (retract*)
                          ▼
                       [DRAFT]

* retract is also available from PENDING → DRAFT (employee retracts before decision)
```

Transitions that are **not** allowed:
- `APPROVED → PENDING` (cannot un-approve)
- `REIMBURSED → *` (terminal state; immutable)
- Any transition initiated by a role without permission (enforced server-side)

---

### Step-by-Step Flow with Acceptance Criteria

#### Step 1 — Receipt Upload & AI Extraction

**Trigger**: Employee uploads a receipt image via the submission form.

**Server actions**:
1. Validate MIME type (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`).
2. Validate file size (≤ 10 MB).
3. Compute SHA-256 hash → check `Expense.receiptHash` for duplicates.
4. Upload file to object store → obtain `receiptUrl`.
5. Call `src/lib/ai/receiptParser.ts` → Claude Vision API with the image.
6. Parse Claude response → extract `aiRawVendor`, `aiRawAmount`, `aiRawDate`, `aiRawCategory`, `aiConfidence`.
7. Create `Expense` record with status `DRAFT`; pre-populate editable fields from AI values as defaults.
8. Return the draft expense ID + extracted fields to the client.

**Acceptance Criteria**:
- AC-1.1: File upload returns an error if MIME type is not in the allowed list.
- AC-1.2: File upload returns an error if file size exceeds 10 MB.
- AC-1.3: A duplicate receipt (same SHA-256) returns HTTP 409 with a link to the existing expense.
- AC-1.4: If AI extraction succeeds with confidence ≥ 0.7, all four fields are pre-filled in the form.
- AC-1.5: If AI extraction fails or confidence < 0.7, the form is shown empty with a warning banner; the employee fills fields manually.
- AC-1.6: The `DRAFT` expense record is created in the DB even if AI extraction fails, so the receipt is not lost.
- AC-1.7: AI extraction completes within 15 seconds; if it times out, the expense is still created and the employee is shown a "AI unavailable — please fill manually" message.

---

#### Step 2 — Employee Reviews & Confirms Fields

**Trigger**: Employee sees the pre-filled form and clicks "Submit Expense".

**Server actions**:
1. Validate all confirmed fields (Zod schema — see §8).
2. Assert expense `status === DRAFT` and `submittedById === session.user.id`.
3. Update expense: set confirmed fields, set `status = PENDING`, set `submittedAt = now()`.
4. Create `Notification` record for all MANAGERs (or a configured notification target).

**Acceptance Criteria**:
- AC-2.1: Employee can freely edit vendor, amount, date, category, description before submitting.
- AC-2.2: The `aiRaw*` fields in the DB are never updated by the employee's edits — they remain as originally extracted.
- AC-2.3: Submitting with an empty description returns a validation error.
- AC-2.4: Submitting with an amount ≤ 0 returns a validation error.
- AC-2.5: After successful submission, status badge changes to `PENDING` and the form becomes read-only.
- AC-2.6: The employee cannot submit an expense that is already `PENDING`, `APPROVED`, or `REIMBURSED`.

---

#### Step 3 — Manager Reviews Pending Queue

**Trigger**: Manager navigates to the Approvals queue.

**Server actions**:
1. Fetch all `Expense` records where `status = PENDING`, ordered by `submittedAt ASC`.
2. Include `submittedBy.name`, `category`, `amount`, `vendor`, `date`, receipt thumbnail URL.
3. Role-guard: only `MANAGER` role can access this route.

**Acceptance Criteria**:
- AC-3.1: Queue is ordered oldest-first (longest-waiting at top).
- AC-3.2: Each row shows: employee name, vendor, amount, date, category, receipt thumbnail, days waiting.
- AC-3.3: An `EMPLOYEE` accessing this route receives a 403 / redirect to their own dashboard.
- AC-3.4: Clicking a row opens a detail page with the full receipt image and all confirmed fields.

---

#### Step 4 — Manager Approves or Rejects

**Trigger**: Manager clicks "Approve" or "Reject" on an expense detail page.

**Server actions (Approve)**:
1. Assert `session.user.role === MANAGER`.
2. Assert `expense.status === PENDING`.
3. Create `Approval` record: `{ expenseId, approverId: session.user.id, decision: APPROVED, decidedAt: now() }`.
4. Update `Expense.status = APPROVED`.
5. Create `Notification` for the submitting employee.

**Server actions (Reject)**:
1. Assert `session.user.role === MANAGER`.
2. Assert `expense.status === PENDING`.
3. Validate `reason` is non-empty (min 10 chars, max 500 chars).
4. Create `Approval` record: `{ ..., decision: REJECTED, reason }`.
5. Update `Expense.status = REJECTED`.
6. Create `Notification` for the submitting employee with the rejection reason.

**Acceptance Criteria**:
- AC-4.1: Approving an expense transitions it from `PENDING` to `APPROVED` atomically (Prisma transaction).
- AC-4.2: Rejecting without a reason returns a validation error; the modal submit button stays disabled if reason field is empty.
- AC-4.3: A manager cannot approve/reject their own submitted expense (server-side check: `expense.submittedById !== session.user.id`).
- AC-4.4: Only one `Approval` record is created per expense (Prisma `@unique` on `expenseId`).
- AC-4.5: The employee sees a notification badge increment and sees the decision on their expense list.

---

#### Step 5 — Finance Marks Reimbursed & Exports CSV

**Trigger**: Finance user views approved expenses and marks one or more as reimbursed.

**Server actions (Mark Reimbursed)**:
1. Assert `session.user.role === FINANCE`.
2. For each selected expenseId: assert `status === APPROVED`.
3. Update `Expense.status = REIMBURSED`.
4. Set `Approval.reimbursedById` and `Approval.reimbursedAt`.
5. Create `Notification` for each affected employee.

**Server actions (Export CSV)**:
1. Assert `session.user.role === FINANCE`.
2. Apply optional filters (date range, employee, category, status).
3. Stream CSV with headers: `ID, Employee, Vendor, Amount, Category, Date, Description, Status, Approved By, Decided At, Reimbursed At`.
4. Response header: `Content-Disposition: attachment; filename="expenses-{date}.csv"`.

**Acceptance Criteria**:
- AC-5.1: Only expenses with `status === APPROVED` can be marked as reimbursed.
- AC-5.2: Bulk mark-reimbursed updates all selected expenses in a single Prisma transaction.
- AC-5.3: CSV export includes all columns listed above; amounts are formatted as decimal strings (e.g., "1250.00" not "125000").
- AC-5.4: An `EMPLOYEE` or `MANAGER` accessing the CSV export route receives a 403.
- AC-5.5: An empty result set returns a valid CSV file with only the header row (not an error).

---

## 7. Edge Cases

### EC-01 — AI Extraction Fails or Returns Low-Confidence / Garbled Data

**Scenarios**: blurry image, handwritten receipt, non-English text, non-receipt document (e.g., a selfie), Claude API timeout or error.

**Detection**:
- Claude returns `aiConfidence < 0.70`, OR
- Claude returns an error / HTTP 5xx, OR
- Any of the four key fields (`vendor`, `amount`, `date`, `category`) is absent from the response.

**Handling Strategy**:
1. The expense `DRAFT` record is still created and `receiptUrl` is saved (receipt is never lost).
2. The `aiRaw*` fields are set to `null`; `aiConfidence` is set to the returned score or `0.0`.
3. The form is shown to the employee with all fields empty and a dismissible warning banner: *"AI could not read this receipt clearly. Please fill in the details manually."*
4. The employee fills in fields manually and submits normally. This is a first-class supported path, not an error state.
5. The `aiExtractionRaw` blob always stores whatever Claude returned (even a partial or error response) for debugging.

**Explicitly not allowed**: Blocking submission because AI extraction failed. The AI assists; it never gates.

---

### EC-02 — Employee Edits AI-Suggested Fields Before Submitting

**Risk**: The system must never treat AI-extracted values as the "real" expense data if the employee changed them.

**Handling Strategy**:
1. On the client, the form fields are initialized from `aiRaw*` values as defaults but are fully editable.
2. The `PATCH /expense/:id/submit` server action accepts only the employee's confirmed field values (`vendor`, `amount`, `date`, `category`, `description`) from the request body.
3. These confirmed values overwrite the default-populated editable columns; the `aiRaw*` columns are never touched again after initial creation.
4. At no point does any server action read `aiRaw*` fields and treat them as the expense's confirmed data.
5. For audit: the difference between `aiRawVendor` and `vendor` (and same for other fields) is the ground truth for any accuracy measurement.

**Acceptance Criteria (repeated for emphasis)**: AC-2.2 — `aiRaw*` fields are immutable after the initial extraction.

---

### EC-03 — Duplicate Receipt Submission (Same Image Uploaded Twice)

**Detection**: SHA-256 of the uploaded file bytes is computed server-side and compared against `Expense.receiptHash` (unique indexed column).

**Handling Strategy**:
1. If a matching hash exists, the upload is **rejected with HTTP 409 Conflict**.
2. The response body includes: `{ error: "Duplicate receipt", existingExpenseId: "...", existingExpenseStatus: "PENDING" }`.
3. The client displays: *"This receipt was already uploaded. View existing expense →"* (linked to the existing expense).
4. The duplicate file is **not** uploaded to object storage (hash check happens before the S3 call).
5. Exception: if the existing expense with the same hash has status `REJECTED`, the employee is offered the option to re-use the same receipt for a new expense (creates a new record but with the same `receiptUrl`; a new hash record is **not** created — the uniqueness constraint applies to the `Expense` row, not the storage object).

> **Implementation note**: This requires the hash check to be done before the object store upload in the server action pipeline.

---

### EC-04 — Manager Rejects With No Reason Provided

**Handling Strategy**:
1. The "Reject" button opens a modal with a `<textarea>` for the reason (min 10 chars, max 500 chars).
2. The modal's submit button is **disabled** while the textarea is empty or below 10 characters (client-side UX).
3. The server action independently validates the `reason` field with Zod (`z.string().min(10).max(500)`).
4. If the request somehow reaches the server without a valid reason (e.g., API call bypassing the UI), the server action returns a 400 with a descriptive error.
5. An `Approval` record with `decision: REJECTED` and `reason: null` can never be created — this is enforced at the application layer (not a DB constraint, since `reason` is optional for `APPROVED` rows).

---

### EC-05 — An Expense Edited or Deleted After It's Already Been Approved

**Scenario**: Employee somehow attempts to edit fields or delete an expense that is in `APPROVED` or `REIMBURSED` status.

**Handling Strategy**:

| Action | Allowed? | Handling |
|--------|----------|---------|
| Edit fields on an `APPROVED` expense | ❌ | Server action returns 403: *"Approved expenses cannot be edited."* |
| Delete an `APPROVED` expense | ❌ | Server action returns 403. |
| Edit fields on a `REIMBURSED` expense | ❌ | Server action returns 403. |
| Delete a `REIMBURSED` expense | ❌ | Server action returns 403. |
| Edit/delete own `DRAFT` expense | ✅ | Full edit access. |
| Edit/delete own `PENDING` expense via "Retract" | ✅ | Retract → DRAFT → edit → re-submit. |
| Manager edits a `PENDING` expense | ❌ | Managers approve/reject only; they do not edit content. |

**Implementation**: Every mutating server action checks `expense.status` before proceeding. The state-machine check is done inside a Prisma transaction to prevent TOCTOU races.

---

### EC-06 — Receipt Image Upload Limits

**File Size**: Maximum **10 MB** per file.

**Allowed MIME Types**:
- `image/jpeg`
- `image/png`
- `image/webp`
- `application/pdf` (single-page; only first page sent to Claude)

**Validation Order** (server-side; never trust client headers):
1. Check `Content-Length` / streamed byte count ≤ 10 MB. Reject with 413 if exceeded.
2. Read magic bytes (first 8 bytes of stream) to verify actual MIME type matches declared type. Reject with 415 if mismatch or unsupported.
3. Generate SHA-256 (duplicate check).
4. Upload to object store.

**Storage Locations**:
- **Production**: AWS S3 or Cloudflare R2 bucket; objects stored at `receipts/{userId}/{expenseId}/{filename}`. Access via signed URLs (15-minute expiry).
- **Local Trial**: `public/uploads/receipts/{expenseId}/` on disk (Next.js public folder). Not suitable for production (no auth on files, no CDN).

**Client UX**: File input restricted to `accept="image/jpeg,image/png,image/webp,application/pdf"` with a visible size warning. Errors shown inline beneath the upload widget.

---

### EC-07 — Currency / Amount Parsing Errors (AI Misreads Decimal or Currency Symbol)

**Scenarios**:
- Claude reads "₹1,250.00" as `12500` or `125000` (decimal/comma ambiguity).
- Claude reads "€15.50" and stores `1550` cents but the app is INR-only.
- Claude reads a handwritten "7" as "1" due to image quality.
- Claude returns a string like `"1.250,00"` (European locale formatting).

**Handling Strategy**:
1. **Normalisation function** in `src/lib/ai/parseAmount.ts`:
   - Strip all currency symbols and alphabetic characters.
   - Detect ambiguous separators: if the string matches `/\d{1,3}[.,]\d{3}[.,]\d{2}/`, treat the last separator as the decimal.
   - Convert to integer (smallest currency unit = amount × 100, rounded).
   - If the result is 0 or negative after parsing, set `aiRawAmount = null` and `aiConfidence` drops to `< 0.5`.
2. **Confidence flag**: If `aiRawAmount` is `null` or the parsed value seems implausibly large (> 500,000 INR), `aiConfidence` is clamped to `0.0`.
3. **Employee owns the final value**: The pre-filled amount field is clearly labeled *"Suggested by AI — please verify"*. The employee is responsible for correcting any misread amounts before submitting.
4. **No automatic currency conversion**: If Claude returns a non-INR symbol, the amount field is left blank and the warning banner is shown.
5. **Audit trail**: The raw string from Claude is preserved in `aiExtractionRaw` so any mis-parse can be investigated later.

---

## 8. Affected Files & Modules

### Directory Map

```
expensedesk-ai/
├── prisma/
│   ├── schema.prisma              # Full data model (User, Expense, Approval, Notification)
│   └── migrations/                # Prisma migration history
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   │
│   │   ├── (employee)/
│   │   │   ├── dashboard/page.tsx          # Employee: own expenses list
│   │   │   ├── expenses/
│   │   │   │   ├── new/page.tsx            # Upload + AI form
│   │   │   │   └── [id]/page.tsx           # Expense detail (read-only after submit)
│   │   │   └── layout.tsx                  # Role guard: EMPLOYEE | MANAGER | FINANCE
│   │   │
│   │   ├── (manager)/
│   │   │   ├── approvals/
│   │   │   │   ├── page.tsx                # Pending queue
│   │   │   │   └── [id]/page.tsx           # Expense detail + Approve/Reject
│   │   │   └── layout.tsx                  # Role guard: MANAGER only
│   │   │
│   │   ├── (finance)/
│   │   │   ├── finance/
│   │   │   │   ├── page.tsx                # All approved + reimbursed expenses
│   │   │   │   └── export/route.ts         # CSV export route handler
│   │   │   └── layout.tsx                  # Role guard: FINANCE only
│   │   │
│   │   └── api/
│   │       └── upload/route.ts             # POST: receive file → validate → S3 → AI → return draft
│   │
│   ├── server/
│   │   └── actions/
│   │       ├── auth.actions.ts             # login, register, logout
│   │       ├── expense.actions.ts          # createDraft, submitExpense, retractExpense, deleteExpense
│   │       ├── approval.actions.ts         # approveExpense, rejectExpense
│   │       └── finance.actions.ts          # markReimbursed (bulk), exportCSV
│   │
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── receiptParser.ts            # Claude Vision API call + raw response handling
│   │   │   ├── parseAmount.ts              # Amount normalisation + currency stripping
│   │   │   └── types.ts                    # AIExtractionResult type definition
│   │   │
│   │   ├── validators/
│   │   │   ├── expense.schema.ts           # Zod: upload params, confirm-fields, submit
│   │   │   ├── approval.schema.ts          # Zod: approve (no body), reject (reason required)
│   │   │   ├── user.schema.ts              # Zod: register, login
│   │   │   └── finance.schema.ts           # Zod: mark-reimbursed IDs array, CSV filter params
│   │   │
│   │   ├── auth.ts                         # NextAuth config, session helpers, role guard util
│   │   ├── db.ts                           # Prisma client singleton
│   │   └── storage.ts                      # S3 / local disk upload abstraction
│   │
│   └── components/
│       ├── expense/
│       │   ├── ReceiptUploader.tsx          # Drag-drop upload + progress + duplicate error
│       │   ├── ExtractionForm.tsx           # Pre-filled form with AI confidence badge
│       │   ├── ExpenseStatusBadge.tsx       # Status colour-coded badge
│       │   └── ExpenseTable.tsx             # Shared table used on employee + finance views
│       ├── approvals/
│       │   ├── ApprovalQueue.tsx            # Manager's pending list
│       │   ├── ApprovalDetail.tsx           # Receipt image + fields + action buttons
│       │   └── RejectModal.tsx              # Modal with required reason textarea
│       ├── finance/
│       │   ├── FinanceDashboard.tsx         # KPI summary cards
│       │   ├── ReimburseButton.tsx          # Bulk action button
│       │   └── ExportButton.tsx             # CSV download trigger
│       └── ui/
│           ├── Button.tsx
│           ├── Input.tsx
│           ├── Modal.tsx
│           ├── Badge.tsx
│           ├── Spinner.tsx
│           └── Toast.tsx
```

### Key Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `api/upload/route.ts` | File validation → hash check → S3 upload → Claude call → create DRAFT Expense |
| `lib/ai/receiptParser.ts` | Wraps Claude Vision API; returns typed `AIExtractionResult`; never throws — always returns a result with `success: false` on failure |
| `lib/ai/parseAmount.ts` | Pure function; takes raw string from Claude; returns `number | null` in smallest currency units |
| `lib/validators/expense.schema.ts` | Zod schema for the confirm-and-submit payload; rejects `aiRaw*` fields if present |
| `server/actions/expense.actions.ts` | State machine transitions DRAFT→PENDING, PENDING→DRAFT (retract) |
| `server/actions/approval.actions.ts` | State machine transitions PENDING→APPROVED/REJECTED; enforces reason on rejection |
| `server/actions/finance.actions.ts` | APPROVED→REIMBURSED bulk transition; CSV streaming |
| `lib/auth.ts` | `requireRole(role)` helper used in every layout.tsx and server action |
| `lib/storage.ts` | Abstract interface over S3 and local disk; swap implementation without changing call sites |

### Zod Schema Outline — `expense.schema.ts`

```typescript
// Upload phase (server-side only; not a Zod form schema)
const UploadConstraints = {
  maxSizeBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
}

// Confirm-and-submit payload (from employee form)
const SubmitExpenseSchema = z.object({
  vendor:      z.string().min(1).max(200),
  amount:      z.number().int().positive(),         // smallest currency unit
  date:        z.coerce.date().max(new Date()),      // no future dates
  category:    z.nativeEnum(Category),
  description: z.string().min(1).max(1000),
  // aiRaw* fields are STRIP-not-passthrough: presence in body is ignored
})

// Rejection payload
const RejectExpenseSchema = z.object({
  reason: z.string().min(10).max(500),
})

// Finance: mark reimbursed
const MarkReimbursedSchema = z.object({
  expenseIds: z.array(z.string().cuid()).min(1).max(100),
})
```

### Claude Vision API Call Outline — `receiptParser.ts`

```typescript
interface AIExtractionResult {
  success: boolean
  confidence: number          // 0.0 – 1.0; < 0.7 = low confidence
  raw: object                 // Full Claude JSON response — stored in aiExtractionRaw

  // Extracted fields (null if not found or low confidence)
  vendor: string | null
  rawAmountString: string | null   // e.g., "₹1,250.00" — fed to parseAmount.ts
  date: string | null              // ISO 8601 if parseable
  category: Category | null
}

// Prompt sent to Claude:
// "You are a receipt OCR assistant. Extract: vendor name, total amount (with currency symbol),
//  date, and suggest one of these categories: [TRAVEL, MEALS, ...]. 
//  Return JSON: { vendor, amount, date, category, confidence }.
//  If the image is not a receipt or fields are unreadable, set confidence < 0.5."
```

---

## 9. Open Questions

These must be resolved before or during implementation. They are not blockers for plan approval.

| # | Question | Options | Recommendation |
|---|----------|---------|---------------|
| OQ-01 | **Single-approver vs. multi-step approval?** | (a) Any MANAGER approves — simple queue. (b) Expenses assigned to a specific manager. (c) Sequential multi-level (e.g., manager → finance head for amounts > ₹10,000). | Start with (a) for MVP. Flag amounts > ₹10,000 visually for finance awareness. |
| OQ-02 | **When does AI extraction run — on upload or on submit?** | (a) Server-side on upload: employee sees pre-filled form immediately after drop. (b) Server-side on submit: extraction runs in the background; employee submits raw data. | (a) — on upload. Better UX; extraction result guides what the employee fills in. Assumption A2 already reflects this. |
| OQ-03 | **Receipt image storage for the trial?** | (a) Base64 in Postgres: simple, no external service, poor for large files / queries. (b) Local disk (`public/uploads/`): easy, no auth on URLs. (c) S3-compatible bucket: correct long-term solution. | (b) local disk for trial; (c) for production. Abstract behind `lib/storage.ts` so the switch is a config change. |
| OQ-04 | **Can a manager approve their own expenses?** | (a) Yes — trust the manager. (b) No — same-person approval is a conflict of interest; requires a second manager. | (b) — enforce server-side. AC-4.3 already specifies this. |
| OQ-05 | **What happens when a rejected expense is resubmitted?** | (a) Employee edits the DRAFT and re-submits — creates a new PENDING state on the same Expense record. (b) Employee creates a brand-new Expense, re-uploading the receipt. | (a) — allow edit-and-resubmit. The original `Approval` record with `REJECTED` is preserved; a second `Approval` record is created on re-decision. (Requires removing the `@unique` constraint on `Approval.expenseId` or using a different cardinality model.) |
| OQ-06 | **Should FINANCE be able to add comments when marking as reimbursed?** | (a) Yes — free-text reimbursement note (e.g., payment reference). (b) No — status change only. | (a) is low-effort and high-value for audit trails. Add `reimbursedNote String?` to `Approval`. |
| OQ-07 | **Notification delivery — in-app only or also email?** | (a) In-app notification badge only. (b) In-app + email via Resend/SES. | (a) for MVP; email as a follow-on. The `Notification` model supports both without schema changes. |
| OQ-08 | **PDF export in addition to CSV?** | (a) CSV only for MVP. (b) PDF report with receipt thumbnails. | (a) CSV only for MVP. PDF requires puppeteer/pdfkit and is significant extra scope. |
| OQ-09 | **How is the confidence threshold configured?** | (a) Hard-coded at 0.7 in `receiptParser.ts`. (b) Environment variable. (c) Admin UI setting. | (b) — `AI_CONFIDENCE_THRESHOLD=0.7` in `.env`. Easy to tune without a redeploy. |
| OQ-10 | **Rate limiting on the AI extraction endpoint?** | Without rate limits, a single user could spam the upload endpoint and incur large Claude API costs. | Add per-user rate limit: max 20 receipt uploads per hour. Enforced via Redis counter or in-memory (for trial). |

---

*End of Plan. No implementation code will be written until this plan is explicitly approved.*
