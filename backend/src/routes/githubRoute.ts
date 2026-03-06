import { Router } from "express";
const router = Router();
import { githubRepoGet, githubRepoTopLevelGet, githubWebhookHandler, repoPathGet, repositoryGet } from "../controllers/githubController.js";

router.get("/", githubRepoGet);
router.get("/repository", repositoryGet);
router.get("/lessgo", githubRepoTopLevelGet);
router.get("/path", repoPathGet);
router.post("/webhook", githubWebhookHandler)

export default router;