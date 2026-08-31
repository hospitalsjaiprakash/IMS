-- 013_full_workflow.sql

-- 1. Update the status constraint
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_status_check 
  CHECK (status IN (
    'submitted', 
    'with_hod', 
    'with_hod_and_imc', 
    'with_imc', 
    'redirect_requested', 
    'with_head_management', 
    'pending_imc_report',
    'pending_training',
    'resolved', 
    'closed',
    'withdrawn', 
    'locked'
  ));

-- 2. Add Management Decision tracking
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS management_decision VARCHAR(50) CHECK (management_decision IN ('AGREE', 'DISAGREE_MODIFY', 'DISAGREE_REINVESTIGATE'));
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS management_notes TEXT;

-- 3. Update attachments stage constraint
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_stage_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_stage_check
  CHECK (stage IN ('submission', 'hod_feedback', 'imc_feedback', 'investigator_report', 'md_decision', 'imc_report'));
