import { Router } from "express";
const router = Router();
import { test } from "../services/aiGenerator.js";

router.get("/", test);

export default router;