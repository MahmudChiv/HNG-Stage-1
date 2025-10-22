import { Router } from "express";
import {
  addString,
  filterByNaturalLanguage,
  getAllStringsWithFiltering,
  getString,
} from "../controllers/myControllers";

const router = Router();

router.post("/strings", addString);
router.get("/strings/:string", getString);
router.get("/strings", getAllStringsWithFiltering);
router.get("/strings/filter-by-natural-language", filterByNaturalLanguage);

export default router;
