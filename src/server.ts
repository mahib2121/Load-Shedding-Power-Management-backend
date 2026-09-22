import app from "./app";
import config from "./app/config";
import { prisma } from "./app/lib/prisma";
import redisClient from "./app/lib/redis";

const PORT = config.port;
const main = async () => {
  try {
    // Connect to database
    await prisma.$connect();

    console.log("Connected to the database successfully.");
    await redisClient.connect();
    console.log("Connected to redis");

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

main();
