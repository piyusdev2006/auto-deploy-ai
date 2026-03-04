/**
 * @file server.js
 * @description Entry point — loads env vars, connects to MongoDB, and starts
 * the Express HTTP server.
 *
 * This file is intentionally thin. All route / middleware registration lives
 * in app.js so that the Express app can be imported independently for testing.
 */

require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(
        `[Server] Running on port ${PORT} (${process.env.NODE_ENV || "development"})`,
      );
    });
  } catch (error) {
    console.error("[Server] Failed to start:", error.message);
    process.exit(1);
  }
};

startServer();
