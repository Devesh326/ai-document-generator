import express from "express";
import dotenv from "dotenv";
import githubRouter from "./routes/githubRoute.js"
import aiRouter from "./routes/aiRoute.js"

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.use("/github", githubRouter);
app.use("/ai", aiRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});