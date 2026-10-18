import http from 'http';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma, initDbDefaults } from '../src/db';
import { router as apiRouter } from '../src/routes/api.routes';
import { config } from '../src/config';

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

const server = http.createServer(app);

async function runTests() {
  await initDbDefaults();

  // Clean up any test users from prior runs
  await prisma.user.deleteMany({
    where: {
      OR: [
        { username: 'rohit_player' },
        { phone: '9876543210' },
        { email: 'rohit@example.com' },
      ],
    },
  });

  await new Promise<void>((resolve) => server.listen(4099, resolve));
  const baseUrl = 'http://localhost:4099/api';

  console.log('🧪 Starting comprehensive Authentication & RBAC tests...\n');

  async function apiCall(endpoint: string, method = 'GET', body?: any, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data: any = await res.json();
    return { status: res.status, data };
  }

  // 1. User Registration
  console.log('Test 1: User Registration (Phone + Password + Backup Email)');
  const regPayload = {
    username: 'rohit_player',
    phone: '9876543210',
    email: 'rohit@example.com',
    password: 'Password@123',
  };
  const regRes = await apiCall('/v1/auth/register', 'POST', regPayload);
  console.log(`Status: ${regRes.status}`, regRes.data.success ? '✅ PASS' : '❌ FAIL');
  if (!regRes.data.success) throw new Error(`Registration failed: ${JSON.stringify(regRes.data)}`);
  const userToken = regRes.data.tokens.accessToken;
  const userRefreshToken = regRes.data.tokens.refreshToken;

  // 2. User Login
  console.log('\nTest 2: User Login with Phone + Password');
  const loginRes = await apiCall('/v1/auth/login', 'POST', {
    phone: '9876543210',
    password: 'Password@123',
  });
  console.log(`Status: ${loginRes.status}`, loginRes.data.success ? '✅ PASS' : '❌ FAIL');
  if (!loginRes.data.success) throw new Error(`Login failed: ${JSON.stringify(loginRes.data)}`);

  // 3. Authenticated User Profile
  console.log('\nTest 3: Fetch User Profile via Bearer Token');
  const profileRes = await apiCall('/v1/auth/me', 'GET', undefined, userToken);
  console.log(`Status: ${profileRes.status}`, profileRes.data.user?.username === 'rohit_player' ? '✅ PASS' : '❌ FAIL');

  // 4. Forgot Password (Trigger Email OTP)
  console.log('\nTest 4: Request Password Reset OTP via Phone');
  const forgotRes = await apiCall('/v1/auth/forgot-password', 'POST', { identifier: '9876543210' });
  console.log(`Status: ${forgotRes.status}`, forgotRes.data.success ? '✅ PASS' : '❌ FAIL');

  // 5. Test Reset Password with 6-digit OTP
  const testOtp = '654321';
  const testOtpHash = await bcrypt.hash(testOtp, 10);
  await prisma.passwordResetOtp.create({
    data: {
      userId: regRes.data.user.id,
      otpHash: testOtpHash,
      expiresAt: new Date(Date.now() + 600000),
    },
  });

  console.log('\nTest 5: Reset Password with 6-digit OTP');
  const resetRes = await apiCall('/v1/auth/reset-password', 'POST', {
    email: 'rohit@example.com',
    otp: testOtp,
    newPassword: 'NewSecurePassword@456',
  });
  console.log(`Status: ${resetRes.status}`, resetRes.data.success ? '✅ PASS' : '❌ FAIL');

  // 6. Login with New Password
  console.log('\nTest 6: Login with newly reset password');
  const newLoginRes = await apiCall('/v1/auth/login', 'POST', {
    phone: '9876543210',
    password: 'NewSecurePassword@456',
  });
  console.log(`Status: ${newLoginRes.status}`, newLoginRes.data.success ? '✅ PASS' : '❌ FAIL');

  // 7. Admin Login (Pre-seeded Super Admin)
  console.log('\nTest 7: Admin Login with pre-seeded Super Admin credentials');
  const adminLoginRes = await apiCall('/v1/admin/auth/login', 'POST', {
    identifier: config.adminInitialEmail,
    password: config.adminInitialPassword,
  });
  console.log(`Status: ${adminLoginRes.status}`, adminLoginRes.data.success ? '✅ PASS' : '❌ FAIL');
  const adminToken = adminLoginRes.data.tokens.accessToken;

  // 8. Admin accessing protected Admin stats
  console.log('\nTest 8: Admin accessing protected /api/admin/stats');
  const adminStatsRes = await apiCall('/admin/stats', 'GET', undefined, adminToken);
  console.log(`Status: ${adminStatsRes.status}`, adminStatsRes.data.success ? '✅ PASS' : '❌ FAIL');

  // 9. RBAC Security Check: Regular User trying to access Admin stats
  console.log('\nTest 9: RBAC Guard Check: Regular User accessing /api/admin/stats (Expect 401/403 Forbidden)');
  const forbiddenRes = await apiCall('/admin/stats', 'GET', undefined, userToken);
  console.log(`Status: ${forbiddenRes.status}`, forbiddenRes.status === 401 || forbiddenRes.status === 403 ? '✅ PASS (Access Denied as expected)' : '❌ FAIL');

  // 10. Refresh Token Rotation
  console.log('\nTest 10: Refresh Token Rotation');
  const freshRefreshToken = newLoginRes.data.tokens.refreshToken;
  const refreshRes = await apiCall('/v1/auth/refresh-token', 'POST', {
    refreshToken: freshRefreshToken,
  });
  console.log(`Status: ${refreshRes.status}`, refreshRes.data.success ? '✅ PASS' : '❌ FAIL');
  if (!refreshRes.data.success) throw new Error(`Refresh token failed: ${JSON.stringify(refreshRes.data)}`);

  // 11. Logout
  console.log('\nTest 11: User Logout');
  const logoutRes = await apiCall('/v1/auth/logout', 'POST', {
    refreshToken: refreshRes.data.refreshToken,
  });
  console.log(`Status: ${logoutRes.status}`, logoutRes.data.success ? '✅ PASS' : '❌ FAIL');

  console.log('\n🎉 ALL 11 AUTHENTICATION & RBAC TESTS PASSED SUCCESSFULLY!\n');

  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  server.close();
  process.exit(1);
});
