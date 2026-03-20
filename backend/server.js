require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const admin = require('firebase-admin');
const path = require('path');
const https = require('https');
const { generateOTP, sendEmailOTP, sendSmsOTP, sendStatusUpdateEmail, sendComplaintRegistrationEmail } = require('./mailer');
const http = require('http');
const socketIo = require('socket.io');

// ==========================================
// FIREBASE ADMIN SETUP (For Auth & OTP)
// ==========================================
try {
  // Check if service account file exists, if not, wait for user to provide it
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, 'firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath)
  });
  console.log('[Notice] Firebase Admin initialized.');
} catch (e) {
  console.log('[Notice] Firebase Admin not configured or service account missing. Please provide firebase-service-account.json.');
}

// ==========================================
// NOTIFICATIONS SYSTEM (Twilio, Email, Push)
// ==========================================
let twilioClient = null;
let TWILIO_PHONE_NUMBER = null;
try {
  const twilio = require('twilio');
  twilioClient = process.env.TWILIO_ACCOUNT_SID
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;
  TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
  if (twilioClient) console.log('[Notice] Twilio SMS client configured.');
  else console.log('[Notice] Twilio not configured — SMS will be mocked.');
} catch (e) {
  console.log('[Notice] Twilio module unavailable — SMS will be mocked to console.');
}

let nodemailer = null;
let emailTransporter = null;
try {
  nodemailer = require('nodemailer');
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    // GMAIL
    emailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    console.log("[Notice] Gmail SMTP configured successfully.");
  } else if (process.env.MAILTRAP_USER && process.env.MAILTRAP_PASS) {
    // MAILTRAP
    emailTransporter = nodemailer.createTransport({
      host: "sandbox.smtp.mailtrap.io",
      port: 2525,
      auth: { user: process.env.MAILTRAP_USER, pass: process.env.MAILTRAP_PASS }
    });
    console.log("[Notice] Mailtrap (Dev) SMTP configured successfully.");
  } else {
    console.log("[Notice] No real Email service configured — using Console Mocking.");
  }
} catch (e) {
  console.log("[Notice] Nodemailer unavailable — using Console Mocking.");
}

const sendSmsNotification = async (to, message) => {
  if (!to) return;

  // --- 1. TRY BREVO API (Unified Email + SMS) ---
  if (process.env.BREVO_API_KEY) {
    const data = JSON.stringify({ recipient: to, content: message, type: 'transactional' });
    const options = {
      hostname: 'api.brevo.com',
      port: 443,
      path: '/v3/transactionalSMS/sms',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode < 300) console.log(`[Brevo SMS Success] To: ${to}`);
      else console.error(`[Brevo SMS Failed] Code: ${res.statusCode}`);
    });
    req.on('error', (err) => console.error(`[Brevo SMS Error]`, err.message));
    req.write(data);
    req.end();
    return;
  }

  // --- 2. TRY TWILIO FALLBACK ---
  if (twilioClient) {
    try {
      await twilioClient.messages.create({ body: message, from: TWILIO_PHONE_NUMBER, to: to });
      console.log(`[Twilio Success] SMS dispatched to ${to}`);
    } catch (error) {
      console.error(`[Twilio Error] Failed sending SMS:`, error.message);
    }
    return;
  }

  // --- 3. MOCK FALLBACK ---
  console.log(`\n📱  [Sms Mock Inbox]`);
  console.log(`-------------------------------------------`);
  console.log(`To:      ${to}`);
  console.log(`Message: ${message}`);
  console.log(`-------------------------------------------\n`);
};

const sendEmailNotification = async (to, subject, html) => {
  if (!to) return;
  const plainText = html.replace(/<[^>]*>?/gm, '').trim();

  // --- 1. TRY BREVO API (Unified Email + SMS) ---
  if (process.env.BREVO_API_KEY) {
    const data = JSON.stringify({
      sender: { name: "CivicConnect Admin", email: process.env.EMAIL_USER || "alert@city.gov" },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html
    });
    const options = {
      hostname: 'api.brevo.com',
      port: 443,
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode < 300) console.log(`[Brevo Email Success] To: ${to}`);
      else console.error(`[Brevo Email Failed] Code: ${res.statusCode}`);
    });
    req.on('error', (err) => console.error(`[Brevo Email Error]`, err.message));
    req.write(data);
    req.end();
    return;
  }

  // --- 2. TRY NODEMAILER (Gmail/Mailtrap) FALLBACK ---
  if (emailTransporter) {
    try {
      const senderEmail = process.env.EMAIL_USER || 'alert@city.gov';
      await emailTransporter.sendMail({ from: `"CivicConnect Admin" <${senderEmail}>`, to, subject, html });
      console.log(`[Email Success] Real notification sent from ${senderEmail} via SMTP to ${to}`);
    } catch (error) {
      console.error(`[Email Error] Failed SMTP dispatch:`, error.message);
    }
    return;
  }

  // --- 3. MOCK FALLBACK ---
  console.log(`\n📧  [Email Mock Inbox]`);
  console.log(`-------------------------------------------`);
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`-------------------------------------------`);
  console.log(`Message: ${plainText}`);
  console.log(`-------------------------------------------\n`);
};

const sendPushNotification = async (userId, title, body) => {
  console.log(`[Web Push Alert] Triggering Push Client for UserID ${userId}: "${title}" - ${body}`);
};

// ==========================================
// SQLITE DATABASE SETUP (Zero Config)
// ==========================================
let db;

async function initDB() {
  try {
    // Opens or creates a physical civic_data.sqlite file in the backend folder
    db = await open({
      filename: path.join(__dirname, 'civic_data.sqlite'),
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        phone TEXT,
        password TEXT,
        role TEXT,
        department TEXT,
        points INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Migration: Ensure department column exists in users
      PRAGMA table_info(users);

      CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id TEXT UNIQUE,
        user_id TEXT,
        title TEXT,
        category TEXT,
        description TEXT,
        lat REAL,
        lng REAL,
        city TEXT,
        state TEXT,
        village TEXT,
        media_url TEXT,
        resolution_media_url TEXT,
        is_emergency INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Pending',
        priority TEXT DEFAULT 'Normal',
        department TEXT DEFAULT 'Unassigned',
        admin_remarks TEXT,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id INTEGER,
        user_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(issue_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id INTEGER,
        user_id TEXT,
        author_name TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notificationPreferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id INTEGER,
        user_id TEXT,
        email TEXT,
        phone TEXT,
        push_enabled INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id INTEGER,
        user_id TEXT,
        type TEXT, -- 'exists' or 'resolved'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(issue_id, user_id, type)
      );
    `);

    // Ensure all new columns exist in existing databases (Migration)
    try { await db.run('ALTER TABLE users ADD COLUMN department TEXT'); } catch (e) { }
    try { await db.run('ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0'); } catch (e) { }
    try { await db.run('ALTER TABLE users ADD COLUMN badge TEXT DEFAULT "Citizen"'); } catch (e) { }
    try { await db.run('ALTER TABLE issues ADD COLUMN is_emergency INTEGER DEFAULT 0'); } catch (e) { }
    try { await db.run('ALTER TABLE issues ADD COLUMN resolution_media_url TEXT'); } catch (e) { }
    try { await db.run('ALTER TABLE issues ADD COLUMN deadline_at DATETIME'); } catch (e) { }
    try { await db.run('ALTER TABLE issues ADD COLUMN is_escalated INTEGER DEFAULT 0'); } catch (e) { }
    try { await db.run('ALTER TABLE issues ADD COLUMN city TEXT'); } catch (e) { }
    try { await db.run('ALTER TABLE issues ADD COLUMN state TEXT'); } catch (e) { }
    try { await db.run('ALTER TABLE issues ADD COLUMN village TEXT'); } catch (e) { }

    // --- SEED SYSTEM MASTER ADMIN ---
    const officialExists = await db.get('SELECT * FROM users WHERE email = ?', ['gov@city.org']);
    if (!officialExists) {
      const hashedMaster = await bcrypt.hash('city@1234', 10);
      await db.run(
        'INSERT INTO users (id, name, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?)',
        ['MASTER-ADMIN', 'OFFICIAL GOV ADMIN', 'gov@city.org', '+910000000000', hashedMaster, 'admin']
      );
      console.log("🏛️  MASTER ADMIN PORTAL ACTIVE: gov@city.org | city@1234");
    }

    // MANDATORY SECURITY RESET: Force all other accounts to 'user' role
    // This ensures only the Hardcoded Gov Admin is the administrator.
    await db.run("UPDATE users SET role = 'user' WHERE email != 'gov@city.org'");
    console.log("🛡️  Global Security Audit Complete: All citizen roles normalized to 'user'.");

    console.log("✅ SQLite Database 'civic_data.sqlite' successfully initialized and connected!");
  } catch (err) {
    console.error("❌ Fatal SQLite initialization error:", err.message);
  }
}

initDB();

// ==========================================
// EXPRESS SERVER & MIDDLEWARE
// ==========================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ==========================================
// SOCKET.IO SETUP
// ==========================================
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  // Optional: Join user-specific room for targeted notifications
  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });
});

function generateComplaintId() {
  return 'CC' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
}

function generateUserId() {
  return 'U' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// ==========================================
// AUTH ROUTES
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check existing
    const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = generateUserId();

    // STRICT: Only gov@city.org can be admin. All registrants are assigned 'user' role.
    const role = 'user';

    await db.run(
      'INSERT INTO users (id, name, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, name, email, phone, hashedPassword, role]
    );

    const token = jwt.sign({ id: userId, email, name, role }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ success: true, user: { id: userId, name, email, phone, role }, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SIMPLE OTP SYSTEM (Re-implemented)
// ==========================================
const otpStore = new Map();

app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'Email or Mobile required' });

    const otp = generateOTP();
    otpStore.set(identifier, { otp, expires: Date.now() + 5 * 60 * 1000 });

    const isEmail = identifier.includes('@');
    let success = false;

    if (isEmail) {
      success = await sendEmailOTP(identifier, otp);
    } else {
      success = await sendSmsOTP(identifier, otp);
    }

    if (success) res.json({ success: true, message: 'OTP dispatched successfully!' });
    else res.status(500).json({ error: 'Failed to send OTP.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { identifier, otp } = req.body;
    const stored = otpStore.get(identifier);

    if (!stored || stored.otp !== otp || Date.now() > stored.expires) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    otpStore.delete(identifier);
    let user = await db.get('SELECT * FROM users WHERE email = ? OR phone = ?', [identifier, identifier]);

    if (!user && identifier.includes('@')) {
      // Auto-register via email if not exists
      const newUserId = generateUserId();
      await db.run('INSERT INTO users (id, email, role) VALUES (?, ?, ?)', [newUserId, identifier, 'user']);
      user = { id: newUserId, email: identifier, role: 'user' };
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) return res.status(401).json({ error: 'Invalid Credentials' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid Credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/firebase-login', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'No ID token provided' });

    // Verify token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;

    let user = await db.get('SELECT id, name, email, phone, role, department FROM users WHERE email = ?', [email]);
    if (!user) {
      // Auto-register new citizens via Firebase
      const newUserId = generateUserId();
      const displayName = decodedToken.name || email.split('@')[0];
      await db.run(
        'INSERT INTO users (id, name, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?)',
        [newUserId, displayName, email, null, '', 'user']
      );
      user = { id: newUserId, name: displayName, email, phone: null, role: 'user', department: null };
      console.log(`[Firebase Auth] New user registered: ${email}`);
    }

    const localToken = jwt.sign(
      { id: user.id, role: user.role, department: user.department },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token: localToken, user });
  } catch (err) {
    console.error('[Firebase Verify Error]', err.message);
    res.status(401).json({ error: 'Unauthorized: Firebase Token Invalid' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      // Don't reveal whether account exists
      return res.json({ success: true, message: 'If an account exists, a recovery email has been sent.' });
    }

    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);
    console.log(`[Password Reset] Temp password for ${user.email}: ${tempPassword}`);

    sendEmailNotification(
      user.email,
      'CivicConnect: Password Recovery',
      `<h3>Password Reset Request</h3><p>Hello ${user.name},</p><p>We received a request to reset your password.</p><p>Your new temporary password is: <b>${tempPassword}</b></p><p>Please login and change it from your profile immediately.</p>`
    );

    if (user.phone) {
      sendSmsNotification(user.phone, `CivicConnect Password Reset: Your temporary password is ${tempPassword}.`);
    }

    // Return the temp password in the response so user can log in
    // even if email/SMS is not configured
    res.json({
      success: true,
      message: 'Password reset successful! A temporary password has been sent to your email and phone.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PROFILE UPDATE WITH OTP ---
app.post('/api/auth/profile-otp', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT email, name FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = generateOTP();
    otpStore.set(`profile-${req.user.id}`, { otp, expires: Date.now() + 5 * 60 * 1000 });

    await sendEmailOTP(user.email, otp, user.name);
    res.json({ success: true, message: 'Verification code sent to your email.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email, phone, password, otp } = req.body;
    const userId = req.user.id;

    // If password is being changed, OTP is mandatory
    if (password && password.trim()) {
      const stored = otpStore.get(`profile-${userId}`);
      if (!stored || stored.otp !== otp || Date.now() > stored.expires) {
        return res.status(401).json({ error: 'Invalid or expired verification code' });
      }
      otpStore.delete(`profile-${userId}`);
    }

    const existing = await db.get('SELECT * FROM users WHERE email = ? AND id != ?', [email, userId]);
    if (existing) return res.status(400).json({ error: 'Email already in use' });

    let query = 'UPDATE users SET name = ?, email = ?, phone = ?';
    let params = [name, email, phone];

    if (password && password.trim()) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = ?';
      params.push(hashedPassword);
    }

    query += ' WHERE id = ?';
    params.push(userId);

    await db.run(query, params);

    const updatedUser = await db.get('SELECT id, name, email, phone, role FROM users WHERE id = ?', [userId]);

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- USER ACCOUNT DELETE (self) ---
app.delete('/api/auth/account', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await db.get('SELECT id, email FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Pre-fetch issue ids so we can emit deletion events after commit
    const ownedIssues = await db.all('SELECT id FROM issues WHERE user_id = ?', [userId]);
    const issueIds = ownedIssues.map(i => i.id);

    await db.exec('BEGIN');

    // Remove all user-generated data across the system
    await db.run('DELETE FROM votes WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM comments WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM notificationPreferences WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM verifications WHERE user_id = ?', [userId]);

    // Remove the user's issues and any dependent rows tied to those issues
    if (issueIds.length > 0) {
      const placeholders = issueIds.map(() => '?').join(',');
      await db.run(`DELETE FROM votes WHERE issue_id IN (${placeholders})`, issueIds);
      await db.run(`DELETE FROM comments WHERE issue_id IN (${placeholders})`, issueIds);
      await db.run(`DELETE FROM notificationPreferences WHERE issue_id IN (${placeholders})`, issueIds);
      await db.run(`DELETE FROM verifications WHERE issue_id IN (${placeholders})`, issueIds);
      await db.run(`DELETE FROM issues WHERE id IN (${placeholders})`, issueIds);
    } else {
      await db.run('DELETE FROM issues WHERE user_id = ?', [userId]);
    }

    await db.run('DELETE FROM users WHERE id = ?', [userId]);
    await db.exec('COMMIT');

    // Notify clients so they can remove deleted issues in real time.
    for (const id of issueIds) {
      io.emit('issueDeleted', { id });
    }

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    try { await db.exec('ROLLBACK'); } catch (e) { /* ignore rollback errors */ }
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ISSUES ROUTES
// ==========================================
// --- AI PRIORITY PREDICTION ENGINE ---
// --- PROXIMITY DUPLICATE DETECTION ---
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000; // returns distance in meters
}

app.get('/api/issues/check-duplicates', authenticateToken, async (req, res) => {
  try {
    const { lat, lng, category } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'Lat/Lng required' });

    const openIssues = await db.all('SELECT id, complaint_id, title, status, lat, lng, category FROM issues WHERE status != ?', ['Resolved']);

    // Find issues within 100 meters with same category
    const duplicates = openIssues.filter(issue => {
      if (!issue.lat || !issue.lng) return false;
      const dist = getDistance(parseFloat(lat), parseFloat(lng), issue.lat, issue.lng);
      return dist <= 150 && (category ? issue.category === category : true);
    });

    res.json({ duplicates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const calculatePriority = async (issueId, lat, lng) => {
  let votes = 0;
  if (issueId) {
    const v = await db.get('SELECT COUNT(*) as c FROM votes WHERE issue_id = ?', [issueId]);
    votes = v ? v.c : 0;
  }

  // Base mapping distance from assumed City Core
  const centerLat = 20.5937, centerLng = 78.9629;
  const dist = Math.sqrt(Math.pow(lat - centerLat, 2) + Math.pow(lng - centerLng, 2));
  let locationPoints = dist < 0.1 ? 2 : dist < 0.5 ? 1 : 0;

  // Complaint density mapping (similar proximity issues = high risk)
  const nearby = await db.all('SELECT lat, lng FROM issues WHERE status != ?', ['Resolved']);
  let densityPoints = 0;
  let nearbyCount = 0;
  for (let issue of nearby) {
    if (!issue.lat || !issue.lng) continue;
    const d = Math.sqrt(Math.pow(lat - issue.lat, 2) + Math.pow(lng - issue.lng, 2));
    if (d < 0.05) nearbyCount++;
  }
  if (nearbyCount > 5) densityPoints = 3;
  else if (nearbyCount > 2) densityPoints = 1;

  const totalScore = votes + locationPoints + densityPoints;
  if (totalScore >= 5) return 'High';
  if (totalScore >= 2) return 'Normal';
  return 'Low';
};

// --- AUTO ESCALATION SYSTEM ---
const runEscalationCycle = async () => {
  try {
    if (!db) return;
    const now = new Date().toISOString();
    // Find all non-resolved, non-escalated, past-deadline issues
    const overdue = await db.all(
      'SELECT id, complaint_id, category, user_id FROM issues WHERE status != ? AND is_escalated = ? AND deadline_at < ?',
      ['Resolved', 0, now]
    );

    if (overdue.length > 0) {
      console.log(`[Escalation Cycle] Found ${overdue.length} overdue issues. Escalating...`);
      for (const issue of overdue) {
        await db.run(
          'UPDATE issues SET is_escalated = 1, priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['HIGH (ESCALATED)', issue.id]
        );
        // Bonus for admin awareness - could notify a special table/service
      }
    }
  } catch (e) {
    console.error("Escalation Engine Error:", e.message);
  }
};

// Check for escalations every 10 minutes
setInterval(runEscalationCycle, 10 * 60 * 1000);
// Run once on boot too
setTimeout(runEscalationCycle, 5000);

// --- PUBLIC DATA (NO AUTH REQUIRED) ---
app.get('/api/public/issues', async (req, res) => {
  try {
    const issues = await db.all('SELECT id, complaint_id, title, category, status, priority, is_escalated, deadline_at, admin_remarks, created_at FROM issues ORDER BY created_at DESC');
    for (let i = 0; i < issues.length; i++) {
      const vRow = await db.get('SELECT COUNT(*) as c FROM votes WHERE issue_id = ?', [issues[i].id]);
      issues[i].upvotes = vRow.c;
      const cRows = await db.all('SELECT id, user_id, author_name, content, created_at FROM comments WHERE issue_id = ?', [issues[i].id]);
      issues[i].comments = cRows;
    }
    res.json({ issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
const translateText = async (text) => {
  // In a real app, use @vitalets/google-translate-api or similar
  // For now, we simulate detection and translation OR use a basic heuristic
  // If it contains Marathi/Hindi characters, we flag it.
  const isMarathiHindi = /[\u0900-\u097F]/.test(text);
  if (!isMarathiHindi) return { translated: text, original: text, detected: 'en' };

  // Simulated Translation (Replacing common words if needed, or just appending tag)
  // Real implementers would use: fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURI(text)}`)
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    const translated = data[0].map(x => x[0]).join('');
    return { translated, original: text, detected: 'hi/mr' };
  } catch (e) {
    return { translated: `[AUTO-TRANSLATED: ${text}]`, original: text, detected: 'hi/mr' };
  }
};

app.post('/api/issues', authenticateToken, async (req, res) => {
  try {
    const { title, category, description, lat, lng, city, state, village, media_url, is_emergency, severity } = req.body;
    const userId = req.user.id;
    const complaintId = generateComplaintId();

    // Auto-Translate description/title if in Marathi/Hindi
    const translatedTitle = await translateText(title);
    const translatedDesc = await translateText(description);

    const finalTitle = translatedTitle.translated;
    const finalDesc = translatedDesc.translated;

    // Auto-set emergency for critical categories
    const autoEmergency = ['flood', 'fire'].includes(category.toLowerCase());
    const finalIsEmergency = is_emergency || autoEmergency;

    // Severity Logic (If provided or auto-detected)
    let finalSeverity = severity || 'Medium';
    if (finalIsEmergency) finalSeverity = 'High';
    else if (description.toLowerCase().includes('minor') || description.toLowerCase().includes('small')) finalSeverity = 'Low';
    else if (description.toLowerCase().includes('major') || description.toLowerCase().includes('dangerous')) finalSeverity = 'High';

    const predictedPriority = finalIsEmergency || finalSeverity === 'High' ? 'High' : await calculatePriority(null, lat, lng);

    // Calculate Deadline
    const now = new Date();
    let deadlineAt = new Date();
    if (finalIsEmergency) {
      deadlineAt.setHours(now.getHours() + 2); // 2 hours for emergencies
    } else if (category === 'garbage') {
      deadlineAt.setHours(now.getHours() + 24);
    } else if (category === 'pothole') {
      deadlineAt.setDate(now.getDate() + 7);
    } else {
      deadlineAt.setDate(now.getDate() + 3); // Default 3 days for others
    }

    const result = await db.run(
      `INSERT INTO issues (complaint_id, user_id, title, category, description, lat, lng, city, state, village, media_url, is_emergency, priority, admin_remarks, deadline_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        complaintId,
        userId,
        finalTitle,
        category,
        finalDesc,
        lat,
        lng,
        city || null,
        state || null,
        village || null,
        media_url || null,
        finalIsEmergency ? 1 : 0,
        predictedPriority,
        (translatedDesc.detected !== 'en' ? `Original: ${translatedDesc.original}` : null),
        deadlineAt.toISOString()
      ]
    );

    const issueId = result.lastID;

    // Award points for reporting (20 points)
    await db.run('UPDATE users SET points = points + 20 WHERE id = ?', [userId]);

    // Check for badge upgrade
    const uPoints = await db.get('SELECT points FROM users WHERE id = ?', [userId]);
    let newBadge = "Citizen";
    if (uPoints.points > 500) newBadge = "Civic Legend";
    else if (uPoints.points > 200) newBadge = "City Guardian";
    else if (uPoints.points > 50) newBadge = "Top Citizen";
    await db.run('UPDATE users SET badge = ? WHERE id = ?', [newBadge, userId]);

    // Save notification preferences
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

    if (user && (user.email || user.phone)) {
      await db.run(
        'INSERT INTO notificationPreferences (issue_id, user_id, email, phone) VALUES (?, ?, ?, ?)',
        [issueId, userId, user.email, user.phone]
      );

      // Trigger Alert
      if (user.phone) {
        sendSmsNotification(user.phone, `CivicConnect: Complaint ${complaintId} (${title}) registered successfully!`);
      }
      if (user.email) {
        sendComplaintRegistrationEmail(user.email, complaintId, title, category, user.name);
      }
      sendPushNotification(user.id, "Registered Successfully", `Complaint ${complaintId} is now tracked.`);
    }

    res.status(201).json({ success: true, id: issueId, complaint_id: complaintId, message: 'Issue reported', translated: translatedDesc.detected !== 'en' });

    // Emit real-time update
    const newIssue = await db.get('SELECT * FROM issues WHERE id = ?', [issueId]);
    io.emit('issueCreated', newIssue);

    // Geo-fencing alerts: Notify users near the issue location
    // For simplicity, emit to all, but in frontend check distance
    io.emit('newIssueNearby', { lat, lng, title, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/notifications', authenticateToken, async (req, res) => {
  try {
    const issues = await db.all(
      "SELECT id, complaint_id, title, status, admin_remarks, updated_at, created_at FROM issues WHERE user_id = ? ORDER BY updated_at DESC LIMIT 10",
      [req.user.id]
    );

    // Filter out issues that haven't been touched by an admin (or haven't progressed)
    const notifications = issues
      .filter(i => i.updated_at !== i.created_at || i.status !== 'Pending')
      .map(i => ({
        id: `alert-${i.id}-${i.updated_at}`,
        message: `Update for [CIVIC-${i.id}]: Status changed to ${i.status.toUpperCase()}. ${i.admin_remarks ? `Official note: "${i.admin_remarks}"` : ''}`,
        date: new Date(i.updated_at).toLocaleTimeString() + ' - ' + new Date(i.updated_at).toLocaleDateString(),
        read: false
      }));

    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/my-issues', authenticateToken, async (req, res) => {
  try {
    const issues = await db.all(
      "SELECT * FROM issues WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );

    // Attach vote counts
    for (let i = 0; i < issues.length; i++) {
      const vRow = await db.get('SELECT COUNT(*) as c FROM votes WHERE issue_id = ?', [issues[i].id]);
      issues[i].upvotes = vRow.c;
    }

    res.json({ issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/issues', authenticateToken, async (req, res) => {
  try {
    // All issues should be visible to everyone for public tracking
    const issues = await db.all('SELECT * FROM issues ORDER BY created_at DESC');

    for (let i = 0; i < issues.length; i++) {
      const voteRow = await db.get('SELECT COUNT(*) as c FROM votes WHERE issue_id = ?', [issues[i].id]);
      issues[i].upvotes = voteRow.c;

      // Load comments for the issue tracker
      const comments = await db.all('SELECT id, user_id, author_name, content, created_at FROM comments WHERE issue_id = ?', [issues[i].id]);
      issues[i].comments = comments;
    }

    res.json({ issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/issues', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const issues = await db.all('SELECT * FROM issues ORDER BY created_at DESC');
    for (let i = 0; i < issues.length; i++) {
      const voteRow = await db.get('SELECT COUNT(*) as c FROM votes WHERE issue_id = ?', [issues[i].id]);
      issues[i].upvotes = voteRow.c;
      const uRow = await db.get('SELECT name, email FROM users WHERE id = ?', [issues[i].user_id]);
      issues[i].user = uRow ? { name: uRow.name, email: uRow.email } : null;
    }
    res.json({ issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/issues/:id', authenticateToken, async (req, res) => {
  try {
    const issueId = parseInt(req.params.id);
    const issue = await db.get('SELECT * FROM issues WHERE id = ?', [issueId]);

    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    if (req.user.role !== 'admin' && issue.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const voteRow = await db.get('SELECT COUNT(*) as c FROM votes WHERE issue_id = ?', [issueId]);
    issue.upvotes = voteRow.c;

    const comments = await db.all('SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at ASC', [issueId]);

    res.json({ issue, comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/issues/:id/vote', authenticateToken, async (req, res) => {
  try {
    const issueId = parseInt(req.params.id);
    const userId = req.user.id;

    const issue = await db.get('SELECT * FROM issues WHERE id = ?', [issueId]);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    if (req.user.role !== 'admin' && issue.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only vote on visible tracker issues.' });
    }

    try {
      await db.run('INSERT INTO votes (issue_id, user_id) VALUES (?, ?)', [issueId, userId]);

      const p = await db.get('SELECT lat, lng FROM issues WHERE id = ?', [issueId]);
      if (p.lat && p.lng) {
        const newPrio = await calculatePriority(issueId, p.lat, p.lng);
        await db.run('UPDATE issues SET priority = ? WHERE id = ?', [newPrio, issueId]);
      }

      res.json({ success: true, message: 'Vote recorded' });
    } catch (e) {
      if (e.message.includes('UNIQUE constraint failed')) return res.status(400).json({ error: 'Already voted' });
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/issues/:id/comments', authenticateToken, async (req, res) => {
  try {
    const issueId = parseInt(req.params.id);
    const { content } = req.body;
    const userId = req.user.id;

    const issue = await db.get('SELECT * FROM issues WHERE id = ?', [issueId]);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    await db.run(
      'INSERT INTO comments (issue_id, user_id, author_name, content) VALUES (?, ?, ?, ?)',
      [issueId, userId, req.user.name || 'Anonymous', content]
    );

    res.status(201).json({ success: true, message: 'Comment added' });

    // Emit real-time update for comments
    io.emit('commentAdded', { issueId, userId, authorName: req.user.name || 'Anonymous', content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- USER REPORT UPDATE (owner or admin) ---
app.put('/api/issues/:id', authenticateToken, async (req, res) => {
  try {
    const issueId = parseInt(req.params.id);
    if (!Number.isFinite(issueId)) return res.status(400).json({ error: 'Invalid issue id' });

    const existing = await db.get('SELECT * FROM issues WHERE id = ?', [issueId]);
    if (!existing) return res.status(404).json({ error: 'Issue not found' });

    if (req.user.role !== 'admin' && existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only update your own reports.' });
    }

    const {
      title,
      category,
      description,
      lat,
      lng,
      city,
      state,
      village,
      media_url,
      is_emergency,
      severity
    } = req.body || {};

    const hasAnyUpdate =
      title !== undefined ||
      category !== undefined ||
      description !== undefined ||
      lat !== undefined ||
      lng !== undefined ||
      city !== undefined ||
      state !== undefined ||
      village !== undefined ||
      media_url !== undefined ||
      is_emergency !== undefined ||
      severity !== undefined;

    if (!hasAnyUpdate) return res.status(400).json({ error: 'No update fields provided' });

    const finalTitle = title !== undefined ? String(title).trim() : existing.title;
    if (title !== undefined && !finalTitle) return res.status(400).json({ error: 'Title cannot be empty' });

    const finalCategory = category !== undefined ? String(category).trim() : existing.category;
    if (category !== undefined && !finalCategory) return res.status(400).json({ error: 'Category cannot be empty' });

    const finalDescription = description !== undefined ? String(description).trim() : existing.description;
    if (description !== undefined && !finalDescription) return res.status(400).json({ error: 'Description cannot be empty' });

    const finalLat = lat !== undefined ? lat : existing.lat;
    const finalLng = lng !== undefined ? lng : existing.lng;

    const finalCity = city !== undefined ? city : existing.city;
    const finalState = state !== undefined ? state : existing.state;
    const finalVillage = village !== undefined ? village : existing.village;

    const autoEmergency = ['flood', 'fire'].includes(String(finalCategory || '').toLowerCase());
    const userEmergency = is_emergency !== undefined ? (is_emergency ? 1 : 0) : existing.is_emergency;
    const finalIsEmergency = (userEmergency === 1 || autoEmergency) ? 1 : 0;

    let finalSeverity = severity || 'Medium';
    const descLower = String(finalDescription || '').toLowerCase();
    if (finalIsEmergency) finalSeverity = 'High';
    else if (descLower.includes('minor') || descLower.includes('small')) finalSeverity = 'Low';
    else if (descLower.includes('major') || descLower.includes('dangerous')) finalSeverity = 'High';

    const translatedTitle = await translateText(finalTitle);
    const translatedDesc = await translateText(finalDescription);

    const predictedPriority =
      finalIsEmergency || finalSeverity === 'High'
        ? 'High'
        : await calculatePriority(issueId, finalLat, finalLng);

    const now = new Date();
    const deadlineAt = new Date(now);
    if (finalIsEmergency) deadlineAt.setHours(now.getHours() + 2);
    else if (String(finalCategory || '').toLowerCase() === 'garbage') deadlineAt.setHours(now.getHours() + 24);
    else if (String(finalCategory || '').toLowerCase() === 'pothole') deadlineAt.setDate(now.getDate() + 7);
    else deadlineAt.setDate(now.getDate() + 3);

    // Note: existing app stores "Original: ..." inside admin_remarks for translated descriptions.
    let adminRemarks = existing.admin_remarks;
    if (translatedDesc.detected !== 'en') {
      if (!adminRemarks || String(adminRemarks).startsWith('Original:')) {
        adminRemarks = `Original: ${translatedDesc.original}`;
      }
    } else if (adminRemarks && String(adminRemarks).startsWith('Original:')) {
      adminRemarks = null;
    }

    const newMediaUrl = Object.prototype.hasOwnProperty.call(req.body, 'media_url')
      ? (media_url || null)
      : existing.media_url;

    await db.run(
      `UPDATE issues
       SET title = ?,
           category = ?,
           description = ?,
           lat = ?,
           lng = ?,
           city = ?,
           state = ?,
           village = ?,
           media_url = ?,
           is_emergency = ?,
           priority = ?,
           deadline_at = ?,
           admin_remarks = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        translatedTitle.translated,
        finalCategory,
        translatedDesc.translated,
        finalLat,
        finalLng,
        finalCity,
        finalState,
        finalVillage,
        newMediaUrl,
        finalIsEmergency,
        predictedPriority,
        deadlineAt.toISOString(),
        adminRemarks,
        issueId
      ]
    );

    const updatedIssue = await db.get('SELECT * FROM issues WHERE id = ?', [issueId]);
    io.emit('issueUpdated', updatedIssue);

    res.json({ success: true, issue: updatedIssue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- USER REPORT DELETE (owner or admin) ---
app.delete('/api/issues/:id', authenticateToken, async (req, res) => {
  try {
    const issueId = parseInt(req.params.id);
    if (!Number.isFinite(issueId)) return res.status(400).json({ error: 'Invalid issue id' });

    const existing = await db.get('SELECT * FROM issues WHERE id = ?', [issueId]);
    if (!existing) return res.status(404).json({ error: 'Issue not found' });

    if (req.user.role !== 'admin' && existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only delete your own reports.' });
    }

    await db.exec('BEGIN');
    await db.run('DELETE FROM votes WHERE issue_id = ?', [issueId]);
    await db.run('DELETE FROM comments WHERE issue_id = ?', [issueId]);
    await db.run('DELETE FROM notificationPreferences WHERE issue_id = ?', [issueId]);
    await db.run('DELETE FROM verifications WHERE issue_id = ?', [issueId]);
    await db.run('DELETE FROM issues WHERE id = ?', [issueId]);
    await db.exec('COMMIT');

    io.emit('issueDeleted', { id: issueId });
    res.json({ success: true, message: 'Issue deleted' });
  } catch (err) {
    try { await db.exec('ROLLBACK'); } catch (e) { /* ignore */ }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/issues/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const issueId = parseInt(req.params.id);
    const { status, remarks, department, priority, resolution_media_url } = req.body;

    const issue = await db.get('SELECT * FROM issues WHERE id = ?', [issueId]);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const oldStatus = issue.status;

    let query = 'UPDATE issues SET updated_at = CURRENT_TIMESTAMP';
    let params = [];

    if (status) {
      const validStatuses = ['Pending', 'In Progress', 'Resolved'];
      if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

      query += ', status = ?';
      params.push(status);

      if (status === 'Resolved' && oldStatus !== 'Resolved') {
        query += `, resolved_at = CURRENT_TIMESTAMP`;
        // Award 50 bonus points to the reporter
        await db.run('UPDATE users SET points = points + 50 WHERE id = ?', [issue.user_id]);

        // Check for badge upgrade for the reporter
        const uPoints = await db.get('SELECT points FROM users WHERE id = ?', [issue.user_id]);
        let rBadge = "Citizen";
        if (uPoints.points > 500) rBadge = "Civic Legend";
        else if (uPoints.points > 200) rBadge = "City Guardian";
        else if (uPoints.points > 50) rBadge = "Top Citizen";
        await db.run('UPDATE users SET badge = ? WHERE id = ?', [rBadge, issue.user_id]);
      } else if (status !== 'Resolved') {
        query += `, resolved_at = NULL`;
      }
    }

    if (remarks !== undefined) { query += ', admin_remarks = ?'; params.push(remarks); }
    if (department !== undefined) { query += ', department = ?'; params.push(department); }
    if (priority !== undefined) { query += ', priority = ?'; params.push(priority); }
    if (resolution_media_url !== undefined) { query += ', resolution_media_url = ?'; params.push(resolution_media_url); }

    query += ' WHERE id = ?';
    params.push(issueId);

    await db.run(query, params);

    // Trigger Notifications on Status Update
    if (status && status !== oldStatus) {
      const pref = await db.get('SELECT * FROM notificationPreferences WHERE issue_id = ?', [issueId]);
      if (pref) {
        const isResolved = status.toLowerCase() === 'resolved';
        const eventPhrase = isResolved ? 'has been RESOLVED' : `status is now ${status}`;
        let msg = `CivicConnect Update: Complaint ${issue.complaint_id} ${eventPhrase}.`;
        if (remarks) msg += ` Remarks: ${remarks}`;

        if (pref.phone) sendSmsNotification(pref.phone, msg);
        if (pref.push_enabled) sendPushNotification(pref.user_id, "Status Updated", msg);
      }
      // Send notification with rich data
      const reporter = await db.get('SELECT name, email FROM users WHERE id = ?', [issue.user_id]);
      if (reporter && reporter.email) {
        const reportDate = new Date(issue.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const resolvedDate = status === 'Resolved' ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

        sendStatusUpdateEmail(reporter.email, issue.complaint_id, issue.title, status || issue.status, remarks || issue.admin_remarks, reporter.name, reportDate, resolvedDate);
      }
    }

    res.json({ success: true, message: 'Status updated and notifications sent successfully' });

    // Emit real-time update
    const updatedIssue = await db.get('SELECT * FROM issues WHERE id = ?', [issueId]);
    io.emit('issueUpdated', updatedIssue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DEPARTMENT PERFORMANCE & PREDICTIONS ---
app.get('/api/admin/department-performance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const resolvedIssues = await db.all('SELECT category, created_at, resolved_at FROM issues WHERE status = "Resolved"');
    const allIssues = await db.all('SELECT category, status, deadline_at FROM issues');

    const performance = {};

    allIssues.forEach(issue => {
      if (!performance[issue.category]) performance[issue.category] = { resolved: 0, total: 0, avgSpeed: 0, totalSpeedMs: 0, delayed: 0 };
      performance[issue.category].total++;
      if (issue.status === 'Resolved') performance[issue.category].resolved++;

      const isPastDeadline = issue.status !== 'Resolved' && new Date(issue.deadline_at) < new Date();
      if (isPastDeadline) performance[issue.category].delayed++;
    });

    resolvedIssues.forEach(issue => {
      const speed = new Date(issue.resolved_at) - new Date(issue.created_at);
      performance[issue.category].totalSpeedMs += speed;
    });

    Object.keys(performance).forEach(cat => {
      if (performance[cat].resolved > 0) {
        performance[cat].avgSpeedHrs = (performance[cat].totalSpeedMs / performance[cat].resolved / (1000 * 60 * 60)).toFixed(1);
      } else {
        performance[cat].avgSpeedHrs = 'N/A';
      }
      // Score = (% Resolved * 0.7) + (% On Time * 0.3)
      const resolutionRate = (performance[cat].resolved / performance[cat].total) || 0;
      const onTimeRate = (1 - (performance[cat].delayed / performance[cat].total)) || 1;
      performance[cat].score = Math.round((resolutionRate * 70) + (onTimeRate * 30));
    });

    const ranking = Object.entries(performance).map(([key, val]) => ({ department: key, ...val })).sort((a, b) => b.score - a.score);

    res.json({ ranking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/issue-predictions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const history = await db.all('SELECT category, city, created_at, lat, lng FROM issues');
    
    if (history.length === 0) {
      return res.json({ predictions: [] });
    }

    // 1. Calculate Category Frequency
    const catFreq = {};
    history.forEach(h => {
      catFreq[h.category] = (catFreq[h.category] || 0) + 1;
    });

    // 2. Aggregate by City & Category
    const cityCatPatterns = {};
    history.forEach(h => {
      if (!h.city) return;
      const key = `${h.city}_${h.category}`;
      if (!cityCatPatterns[key]) {
        cityCatPatterns[key] = { 
          count: 0, 
          city: h.city, 
          category: h.category,
          avgLat: 0,
          avgLng: 0
        };
      }
      cityCatPatterns[key].count++;
      cityCatPatterns[key].avgLat += h.lat;
      cityCatPatterns[key].avgLng += h.lng;
    });

    const results = Object.values(cityCatPatterns).map(p => {
      const avgLat = (p.avgLat / p.count).toFixed(2);
      const avgLng = (p.avgLng / p.count).toFixed(2);
      const totalInCat = catFreq[p.category];
      const intensity = Math.min(Math.round((p.count / totalInCat) * 100), 100);
      
      let likelihood = intensity > 70 ? 'CRITICAL' : intensity > 40 ? 'High' : 'Moderate';
      let note = "";
      
      if (p.category === 'pothole') note = `Seasonal road erosion pattern detected in ${p.city}. Proactive inspection recommended for GRID ${avgLat},${avgLng}.`;
      else if (p.category === 'garbage') note = `Accumulation spike in ${p.city} indicates secondary collection failure risk.`;
      else if (p.category === 'water') note = `Pressure drop chain reported. Potential main pipeline compromise in ${p.city}.`;
      else note = `Unusual volume of ${p.category} reports in ${p.city}. Monitoring cluster active.`;

      return {
        category: p.category.toUpperCase(),
        likelihood,
        intensity: `${intensity}%`,
        note,
        grid: `${avgLat}, ${avgLng}`,
        dow: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        count: p.count
      };
    });

    // Sort by intensity and return top 5
    const predictions = results
      .sort((a, b) => parseInt(b.intensity) - parseInt(a.intensity))
      .slice(0, 5);

    res.json({ predictions });
  } catch (err) {
    console.error("Prediction Engine Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const topUsers = await db.all(
      'SELECT name, points FROM users WHERE role = "user" ORDER BY points DESC LIMIT 10'
    );
    res.json({ leaderboard: topUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  const msg = message.toLowerCase();

  let response = "I'm the Smart Civic Assistant. I can help you report issues or track progress. Try asking 'how to report' or 'about points'.";

  if (msg.includes('report') || msg.includes('file')) {
    response = "To report an issue, click 'Report Issue' in the top menu. Enter a title, description, and use the map to pin the exact location. You can also upload a photo for faster resolution!";
  } else if (msg.includes('water')) {
    response = "For water issues (leaks, supply, etc.), select the 'Water Supply' category when reporting. High-priority water issues are usually reviewed within 24 hours.";
  } else if (msg.includes('pothole') || msg.includes('road')) {
    response = "Potholes and road damage should be reported under the 'Roads & Transport' category. Please attach a photo so our team can assess the depth and urgency.";
  } else if (msg.includes('points') || msg.includes('score') || msg.includes('rank')) {
    response = "You earn 10 points for every report you file, and a 50-point bonus when your report is resolved! Check the 'Leaderboard' to see top civic contributors.";
  } else if (msg.includes('emergency')) {
    response = "If an issue poses an immediate danger, use the 'Emergency Reporting' toggle in the report form. This flags it natively in our system with highest priority.";
  } else if (msg.includes('admin') || msg.includes('official')) {
    response = "Only verified government officials can access the Headquarters portal. If you are an official, please use your government-issued credentials to login.";
  }

  res.json({ response });
});

app.post('/api/issues/:id/verify', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { type } = req.body; // 'exists', 'resolved', or 'not_resolved'

  try {
    const issue = await db.get('SELECT * FROM issues WHERE id = ?', [id]);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    if (issue.user_id === req.user.id) {
      return res.status(400).json({ error: "You cannot verify your own report." });
    }

    // Check if already verified by this user
    const existing = await db.get('SELECT * FROM verifications WHERE issue_id = ? AND user_id = ?', [id, req.user.id]);
    if (existing) {
      return res.status(400).json({ error: "You have already verified this issue." });
    }

    await db.run(
      'INSERT INTO verifications (issue_id, user_id, type) VALUES (?, ?, ?)',
      [id, req.user.id, type]
    );

    let pointsAwarded = type === 'exists' ? 5 : type === 'resolved' ? 10 : 0;
    let message = 'Verification successful!';

    if (type === 'not_resolved' && issue.status === 'Resolved') {
      // Re-open the issue
      const reopenRemark = '[RE-OPENED]: Citizen verification failed — Issue still exists as per community report. (Official resolution disputed)';
      await db.run(
        'UPDATE issues SET status = ?, admin_remarks = ? WHERE id = ?',
        ['Pending', reopenRemark, id]
      );
      message = 'Issue re-opened due to verification failure!';
      // No points for re-opening
      pointsAwarded = 0;

      // Emit real-time update
      const updatedIssue = await db.get('SELECT * FROM issues WHERE id = ?', [id]);
      io.emit('issueUpdated', updatedIssue);
    } else if (type === 'resolved' && issue.admin_remarks && issue.admin_remarks.includes('[RE-OPENED]')) {
      // Remove the re-open remark when verified as resolved
      await db.run(
        'UPDATE issues SET admin_remarks = NULL WHERE id = ?',
        [id]
      );

      // Emit real-time update
      const updatedIssue = await db.get('SELECT * FROM issues WHERE id = ?', [id]);
      io.emit('issueUpdated', updatedIssue);
    }

    if (pointsAwarded > 0) {
      await db.run('UPDATE users SET points = points + ? WHERE id = ?', [pointsAwarded, req.user.id]);

      // Refresh user for badge calculation
      const user = await db.get('SELECT points FROM users WHERE id = ?', [req.user.id]);
      let newBadge = "Citizen";
      if (user.points > 500) newBadge = "Civic Legend";
      else if (user.points > 200) newBadge = "City Guardian";
      else if (user.points > 50) newBadge = "Top Citizen";

      await db.run('UPDATE users SET badge = ? WHERE id = ?', [newBadge, req.user.id]);
    }

    res.json({ message, points: pointsAwarded });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: "Already verified." });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaderboard = await db.all(
      'SELECT name, points, badge FROM users WHERE role = "user" AND email != "gov@city.org" ORDER BY points DESC LIMIT 10'
    );
    res.json({ leaderboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT id, name, email, phone, role, points, badge FROM users WHERE id = ?', [req.user.id]);
    const reportCount = await db.get('SELECT COUNT(*) as c FROM issues WHERE user_id = ?', [req.user.id]);
    const resolvedCount = await db.get('SELECT COUNT(*) as c FROM issues WHERE user_id = ? AND status = "Resolved"', [req.user.id]);

    res.json({ user, stats: { total: reportCount.c, resolved: resolvedCount.c } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/smart-suggestions', async (req, res) => {
  try {
    const { lat, lng, radius = 1 } = req.query; // radius in km
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

    // Get issues within radius
    const issues = await db.all('SELECT category, lat, lng FROM issues');
    const nearbyIssues = issues.filter(issue => {
      const distance = Math.sqrt((issue.lat - lat) ** 2 + (issue.lng - lng) ** 2) * 111; // approx km
      return distance <= radius;
    });

    const categoryCount = {};
    nearbyIssues.forEach(issue => {
      categoryCount[issue.category] = (categoryCount[issue.category] || 0) + 1;
    });

    const suggestions = [];
    if (categoryCount.garbage > 2) suggestions.push("This area needs more dustbins");
    if (categoryCount.pothole > 2) suggestions.push("Road repairs needed in this area");
    if (categoryCount.streetlight > 1) suggestions.push("Streetlight maintenance required");
    if (categoryCount.water > 1) suggestions.push("Water pipeline inspection needed");
    if (categoryCount.flood > 0) suggestions.push("Flood prevention measures recommended");
    if (categoryCount.fire > 0) suggestions.push("Fire safety equipment check needed");

    res.json({ suggestions, nearbyIssueCount: nearbyIssues.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/city-ranking', async (req, res) => {
  try {
    // For simplicity, calculate overall metrics (assuming single city)
    // Cleanliness: % of garbage issues resolved
    const garbageIssues = await db.all('SELECT status FROM issues WHERE category = "garbage"');
    const totalGarbage = garbageIssues.length;
    const resolvedGarbage = garbageIssues.filter(i => i.status === 'Resolved').length;
    const cleanlinessScore = totalGarbage > 0 ? (resolvedGarbage / totalGarbage) * 100 : 100;

    // Response time: Average time to resolve issues
    const resolvedIssues = await db.all('SELECT created_at, resolved_at FROM issues WHERE status = "Resolved" AND resolved_at IS NOT NULL');
    let totalResponseTime = 0;
    resolvedIssues.forEach(issue => {
      const created = new Date(issue.created_at);
      const resolved = new Date(issue.resolved_at);
      totalResponseTime += (resolved - created) / (1000 * 60 * 60); // hours
    });
    const avgResponseTime = resolvedIssues.length > 0 ? totalResponseTime / resolvedIssues.length : 0;

    // Overall score (higher is better)
    const overallScore = (cleanlinessScore * 0.6) + ((24 - Math.min(avgResponseTime, 24)) / 24 * 100 * 0.4);

    res.json({
      cleanliness: Math.round(cleanlinessScore),
      avgResponseTimeHours: Math.round(avgResponseTime * 10) / 10,
      overallScore: Math.round(overallScore),
      rank: 1 // Single city for now
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
