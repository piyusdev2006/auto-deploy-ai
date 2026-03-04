// MongoDB connection — fail-fast in production, throws in dev/test.

const dns = require("dns");
const mongoose = require("mongoose");

// Force Google DNS so SRV lookups for MongoDB Atlas don't fail on restrictive networks.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

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
