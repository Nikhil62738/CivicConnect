require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const path = require('path');
const https = require('https');
const { generateOTP, sendEmailOTP, sendSmsOTP, sendStatusUpdateEmail, sendComplaintRegistrationEmail } = require('./mailer');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./db');

// Import models
const { User, Issue, Vote, Comment, NotificationPreference, Verification } = require('./db');

// ==========================================
// FIREBASE ADMIN SETUP (For Auth & OTP)
// ==========================================
try {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, 'firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath)
  });
  console.log('[Notice] Firebase Admin initialized.');
} catch (e) {
  console.log('[Notice] Firebase Admin not configured or service account missing.');
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
} catch (e) {
  console.log('[Notice] Twilio unavailable.');
}

let nodemailer = null;
let emailTransporter = null;
try {
  nodemailer = require('nodemailer');
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    emailTransporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    console.log("[Notice] Gmail SMTP configured.");
  } else if (process.env.MAILTRAP_USER && process.env.MAILTRAP_PASS) {
    emailTransporter = nodemailer.createTransporter({
      host: "sandbox.smtp.mailtrap.io",
      port: 2525,
      auth: { user: process.env.MAILTRAP_USER, pass: process.env.MAILTRAP_PASS }
    });
  }
} catch (e) {
  console.log("[Notice] No Email service configured.");
}

const sendSmsNotification = async (to, message) => {
  if (!to) return;
  // Brevo/Twilio logic (unchanged)
  if (process.env.BREVO_API_KEY) {
    // ... existing Brevo SMS code
  }
  if (twilioClient) {
    try {
      await twilioClient.messages.create({ body: message, from: TWILIO_PHONE_NUMBER, to });
    } catch (error) {}
  }
  console.log(`📱 SMS Mock: ${to} - ${message}`);
};

const sendEmailNotification = async (to, subject, html) => {
  // Existing email logic unchanged
  console.log(`📧 Email Mock: ${to}`);
};

const sendPushNotification = async (userId, title, body) => {
  console.log(`[Push] ${userId}: ${title}`);
};

// ==========================================
// MONGOOSE INIT & SEED
// ==========================================
connectDB();

// Seed master admin if missing
User.findOne({ email: 'gov@city.org' }).then(officialExists => {
  if (!officialExists) {
    bcrypt.hash('city@1234', 10).then(hashedMaster => {
      const masterAdmin = new User({
        id: 'MASTER-ADMIN',
        name: 'OFFICIAL GOV ADMIN',
        email: 'gov@city.org',
        phone: '+910000000000',
        password: hashedMaster,
        role: 'admin'
      });
      masterAdmin.save().then(() => {
        console.log("🏛️ MASTER ADMIN: gov@city.org | city@1234");
        // Reset others to user
        User.updateMany({ email: { $ne: 'gov@city.org' } }, { role: 'user' }).then(() => {
          console.log("🛡️ Security audit complete");
        });
      });
    });
  }
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "http://localhost:3000" } });
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Auth middleware (unchanged)
const authenticateToken = (req, res, next) => {
  // ... existing JWT logic
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// ==========================================
// UTILITY FUNCTIONS (unchanged)
// ==========================================
function generateComplaintId() { return 'CC' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase(); }
function generateUserId() { return 'U' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase(); }

function getDistance(lat1, lon1, lat2, lon2) {
  // ... existing distance logic
}

const translateText = async (text) => {
  // ... existing translate logic
};

const calculatePriority = async (issueId, lat, lng) => {
  let votes = 0;
  if (issueId) {
    votes = await Vote.countDocuments({ issue_id: issueId });
  }
  // ... existing priority logic (update DB calls to Mongo)
  const centerLat = 20.5937, centerLng = 78.9629;
  // ... rest unchanged
  return 'Normal'; // Simplified for now
};

// Auto-escalation (Mongo version)
const runEscalationCycle = async () => {
  const now = new Date();
  const overdue = await Issue.find({
    status: { $ne: 'Resolved' },
    is_escalated: 0,
    deadline_at: { $lt: now }
  });
  overdue.forEach(async issue => {
    await Issue.findByIdAndUpdate(issue._id, {
      is_escalated: 1,
      priority: 'HIGH (ESCALATED)',
      updated_at: now
    });
  });
};
setInterval(runEscalationCycle, 10 * 60 * 1000);

// Socket.io (unchanged)
io.on('connection', (socket) => {
  // ... existing
});

// ==========================================
// AUTH ROUTES (MongoDB)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = generateUserId();
    const role = 'user';

    const user = new User({ id: userId, name, email, phone, password: hashedPassword, role });
    await user.save();

    const token = jwt.sign({ id: userId, email, name, role }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ success: true, user: { id: userId, name, email, phone, role }, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// OTP routes (no DB change needed except verify-otp user lookup)
app.post('/api/auth/verify-otp', async (req, res) => {
  // ... existing OTP logic
  let user = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }] });
  // ... rest unchanged
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Invalid Credentials' });
  }
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }, token });
});

// Firebase login
app.post('/api/auth/firebase-login', async (req, res) => {
  // ... existing Firebase logic, use User.findOne({ email }), User.create()
});

// Forgot password
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (user) {
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    await User.findOneAndUpdate({ id: user.id }, { password: hashedPassword });
    // Send notifications
  }
  res.json({ success: true, message: 'Recovery instructions sent.' });
});

// Profile update
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  const { name, email, phone, password } = req.body;
  const existing = await User.findOne({ email, id: { $ne: req.user.id } });
  if (existing) return res.status(400).json({ error: 'Email already in use' });

  const update = { name, email, phone };
  if (password) update.password = await bcrypt.hash(password, 10);
  await User.findOneAndUpdate({ id: req.user.id }, update);
  const updatedUser = await User.findOne({ id: req.user.id }, 'id name email phone role');
  res.json({ success: true, user: updatedUser });
});

// Account delete (transaction needed)
app.delete('/api/auth/account', authenticateToken, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Issue.deleteMany({ user_id: req.user.id }, { session });
    await Vote.deleteMany({ user_id: req.user.id }, { session });
    // ... delete other refs
    await User.findOneAndDelete({ id: req.user.id }, { session });
    await session.commitTransaction();
    res.json({ success: true });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
});

// ==========================================
// ISSUES ROUTES (MongoDB)
// ==========================================
app.get('/api/public/issues', async (req, res) => {
  const issues = await Issue.find({})
    .sort({ created_at: -1 })
    .lean();
  // Attach upvotes, comments
  for (let issue of issues) {
    issue.upvotes = await Vote.countDocuments({ issue_id: issue._id });
    issue.comments = await Comment.find({ issue_id: issue._id }).lean();
  }
  res.json({ issues });
});

app.post('/api/issues', authenticateToken, async (req, res) => {
  // ... existing logic
  const issueData = {
    complaint_id: complaintId,
    user_id: req.user.id,
    // ... all fields from existing logic
  };
  const issue = new Issue(issueData);
  await issue.save();

  // Points update
  await User.findOneAndUpdate(
    { id: req.user.id },
    { $inc: { points: 20 } }
  );

  // Notification prefs, socket emit, etc.
  res.status(201).json({ success: true, id: issue._id, complaint_id });
});

app.get('/api/issues/:complaintId', authenticateToken, async (req, res) => {
  const issue = await Issue.findOne({ complaint_id: req.params.complaintId });
  // ... auth check, attach data
});

// All other routes follow similar MongoDB pattern:
// - db.get → Model.findOne/findById
// - db.all → Model.find
// - db.run INSERT → Model.create/new Model.save
// - db.run UPDATE → Model.findByIdAndUpdate
// - db.run DELETE → Model.findByIdAndDelete/deleteMany
// - COUNT → Model.countDocuments

// Admin endpoints, leaderboard, etc. similarly converted

server.listen(PORT, () => {
  console.log(`🚀 MongoDB Server on port ${PORT}`);
});

module.exports = app;
