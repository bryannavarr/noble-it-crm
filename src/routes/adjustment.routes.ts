import { Router } from "express";
import * as adjustmentController from "../controllers/adjustment.controller";

const router = Router();

router.post("/",                    adjustmentController.addPending);
router.get("/client/:clientId",     adjustmentController.listForClient);
router.delete("/:id",               adjustmentController.remove);

export default router;
