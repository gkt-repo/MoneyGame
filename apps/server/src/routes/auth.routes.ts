import { Router, Request, Response } from 'express';
import { authService } from '../modules/auth/auth.service';
import {
  authenticateUser,
  authenticateAdmin,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';

export const authRouter = Router();

// ─── User Auth Routes ────────────────────────────────────────────────────────

/**
 * Register new user (Phone + Password + Email backup)
 */
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, phone, email, password } = req.body;
    const deviceInfo = (req.headers['user-agent'] as string) || 'Web/Mobile Client';
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    const result = await authService.registerUser(
      { username, phone, email, password },
      deviceInfo,
      ipAddress
    );

    res.status(201).json({
      success: true,
      message: 'Account registered successfully',
      ...result,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * User Login (Phone + Password)
 */
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, identifier, username, password } = req.body;
    const loginId = identifier || phone || username;
    const deviceInfo = (req.headers['user-agent'] as string) || 'Web/Mobile Client';
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    const result = await authService.loginUser({ identifier: loginId, phone: loginId, username: loginId, password }, deviceInfo, ipAddress);

    res.json({
      success: true,
      message: 'Login successful',
      ...result,
    });
  } catch (err: any) {
    res.status(401).json({ success: false, error: err.message });
  }
});

/**
 * Request Password Reset OTP (dispatched to registered backup email)
 */
authRouter.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      res.status(400).json({ success: false, error: 'Mobile number or email is required' });
      return;
    }

    const result = await authService.forgotPassword(identifier);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Reset Password with OTP
 */
authRouter.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.body;
    const result = await authService.resetPassword(email, otp, newPassword);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Rotate / Refresh Token
 */
authRouter.post('/refresh-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    const deviceInfo = (req.headers['user-agent'] as string) || 'Web/Mobile Client';
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    const result = await authService.refreshAccessToken(refreshToken, deviceInfo, ipAddress);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(401).json({ success: false, error: err.message });
  }
});

/**
 * Logout
 */
authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get current user profile
 */
authRouter.get('/me', authenticateUser, (req: AuthenticatedRequest, res: Response): void => {
  res.json({ success: true, user: req.user });
});

// ─── Admin Auth Routes ───────────────────────────────────────────────────────

export const adminAuthRouter = Router();

/**
 * Admin Login (Email/Username + Password)
 */
adminAuthRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body;
    const deviceInfo = (req.headers['user-agent'] as string) || 'Admin Console';
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    const result = await authService.loginAdmin({ identifier, password }, deviceInfo, ipAddress);
    res.json({
      success: true,
      message: 'Admin authorization successful',
      ...result,
    });
  } catch (err: any) {
    res.status(401).json({ success: false, error: err.message });
  }
});

/**
 * Admin Session Refresh
 */
adminAuthRouter.post('/refresh-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    const deviceInfo = (req.headers['user-agent'] as string) || 'Admin Console';
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    const result = await authService.refreshAccessToken(refreshToken, deviceInfo, ipAddress);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(401).json({ success: false, error: err.message });
  }
});

/**
 * Get current admin profile
 */
adminAuthRouter.get('/me', authenticateAdmin, (req: AuthenticatedRequest, res: Response): void => {
  res.json({ success: true, admin: req.user });
});
