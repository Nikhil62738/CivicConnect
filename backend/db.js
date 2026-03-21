const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/civicdb');
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
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
