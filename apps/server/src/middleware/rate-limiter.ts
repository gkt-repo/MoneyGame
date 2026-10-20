import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

// Strict Limiter for Authentication & OTP routes (prevents brute-force)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30, // 30 attempts per 15 minutes per IP
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' },
  skip: () => isTest,
});

// Session Limiter for token refresh and profile checks
export const sessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many session requests. Please try again later.' },
  skip: () => isTest,
});

// Deposit Creation Rate Limiter
export const depositLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 25,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many deposit requests. Please wait a few minutes before trying again.' },
  skip: () => isTest,
});

// UTR Claim Rate Limiter (prevents UTR brute-forcing)
export const claimLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many UTR claim attempts. Please wait a few minutes before trying again.' },
  skip: () => isTest,
});

// Webhook Rate Limiter
export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
});
