import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { notFound, orThrow } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logActivity } from "../lib/activity.js";

const router = Router();
const adminOnly = [requireAuth, requireRole("admin")];

const categorySchema = z.object({
  name: z.string().trim().min(2, "Enter a category name."),
  description: z.string().trim().max(300).optional(),
  is_active: z.boolean().optional(),
});

// Anyone can read the list — the report form needs it before sign-in.
router.get("/", async (_req, res) => {
  const categories = orThrow(
    await db.from("categories").select("id, name, description, is_active").order("name"),
    "Categories could not be loaded.",
  );
  res.json({ categories });
});

router.post("/", adminOnly, async (req: Request, res: Response) => {
  const input = parse(categorySchema, req.body);
  const category = orThrow(
    await db.from("categories").insert(input).select().single(),
    "That category could not be created. It may already exist.",
  );

  await logActivity(req, "category.created", { entityType: "category", entityId: category.id });
  res.status(201).json({ category });
});

router.patch("/:id", adminOnly, async (req: Request, res: Response) => {
  const input = parse(categorySchema.partial(), req.body);
  const { data: category } = await db
    .from("categories")
    .update(input)
    .eq("id", req.params.id)
    .select()
    .single();

  if (!category) throw notFound("That category does not exist.");

  await logActivity(req, "category.updated", { entityType: "category", entityId: category.id });
  res.json({ category });
});

// Categories are deactivated, never deleted — existing reports still point at them.
router.delete("/:id", adminOnly, async (req: Request, res: Response) => {
  const { data: category } = await db
    .from("categories")
    .update({ is_active: false })
    .eq("id", req.params.id)
    .select()
    .single();

  if (!category) throw notFound("That category does not exist.");

  await logActivity(req, "category.deactivated", { entityType: "category", entityId: category.id });
  res.json({ category });
});

export default router;
