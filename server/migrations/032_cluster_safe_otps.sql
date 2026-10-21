-- =============================================
-- MIGRATION 032: Cluster-Safe Database-Backed OTP Storage
-- Replaces in-memory Map with PostgreSQL persistence across PM2 cluster instances
-- Includes attempt tracking for brute-force protection and automated expiration
-- =============================================

CREATE TABLE IF NOT EXISTS security_otps (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_otps_lookup 
ON security_otps (employee_id, action);

CREATE INDEX IF NOT EXISTS idx_security_otps_expiry 
ON security_otps (expires_at);
