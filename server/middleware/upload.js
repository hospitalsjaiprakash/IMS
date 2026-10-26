const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const { s3Client, isR2Configured } = require('../config/s3');
const { query } = require('../config/database');

// Maps DB stage names to human-readable R2 folder names
const stageFolderMap = {
  submission: 'employee',
  hod_feedback: 'hod',
  imc_feedback: 'imc',
  md_decision: 'mgmt',
  investigator_report: 'investigator',
  broadcast: 'broadcast',
  imc_report: 'imc_report',
  formal_letter: 'letters',
  trainer_report: 'trainer',
};

// Helper to build the S3 key with folder structure: referenceId/folder/filename
async function buildS3Key(req, file, stage) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const safeFilename = uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const folder = stageFolderMap[stage] || stage || 'misc';

  // Try to get incident reference_id from route param
  const incidentId = req.params && req.params.id;
  if (incidentId) {
    try {
      const result = await query('SELECT reference_id FROM incidents WHERE id = $1', [incidentId]);
      if (result.rows.length > 0) {
        // Convert JPHRC/IMS/2026/00001 -> JPHRC-IMS-2026-00001 (safe folder name)
        const refId = result.rows[0].reference_id.replace(/\//g, '-');
        return `${refId}/${folder}/${safeFilename}`;
      }
    } catch (e) {
      console.error('[R2 Key] Failed to fetch reference_id:', e.message);
    }
  }

  // Fallback for new incidents (submission stage - no ID yet)
  return `pending/${folder}/${safeFilename}`;
}

// Allowed file types: only images and PDF
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error(`File type "${ext || 'unknown'}" is not allowed. Only images (JPG, PNG, WEBP) and PDF files are permitted.`);
    err.statusCode = 400;
    return cb(err, false);
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const err = new Error(`File MIME type "${file.mimetype}" is not permitted. Only images and PDF files are allowed.`);
    err.statusCode = 400;
    return cb(err, false);
  }
  cb(null, true);
};

const limits = {
  fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '2', 10) * 1024 * 1024,
};

let upload;

if (isR2Configured() && s3Client && process.env.S3_BUCKET_NAME) {
  // STRICT CLOUDFLARE R2 DRIVER (Zero Local Disk Storage)
  upload = multer({
    storage: multerS3({
      s3: s3Client,
      bucket: process.env.S3_BUCKET_NAME,
      metadata: function (req, file, cb) {
        cb(null, { fieldName: file.fieldname, stage: req._uploadStage || 'submission' });
      },
      key: async function (req, file, cb) {
        try {
          const stage = req._uploadStage || 'submission';
          const key = await buildS3Key(req, file, stage);
          cb(null, key);
        } catch (err) {
          cb(err);
        }
      }
    }),
    fileFilter,
    limits
  });
} else if (process.env.NODE_ENV === 'test') {
  // In automated test environments without R2 credentials, use memory storage for MIME/size validation
  upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits
  });
} else {
  // If R2 is not configured, strictly prohibit local disk upload fallback as per hospital directive
  upload = {
    array: () => (req, res, next) => next(new Error('Cloudflare R2 storage is not configured. Server upload folder is disabled.')),
    single: () => (req, res, next) => next(new Error('Cloudflare R2 storage is not configured. Server upload folder is disabled.')),
    fields: () => (req, res, next) => next(new Error('Cloudflare R2 storage is not configured. Server upload folder is disabled.')),
  };
  console.warn('⚠️ [STORAGE] Cloudflare R2 is not configured. Local disk fallback is disabled.');
}

/**
 * Helper middleware to set the upload stage for S3 folder organization
 * @param {string} stage
 */
const setUploadStage = (stage) => (req, _, next) => {
  req._uploadStage = stage;
  next();
};

module.exports = {
  upload,
  setUploadStage,
  uploadIncidentAttachments: upload.array('attachments', 10),
  uploadSingle: (fieldName) => upload.single(fieldName),
};
