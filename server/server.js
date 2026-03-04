// Entry point — loads env, connects MongoDB, starts Express.

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
