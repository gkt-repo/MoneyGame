import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config';
import { initDbDefaults } from './db';
import fs from 'fs';
import { router as apiRouter } from './routes/api.routes';
import { gameManager } from './modules/game/game.manager';
import { walletService } from './modules/wallet/wallet.service';
import { paymentService } from './modules/payment/payment.service';

const app = express();
const server = http.createServer(app);

// Enable CORS and JSON parsing
app.use(cors());
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

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

gameManager.setSocketServer(io);
walletService.setSocketServer(io);
paymentService.setSocketServer(io);

io.on('connection', (socket) => {
  // Listen for user personal channel subscription (for live balance updates)
  socket.on('join_user_channel', (userId: string) => {
    socket.join(`user:${userId}`);
  });

  // Listen for deposit-specific channel subscription (for instant payment confirmation)
  socket.on('join_deposit_channel', (depositId: string) => {
    socket.join(`deposit:${depositId}`);
  });

  socket.on('leave_deposit_channel', (depositId: string) => {
    socket.leave(`deposit:${depositId}`);
  });

  // Listen for admin channel subscription
  socket.on('join_admin_channel', () => {
    socket.join('admin_channel');
  });

  // Listen for room game updates
  socket.on('join_room_channel', (roomId: string) => {
    socket.join(roomId);
  });

  socket.on('leave_room_channel', (roomId: string) => {
    socket.leave(roomId);
  });
});

// Start server
async function bootstrap() {
  await initDbDefaults();

  server.listen(config.port, () => {
    console.log(`=======================================================`);
    console.log(`🚀 MoneyGame Server running on http://localhost:${config.port}`);
    console.log(`📡 WebSocket ready on port ${config.port}`);
    console.log(`💳 Dynamic UPI Receiver: ${config.adminUpiId}`);
    console.log(`=======================================================`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
