-- =============================================
-- DESIGNATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS designations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE
);

INSERT INTO designations (name) VALUES
  ('Consultant - D1 to D3'),
  ('Sr. Medical Officer - D4'),
  ('Jr. Medical Officer - D5'),
  ('Clinical Assistant - D6'),
  ('Infection Control Nurse'),
  ('Nursing Sup. - NS1'),
  ('Deputy Nursing Sup. - NS2'),
  ('Asst. Nursing Sup. - NS3'),
  ('Ward In-charge - NS4'),
  ('Sr. Nurse - NS5'),
  ('Jr. Nurse - NS6'),
  ('Nursing Assistant - NS7'),
  ('Health Assistant - NS8'),
  ('Sr. Technician'),
  ('Jr. Technician'),
  ('Technical Assistant'),
  ('HOD'),
  ('Assistant HOD'),
  ('In-charge'),
  ('Assistant In-charge'),
  ('Senior Co-Ordinator'),
  ('Junior Co-Ordinator'),
  ('Department Assistant'),
  ('MPW'),
  ('DNB Doctor'),
  ('COO'),
  ('Assistant COO'),
  ('Others')
ON CONFLICT DO NOTHING;
