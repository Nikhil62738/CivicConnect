const mongoose = require('mongoose');
const User = require('./backend/models/User');

const MONGO_URI = 'mongodb://localhost:27017/civicdb';

async function check() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");
  const users = await User.find({ role: 'admin' });
  users.forEach(u => {
    console.log(`Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, Dept: ${u.department}`);
  });
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
