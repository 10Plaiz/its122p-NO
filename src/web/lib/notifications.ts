import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./auth.js";
import type { Notification } from "./types.js";

// #83: the menu badge's unread count, kept here so that everything that reads or
// marks notifications keeps it right. The badge rechecks on every page change and
// when the tab regains focus, and marking read rechecks at once, so the badge never
// waits for a reload.
export function createUnreadCount(fetchCount: () => Promise<number>) {
  let current: { account: string; count: number } | null = null;
  let account: string | null = null;
  let latest = 0;
  const listeners = new Set<() => void>();

  return {
    // The count for this account, or null before its first answer, so a badge
    // never shows the previous account's count.
    countFor: (who: string) => (current?.account === who ? current.count : null),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // Only the newest check may publish: an answer to an older one, arriving late,
    // would put back a count the reader has since cleared. A failed check keeps
    // the last count.
    async recheck(who: string | null = account) {
      if (!who) return;
      account = who;
      const id = ++latest;
      let count: number;
      try {
        count = await fetchCount();
      } catch {
        return;
      }
      if (id !== latest || (current?.account === who && current.count === count)) return;
      current = { account: who, count };
      for (const listener of listeners) listener();
    },
  };
}

const unread = createUnreadCount(async () => (await api.get<{ unread: number }>("/notifications/unread")).unread);

export function useUnreadCount() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const who = user?.id ?? null;
  const count = useSyncExternalStore(unread.subscribe, () => (who ? unread.countFor(who) : null));

  useEffect(() => {
    void unread.recheck(who);
  }, [who, pathname]);

  useEffect(() => {
    const recheck = () => void unread.recheck(who);
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, [who]);

  return count ?? 0;
}

export async function markNotificationRead(id: number) {
  const result = await api.patch<{ notification: Notification }>(`/notifications/${id}/read`);
  void unread.recheck();
  return result;
}

// read-all answers 204 with no body, so it reports success explicitly rather than
// leaving the caller to test an empty response.
export async function markAllNotificationsRead() {
  await api.patch<void>("/notifications/read-all");
  void unread.recheck();
  return true;
}
