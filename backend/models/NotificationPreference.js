const mongoose = require('mongoose');

const notificationPreferenceSchema = new mongoose.Schema({
  issue_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
  user_id: { type: String, required: true }, // matches User.id
  email: String,
  phone: String,
  push_enabled: { type: Number, default: 1 }
}, { timestamps: false });

notificationPreferenceSchema.index({ issue_id: 1, user_id: 1 });

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
