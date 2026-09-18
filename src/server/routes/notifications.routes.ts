import { Router } from "express";
import { db } from "../config/supabase.js";
import { notFound, orThrow } from "../lib/errors.js";
import { currentUser, requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const result = await db
    .from("notifications")
    .select("id, message, is_read, created_at, report_id", { count: "exact" })
    .eq("user_id", currentUser(req).id)
    .order("created_at", { ascending: false })
    .limit(50);

  const notifications = orThrow(result, "Notifications could not be loaded.");
  const unread = notifications.filter((n) => !n.is_read).length;

  res.json({ notifications, unread });
});

router.patch("/:id/read", async (req, res) => {
  const { data: notification } = await db
    .from("notifications")
    .update({ is_read: true })
    .eq("id", req.params.id)
    .eq("user_id", currentUser(req).id) // you can only mark your own as read
    .select()
    .single();

  if (!notification) throw notFound("That notification does not exist.");
  res.json({ notification });
});

router.patch("/read-all", async (req, res) => {
  orThrow(
    await db.from("notifications").update({ is_read: true }).eq("user_id", currentUser(req).id).eq("is_read", false),
    "Your notifications could not be updated.",
  );
  res.status(204).end();
});

export default router;
