const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  issue_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
  user_id: { type: String, required: true }, // matches User.id string
  author_name: { type: String, required: true },
  content: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
}, { timestamps: false });

commentSchema.index({ issue_id: 1, created_at: -1 });

module.exports = mongoose.model('Comment', commentSchema);
