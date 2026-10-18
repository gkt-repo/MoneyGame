import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config';
import { initDbDefaults } from './db';
import { router as apiRouter } from './routes/api.routes';
import { gameManager } from './modules/game/game.manager';
import { walletService } from './modules/wallet/wallet.service';
import { paymentService } from './modules/payment/payment.service';

const app = express();
const server = http.createServer(app);

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend UI
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Mount API routes
app.use('/api', apiRouter);

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
