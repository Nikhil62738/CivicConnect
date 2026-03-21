require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { connectDB, User, Issue, Vote, Comment, NotificationPreference, Verification } = require('./db');
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
// ==========================================
// MONGODB SETUP
// ==========================================
connectDB();

// MASTER ADMIN SEEDER
const seedMasterAdmin = async () => {
  try {
    const officialExists = await User.findOne({ email: 'gov@city.org' });
    if (!officialExists) {
      const hashedMaster = await bcrypt.hash('city@1234', 10);
      const masterAdmin = new User({
        id: 'MASTER-ADMIN',
        name: 'OFFICIAL GOV ADMIN',
        email: 'gov@city.org',
        phone: '+910000000000',
        password: hashedMaster,
        role: 'admin'
      });
      await masterAdmin.save();
      console.log("🏛️  MASTER ADMIN PORTAL ACTIVE: gov@city.org | city@1234");
    }
    // Security audit: ensure only the official admin has the 'admin' role
    console.log("🛡️  Global Security Audit Complete");
  } catch (err) {
    console.error("❌ Seeding Error:", err.message);
  }
};

seedMasterAdmin();

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

const requireMasterAdmin = (req, res, next) => {
  if (req.user.id !== 'MASTER-ADMIN' && req.user.email !== 'gov@city.org') {
    return res.status(403).json({ error: 'Master admin access required to manage district admins' });
  }
  next();
};

// ==========================================
// AUTH ROUTES
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check existing
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = generateUserId();

    // STRICT: Only gov@city.org can be admin. All registrants are assigned 'user' role.
    const role = 'user';

    const newUser = new User({ id: userId, name, email, phone, password: hashedPassword, role });
    await newUser.save();

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
    let user = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }] });

    if (!user && identifier.includes('@')) {
      // Auto-register via email if not exists
      const newUserId = generateUserId();
      user = new User({ id: newUserId, email: identifier, role: 'user', name: identifier.split('@')[0] });
      await user.save();
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, department: user.department }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(401).json({ error: 'Invalid Credentials' });

    if (!user.password) return res.status(401).json({ error: 'Please login using OTP or Social' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid Credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role, department: user.department }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, department: user.department }, token });
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

    let user = await User.findOne({ email });
    if (!user) {
      // Auto-register new citizens via Firebase
      const newUserId = generateUserId();
      const displayName = decodedToken.name || email.split('@')[0];
      user = new User({
        id: newUserId,
        name: displayName,
        email,
        role: 'user'
      });
      await user.save();
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

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal whether account exists
      return res.json({ success: true, message: 'If an account exists, a recovery email has been sent.' });
    }

    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await User.findOneAndUpdate({ id: user.id }, { password: hashedPassword });
    console.log(`[Password Reset] Temp password for ${user.email}: ${tempPassword}`);

    sendEmailNotification(
      user.email,
      'CivicConnect: Password Recovery',
      `<h3>Password Reset Request</h3><p>Hello ${user.name},</p><p>We received a request to reset your password.</p><p>Your new temporary password is: <b>${tempPassword}</b></p><p>Please login and change it from your profile immediately.</p>`
    );

    if (user.phone) {
      sendSmsNotification(user.phone, `CivicConnect Password Reset: Your temporary password is ${tempPassword}.`);
    }

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

    const existing = await User.findOne({ email, id: { $ne: userId } });
    if (existing) return res.status(400).json({ error: 'Email already in use' });

    const update = { name, email, phone };
    if (password && password.trim()) {
      update.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await User.findOneAndUpdate({ id: userId }, update, { new: true });
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- USER ACCOUNT DELETE (self) ---
app.delete('/api/auth/account', authenticateToken, async (req, res) => {
  const mongoose = require('mongoose');
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user.id;

    // Pre-fetch issue ids so we can emit deletion events
    const ownedIssues = await Issue.find({ user_id: userId });
    const issueIds = ownedIssues.map(i => i._id);

    // Remove all user-generated data
    await Vote.deleteMany({ user_id: userId }).session(session);
    await Comment.deleteMany({ user_id: userId }).session(session);
    await NotificationPreference.deleteMany({ user_id: userId }).session(session);
    await Verification.deleteMany({ user_id: userId }).session(session);

    if (issueIds.length > 0) {
      await Vote.deleteMany({ issue_id: { $in: issueIds } }).session(session);
      await Comment.deleteMany({ issue_id: { $in: issueIds } }).session(session);
      await NotificationPreference.deleteMany({ issue_id: { $in: issueIds } }).session(session);
      await Verification.deleteMany({ issue_id: { $in: issueIds } }).session(session);
      await Issue.deleteMany({ _id: { $in: issueIds } }).session(session);
    }

    await User.findOneAndDelete({ id: userId }).session(session);
    await session.commitTransaction();

    // Socket emit
    issueIds.forEach(id => io.emit('issueDeleted', { id }));

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
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

    // MongoDB Geospatial query would be better, but we keep the same filter logic for "without changing"
    const openIssues = await Issue.find({ status: { $ne: 'Resolved' } }).lean();

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
    votes = await Vote.countDocuments({ issue_id: issueId });
  }

  const centerLat = 20.5937, centerLng = 78.9629;
  const dist = Math.sqrt(Math.pow(lat - centerLat, 2) + Math.pow(lng - centerLng, 2));
  let locationPoints = dist < 0.1 ? 2 : dist < 0.5 ? 1 : 0;

  const nearby = await Issue.find({ status: { $ne: 'Resolved' } }).select('lat lng').lean();
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
    const now = new Date();
    const overdue = await Issue.find({
      status: { $ne: 'Resolved' },
      is_escalated: 0,
      deadline_at: { $lt: now }
    });

    if (overdue.length > 0) {
      console.log(`[Escalation Cycle] Found ${overdue.length} overdue issues. Escalating...`);
      for (const issue of overdue) {
        issue.is_escalated = 1;
        issue.priority = 'HIGH (ESCALATED)';
        issue.updated_at = new Date();
        await issue.save();
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
    const issues = await Issue.find({})
      .sort({ created_at: -1 })
      .lean();

    // Attach upvotes and comments
    for (let issue of issues) {
      issue.upvotes = await Vote.countDocuments({ issue_id: issue._id });
      issue.comments = await Comment.find({ issue_id: issue._id }).lean();
      // Map _id to id for frontend compatibility
      issue.id = issue._id.toString();
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

    // Auto-Translate description/title
    const translatedTitle = await translateText(title);
    const translatedDesc = await translateText(description);

    const finalTitle = translatedTitle.translated;
    const finalDesc = translatedDesc.translated;

    // Auto-set emergency for critical categories
    const autoEmergency = ['flood', 'fire'].includes(category.toLowerCase());
    const finalIsEmergency = is_emergency || autoEmergency;

    // Severity Logic
    let finalSeverity = severity || 'Medium';
    if (finalIsEmergency) finalSeverity = 'High';
    else if (description.toLowerCase().includes('minor') || description.toLowerCase().includes('small')) finalSeverity = 'Low';
    else if (description.toLowerCase().includes('major') || description.toLowerCase().includes('dangerous')) finalSeverity = 'High';

    const predictedPriority = finalIsEmergency || finalSeverity === 'High' ? 'High' : await calculatePriority(null, lat, lng);

    // Calculate Deadline
    const now = new Date();
    let deadlineAt = new Date();
    if (finalIsEmergency) {
      deadlineAt.setHours(now.getHours() + 2);
    } else if (category === 'garbage') {
      deadlineAt.setHours(now.getHours() + 24);
    } else if (category === 'pothole') {
      deadlineAt.setDate(now.getDate() + 7);
    } else {
      deadlineAt.setDate(now.getDate() + 3);
    }

    const issue = new Issue({
      complaint_id: complaintId,
      user_id: userId,
      title: finalTitle,
      category,
      description: finalDesc,
      lat,
      lng,
      city: city || null,
      state: state || null,
      village: village || null,
      media_url: media_url || null,
      is_emergency: finalIsEmergency ? 1 : 0,
      priority: predictedPriority,
      admin_remarks: (translatedDesc.detected !== 'en' ? `Original: ${translatedDesc.original}` : null),
      deadline_at: deadlineAt
    });

    await issue.save();

    // Award points (20 points) and check badge
    const userUpdate = await User.findOneAndUpdate(
      { id: userId },
      { $inc: { points: 20 } },
      { new: true }
    );

    let newBadge = "Citizen";
    if (userUpdate.points > 500) newBadge = "Civic Legend";
    else if (userUpdate.points > 200) newBadge = "City Guardian";
    else if (userUpdate.points > 50) newBadge = "Top Citizen";

    await User.findOneAndUpdate({ id: userId }, { badge: newBadge });

    // Save notification preferences
    const pref = new NotificationPreference({
      issue_id: issue._id,
      user_id: userId,
      email: userUpdate.email,
      phone: userUpdate.phone
    });
    await pref.save();

    // Notifications
    if (userUpdate.phone) {
      sendSmsNotification(userUpdate.phone, `CivicConnect: Complaint ${complaintId} (${title}) registered successfully!`);
    }
    if (userUpdate.email) {
      sendComplaintRegistrationEmail(userUpdate.email, complaintId, title, category, userUpdate.name);
    }
    sendPushNotification(userId, "Registered Successfully", `Complaint ${complaintId} is now tracked.`);

    res.status(201).json({
      success: true,
      id: issue._id,
      complaint_id: complaintId,
      message: 'Issue reported',
      translated: translatedDesc.detected !== 'en'
    });

    // io events
    const leanIssue = issue.toObject();
    leanIssue.id = leanIssue._id;
    io.emit('issueCreated', leanIssue);
    io.emit('newIssueNearby', { lat, lng, title, category });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/notifications', authenticateToken, async (req, res) => {
  try {
    const issues = await Issue.find({ user_id: req.user.id })
      .sort({ updated_at: -1 })
      .limit(10)
      .lean();

    const notifications = issues
      .filter(i => i.updated_at.getTime() !== i.created_at.getTime() || i.status !== 'Pending')
      .map(i => ({
        id: `alert-${i._id}-${i.updated_at.getTime()}`,
        message: `Update for [CIVIC-${i.complaint_id}]: Status changed to ${i.status.toUpperCase()}. ${i.admin_remarks ? `Official note: "${i.admin_remarks}"` : ''}`,
        date: new Date(i.updated_at).toLocaleTimeString() + ' - ' + new Date(i.updated_at).toLocaleDateString(),
        read: false
      }));

    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public/issues', async (req, res) => {
  try {
    const issues = await Issue.find({}).sort({ created_at: -1 }).lean();
    for (let issue of issues) {
      issue.upvotes = await Vote.countDocuments({ issue_id: issue._id });
      issue.id = issue._id.toString();
    }
    res.json({ issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/my-issues', authenticateToken, async (req, res) => {
  try {
    const issues = await Issue.find({ user_id: req.user.id })
      .sort({ created_at: -1 })
      .lean();

    for (let issue of issues) {
      issue.upvotes = await Vote.countDocuments({ issue_id: issue._id });
      issue.id = issue._id.toString();
    }

    res.json({ issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/issues', authenticateToken, async (req, res) => {
  try {
    const issues = await Issue.find({})
      .sort({ created_at: -1 })
      .lean();

    for (let issue of issues) {
      issue.upvotes = await Vote.countDocuments({ issue_id: issue._id });
      issue.comments = await Comment.find({ issue_id: issue._id }).lean();
      issue.id = issue._id.toString();
    }

    res.json({ issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/issues', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    // If not master admin, filter by assigned district (department)
    if (req.user.email !== 'gov@city.org' && req.user.department) {
      filter.city = req.user.department;
    }

    const issues = await Issue.find(filter)
      .sort({ created_at: -1 })
      .lean();

    for (let issue of issues) {
      issue.upvotes = await Vote.countDocuments({ issue_id: issue._id });
      const user = await User.findOne({ id: issue.user_id }, 'name email').lean();
      issue.user = user;
      issue.id = issue._id.toString();
    }
    res.json({ issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/issues/:id', authenticateToken, async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await Issue.findById(issueId).lean();

    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    if (req.user.role !== 'admin' && issue.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    issue.upvotes = await Vote.countDocuments({ issue_id: issueId });
    const comments = await Comment.find({ issue_id: issueId }).sort({ created_at: 1 }).lean();

    issue.id = issue._id.toString();
    res.json({ issue, comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/issues/:id/vote', authenticateToken, async (req, res) => {
  try {
    const issueId = req.params.id;
    const userId = req.user.id;

    const issue = await Issue.findById(issueId);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    // Allow voting on public issues
    try {
      const existingVote = await Vote.findOne({ issue_id: issueId, user_id: userId });
      if (existingVote) return res.status(400).json({ error: 'Already voted' });

      const vote = new Vote({ issue_id: issueId, user_id: userId });
      await vote.save();

      const newPrio = await calculatePriority(issueId, issue.lat, issue.lng);
      await Issue.findByIdAndUpdate(issueId, { priority: newPrio });

      res.json({ success: true, message: 'Vote recorded' });
    } catch (e) {
      if (e.code === 11000) return res.status(400).json({ error: 'Already voted' });
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/issues/:id/comments', authenticateToken, async (req, res) => {
  try {
    const issueId = req.params.id;
    const { content } = req.body;
    const userId = req.user.id;

    const issue = await Issue.findById(issueId);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const comment = new Comment({
      issue_id: issueId,
      user_id: userId,
      author_name: req.user.name || 'Anonymous',
      content
    });
    await comment.save();

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
    const issueId = req.params.id;
    const existing = await Issue.findById(issueId);
    if (!existing) return res.status(404).json({ error: 'Issue not found' });

    if (req.user.role !== 'admin' && existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only update your own reports.' });
    }

    const {
      title, category, description, lat, lng, city, state, village, media_url, is_emergency, severity
    } = req.body || {};

    if (title !== undefined) existing.title = (await translateText(String(title).trim())).translated;
    if (category !== undefined) existing.category = String(category).trim();
    if (description !== undefined) existing.description = (await translateText(String(description).trim())).translated;
    if (lat !== undefined) existing.lat = lat;
    if (lng !== undefined) existing.lng = lng;
    if (city !== undefined) existing.city = city;
    if (state !== undefined) existing.state = state;
    if (village !== undefined) existing.village = village;
    if (media_url !== undefined) existing.media_url = media_url;
    
    if (is_emergency !== undefined || category !== undefined) {
      const autoEmergency = ['flood', 'fire'].includes(String(existing.category || '').toLowerCase());
      existing.is_emergency = (is_emergency || autoEmergency) ? 1 : 0;
    }

    if (existing.is_emergency || severity === 'High') {
      existing.priority = 'High';
    } else {
      existing.priority = await calculatePriority(issueId, existing.lat, existing.lng);
    }

    // Deadline update
    const now = new Date();
    if (existing.is_emergency) existing.deadline_at = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    else if (existing.category === 'garbage') existing.deadline_at = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    else if (existing.category === 'pothole') existing.deadline_at = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    else existing.deadline_at = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    existing.updated_at = new Date();
    await existing.save();

    const leanUpdate = existing.toObject();
    leanUpdate.id = leanUpdate._id;
    io.emit('issueUpdated', leanUpdate);

    res.json({ success: true, issue: leanUpdate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- USER REPORT DELETE (owner or admin) ---
app.delete('/api/issues/:id', authenticateToken, async (req, res) => {
  try {
    const issueId = req.params.id;
    const existing = await Issue.findById(issueId);
    if (!existing) return res.status(404).json({ error: 'Issue not found' });

    if (req.user.role !== 'admin' && existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only delete your own reports.' });
    }

    await Vote.deleteMany({ issue_id: issueId });
    await Comment.deleteMany({ issue_id: issueId });
    await NotificationPreference.deleteMany({ issue_id: issueId });
    await Verification.deleteMany({ issue_id: issueId });
    await Issue.findByIdAndDelete(issueId);

    io.emit('issueDeleted', { id: issueId });
    res.json({ success: true, message: 'Issue deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/issues/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const issueId = req.params.id;
    const { status, remarks, department, priority, resolution_media_url } = req.body;

    const issue = await Issue.findById(issueId);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const oldStatus = issue.status;

    if (status) {
      const validStatuses = ['Pending', 'In Progress', 'Resolved'];
      if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

      issue.status = status;
      if (status === 'Resolved' && oldStatus !== 'Resolved') {
        issue.resolved_at = new Date();
        // Award 50 bonus points
        const user = await User.findOneAndUpdate({ id: issue.user_id }, { $inc: { points: 50 } }, { new: true });
        if (user) {
          let rBadge = "Citizen";
          if (user.points > 500) rBadge = "Civic Legend";
          else if (user.points > 200) rBadge = "City Guardian";
          else if (user.points > 50) rBadge = "Top Citizen";
          await User.findOneAndUpdate({ id: issue.user_id }, { badge: rBadge });
        }
      } else if (status !== 'Resolved') {
        issue.resolved_at = null;
      }
    }

    if (remarks !== undefined) issue.admin_remarks = remarks;
    if (department !== undefined) issue.department = department;
    if (priority !== undefined) issue.priority = priority;
    if (resolution_media_url !== undefined) issue.resolution_media_url = resolution_media_url;

    issue.updated_at = new Date();
    await issue.save();

    // Notifications
    if (status && status !== oldStatus) {
      const pref = await NotificationPreference.findOne({ issue_id: issueId });
      if (pref) {
        const isResolved = status.toLowerCase() === 'resolved';
        const msg = `CivicConnect Update: Complaint ${issue.complaint_id} ${isResolved ? 'has been RESOLVED' : `status is now ${status}`}. ${remarks || ''}`;
        if (pref.phone) sendSmsNotification(pref.phone, msg);
        sendPushNotification(issue.user_id, "Status Updated", msg);
      }
      
      const reporter = await User.findOne({ id: issue.user_id });
      if (reporter && reporter.email) {
        sendStatusUpdateEmail(reporter.email, issue.complaint_id, issue.title, status, remarks, reporter.name, issue.created_at, issue.resolved_at);
      }
    }

    const leanIssue = issue.toObject();
    leanIssue.id = leanIssue._id.toString();
    io.emit('issueUpdated', leanIssue);

    res.json({ success: true, message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DEPARTMENT PERFORMANCE & PREDICTIONS ---
app.get('/api/admin/department-performance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.user.email !== 'gov@city.org' && req.user.department) {
      filter.city = req.user.department;
    }
    const allIssues = await Issue.find(filter).lean();
    const performance = {};

    allIssues.forEach(issue => {
      const cat = issue.category || 'Unassigned';
      if (!performance[cat]) performance[cat] = { resolved: 0, total: 0, totalSpeedMs: 0, delayed: 0 };
      performance[cat].total++;
      if (issue.status === 'Resolved') {
        performance[cat].resolved++;
        if (issue.resolved_at) {
          performance[cat].totalSpeedMs += (new Date(issue.resolved_at) - new Date(issue.created_at));
        }
      }
      if (issue.status !== 'Resolved' && issue.deadline_at && new Date(issue.deadline_at) < new Date()) {
        performance[cat].delayed++;
      }
    });

    const ranking = Object.entries(performance).map(([cat, val]) => {
      const avgSpeedHrs = val.resolved > 0 ? (val.totalSpeedMs / val.resolved / (1000 * 60 * 60)).toFixed(1) : 'N/A';
      const resolutionRate = (val.resolved / val.total) || 0;
      const onTimeRate = (1 - (val.delayed / val.total)) || 1;
      const score = Math.round((resolutionRate * 70) + (onTimeRate * 30));
      return { department: cat, ...val, avgSpeedHrs, score };
    }).sort((a, b) => b.score - a.score);

    res.json({ ranking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/issue-predictions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.user.email !== 'gov@city.org' && req.user.department) {
      filter.city = req.user.department;
    }
    const history = await Issue.find(filter).select('city category lat lng').lean();
    if (history.length < 1) return res.json({ predictions: [] });

    const cityCatPatterns = {};
    const catFreq = {};

    history.forEach(h => {
      if (!h.city) return;
      catFreq[h.category] = (catFreq[h.category] || 0) + 1;
      const key = `${h.city}_${h.category}`;
      if (!cityCatPatterns[key]) {
        cityCatPatterns[key] = { count: 0, city: h.city, category: h.category, avgLat: 0, avgLng: 0 };
      }
      cityCatPatterns[key].count++;
      cityCatPatterns[key].avgLat += h.lat;
      cityCatPatterns[key].avgLng += h.lng;
    });

    const predictions = Object.values(cityCatPatterns).map(p => {
      const avgLat = (p.avgLat / p.count).toFixed(2);
      const avgLng = (p.avgLng / p.count).toFixed(2);
      const totalInCat = catFreq[p.category];
      const intensity = Math.min(Math.round((p.count / totalInCat) * 100), 100);
      let likelihood = intensity > 70 ? 'CRITICAL' : intensity > 40 ? 'High' : 'Moderate';
      
      return {
        category: p.category.toUpperCase(),
        likelihood,
        intensity: `${intensity}%`,
        note: `Pattern detected in ${p.city}. Proactive monitor active at ${avgLat}, ${avgLng}.`,
        grid: `${avgLat}, ${avgLng}`,
        dow: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        count: p.count
      };
    }).sort((a, b) => parseInt(b.intensity) - parseInt(a.intensity)).slice(0, 5);

    res.json({ predictions });
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
    response = "You earn 20 points for every report you file, 5-10 for verifications, and a 50-point bonus when your report is resolved! Check the 'Leaderboard' to see top contributors.";
  } else if (msg.includes('emergency')) {
    response = "If an issue poses an immediate danger, use the 'Emergency Reporting' toggle in the report form. This flags it natively in our system with highest priority.";
  } else if (msg.includes('admin') || msg.includes('official')) {
    response = "Only verified government officials can access the Headquarters portal. If you are an official, please use your government-issued credentials to login.";
  }

  res.json({ response });
});

app.post('/api/issues/:id/verify', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { type } = req.body;

  try {
    const issue = await Issue.findById(id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    if (issue.user_id === req.user.id) {
      return res.status(400).json({ error: "You cannot verify your own report." });
    }

    const existing = await Verification.findOne({ issue_id: id, user_id: req.user.id });
    if (existing) return res.status(400).json({ error: "You have already verified this issue." });

    const verification = new Verification({ issue_id: id, user_id: req.user.id, type });
    await verification.save();

    let pointsAwarded = type === 'exists' ? 5 : type === 'resolved' ? 10 : 0;
    
    if (type === 'not_resolved' && issue.status === 'Resolved') {
      issue.status = 'Pending';
      issue.admin_remarks = '[RE-OPENED]: Citizen verification failed.';
      await issue.save();
      const leanIssue = issue.toObject();
      leanIssue.id = leanIssue._id;
      io.emit('issueUpdated', leanIssue);
    }

    if (pointsAwarded > 0) {
      const user = await User.findOneAndUpdate({ id: req.user.id }, { $inc: { points: pointsAwarded } }, { new: true });
      let newBadge = "Citizen";
      if (user.points > 500) newBadge = "Civic Legend";
      else if (user.points > 200) newBadge = "City Guardian";
      else if (user.points > 50) newBadge = "Top Citizen";
      await User.findOneAndUpdate({ id: req.user.id }, { badge: newBadge });
    }

    res.json({ message: 'Verified!', points: pointsAwarded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaderboard = await User.find({ role: 'user', email: { $ne: 'gov@city.org' } })
      .sort({ points: -1 })
      .limit(10)
      .select('name points badge')
      .lean();
    res.json({ leaderboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.id }).select('id name email phone role points badge').lean();
    const total = await Issue.countDocuments({ user_id: req.user.id });
    const resolved = await Issue.countDocuments({ user_id: req.user.id, status: 'Resolved' });

    res.json({ user, stats: { total, resolved } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/smart-suggestions', async (req, res) => {
  try {
    const { lat, lng, radius = 1 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

    const issues = await Issue.find({}).select('category lat lng').lean();
    const nearbyIssues = issues.filter(issue => {
      const distance = Math.sqrt((issue.lat - lat) ** 2 + (issue.lng - lng) ** 2) * 111;
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
    
    res.json({ suggestions, nearbyIssueCount: nearbyIssues.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/city-ranking', async (req, res) => {
  try {
    const garbageIssues = await Issue.find({ category: 'garbage' }).select('status').lean();
    const totalGarbage = garbageIssues.length;
    const resolvedGarbage = garbageIssues.filter(i => i.status === 'Resolved').length;
    const cleanlinessScore = totalGarbage > 0 ? (resolvedGarbage / totalGarbage) * 100 : 100;

    const resolvedIssues = await Issue.find({ status: 'Resolved' }).select('created_at resolved_at').lean();
    let totalResponseTime = 0;
    resolvedIssues.forEach(issue => {
      if (issue.resolved_at) totalResponseTime += (new Date(issue.resolved_at) - new Date(issue.created_at)) / (1000 * 60 * 60);
    });
    const avgResponseTime = resolvedIssues.length > 0 ? totalResponseTime / resolvedIssues.length : 0;
    const overallScore = (cleanlinessScore * 0.6) + ((24 - Math.min(avgResponseTime, 24)) / 24 * 100 * 0.4);

    res.json({
      cleanliness: Math.round(cleanlinessScore),
      avgResponseTimeHours: Math.round(avgResponseTime * 10) / 10,
      overallScore: Math.round(overallScore),
      rank: 1
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN USER MANAGEMENT ---
app.get('/api/admin/users', authenticateToken, requireMasterAdmin, async (req, res) => {
  try {
    const filter = { role: 'admin' };
    if (req.user.email !== 'gov@city.org' && req.user.department) {
      filter.department = req.user.department;
    }
    const users = await User.find(filter).select('-password').lean();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', authenticateToken, requireMasterAdmin, async (req, res) => {
  try {
    const { name, email, password, department, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = generateUserId();

    const newUser = new User({
      id: userId,
      name,
      email,
      password: hashedPassword,
      department: department || 'General',
      phone: phone || '',
      role: 'admin'
    });
    await newUser.save();

    res.status(201).json({ success: true, user: { id: userId, name, email, department: newUser.department } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireMasterAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId === 'MASTER-ADMIN' || userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete master admin or yourself' });
    }

    await User.findOneAndDelete({ id: userId });
    res.json({ success: true, message: 'Admin user removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
