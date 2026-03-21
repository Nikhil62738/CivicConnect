const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String },
  password: { type: String },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  department: { type: String },
  points: { type: Number, default: 0 },
  badge: { type: String, default: 'Citizen' },
  created_at: { type: Date, default: Date.now }
}, { timestamps: false });

module.exports = mongoose.model('User', userSchema);
