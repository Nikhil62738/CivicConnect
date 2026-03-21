const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  issue_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
  user_id: { type: String, required: true }, // matches User.id
  type: { type: String, required: true }, // 'exists', 'resolved', 'not_resolved'
  created_at: { type: Date, default: Date.now }
}, { timestamps: false });

// Compound unique matching SQL
verificationSchema.index({ issue_id: 1, user_id: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Verification', verificationSchema);
