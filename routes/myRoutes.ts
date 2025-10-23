import { Router } from "express";
import {
  addString,
  deleteString,
  filterByNaturalLanguage,
  getAllStringsWithFiltering,
  getString,
} from "../controllers/myControllers";

const router = Router();

router.get("/strings/filter-by-natural-language", filterByNaturalLanguage);
router.post("/strings", addString);
router.get("/strings/:string", getString);
router.get("/strings", getAllStringsWithFiltering);
router.delete("/strings/:string", deleteString);

export default router;
