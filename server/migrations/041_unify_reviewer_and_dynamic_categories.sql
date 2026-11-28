-- =============================================================================
-- Migration 041: Unify Reviewer Role & Dynamic Incident Category Types
-- =============================================================================
-- 1. Create normalized table `incident_category_types` and seed all 27
--    existing categories' Incident Types idempotently (always ensuring 'Others').
-- 2. Normalize all legacy `hod` roles -> `employee` and clear legacy
--    department leader/reviewer flags so `category_feedback_assignees` is the
--    sole source of truth for Reviewer eligibility.
-- =============================================================================

CREATE TABLE IF NOT EXISTS incident_category_types (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES incident_categories(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, name)
);

CREATE INDEX IF NOT EXISTS idx_incident_category_types_cat
  ON incident_category_types(category_id, sort_order, name);

WITH seeded(cat_name, type_name, ord) AS (
  VALUES
    -- Asset Related
    ('Asset Related', 'Delayed or inadequate maintenance of equipment', 1),
    ('Asset Related', 'Prolonged non-availability of critical medical equipment', 2),
    ('Asset Related', 'Inadequate supply of essential assets', 3),
    ('Asset Related', 'Physical damage to hospital equipment', 4),
    ('Asset Related', 'Theft or loss of hospital assets', 5),
    ('Asset Related', 'Missing or incomplete asset records', 6),
    ('Asset Related', 'Inappropriate use of hospital assets', 7),
    ('Asset Related', 'Safety incidents involving equipment usage', 8),
    ('Asset Related', 'Inaccurate or out-of-calibration equipment', 9),
    ('Asset Related', 'Delays in asset procurement', 10),
    ('Asset Related', 'Inappropriate disposal or retirement of assets', 11),
    ('Asset Related', 'Staff incompetence or lack of training in using equipment', 12),
    ('Asset Related', 'Others', 999),

    -- Billing Related
    ('Billing Related', 'Patient registration error (KYC)', 1),
    ('Billing Related', 'Patient class/payer error', 2),
    ('Billing Related', 'Referral doctor/consultants name error', 3),
    ('Billing Related', 'Mode of payment (cash/card/ECS) error', 4),
    ('Billing Related', 'Wrong investigation/procedure/consultation', 5),
    ('Billing Related', 'Billing card errors', 6),
    ('Billing Related', 'Insurance/TPA Related billing errors', 7),
    ('Billing Related', 'Government credit patient related billing error', 8),
    ('Billing Related', 'Medicine and consumable related billing errors', 9),
    ('Billing Related', 'Blood bank related billing errors', 10),
    ('Billing Related', 'Billing cancellation and modification', 11),
    ('Billing Related', 'Others', 999),

    -- Security Related
    ('Security Related', 'Inappropriate behaviour of security staff', 1),
    ('Security Related', 'Theft/Burglary/Pilferage', 2),
    ('Security Related', 'Absconding Patient', 3),
    ('Security Related', 'Unauthorized Personnel Entry', 4),
    ('Security Related', 'Forbidden food items entry into hospital', 5),
    ('Security Related', 'Inebriated staff/visitor in hospital', 6),
    ('Security Related', 'Consumption/possession of tobacco products in the hospital premises', 7),
    ('Security Related', 'Security issues', 8),
    ('Security Related', 'Unauthorized work/activity', 9),
    ('Security Related', 'Theft & misconduct', 10),
    ('Security Related', 'Facility damage issues', 11),
    ('Security Related', 'Behavioural & discipline concerns', 12),
    ('Security Related', 'Health, safety & hygiene issue', 13),
    ('Security Related', 'Others', 999),

    -- Biomedical Related
    ('Biomedical Related', 'Equipment Safety Hazard', 1),
    ('Biomedical Related', 'Equipment/Accessories Lost/Missing', 2),
    ('Biomedical Related', 'Damaged during transfer/ use', 3),
    ('Biomedical Related', 'Unavailability of essential equipment/accessories', 4),
    ('Biomedical Related', 'Oxygen cylinder unavailability/low pressure', 5),
    ('Biomedical Related', 'Delayed preventive maintenance', 6),
    ('Biomedical Related', 'Mishandling of equipment/assets', 7),
    ('Biomedical Related', 'Delayed response to complaints/request', 8),
    ('Biomedical Related', 'Inappropriate documentation', 9),
    ('Biomedical Related', 'Unauthorised movement of equipment/accessories', 10),
    ('Biomedical Related', 'Others', 999),

    -- Blood Bank Related
    ('Blood Bank Related', 'Inappropriate storage of blood and blood products', 1),
    ('Blood Bank Related', 'Transfusion associated reactions', 2),
    ('Blood Bank Related', 'Inappropriate blood/blood component transfusion', 3),
    ('Blood Bank Related', 'Documentation related', 4),
    ('Blood Bank Related', 'Donor counselling related', 5),
    ('Blood Bank Related', 'Packaging and labelling related', 6),
    ('Blood Bank Related', 'Others', 999),

    -- Facility Related
    ('Facility Related', 'Delayed Response to Complaints/Request', 1),
    ('Facility Related', 'Damage to facility asset', 2),
    ('Facility Related', 'Misuse of amenities', 3),
    ('Facility Related', 'Unauthorized movement of facility item', 4),
    ('Facility Related', 'Inappropriate documentation', 5),
    ('Facility Related', 'Unauthorized encroachment of accommodation/amenities', 6),
    ('Facility Related', 'Others', 999),

    -- Doctor Related
    ('Doctor Related', 'Admission notes', 1),
    ('Doctor Related', 'Initial assessment notes', 2),
    ('Doctor Related', 'Doctors daily notes', 3),
    ('Doctor Related', 'Doctors transfer notes', 4),
    ('Doctor Related', 'Procedure notes', 5),
    ('Doctor Related', 'OT notes', 6),
    ('Doctor Related', 'Counselling notes', 7),
    ('Doctor Related', 'Use of unauthorized abbreviations', 8),
    ('Doctor Related', 'Non-signed documents- Consultants & RMOS', 9),
    ('Doctor Related', 'Non-compliance to verbal order policy', 10),
    ('Doctor Related', 'Prescription related error', 11),
    ('Doctor Related', 'Discharge summary related error', 12),
    ('Doctor Related', 'MLC related notes', 13),
    ('Doctor Related', 'Death related notes/Certificate errors', 14),
    ('Doctor Related', 'Cross-referral related notes', 15),
    ('Doctor Related', 'Others', 999),

    -- Consent Related
    ('Consent Related', 'Incorrect consent form/s used', 1),
    ('Consent Related', 'Incomplete consent form', 2),
    ('Consent Related', 'Consent not taken', 3),
    ('Consent Related', 'Consent given by unauthorized personnel', 4),
    ('Consent Related', 'Improper counselling about operative options before surgery', 5),
    ('Consent Related', 'Others', 999),

    -- CSSD Related
    ('CSSD Related', 'Delay in distribution', 1),
    ('CSSD Related', 'Documentation related', 2),
    ('CSSD Related', 'Packaging and labelling related', 3),
    ('CSSD Related', 'Sterility related', 4),
    ('CSSD Related', 'Package with no/illegible expiry dates', 5),
    ('CSSD Related', 'Unclean/non-functional packed equipments', 6),
    ('CSSD Related', 'Missing/broken instruments', 7),
    ('CSSD Related', 'Incomplete sterile set', 8),
    ('CSSD Related', 'Others', 999),

    -- Food and Beverages
    ('Food and Beverages', 'Foodborne illness', 1),
    ('Food and Beverages', 'Chemical contamination', 2),
    ('Food and Beverages', 'Inappropriate labelling/packaging', 3),
    ('Food and Beverages', 'Non-adherence to Food safety practices', 4),
    ('Food and Beverages', 'Inadequate quantity of food', 5),
    ('Food and Beverages', 'Deteriorated or stale product', 6),
    ('Food and Beverages', 'Taste and flavour related', 7),
    ('Food and Beverages', 'Foreign matter in food', 8),
    ('Food and Beverages', 'Delay in food service', 9),
    ('Food and Beverages', 'Inappropriate temperature of the food', 10),
    ('Food and Beverages', 'Unavailability of prescribed diet', 11),
    ('Food and Beverages', 'Diet counselling/diet plan related', 12),
    ('Food and Beverages', 'Presentation of food and cleanliness of utensils', 13),
    ('Food and Beverages', 'Hygiene and grooming of delivery person', 14),
    ('Food and Beverages', 'Others', 999),

    -- General Maintenance related
    ('General Maintenance related', 'Breakdown', 1),
    ('General Maintenance related', 'Inappropriate shutdown', 2),
    ('General Maintenance related', 'Delayed response to complaints/Request', 3),
    ('General Maintenance related', 'Misuse amenities (AC, light, fan, etc)', 4),
    ('General Maintenance related', 'Equipment safety hazard', 5),
    ('General Maintenance related', 'Delayed preventive maintenance', 6),
    ('General Maintenance related', 'Inappropriate documentation', 7),
    ('General Maintenance related', 'Unauthorised movement of items', 8),
    ('General Maintenance related', 'Others', 999),

    -- Hospital Emergency Codes Related
    ('Hospital Emergency Codes Related', 'Code Red', 1),
    ('Hospital Emergency Codes Related', 'Code Yellow', 2),
    ('Hospital Emergency Codes Related', 'Code White', 3),
    ('Hospital Emergency Codes Related', 'Code Pink', 4),
    ('Hospital Emergency Codes Related', 'Code Grey', 5),
    ('Hospital Emergency Codes Related', 'Code Green', 6),
    ('Hospital Emergency Codes Related', 'Code Black', 7),
    ('Hospital Emergency Codes Related', 'Code Brown', 8),
    ('Hospital Emergency Codes Related', 'Code Orange', 9),
    ('Hospital Emergency Codes Related', 'Code Blue', 10),
    ('Hospital Emergency Codes Related', 'Others', 999),

    -- HR Related
    ('HR Related', 'Grooming related', 1),
    ('HR Related', 'Behavioural issue', 2),
    ('HR Related', 'Inappropriate documentation', 3),
    ('HR Related', 'Training & development related', 4),
    ('HR Related', 'Others', 999),

    -- Housekeeping Related
    ('Housekeeping Related', 'Unclean toilet', 1),
    ('Housekeeping Related', 'Unclean room, floor and dustbin', 2),
    ('Housekeeping Related', 'Cobweb in any area', 3),
    ('Housekeeping Related', 'Pest control related', 4),
    ('Housekeeping Related', 'Delay in service', 5),
    ('Housekeeping Related', 'Inappropriate use of chemicals', 6),
    ('Housekeeping Related', 'Spill management error', 7),
    ('Housekeeping Related', 'Biomedical waste handling error', 8),
    ('Housekeeping Related', 'Mishandling of machine', 9),
    ('Housekeeping Related', 'Unavailability of soap, hand gel, etc', 10),
    ('Housekeeping Related', 'Inappropriate documentation', 11),
    ('Housekeeping Related', 'Others', 999),

    -- Infection Control Related
    ('Infection Control Related', 'Needle stick injury', 1),
    ('Infection Control Related', 'Improper segregation of Biomedical Waste', 2),
    ('Infection Control Related', 'Non-compliance of standard precautions during the patient care', 3),
    ('Infection Control Related', 'Splash of Hazardous/Infective Material', 4),
    ('Infection Control Related', 'Thrombophlebitis', 5),
    ('Infection Control Related', 'Improper segregation of soiled and dirty linen at source', 6),
    ('Infection Control Related', 'CAUTI (Catheter Associated Urinary Tract Infection)', 7),
    ('Infection Control Related', 'CLABSI (Central Line Associated Blood Stream Infection)', 8),
    ('Infection Control Related', 'VAP (Ventilator Associated Pneumonia)', 9),
    ('Infection Control Related', 'SSI (Surgical Site Infection)', 10),
    ('Infection Control Related', 'Others', 999),

    -- Lab Related
    ('Lab Related', 'Sample related', 1),
    ('Lab Related', 'Sample mishandling/loss', 2),
    ('Lab Related', 'Late reporting', 3),
    ('Lab Related', 'Incorrect/inappropriate results', 4),
    ('Lab Related', 'Clinical correlation related', 5),
    ('Lab Related', 'Critical value reports not being informed', 6),
    ('Lab Related', 'Expiry of reagents', 7),
    ('Lab Related', 'Reporting error in lab medicine', 8),
    ('Lab Related', 'Others', 999),

    -- Laundry and Linen related
    ('Laundry and Linen related', 'Inadequate supply of linen', 1),
    ('Laundry and Linen related', 'Unclean Linen', 2),
    ('Laundry and Linen related', 'Poor Quality of linen', 3),
    ('Laundry and Linen related', 'Packing & labelling related issue', 4),
    ('Laundry and Linen related', 'Segregation error', 5),
    ('Laundry and Linen related', 'Untimely delivery of linen', 6),
    ('Laundry and Linen related', 'Others', 999),

    -- Medication Related
    ('Medication Related', 'Prescription error', 1),
    ('Medication Related', 'Transcription error', 2),
    ('Medication Related', 'Dispensing error', 3),
    ('Medication Related', 'Error/Delay during administration', 4),
    ('Medication Related', 'Uninformed non-availability of essential drugs in pharmacy', 5),
    ('Medication Related', 'Incorrect storage', 6),
    ('Medication Related', 'Adverse drug reactions', 7),
    ('Medication Related', 'Incomplete/ incorrect documentation', 8),
    ('Medication Related', 'Contaminated/expired medicine', 9),
    ('Medication Related', 'Incorrect labeling', 10),
    ('Medication Related', 'Others', 999),

    -- Nursing Care Related
    ('Nursing Care Related', 'Violation of patient privacy', 1),
    ('Nursing Care Related', 'Injury or fall of patient', 2),
    ('Nursing Care Related', 'Behavioural issues with patients/doctors', 3),
    ('Nursing Care Related', 'Bed sores/pressure ulcers', 4),
    ('Nursing Care Related', 'Patient diet/feeding related issues', 5),
    ('Nursing Care Related', 'Multiple pricks', 6),
    ('Nursing Care Related', 'Non-availability of dressing/appropriate items', 7),
    ('Nursing Care Related', 'Return to ICU within 48 hours', 8),
    ('Nursing Care Related', 'Return to emergency within 72 hours with similar presenting complaint', 9),
    ('Nursing Care Related', 'Accidental removal of tubes and catheters', 10),
    ('Nursing Care Related', 'Restrained related injury', 11),
    ('Nursing Care Related', 'Thrombophlebitis case', 12),
    ('Nursing Care Related', 'Reintubation after planned extubation', 13),
    ('Nursing Care Related', 'Others', 999),

    -- Purchase Related
    ('Purchase Related', 'Prolonged non-availability of item', 1),
    ('Purchase Related', 'Inappropriate delay in procurement of item', 2),
    ('Purchase Related', 'Inappropriate documentation', 3),
    ('Purchase Related', 'Inappropriate storage of items', 4),
    ('Purchase Related', 'Stock related', 5),
    ('Purchase Related', 'Physical damage to items', 6),
    ('Purchase Related', 'Others', 999),

    -- Radiology Related
    ('Radiology Related', 'Inappropriate imaging', 1),
    ('Radiology Related', 'Inappropriate exposure to radiation', 2),
    ('Radiology Related', 'Inappropriate procedure', 3),
    ('Radiology Related', 'Site/side error', 4),
    ('Radiology Related', 'Delay in reporting', 5),
    ('Radiology Related', 'Incorrect/inappropriate results', 6),
    ('Radiology Related', 'Clinical correlation related', 7),
    ('Radiology Related', 'Documentation related', 8),
    ('Radiology Related', 'Critical value reports not being informed', 9),
    ('Radiology Related', 'Contrast extravasation in radiology', 10),
    ('Radiology Related', 'Reporting error in radiology', 11),
    ('Radiology Related', 'Contrast reaction in radiology', 12),
    ('Radiology Related', 'Others', 999),

    -- Store Related
    ('Store Related', 'Prolonged non-availability of item', 1),
    ('Store Related', 'Inappropriate delay in procurement of item', 2),
    ('Store Related', 'Inappropriate documentation', 3),
    ('Store Related', 'Inappropriate storage of items', 4),
    ('Store Related', 'Stock related', 5),
    ('Store Related', 'Physical damage of items', 6),
    ('Store Related', 'Others', 999),

    -- Software/Hardware Related
    ('Software/Hardware Related', 'HIMS related', 1),
    ('Software/Hardware Related', 'Hardware related', 2),
    ('Software/Hardware Related', 'Network related', 3),
    ('Software/Hardware Related', 'Breakdown', 4),
    ('Software/Hardware Related', 'Inappropriate shutdown', 5),
    ('Software/Hardware Related', 'Delayed Response to Complaints/Request', 6),
    ('Software/Hardware Related', 'Equipment safety hazard', 7),
    ('Software/Hardware Related', 'Delayed preventive maintenance', 8),
    ('Software/Hardware Related', 'Inappropriate documentation', 9),
    ('Software/Hardware Related', 'Others', 999),

    -- Surgery or Procedure Related
    ('Surgery or Procedure Related', 'Incorrect patient/site of surgery/procedure', 1),
    ('Surgery or Procedure Related', 'Site not marked', 2),
    ('Surgery or Procedure Related', 'Material/Consumable/ Drug not available before surgery', 3),
    ('Surgery or Procedure Related', 'Antibiotic prophylaxis not given in time before surgery', 4),
    ('Surgery or Procedure Related', 'Pre-anaesthetic checkup not done before surgery', 5),
    ('Surgery or Procedure Related', 'Pre-surgical orders not carried out', 6),
    ('Surgery or Procedure Related', 'Consents partial or incomplete', 7),
    ('Surgery or Procedure Related', 'Inadequate OT staff during surgery', 8),
    ('Surgery or Procedure Related', 'Expired CSSD packs', 9),
    ('Surgery or Procedure Related', 'Injury/adverse outcomes to patient during procedure', 10),
    ('Surgery or Procedure Related', 'Uninformed OT cancellation', 11),
    ('Surgery or Procedure Related', 'Unplanned return to OT', 12),
    ('Surgery or Procedure Related', 'Surgery rescheduled', 13),
    ('Surgery or Procedure Related', 'Adverse anaesthesia event', 14),
    ('Surgery or Procedure Related', 'Others', 999),

    -- Nursing Document Related
    ('Nursing Document Related', 'Initial assessment notes', 1),
    ('Nursing Document Related', 'Care plan', 2),
    ('Nursing Document Related', 'Daily monitoring notes', 3),
    ('Nursing Document Related', 'Drug Chart', 4),
    ('Nursing Document Related', 'Missing/pending Medical Record-Reports, films & scans', 5),
    ('Nursing Document Related', 'Improper handover of patients', 6),
    ('Nursing Document Related', 'Non-compliance to verbal order policy', 7),
    ('Nursing Document Related', 'Non-compliance to doctors written order', 8),
    ('Nursing Document Related', 'Non-recording of critical results and information to doctors', 9),
    ('Nursing Document Related', 'Non-documentation of patient safety parameters', 10),
    ('Nursing Document Related', 'Patient billing card errors', 11),
    ('Nursing Document Related', 'Discharge related document handover', 12),
    ('Nursing Document Related', 'MRD related', 13),
    ('Nursing Document Related', 'Medication and consumables related errors', 14),
    ('Nursing Document Related', 'MLC related documentation', 15),
    ('Nursing Document Related', 'Death related documentation', 16),
    ('Nursing Document Related', 'Crashcart and emergency cart related', 17),
    ('Nursing Document Related', 'Record and register maintenance', 18),
    ('Nursing Document Related', 'Improper handling of patients valuables and other items', 19),
    ('Nursing Document Related', 'Incorrect labeling of samples', 20),
    ('Nursing Document Related', 'Incorrect sample collection', 21),
    ('Nursing Document Related', 'Incorrect entry of investigation in system', 22),
    ('Nursing Document Related', 'Incorrect/Incomplete lab forms', 23),
    ('Nursing Document Related', 'Others', 999),

    -- Vehicle and Ambulance Related
    ('Vehicle and Ambulance Related', 'Ambulance medical equipment non-functional/non-available', 1),
    ('Vehicle and Ambulance Related', 'Delayed ambulance/vehicle service', 2),
    ('Vehicle and Ambulance Related', 'Mis/inadequate communications of ambulance/vehicle staff', 3),
    ('Vehicle and Ambulance Related', 'Inappropriate behaviour with patient/relatives/staff', 4),
    ('Vehicle and Ambulance Related', 'Incomplete daily checklist', 5),
    ('Vehicle and Ambulance Related', 'Unavailability of emergency medication', 6),
    ('Vehicle and Ambulance Related', 'Rash driving/accident', 7),
    ('Vehicle and Ambulance Related', 'Inebriated staff', 8),
    ('Vehicle and Ambulance Related', 'Poor maintenance of vehicle', 9),
    ('Vehicle and Ambulance Related', 'Inappropriate use of vehicle', 10),
    ('Vehicle and Ambulance Related', 'Inappropriate documentation', 11),
    ('Vehicle and Ambulance Related', 'Others', 999),

    -- Accommodation Related
    ('Accommodation Related', 'Others', 999)
)
INSERT INTO incident_category_types (category_id, name, sort_order)
SELECT ic.id, s.type_name, s.ord
FROM incident_categories ic
JOIN seeded s ON LOWER(TRIM(ic.name)) = LOWER(TRIM(s.cat_name))
ON CONFLICT (category_id, name) DO NOTHING;

-- Ensure every category always has an 'Others' fallback type
INSERT INTO incident_category_types (category_id, name, sort_order)
SELECT id, 'Others', 999
FROM incident_categories
ON CONFLICT (category_id, name) DO NOTHING;

-- Unify legacy HOD accounts into standard Employee role and retire legacy department reviewer tables
UPDATE users
SET role = 'employee', updated_at = NOW()
WHERE role = 'hod';

UPDATE master_employees
SET role = 'employee'
WHERE role = 'hod';

UPDATE department_reviewers
SET is_active = FALSE, updated_at = NOW()
WHERE is_active = TRUE;

UPDATE departments
SET hod_user_id = NULL,
    assigned_user_id = NULL,
    incharge_user_id = NULL,
    asst_coo_user_id = NULL
WHERE hod_user_id IS NOT NULL
   OR assigned_user_id IS NOT NULL
   OR incharge_user_id IS NOT NULL
   OR asst_coo_user_id IS NOT NULL;
