const { S3Client } = require('@aws-sdk/client-s3');

// S3 / Cloudflare R2 Client Initialization
// Ensure you have these environment variables set in your .env file:
// AWS_ACCESS_KEY_ID
// AWS_SECRET_ACCESS_KEY
// AWS_REGION
// S3_ENDPOINT_URL (e.g. https://<ACCOUNT_ID>.r2.cloudflarestorage.com)

let s3Client = null;

if (process.env.S3_ENDPOINT_URL) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT_URL,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
  });
  console.log('S3/R2 Client Initialized');
} else {
  console.log('S3/R2 Client NOT Initialized (Missing S3_ENDPOINT_URL)');
}

module.exports = { s3Client };
