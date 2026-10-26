const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

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

/**
 * Retrieve an object from Cloudflare R2 as a Buffer
 * @param {string} key R2 object key
 * @returns {Promise<Buffer>}
 */
async function downloadFromR2(key) {
  if (!s3Client || !process.env.S3_BUCKET_NAME) {
    throw new Error('Cloudflare R2 storage is not configured.');
  }

  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key
  });

  const response = await s3Client.send(command);
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Generate a pre-signed URL for direct browser download from R2
 * @param {string} key R2 object key
 * @param {string} [downloadFilename] Optional filename for Content-Disposition
 * @param {number} [expiresIn=3600] Seconds valid
 */
async function getPresignedDownloadUrl(key, downloadFilename = null, expiresIn = 3600) {
  if (!s3Client || !process.env.S3_BUCKET_NAME) {
    throw new Error('Cloudflare R2 storage is not configured.');
  }

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key
  };

  if (downloadFilename) {
    params.ResponseContentDisposition = `attachment; filename="${downloadFilename}"`;
  }

  const command = new GetObjectCommand(params);
  return await getSignedUrl(s3Client, command, { expiresIn });
}

module.exports = {
  s3Client,
  isR2Configured,
  uploadToR2,
  downloadFromR2,
  getPresignedDownloadUrl
};
