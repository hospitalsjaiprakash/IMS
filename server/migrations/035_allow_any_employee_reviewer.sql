-- Migration 035: Allow any employee to be a department reviewer
-- Removes restrictive check constraint on department_reviewers.reviewer_role

ALTER TABLE department_reviewers DROP CONSTRAINT IF EXISTS department_reviewers_reviewer_role_check;
ALTER TABLE department_reviewers ALTER COLUMN reviewer_role SET DEFAULT 'Department Reviewer';
