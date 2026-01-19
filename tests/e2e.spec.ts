import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3333';

test.describe('DCS Demo - Zero Trust Application', () => {
  test.describe('Seeding', () => {
    test('should have seed admin user in database', async ({ request }) => {
      // Login with seed credentials
      const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          username: 'seed',
          password: 'init'
        }
      });

      expect(loginResponse.ok()).toBeTruthy();
      const loginData = await loginResponse.json();
      expect(loginData.user.username).toBe('seed');
      expect(loginData.user.role).toBe('admin-role');
    });

    test('should reject invalid credentials', async ({ request }) => {
      const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          username: 'seed',
          password: 'wrongpassword'
        }
      });

      expect(loginResponse.status()).toBe(401);
    });
  });

  test.describe('User Management', () => {
    let cookies: string;

    test.beforeEach(async ({ request }) => {
      // Login as seed admin
      const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          username: 'seed',
          password: 'init'
        }
      });
      cookies = loginResponse.headers()['set-cookie'] || '';
    });

    test('should list users', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/users`, {
        headers: { Cookie: cookies }
      });

      expect(response.ok()).toBeTruthy();
      const users = await response.json();
      expect(Array.isArray(users)).toBeTruthy();
      expect(users.length).toBeGreaterThan(0);
      expect(users[0]).toHaveProperty('username');
    });

    test('should create new user with encrypted PII data', async ({ request }) => {
      const testUsername = `testuser_${Date.now()}`;

      // Create user with encrypted data (simulated - in real app, encryption happens client-side)
      const createResponse = await request.post(`${BASE_URL}/api/users`, {
        headers: { Cookie: cookies },
        data: {
          username: testUsername,
          password: 'testpass123',
          name: 'ENCRYPTED_NAME_DATA_BASE64',
          surname: 'ENCRYPTED_SURNAME_DATA_BASE64',
          email: 'ENCRYPTED_EMAIL_DATA_BASE64',
          publicKey: 'TEST_PUBLIC_KEY_BASE64'
        }
      });

      expect(createResponse.ok()).toBeTruthy();
      const createData = await createResponse.json();
      expect(createData.userId).toBeDefined();

      // Verify user was created
      const usersResponse = await request.get(`${BASE_URL}/api/users`, {
        headers: { Cookie: cookies }
      });
      const users = await usersResponse.json();
      const newUser = users.find((u: any) => u.username === testUsername);

      expect(newUser).toBeDefined();
      // PII fields should be encrypted (not plain text)
      expect(newUser.name).toBe('ENCRYPTED_NAME_DATA_BASE64');
      expect(newUser.surname).toBe('ENCRYPTED_SURNAME_DATA_BASE64');
      expect(newUser.email).toBe('ENCRYPTED_EMAIL_DATA_BASE64');
    });

    test('should reject duplicate username', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/users`, {
        headers: { Cookie: cookies },
        data: {
          username: 'seed', // Already exists
          password: 'test123',
          publicKey: 'TEST_KEY'
        }
      });

      expect(response.status()).toBe(409);
    });
  });

  test.describe('Data Encryption', () => {
    let cookies: string;

    test.beforeEach(async ({ request }) => {
      const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          username: 'seed',
          password: 'init'
        }
      });
      cookies = loginResponse.headers()['set-cookie'] || '';
    });

    test('should store data with encrypted values', async ({ request }) => {
      const testKey = `test_key_${Date.now()}`;
      const encryptedValue = 'ENCRYPTED_VALUE_BASE64_' + Date.now();

      // Add data record with encrypted value
      const createResponse = await request.post(`${BASE_URL}/api/data`, {
        headers: { Cookie: cookies },
        data: {
          key: testKey,
          value: encryptedValue
        }
      });

      expect(createResponse.ok()).toBeTruthy();

      // Retrieve data and verify it's still encrypted
      const dataResponse = await request.get(`${BASE_URL}/api/data`, {
        headers: { Cookie: cookies }
      });

      const data = await dataResponse.json();
      const testRecord = data.find((d: any) => d.key === testKey);

      expect(testRecord).toBeDefined();
      expect(testRecord.value).toBe(encryptedValue);
      // Value should NOT be decrypted on server side
      expect(testRecord.value).toContain('ENCRYPTED');
    });

    test('should list all data records', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/data`, {
        headers: { Cookie: cookies }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  test.describe('Key Management', () => {
    let cookies: string;
    let userId: number;

    test.beforeEach(async ({ request }) => {
      const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          username: 'seed',
          password: 'init'
        }
      });
      cookies = loginResponse.headers()['set-cookie'] || '';

      const meResponse = await request.get(`${BASE_URL}/api/auth/me`, {
        headers: { Cookie: cookies }
      });
      const meData = await meResponse.json();
      userId = meData.user.id;
    });

    test('should get wrapped data key for user', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/keys/${userId}`, {
        headers: { Cookie: cookies }
      });

      expect(response.ok()).toBeTruthy();
      const keyInfo = await response.json();
      expect(keyInfo.public_key).toBeDefined();
      expect(keyInfo.role_name).toBe('admin-role');
    });

    test('should list all roles', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/keys/roles/list`, {
        headers: { Cookie: cookies }
      });

      expect(response.ok()).toBeTruthy();
      const roles = await response.json();
      expect(roles.length).toBe(3);
      expect(roles.map((r: any) => r.name)).toContain('admin-role');
      expect(roles.map((r: any) => r.name)).toContain('user-role');
      expect(roles.map((r: any) => r.name)).toContain('view-role');
    });
  });

  test.describe('Role-Based Access Control', () => {
    test('should require authentication for protected endpoints', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/users`);
      expect(response.status()).toBe(401);
    });

    test('should require admin role for user creation', async ({ request }) => {
      // First create a view-only user
      const adminLogin = await request.post(`${BASE_URL}/api/auth/login`, {
        data: { username: 'seed', password: 'init' }
      });
      const adminCookies = adminLogin.headers()['set-cookie'] || '';

      const viewUsername = `viewuser_${Date.now()}`;
      await request.post(`${BASE_URL}/api/users`, {
        headers: { Cookie: adminCookies },
        data: {
          username: viewUsername,
          password: 'viewpass',
          roleId: 'view-role',
          publicKey: 'VIEW_USER_PUBLIC_KEY'
        }
      });

      // Login as view user
      const viewLogin = await request.post(`${BASE_URL}/api/auth/login`, {
        data: { username: viewUsername, password: 'viewpass' }
      });
      const viewCookies = viewLogin.headers()['set-cookie'] || '';

      // Try to create user (should fail)
      const createResponse = await request.post(`${BASE_URL}/api/users`, {
        headers: { Cookie: viewCookies },
        data: {
          username: 'should_fail',
          password: 'test',
          publicKey: 'KEY'
        }
      });

      expect(createResponse.status()).toBe(403);
    });
  });
});
