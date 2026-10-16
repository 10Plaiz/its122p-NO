import { Router } from "express";
import { db } from "../config/supabase.js";
import { notFound, orThrow, throwIfFailed } from "../lib/errors.js";
import { currentUser, requireAuth, requireResidency } from "../middleware/auth.js";

const router = Router();
// UA-8: a citizen locked to the proof upload reaches none of this.
router.use(requireAuth, requireResidency);

// Every unread notification, not only the ones on the first page (#83). The
// partial index notifications_unread_idx covers it. A count-only read has no rows,
// so only its error means anything.
async function countUnread(userId: string) {
  const result = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  throwIfFailed(result, "Notifications could not be counted.");
  return result.count ?? 0;
}

router.get("/", async (req, res) => {
  const userId = currentUser(req).id;
  const [result, unread] = await Promise.all([
    db
      .from("notifications")
      .select("id, message, is_read, created_at, report_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    countUnread(userId),
  ]);

  const notifications = orThrow(result, "Notifications could not be loaded.");
  res.json({ notifications, unread });
});

// The menu badge rechecks this on every page change, so it reads the count alone.
router.get("/unread", async (req, res) => {
  res.json({ unread: await countUnread(currentUser(req).id) });
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

// An update with no select returns no rows, so orThrow would report every success
// as a 500 and the page would never reload (#83).
router.patch("/read-all", async (req, res) => {
  throwIfFailed(
    await db.from("notifications").update({ is_read: true }).eq("user_id", currentUser(req).id).eq("is_read", false),
    "Your notifications could not be updated.",
  );
  res.status(204).end();
});

export default router;
