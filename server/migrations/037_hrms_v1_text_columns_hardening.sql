-- =============================================================================
-- MIGRATION 037: OfficePortal HRMS v1 Variable-Length Text Column Hardening
-- =============================================================================
-- Per OfficePortal Employee Public API v1 Guide Section 6:
--   "No maximum length is guaranteed for the text fields. Store names, codes,
--    email addresses and mobile numbers in variable-length text columns rather
--    than sizing the columns from the values you see."
-- Widens phone (was VARCHAR(20)), department, designation, office_location,
-- employment_type_name, first_name, last_name, and departments.name to TEXT
-- so free-text mobile numbers (e.g. "+91 (0661) 98765-43210") and long names
-- never trigger SQLSTATE 22001 truncation crashes during Change Feed / Webhook sync.
-- =============================================================================

ALTER TABLE master_employees
  ALTER COLUMN phone TYPE TEXT,
  ALTER COLUMN department TYPE TEXT,
  ALTER COLUMN designation TYPE TEXT,
  ALTER COLUMN office_location TYPE TEXT,
  ALTER COLUMN employment_type_name TYPE TEXT,
  ALTER COLUMN first_name TYPE TEXT,
  ALTER COLUMN last_name TYPE TEXT;

ALTER TABLE users
  ALTER COLUMN phone TYPE TEXT,
  ALTER COLUMN department TYPE TEXT,
  ALTER COLUMN designation TYPE TEXT;

ALTER TABLE departments
  ALTER COLUMN name TYPE TEXT;
