import app from "./app";
import config from "./app/config";
import { prisma } from "./app/lib/prisma";
import redisClient from "./app/lib/redis";
import { startScheduler, stopScheduler } from "./app/lib/scheduler";

const PORT = config.port;
const main = async () => {
  try {
    // Connect to database
    await prisma.$connect();
    console.log("Connected to the database successfully.");
    await redisClient.connect();
    console.log("Connected to redis");

    // Start the load-shedding schedule lifecycle scheduler.
    // Runs every minute: APPROVED -> ACTIVE -> COMPLETED.
    startScheduler();

    // Start server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`API: http://localhost:${PORT}/api/v1`);
      console.log(`Health: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Error starting the server:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  stopScheduler();
  try {
    await prisma.$disconnect();
    await redisClient.quit();
  } catch (err) {
    console.error("Error during shutdown:", err);
  }
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main();
