-- =============================================
-- JAIPRAKASH HOSPITAL IMS - Department Leadership Mappings
-- =============================================

ALTER TABLE departments
ADD COLUMN IF NOT EXISTS incharge_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS asst_coo_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
