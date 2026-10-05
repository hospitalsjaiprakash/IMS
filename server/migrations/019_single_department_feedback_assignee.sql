-- =============================================
-- JAIPRAKASH HOSPITAL IMS
-- Migration 019: Single Department Feedback Assignee
-- Only one assigned staff member provides feedback for any department.
-- The same staff member can be assigned to multiple departments.
-- =============================================

ALTER TABLE departments
ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Backfill assigned_user_id from existing hod_user_id or incharge_user_id
UPDATE departments
SET assigned_user_id = COALESCE(hod_user_id, incharge_user_id)
WHERE assigned_user_id IS NULL AND (hod_user_id IS NOT NULL OR incharge_user_id IS NOT NULL);
