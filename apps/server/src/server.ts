import http from 'http';
import { configureSockets } from './socket';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { config } from './config';
import { initDbDefaults, prisma } from './db';
import fs from 'fs';
import { router as apiRouter } from './routes/api.routes';
import { gameManager } from './modules/game/game.manager';
import { walletService } from './modules/wallet/wallet.service';
import { notificationService } from './modules/notification/notification.service';
import { paymentService } from './modules/payment/payment.service';
import { sportsService } from './modules/game/engines/sports-match/sports.service';

const app = express();
const server = http.createServer(app);

if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy);
}

// Configure CORS origin validator supporting Firebase Hosting, GitHub Pages, localhost, and custom domains
const corsOriginChecker = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin) return callback(null, true);
  if (config.allowedOrigins.includes('*')) return callback(null, true);
  if (config.allowedOrigins.includes(origin)) return callback(null, true);

  // Allow Firebase Hosting, GitHub Pages, and localhost only in non-production environments
  if (config.nodeEnv !== 'production') {
    if (
      /^https:\/\/.*\.web\.app$/.test(origin) ||
      /^https:\/\/.*\.firebaseapp\.com$/.test(origin) ||
      /^https:\/\/.*\.github\.io$/.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }
  }

  callback(new Error('Blocked by CORS policy'));
};

// Security headers via Helmet (disabling CSP & COEP to permit embedded Vite SPA builds)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Enable CORS and JSON parsing
app.use(cors({ origin: corsOriginChecker, credentials: true }));
app.use(express.json());

// Mount API routes (supported both at /api and root / for robust client compatibility)
app.use('/api', apiRouter);
app.use(apiRouter);

// Serve Admin Web Portal on /admin
const adminPublicPath = path.join(__dirname, '../public/admin');
if (fs.existsSync(adminPublicPath)) {
  app.use('/admin', express.static(adminPublicPath));
  app.use('/admin', (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(adminPublicPath, 'index.html'));
  });
}

// Serve User Web Portal on /
const userPublicPath = path.join(__dirname, '../public/user');
if (fs.existsSync(userPublicPath)) {
  app.use(express.static(userPublicPath));
} else {
  const legacyPublic = path.join(__dirname, '../public');
  app.use(express.static(legacyPublic));
}

// SPA fallback for HTML5 History routing
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  if (fs.existsSync(userPublicPath)) {
    return res.sendFile(path.join(userPublicPath, 'index.html'));
  }
  const legacyIndex = path.join(__dirname, '../public/index.html');
  if (fs.existsSync(legacyIndex)) {
    return res.sendFile(legacyIndex);
  }
  next();
});

// Initialize Socket.io with origin validator
const io = new Server(server, {
  cors: {
    origin: corsOriginChecker,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

gameManager.setSocketServer(io);
walletService.setSocketServer(io);
notificationService.setSocketServer(io);
paymentService.setSocketServer(io);
sportsService.setSocketServer(io);

configureSockets(io);

// Start server
async function bootstrap() {
  await initDbDefaults();
  await gameManager.recoverInterruptedRooms();

  // Background daemon: clean up expired deposit reservations every 60 seconds
  const periodicExpiry = setInterval(() => {
    paymentService.runPeriodicExpiry().catch((err: any) => {
      console.error('Periodic deposit expiry check error:', err.message);
    });
  }, 60000);

  const runningServer = server.listen(config.port, () => {
    console.log(`=======================================================`);
    console.log(`🚀 MoneyGame Server running on http://localhost:${config.port}`);
    console.log(`📡 WebSocket ready on port ${config.port}`);
    console.log(`💳 Dynamic UPI Receiver: ${config.adminUpiId}`);
    console.log(`🛡️ Security: Helmet active & Rate Limiters enabled`);
    console.log(`=======================================================`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    clearInterval(periodicExpiry);
    gameManager.stopTimers();
    sportsService.stopAutoSync();

    runningServer.close(async () => {
      try {
        io.close();
        await prisma.$disconnect();
        console.log('✅ Server and database connections closed cleanly.');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error('Shutdown timed out after 10s. Forcefully terminating.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
