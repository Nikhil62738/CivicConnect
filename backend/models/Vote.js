const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
  issue_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
  user_id: { type: String, required: true }, // matches User.id string
  created_at: { type: Date, default: Date.now }
}, { timestamps: false });

// Compound unique index matching SQL constraint
voteSchema.index({ issue_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('Vote', voteSchema);
