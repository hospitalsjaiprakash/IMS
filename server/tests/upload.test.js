const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { uploadIncidentAttachments } = require('../middleware/upload');

describe('File Upload Security & Size Constraints', () => {
  const app = express();
  app.use(express.json());

  // Test route using our hardened middleware
  app.post('/test-upload', uploadIncidentAttachments, (req, res) => {
    res.status(200).json({
      success: true,
      filesCount: req.files ? req.files.length : 0,
      filenames: req.files ? req.files.map(f => f.filename || f.key) : []
    });
  });

  // Central error handler matching server/index.js
  app.use((err, req, res, next) => {
    if (err.name === 'MulterError') {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ status: 'error', error: 'File size exceeds maximum allowed limit of 2MB per file.' });
      }
      return res.status(400).json({ status: 'error', error: err.message });
    }
    if (err.statusCode === 400 || (err.message && (err.message.includes('not allowed') || err.message.includes('not permitted')))) {
      return res.status(400).json({ status: 'error', error: err.message });
    }
    res.status(500).json({ status: 'error', error: err.message });
  });

  const scratchDir = path.resolve(__dirname, '../scratch-test');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  after(() => {
    // Cleanup temporary test files
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (_) {}
  });

  test('accepts valid PNG image under 2MB', async () => {
    const pngPath = path.join(scratchDir, 'test-image.png');
    // Minimal 1x1 PNG header
    const pngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
    fs.writeFileSync(pngPath, pngBuffer);

    const res = await request(app)
      .post('/test-upload')
      .attach('attachments', pngPath)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.filesCount, 1);
  });

  test('accepts valid PDF document under 2MB', async () => {
    const pdfPath = path.join(scratchDir, 'test-document.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4\n%...\n%%EOF');

    const res = await request(app)
      .post('/test-upload')
      .attach('attachments', pdfPath)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.filesCount, 1);
  });

  test('rejects disallowed file extension (.txt)', async () => {
    const txtPath = path.join(scratchDir, 'notes.txt');
    fs.writeFileSync(txtPath, 'Sample text content');

    const res = await request(app)
      .post('/test-upload')
      .attach('attachments', txtPath)
      .expect(400);

    assert.ok(res.body.error.includes('Only images (JPG, PNG, WEBP) and PDF files are permitted'));
  });

  test('rejects executable / script upload (.php)', async () => {
    const scriptPath = path.join(scratchDir, 'shell.php');
    fs.writeFileSync(scriptPath, '<?php echo "malicious"; ?>');

    const res = await request(app)
      .post('/test-upload')
      .attach('attachments', scriptPath)
      .expect(400);

    assert.ok(res.body.error.includes('not allowed'));
  });

  test('rejects files exceeding 2MB size limit', async () => {
    const largePath = path.join(scratchDir, 'oversized.png');
    // Allocate 2.5 MB buffer
    const largeBuffer = Buffer.alloc(2.5 * 1024 * 1024, 0);
    fs.writeFileSync(largePath, largeBuffer);

    const res = await request(app)
      .post('/test-upload')
      .attach('attachments', largePath)
      .expect(400);

    assert.ok(res.body.error.includes('exceeds maximum allowed limit of 2MB'));
  });
});
