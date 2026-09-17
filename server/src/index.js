require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');
const propertyRoutes = require('./routes/property');
const ownerRoutes = require('./routes/owners');
const foundationRoutes = require('./routes/foundation');
const importsRoutes = require('./routes/imports');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL || true, credentials: true } });
app.use(cors({ origin: process.env.CLIENT_URL || true, credentials: true }));
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ ok: true, service: 'vortex-one' }); }
  catch { res.status(503).json({ ok: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } }); }
});

app.use('/api/auth', authRoutes);
app.use('/api/foundation', foundationRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/property', propertyRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/imports', importsRoutes);

io.use((socket, next) => {
  try {
    const jwt = require('jsonwebtoken');
    const token = socket.handshake.auth?.token;
    if (!token) throw new Error();
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { next(new Error('Unauthorized')); }
});
io.on('connection', socket => {
  socket.join('agent:' + socket.user.userId);
  socket.emit('ready', { userId: socket.user.userId });
});

const dist = path.join(__dirname, '../../dist');
app.use(express.static(dist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  res.sendFile(path.join(dist, 'index.html'));
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => console.log('Vortex One listening on ' + port));
