-- Enforce exact 4-digit or more padding for reference IDs
ALTER TABLE incidents
ADD CONSTRAINT check_reference_id_format
CHECK (reference_id ~ '^JPHRC/IMS/\d{4}/\d{4,}$');

-- Enforce strict uniqueness on year and sequence number to prevent duplicates
ALTER TABLE incidents
ADD CONSTRAINT unique_year_seq_number
UNIQUE (year, seq_number);
