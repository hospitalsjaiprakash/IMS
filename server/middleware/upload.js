const crypto = require('node:crypto');
const multer = require('multer');
const path = require('path');
const { s3Client, isR2Configured, uploadToR2 } = require('../config/s3');
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

// Helper to build an unguessable S3 key with folder structure: referenceId/folder/filename
async function buildS3Key(req, file, stage) {
  const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}`;
  const cleanedName = (file.originalname || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.');
  const safeFilename = `${uniqueSuffix}-${cleanedName}`;
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

  // Fallback for new incidents (submission stage - no ID yet) or broadcast uploads
  return `pending/${folder}/${safeFilename}`;
}

// Allowed file types: only images and PDF
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const EXTENSION_TO_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Inspect actual binary magic bytes to prevent MIME/extension spoofing.
 * Validates exact file signatures for JPEG, PNG, WEBP, and PDF.
 */
function hasValidMagicBytes(buffer, expectedMime) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) return false;

  switch (expectedMime) {
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
      return buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC);
    case 'image/webp':
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'application/pdf':
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    default:
      return false;
  }
}

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
  const expectedMime = EXTENSION_TO_MIME[ext];
  if (expectedMime && file.mimetype !== expectedMime) {
    const err = new Error(`File extension "${ext}" does not match declared MIME type "${file.mimetype}".`);
    err.statusCode = 400;
    return cb(err, false);
  }
  cb(null, true);
};

const limits = {
  fileSize: (process.env.NODE_ENV === 'test' ? 2 : parseInt(process.env.MAX_FILE_SIZE_MB || '2', 10)) * 1024 * 1024,
};

// Parse uploads into memory (strictly capped at 2MB/file) so binary magic bytes are
// verified BEFORE a single byte is ever persisted to Cloudflare R2.
const memoryMulter = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits
});

/**
 * Collect all uploaded file objects from req.file / req.files (array or fields map).
 */
function collectUploadedFiles(req) {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    for (const list of Object.values(req.files)) {
      if (Array.isArray(list)) files.push(...list);
    }
  }
  return files;
}

/**
 * Verify binary magic bytes for every uploaded file and persist validated buffers to Cloudflare R2.
 */
function wrapWithMagicBytesAndR2(multerHandler) {
  return (req, res, next) => {
    const r2Ready = isR2Configured() && s3Client && process.env.S3_BUCKET_NAME;
    if (!r2Ready && process.env.NODE_ENV !== 'test') {
      return next(new Error('Cloudflare R2 storage is not configured. Server upload folder is disabled.'));
    }

    multerHandler(req, res, async (multerErr) => {
      if (multerErr) return next(multerErr);

      const files = collectUploadedFiles(req);
      if (files.length === 0) return next();

      try {
        const stage = req._uploadStage || 'submission';

        // 1. Validate magic bytes on ALL files before uploading any file to R2
        for (const file of files) {
          const ext = path.extname(file.originalname || '').toLowerCase();
          const expectedMime = EXTENSION_TO_MIME[ext] || file.mimetype;
          if (!hasValidMagicBytes(file.buffer, expectedMime)) {
            const err = new Error(
              `File "${file.originalname}" failed binary signature verification. File content is not a valid image (JPG, PNG, WEBP) or PDF.`
            );
            err.statusCode = 400;
            return next(err);
          }
        }

        // 2. Upload validated files to Cloudflare R2 (skip remote R2 writes during automated tests unless explicitly enabled)
        const shouldUploadToR2 = r2Ready && (process.env.NODE_ENV !== 'test' || process.env.TEST_ALLOW_R2_UPLOAD === 'true');
        for (const file of files) {
          const key = await buildS3Key(req, file, stage);
          if (shouldUploadToR2) {
            await uploadToR2(key, file.buffer, file.mimetype, {
              fieldName: file.fieldname,
              stage
            });
            file.bucket = process.env.S3_BUCKET_NAME;
          }
          file.key = key;
          file.filename = key;
          // Release in-memory buffer once validated and persisted to R2
          delete file.buffer;
        }

        return next();
      } catch (err) {
        return next(err);
      }
    });
  };
}

const upload = {
  array: (fieldName, maxCount) => wrapWithMagicBytesAndR2(memoryMulter.array(fieldName, maxCount)),
  single: (fieldName) => wrapWithMagicBytesAndR2(memoryMulter.single(fieldName)),
  fields: (fields) => wrapWithMagicBytesAndR2(memoryMulter.fields(fields)),
};

if (!isR2Configured() && process.env.NODE_ENV !== 'test') {
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
  hasValidMagicBytes,
  buildS3Key,
  uploadIncidentAttachments: upload.array('attachments', 10),
  uploadSingle: (fieldName) => upload.single(fieldName),
};
