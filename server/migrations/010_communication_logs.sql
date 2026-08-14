CREATE TABLE IF NOT EXISTS communication_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    recipient_contact VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('EMAIL', 'WHATSAPP', 'IN_APP_NOTIFICATION')),
    subject VARCHAR(255) NOT NULL,
    content TEXT,
    status VARCHAR(50) NOT NULL CHECK (status IN ('SENT', 'FAILED', 'DELIVERED', 'READ')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_communication_logs_user_id ON communication_logs(user_id);
CREATE INDEX idx_communication_logs_created_at ON communication_logs(created_at DESC);
CREATE INDEX idx_communication_logs_type ON communication_logs(type);
