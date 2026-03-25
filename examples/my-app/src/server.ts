import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "dotenv";

config();

const app = express();
const PORT = process.env["PORT"] ?? 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
