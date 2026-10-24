const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Cloudflare R2 / S3 Client Initialization
let s3Client = null;

const isR2Configured = () => {
  return Boolean(
    process.env.S3_ENDPOINT_URL &&
    process.env.S3_BUCKET_NAME &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
};

if (isR2Configured()) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT_URL,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
  });
}

/**
 * Direct buffer upload to Cloudflare R2 (ensures zero local disk usage)
 * @param {string} key R2 object key
 * @param {Buffer|Uint8Array|string} body Content
 * @param {string} contentType MIME type
 * @param {Object} metadata Optional metadata
 */
async function uploadToR2(key, body, contentType = 'application/octet-stream', metadata = {}) {
  if (!s3Client || !process.env.S3_BUCKET_NAME) {
    throw new Error('Cloudflare R2 storage is not configured. Local disk fallback is disabled.');
  }

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata
  });

  return await s3Client.send(command);
}

module.exports = {
  s3Client,
  isR2Configured,
  uploadToR2
};
