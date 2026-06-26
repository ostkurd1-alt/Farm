import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import router from './router.js';
import environment from './environment.js';
import character from './character.js';
import building from './building.js';
import infos from './infos.js';
import settings from './settings.js';
import market from './market.js';
import plant from './plant.js';
import mapModule from './map.js';
import broadcast from './broadcast.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 1337;

// ============ SECURITY MIDDLEWARE ============

// Helmet - headers security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts, please try again later.'
});

app.use(generalLimiter);
app.use('/start', authLimiter);
app.use('/register', authLimiter);

// Body parser
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));

// Session management
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict'
  }
});

app.use(sessionMiddleware);

// Static files
app.use(express.static(path.join(__dirname, 'view'), {
  maxAge: '1d',
  etag: true
}));

// ============ SOCKET.IO SETUP ============

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

const connectedUsers = new Map();

io.on('connection', async (socket) => {
  const session = socket.request.session;
  const userId = session?.user?.id;

  if (!userId) {
    socket.emit('error', { message: 'Authentication required' });
    socket.disconnect();
    return;
  }

  connectedUsers.set(userId, socket.id);
  console.log(`User connected: ${userId}`);

  infos.initData(userId, session.user.email);

  const socketWithAuth = {
    ...socket,
    handshake: { ...socket.handshake, user_id: userId }
  };

  try {
    router.routeSocket(socketWithAuth, userId);
    socket.broadcast.emit('characterConnected', { user_id: userId });
  } catch (error) {
    console.error('Socket initialization error:', error);
  }

  socket.on('disconnect', () => {
    connectedUsers.delete(userId);
    console.log(`User disconnected: ${userId}`);
    io.emit('characterDisconnected', { user_id: userId });
  });
});

// ============ ROUTER ============

app.use('/', router.router);

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Internal Server Error');
});

app.use((req, res) => {
  res.status(404).send('Page not found');
});

// ============ INITIALIZATION ============

async function start() {
  try {
    console.log('Starting World of Farmcraft server...');

    await settings.init();
    await mapModule.init();
    broadcast.init(io);
    environment.init();
    character.init(io);
    building.init();
    market.init();
    plant.init();

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { app, server, io, connectedUsers };
