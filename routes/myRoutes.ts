import { Router } from "express";
import {
  addString,
  deleteString,
  filterByNaturalLanguage,
  getAllStringsWithFiltering,
  getString,
} from "../controllers/myControllers";

const router = Router();

router.post("/strings", addString);
router.get("/strings/:string", getString);
router.get("/strings", getAllStringsWithFiltering);
router.get("/string/filter-by-natural-language", filterByNaturalLanguage);
router.delete("/strings/:string", deleteString);

export default router;
