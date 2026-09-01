import "dotenv/config";
import express from "express";
import cors from "cors";
import recruitRouter from "./routes/recruit";
import replyioRouter from "./routes/replyio";
import replyioLinkedinRouter from "./routes/replyioLinkedin";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", recruitRouter);
app.use("/api", replyioRouter);
app.use("/api", replyioLinkedinRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend on :${PORT}`));