require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./db');

// Load models
const User = require('./models/User');
const Issue = require('./models/Issue');
const Vote = require('./models/Vote');
const Comment = require('./models/Comment');
const NotificationPreference = require('./models/NotificationPreference');
const Verification = require('./models/Verification');

async function migrate() {
  try {
    // 1. Connect to MongoDB
    await connectDB();
    console.log('🚀 MongoDB ready for migration');

    // 2. Open SQLite
    const sqlitePath = path.join(__dirname, 'civic_data.sqlite');
    const db = await open({
      filename: sqlitePath,
      driver: sqlite3.Database
    });
    console.log('📱 SQLite opened');

    // 3. Migrate Users (preserve exact 'id' strings)
    let users = await db.all('SELECT * FROM users');
    for (let user of users) {
      await User.findOneAndUpdate(
        { id: user.id },
        user,
        { upsert: true, new: true }
      );
    }
    console.log(`👥 Migrated ${users.length} users`);

    // 4. Migrate Issues (preserve complaint_id, map user_id to ObjectId later if needed)
    let issues = await db.all('SELECT * FROM issues');
    for (let issue of issues) {
      // Convert dates
      if (issue.created_at) issue.created_at = new Date(issue.created_at);
      if (issue.updated_at) issue.updated_at = new Date(issue.updated_at);
      if (issue.resolved_at) issue.resolved_at = new Date(issue.resolved_at);
      if (issue.deadline_at) issue.deadline_at = new Date(issue.deadline_at);
      
      await Issue.findOneAndUpdate(
        { complaint_id: issue.complaint_id },
        issue,
        { upsert: true, new: true }
      );
    }
    console.log(`📋 Migrated ${issues.length} issues`);

    // 5. Migrate Votes (need to map issue_id to Mongo _id)
    const issueMap = {};
    const mongoIssues = await Issue.find({});
    mongoIssues.forEach(i => issueMap[i.complaint_id] = i._id);

    let votes = await db.all('SELECT * FROM votes');
    for (let vote of votes) {
      const issueIdMongo = issueMap[votes.complaint_id] || null; // Fallback if no matching issue
      if (issueIdMongo) {
        await Vote.findOneAndUpdate(
          { issue_id: issueIdMongo, user_id: vote.user_id },
          vote,
          { upsert: true, new: true, overwriteDiscriminatorKey: true }
        );
      }
    }
    console.log(`👍 Migrated ${votes.length} votes`);

    // 6. Migrate Comments
    let comments = await db.all('SELECT * FROM comments');
    for (let comment of comments) {
      if (comment.created_at) comment.created_at = new Date(comment.created_at);
      const issueIdMongo = issueMap[comments.issue_complaint_id] || null;
      if (issueIdMongo) {
        await Comment.create({ ...comment, issue_id: issueIdMongo });
      }
    }
    console.log(`💬 Migrated ${comments.length} comments`);

    // 7. Migrate NotificationPreferences
    let notifs = await db.all('SELECT * FROM notificationPreferences');
    for (let notif of notifs) {
      const issueIdMongo = issueMap[notifs.issue_complaint_id] || null;
      if (issueIdMongo) {
        await NotificationPreference.create({ ...notif, issue_id: issueIdMongo });
      }
    }
    console.log(`🔔 Migrated ${notifs.length} notification prefs`);

    // 8. Migrate Verifications
    let verifs = await db.all('SELECT * FROM verifications');
    for (let verif of verifs) {
      if (verif.created_at) verif.created_at = new Date(verif.created_at);
      const issueIdMongo = issueMap[verifs.issue_complaint_id] || null;
      if (issueIdMongo) {
        await Verification.create({ ...verif, issue_id: issueIdMongo });
      }
    }
    console.log(`✅ Migrated ${verifs.length} verifications`);

    console.log('🎉 Migration COMPLETE! Check counts.');
    console.log('💡 Run `npm run dev` to test.');

    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
