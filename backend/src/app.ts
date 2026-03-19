import express from "express";
import dotenv from "dotenv";
import githubRouter from "./routes/githubRoute.js"
import aiRouter from "./routes/aiRoute.js"
import adminRouter from './routes/adminRoute.js'
import { closeRedis, getRedisClient } from "./configs/redisConfig.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const redisClient = getRedisClient();
app.use(express.json());

app.use("/github", githubRouter);
app.use("/ai", aiRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use('/admin', adminRouter)

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  closeRedis();
  process.exit(0);
});