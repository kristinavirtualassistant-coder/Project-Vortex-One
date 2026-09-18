require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
const leadsRoutes = require('./routes/leads');
const propertyRoutes = require('./routes/property');
const ownerRoutes = require('./routes/owners');
const contactsRoutes = require('./routes/contacts');
const foundationRoutes = require('./routes/foundation');
const importsRoutes = require('./routes/imports');
const importScanRoutes = require('./routes/importScan');
const savedSearchRoutes = require('./routes/savedSearches');
const tasksRoutes = require('./routes/tasks');
const campaignsRoutes = require('./routes/campaigns');
const dialerRoutes = require('./routes/dialer');
const betterAuth = require('./middleware/betterAuth');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const allowedOrigins = new Set([
  process.env.CLIENT_URL,
  'http://127.0.0.1:5173', 'http://localhost:5173',
  'http://127.0.0.1:8080', 'http://localhost:8080'
].filter(Boolean));
const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  }
};

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(cors(corsOptions));
app.use(express.json({ limit: '20mb' }));

app.all('/api/auth/*', async (req, res, next) => {
  try {
    const { toNodeHandler } = await import('better-auth/node');
    const auth = await betterAuth.getBetterAuth();
    return toNodeHandler(auth)(req, res, next);
  } catch (error) { return next(error); }
});

app.get('/api/health', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ ok: true, service: 'vortex-one', database: 'ready' }); }
  catch { res.status(503).json({ ok: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } }); }
});
app.get('/api/ready', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ ok: true, service: 'vortex-one', ready: true }); }
  catch { res.status(503).json({ ok: false, ready: false }); }
});

app.use('/api/foundation', foundationRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/property', propertyRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/imports', importsRoutes);
app.use('/api/imports/scan', importScanRoutes);
app.use('/api/saved-searches', savedSearchRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/dialer', dialerRoutes);

const io = new Server(server, { cors: corsOptions });
io.use((socket, next) => {
  try {
    const jwt = require('jsonwebtoken');
    const token = socket.handshake.auth?.token;
    if (!token || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Unauthorized');
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { next(new Error('Unauthorized')); }
});
io.on('connection', socket => {
  socket.join('agent:' + socket.user.userId);
  socket.emit('ready', { userId: socket.user.userId });
});

const dist = path.join(__dirname, '../../dist');
app.use(express.static(dist, { index: 'index.html', maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  res.sendFile(path.join(dist, 'index.html'));
});
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log('Vortex One listening on ' + port));
