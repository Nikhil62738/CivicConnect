const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
  complaint_id: { type: String, required: true, unique: true },
  user_id: { type: mongoose.Schema.Types.String, ref: 'User.id', required: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  city: String,
  state: String,
  village: String,
  media_url: String,
  resolution_media_url: String,
  is_emergency: { type: Number, default: 0 },
  status: { type: String, default: 'Pending' },
  priority: { type: String, default: 'Normal' },
  department: { type: String, default: 'Unassigned' },
  admin_remarks: String,
  resolved_at: Date,
  deadline_at: Date,
  is_escalated: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { timestamps: false });

issueSchema.index({ lat: '2dsphere', lng: '2dsphere' });
issueSchema.index({ status: 1, priority: 1, created_at: -1 });
issueSchema.index({ user_id: 1 });

module.exports = mongoose.model('Issue', issueSchema);
