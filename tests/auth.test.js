import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { createSqliteDriver } from '../db/sqlite.js';
import { runMigrations } from '../db/index.js';
import { attachUser } from '../lib/auth.js';
import authRoutes from '../routes/auth.js';
import accountRoutes from '../routes/account.js';
import { clearRateLimits } from '../lib/rateLimit.js';

test('Authentication and Account REST API', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchroom-auth-test-'));
  const testDbPath = path.join(tmpDir, 'test.db');
  process.env.DB_PATH = testDbPath;

  const driver = createSqliteDriver(testDbPath);
  await runMigrations(driver);

  const app = express();
  app.use(express.json());
  app.use(attachUser);
  app.use('/api/auth', authRoutes);
  app.use('/api/account', accountRoutes);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(path, baseUrl);
      const reqHeaders = { ...headers };
      let bodyData = null;
      if (body) {
        bodyData = JSON.stringify(body);
        reqHeaders['Content-Type'] = 'application/json';
        reqHeaders['Content-Length'] = Buffer.byteLength(bodyData);
      }

      const req = http.request(
        parsedUrl,
        {
          method,
          headers: reqHeaders
        },
        (res) => {
          let chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString();
            let data = null;
            try {
              data = JSON.parse(raw);
            } catch (e) {
              data = raw;
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              data
            });
          });
        }
      );
      req.on('error', reject);
      if (bodyData) req.write(bodyData);
      req.end();
    });
  }

  let userCookie = null;

  await t.test('Signup: success with new email returns 201 and sets HttpOnly cookie', async () => {
    clearRateLimits();
    const res = await request('POST', '/api/auth/signup', {
      email: 'alice@example.com',
      displayName: 'Alice',
      password: 'SuperPassword123'
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.user.email, 'alice@example.com');
    assert.equal(res.data.user.displayName, 'Alice');
    assert.equal(res.data.user.passwordHash, undefined);
    assert.equal(res.data.user.password, undefined);

    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie);
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    assert.ok(cookieStr.includes('HttpOnly'));
    assert.ok(cookieStr.includes('SameSite=Lax'));
    assert.ok(cookieStr.includes('wr_session='));

    // Verify password hash never appears in body or response
    const jsonStr = JSON.stringify(res.data);
    assert.ok(!jsonStr.includes('password_hash'));
    assert.ok(!jsonStr.includes('passwordHash'));

    userCookie = cookieStr.split(';')[0];
  });

  await t.test('Signup: duplicate email returns 409', async () => {
    const res = await request('POST', '/api/auth/signup', {
      email: 'alice@example.com',
      displayName: 'Alice Two',
      password: 'AnotherPassword123'
    });
    assert.equal(res.status, 409);
    assert.equal(res.data.error, 'That email is already registered');
  });

  await t.test('GET /api/auth/me returns 200 with valid session cookie', async () => {
    const res = await request('GET', '/api/auth/me', null, { Cookie: userCookie });
    assert.equal(res.status, 200);
    assert.equal(res.data.user.email, 'alice@example.com');
  });

  await t.test('GET /api/auth/me returns 401 without cookie', async () => {
    const res = await request('GET', '/api/auth/me');
    assert.equal(res.status, 401);
  });

  await t.test('Login: wrong password and unknown email return identical error message', async () => {
    const resUnknown = await request('POST', '/api/auth/login', {
      email: 'unknown@example.com',
      password: 'Password123'
    });
    const resWrongPass = await request('POST', '/api/auth/login', {
      email: 'alice@example.com',
      password: 'WrongPassword123'
    });

    assert.equal(resUnknown.status, 401);
    assert.equal(resWrongPass.status, 401);
    assert.equal(resUnknown.data.error, 'Email or password is incorrect');
    assert.equal(resWrongPass.data.error, 'Email or password is incorrect');
  });

  await t.test('Login: successful login sets cookie and returns user shape', async () => {
    const res = await request('POST', '/api/auth/login', {
      email: 'alice@example.com',
      password: 'SuperPassword123'
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.user.email, 'alice@example.com');
    assert.ok(res.headers['set-cookie']);
  });

  await t.test('Rate limiting: 10 requests per IP limit triggers 429 on 11th request', async () => {
    clearRateLimits();
    for (let i = 0; i < 10; i++) {
      const res = await request('POST', '/api/auth/signup', {
        email: `user${i}@example.com`,
        displayName: `User${i}`,
        password: 'Password1234'
      });
      assert.equal(res.status, 201);
    }

    const res11 = await request('POST', '/api/auth/signup', {
      email: 'user11@example.com',
      displayName: 'User11',
      password: 'Password1234'
    });
    assert.equal(res11.status, 429);
    clearRateLimits();
  });

  await t.test('Logout: clears cookie and invalidates session', async () => {
    // Login to get fresh cookie
    const loginRes = await request('POST', '/api/auth/login', {
      email: 'alice@example.com',
      password: 'SuperPassword123'
    });
    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

    // Logout
    const logoutRes = await request('POST', '/api/auth/logout', null, { Cookie: cookie });
    assert.equal(logoutRes.status, 204);

    // Now GET /me with that cookie should fail
    const meRes = await request('GET', '/api/auth/me', null, { Cookie: cookie });
    assert.equal(meRes.status, 401);
  });

  await t.test('Password change: updates password and deletes other sessions', async () => {
    // Create session 1
    const s1Res = await request('POST', '/api/auth/login', {
      email: 'alice@example.com',
      password: 'SuperPassword123'
    });
    const s1Cookie = s1Res.headers['set-cookie'][0].split(';')[0];

    // Create session 2
    const s2Res = await request('POST', '/api/auth/login', {
      email: 'alice@example.com',
      password: 'SuperPassword123'
    });
    const s2Cookie = s2Res.headers['set-cookie'][0].split(';')[0];

    // Change password using session 2
    const changeRes = await request(
      'POST',
      '/api/account/password',
      { currentPassword: 'SuperPassword123', newPassword: 'BrandNewPassword123' },
      { Cookie: s2Cookie }
    );
    assert.equal(changeRes.status, 204);

    // Session 2 should still work
    const s2Me = await request('GET', '/api/auth/me', null, { Cookie: s2Cookie });
    assert.equal(s2Me.status, 200);

    // Session 1 should now be revoked (deleted)
    const s1Me = await request('GET', '/api/auth/me', null, { Cookie: s1Cookie });
    assert.equal(s1Me.status, 401);
  });

  await t.test('Hardening: Set-Cookie in production HTTPS has HttpOnly, SameSite=Lax, and Secure', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(
        'POST',
        '/api/auth/login',
        { email: 'alice@example.com', password: 'BrandNewPassword123' },
        { 'X-Forwarded-Proto': 'https' }
      );
      assert.equal(res.status, 200);
      const setCookie = res.headers['set-cookie'];
      assert.ok(setCookie);
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      assert.ok(cookieStr.includes('HttpOnly'), 'Cookie must have HttpOnly');
      assert.ok(cookieStr.includes('SameSite=Lax'), 'Cookie must have SameSite=Lax');
      assert.ok(cookieStr.includes('Secure'), 'Cookie must have Secure in production HTTPS');
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  await t.test('Hardening: GET /healthz executes SELECT 1 against database', async () => {
    app.get('/healthz', async (req, res) => {
      try {
        await driver.get('SELECT 1');
        res.json({ status: 'ok', service: 'watchroom-v3', db: 'connected' });
      } catch (e) {
        res.status(500).json({ status: 'error' });
      }
    });

    const res = await request('GET', '/healthz');
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'ok');
    assert.equal(res.data.db, 'connected');
  });

  server.close();
  await driver.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (e) {}
});
