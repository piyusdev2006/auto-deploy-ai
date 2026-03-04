/**
 * @file config/db.js
 * @description MongoDB connection manager using Mongoose.
 *
 * Exports a single `connectDB` function that:
 *  1. Reads MONGO_URI from environment.
 *  2. Opens the connection with sensible defaults.
 *  3. Logs success or exits on failure (fail-fast in production).
 */

const mongoose = require("mongoose");

/**
 * Connect to MongoDB Atlas (or local instance).
 *
 * @returns {Promise<typeof mongoose>} resolved mongoose instance
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[MongoDB] Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB] Connection error: ${error.message}`);
    // In production we want a hard crash so the process manager restarts us.
    // In test/dev the caller can handle the rejection.
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
