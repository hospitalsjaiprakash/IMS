/**
 * JPHRC IMS - Mock OfficePortal HRMS Public API v1 Server
 * 
 * Standalone mock server simulating OfficePortal's Public API:
 * - POST /publicapi/connect/token (OAuth 2.0 Client Credentials Grant)
 * - GET  /employee/api/v1/employees (Paginated Employee Directory)
 * - GET  /employee/api/v1/employees/changes (Delta Change Feed)
 * - POST /mock/dispatch-webhook (Generates and dispatches HMAC-SHA256 signed webhooks to HIMS)
 * 
 * Usage:
 * node scripts/mock-hrms-server.js
 */

const http = require('http');
const { createHmac } = require('crypto');
const { URL } = require('url');

const PORT = parseInt(process.env.MOCK_HRMS_PORT, 10) || 5050;
const VALID_CLIENT_ID = process.env.OFFICEPORTAL_CLIENT_ID || 'demo_jphrc_client_id';
const VALID_CLIENT_SECRET = process.env.OFFICEPORTAL_CLIENT_SECRET || process.env.OFFICEPORTAL_API_KEY || 'demo_jphrc_secret_key_123';
const WEBHOOK_SIGNING_KEY = process.env.OFFICEPORTAL_WEBHOOK_KEY || process.env.OFFICEPORTAL_WEBHOOK_SECRET || 'whsec_5f0c8e2a7b4d1f9036c2e8a5b7d0f3c6e9a1b4d7f0c3e6a9b2d5f8c1e4a7b0d3';

// Sample Mock Employee Dataset matching OfficePortal schema
const MOCK_EMPLOYEES = [
  {
    employeeId: 'f01a1c0d-0001-4a58-b6c1-000000000001',
    employeeCode: '12243',
    firstName: 'Sourav',
    lastName: 'Barik',
    fullName: 'Sourav Barik',
    departmentName: 'Digital Communications',
    jobTitleName: 'System Administrator',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'sourav.barik@jphrc.org',
    mobileNumber: '+91 98765 43200',
    status: 'active',
    dateOfJoining: '2021-01-15T00:00:00Z',
    terminationDate: null
  },
  {
    employeeId: 'f01a1c0d-0002-4a58-b6c1-000000000002',
    employeeCode: '10001',
    firstName: 'Alok',
    lastName: 'Mohanty',
    fullName: 'Dr. Alok Mohanty',
    departmentName: 'MD Office',
    jobTitleName: 'Medical Director',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'alok.mohanty@jphrc.org',
    mobileNumber: '+91 98765 43201',
    status: 'active',
    dateOfJoining: '2018-05-10T00:00:00Z',
    terminationDate: null
  },
  {
    employeeId: 'f01a1c0d-0003-4a58-b6c1-000000000003',
    employeeCode: '22222',
    firstName: 'Biswa Ranjan',
    lastName: 'Dash',
    fullName: 'Dr. Biswa Ranjan Dash',
    departmentName: 'Quality Management',
    jobTitleName: 'Head of Quality & IMC Lead',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'biswaranjan.dash@jphrc.org',
    mobileNumber: '+91 82499 91648',
    status: 'active',
    dateOfJoining: '2019-03-01T00:00:00Z',
    terminationDate: null
  },
  {
    employeeId: 'f01a1c0d-0004-4a58-b6c1-000000000004',
    employeeCode: '10101',
    firstName: 'Rajesh',
    lastName: 'Sharma',
    fullName: 'Dr. Rajesh Sharma',
    departmentName: 'Medical Services',
    jobTitleName: 'Chief Medical Officer (HOD)',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'rajesh.sharma@jphrc.org',
    mobileNumber: '+91 98765 43210',
    status: 'active',
    dateOfJoining: '2017-08-20T00:00:00Z',
    terminationDate: null
  },
  {
    employeeId: 'f01a1c0d-0005-4a58-b6c1-000000000005',
    employeeCode: '10201',
    firstName: 'Mary',
    lastName: 'Mathew',
    fullName: 'Sister Mary Mathew',
    departmentName: 'Nursing Services',
    jobTitleName: 'Nursing Superintendent (HOD)',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'mary.mathew@jphrc.org',
    mobileNumber: '+91 98765 43213',
    status: 'active',
    dateOfJoining: '2018-11-01T00:00:00Z',
    terminationDate: null
  },
  {
    employeeId: 'f01a1c0d-0006-4a58-b6c1-000000000006',
    employeeCode: '10202',
    firstName: 'Priyanka',
    lastName: 'Mohanty',
    fullName: 'Priyanka Mohanty',
    departmentName: 'Nursing Services',
    jobTitleName: 'Senior Staff Nurse',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'priyanka.mohanty@jphrc.org',
    mobileNumber: '+91 98765 43214',
    status: 'noticePeriod',
    dateOfJoining: '2020-02-15T00:00:00Z',
    terminationDate: null
  },
  {
    employeeId: 'f01a1c0d-0007-4a58-b6c1-000000000007',
    employeeCode: '10999',
    firstName: 'Sunil',
    lastName: 'Verma',
    fullName: 'Sunil Verma',
    departmentName: 'Housekeeping',
    jobTitleName: 'Former Assistant',
    officeLocationName: 'Dandiapali Main Hospital',
    workEmail: 'sunil.verma@jphrc.org',
    mobileNumber: '+91 98765 43299',
    status: 'terminated',
    dateOfJoining: '2021-04-01T00:00:00Z',
    terminationDate: '2026-08-31T00:00:00Z'
  }
];

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const str = raw.toString('utf8');
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(str);
        const obj = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        resolve({ raw, obj });
      } else if (contentType.includes('application/json')) {
        try {
          resolve({ raw, obj: JSON.parse(str || '{}') });
        } catch (e) {
          resolve({ raw, obj: {} });
        }
      } else {
        resolve({ raw, obj: {} });
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // 1. OAuth 2.0 Token Endpoint
  if (req.method === 'POST' && pathname === '/publicapi/connect/token') {
    const { obj } = await parseBody(req);
    const grantType = obj.grant_type;
    const clientId = obj.client_id;
    const clientSecret = obj.client_secret;

    if (grantType !== 'client_credentials') {
      return sendJson(res, 400, { error: 'unsupported_grant_type' });
    }

    if (!clientId || !clientSecret) {
      return sendJson(res, 400, { error: 'invalid_client' });
    }

    const token = `mock_token_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    return sendJson(res, 200, {
      access_token: token,
      expires_in: 900,
      token_type: 'Bearer',
      scope: 'emp:read'
    });
  }

  // Check Bearer Token on API routes
  if (pathname.startsWith('/employee/api/v1/')) {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      return sendJson(res, 401, { error: 'Invalid token' });
    }
  }

  // 2. GET /employee/api/v1/employees (Directory Endpoint)
  if (req.method === 'GET' && pathname === '/employee/api/v1/employees') {
    const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
    const perPage = parseInt(parsedUrl.searchParams.get('perPage') || '100', 10);
    const startIndex = (page - 1) * perPage;
    const pageData = MOCK_EMPLOYEES.slice(startIndex, startIndex + perPage);

    return sendJson(res, 200, {
      data: pageData,
      pagination: {
        totalCount: MOCK_EMPLOYEES.length,
        pageNumber: page,
        pageSize: perPage,
        totalPages: Math.ceil(MOCK_EMPLOYEES.length / perPage)
      }
    });
  }

  // 3. GET /employee/api/v1/employees/changes (Change Feed Endpoint)
  if (req.method === 'GET' && pathname === '/employee/api/v1/employees/changes') {
    const token = parsedUrl.searchParams.get('token');

    if (!token) {
      // First call: return all mock employees as upserted
      return sendJson(res, 200, {
        data: MOCK_EMPLOYEES.map(emp => ({
          changeType: 'upserted',
          employeeId: emp.employeeId,
          changedAt: new Date().toISOString(),
          employee: emp
        })),
        nextCursor: 'cursor_checkpoint_page_1'
      });
    }

    // Subsequent call with cursor: return empty or single update
    return sendJson(res, 200, {
      data: [],
      nextCursor: null
    });
  }

  // 4. POST /mock/dispatch-webhook (Testing utility to dispatch a signed webhook to HIMS)
  if (req.method === 'POST' && pathname === '/mock/dispatch-webhook') {
    const { obj } = await parseBody(req);
    const targetUrl = obj.targetUrl || 'http://localhost:5000/api/webhooks/officeportal';
    const eventType = obj.eventType || 'employee.updated';
    const employeeData = obj.employee || MOCK_EMPLOYEES[0];
    const signingKey = obj.signingKey || WEBHOOK_SIGNING_KEY;

    const payload = JSON.stringify({
      apiVersion: 'v1',
      deliveryId: `del-${Date.now()}`,
      events: [
        {
          eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          types: [eventType],
          occurredAt: new Date().toISOString(),
          attempt: 1,
          data: employeeData
        }
      ]
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = Buffer.concat([
      Buffer.from(`${timestamp}.`, 'utf8'),
      Buffer.from(payload, 'utf8')
    ]);

    const signature = createHmac('sha256', signingKey)
      .update(signedPayload)
      .digest('hex');

    const signatureHeader = `t=${timestamp},v1=${signature}`;

    // Send HTTP POST to HIMS endpoint
    try {
      const parsedTarget = new URL(targetUrl);
      const postReq = http.request({
        hostname: parsedTarget.hostname,
        port: parsedTarget.port,
        path: parsedTarget.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(payload),
          'X-Awarious-Signature': signatureHeader
        }
      }, (postRes) => {
        let respBody = '';
        postRes.on('data', d => respBody += d);
        postRes.on('end', () => {
          sendJson(res, 200, {
            success: true,
            dispatchedTo: targetUrl,
            statusReceived: postRes.statusCode,
            responseBody: respBody,
            signatureHeader
          });
        });
      });

      postReq.on('error', (err) => {
        sendJson(res, 502, { error: `Failed to dispatch: ${err.message}` });
      });

      postReq.write(payload);
      postReq.end();
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  // 404 Fallback
  return sendJson(res, 404, { error: 'Not found' });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`   OfficePortal Public API Mock Server Running        `);
    console.log(`   Listening at: http://localhost:${PORT}             `);
    console.log(`   Token Endpoint:   /publicapi/connect/token         `);
    console.log(`   Employees Endpoint: /employee/api/v1/employees     `);
    console.log(`   Changes Endpoint:   /employee/api/v1/employees/changes`);
    console.log(`   Webhook Dispatcher: /mock/dispatch-webhook         `);
    console.log(`======================================================\n`);
  });
}

module.exports = { server, MOCK_EMPLOYEES, PORT };
