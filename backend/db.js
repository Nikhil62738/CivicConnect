const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://nikhilchopade24155_db_user:Nikhilc@cluster0.opwbdon.mongodb.net/');
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      process.exit(0);
    });

    // Cleanup: Drop potentially broken indexes from the issues collection
    try {
      if (mongoose.connection.models['Issue']) {
        await mongoose.connection.models['Issue'].collection.dropIndexes();
        console.log("🧹 Cleaned up old database indexes.");
      }
    } catch (e) {
      console.log("ℹ️ Index cleanup skipped (no existing indexes to drop).");
    }
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  User: require('./models/User'),
  Issue: require('./models/Issue'),
  Vote: require('./models/Vote'),
  Comment: require('./models/Comment'),
  NotificationPreference: require('./models/NotificationPreference'),
  Verification: require('./models/Verification')
};
