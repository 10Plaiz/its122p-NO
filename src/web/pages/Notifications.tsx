import { Link } from "react-router-dom";
import { Alert, Button, EmptyState, Loading, formatDateTime } from "../components/ui.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { useAction, useApi } from "../lib/useApi.js";
import type { Notification, Role } from "../lib/types.js";

// Wireframe 1k. Every role has notifications; the server scopes them to the caller.
//
// What each role is told differs, so what this page promises differs too. A staff
// member reading the citizen's wording would be waiting for updates on reports
// they never filed.
const EMPTY_TEXT: Record<Role, string> = {
  citizen:
    "You will hear from us whenever one of your reports changes status — from review through to repair.",
  staff:
    "You will hear from us when a report is assigned to you, and when anything changes on one you are working on.",
  admin:
    "You will hear from us when a citizen files a report that needs assigning, and when work moves on reports you are watching.",
};

export function NotificationsPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<{ notifications: Notification[]; unread: number }>(
    "/notifications",
  );

  // read-all answers 204 with no body, so it reports success explicitly rather than
  // leaving the caller to test an empty response.
  const markAll = useAction(async () => {
    await api.patch<void>("/notifications/read-all");
    return true;
  });

  const markOne = useAction((id: number) =>
    api.patch<{ notification: Notification }>(`/notifications/${id}/read`),
  );

  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2>Notifications</h2>
          <p className="text-muted text-[13px]">
            {unread > 0 ? `${unread} unread` : "You are up to date."}
          </p>
        </div>

        {unread > 0 && (
          <Button
            type="button"
            disabled={markAll.pending}
            onClick={async () => {
              const done = await markAll.run();
              if (done) reload();
            }}
          >
            {markAll.pending ? "Marking…" : "Mark all as read"}
          </Button>
        )}
      </header>

      {error && <Alert title="Could not load notifications">{error.message}</Alert>}
      {markAll.error && <Alert title="Could not mark them read">{markAll.error.message}</Alert>}
      {loading && <Loading label="Loading notifications" />}

      {!loading && notifications.length === 0 && (
        <EmptyState title="No notifications yet">
          {user ? EMPTY_TEXT[user.role] : EMPTY_TEXT.citizen}
        </EmptyState>
      )}

      <ul className="flex flex-col gap-2">
        {notifications.map((notification) => (
          <li
            key={notification.id}
            className={
              notification.is_read
                ? "border border-divider p-3 flex flex-col gap-1"
                : "border-2 border-accent p-3 flex flex-col gap-1"
            }
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <p className="text-[14px] flex-1 min-w-[12rem]">{notification.message}</p>

              {!notification.is_read && (
                <Button
                  type="button"
                  disabled={markOne.pending}
                  onClick={async () => {
                    const done = await markOne.run(notification.id);
                    if (done) reload();
                  }}
                >
                  Mark read
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[10px] text-muted">
                {formatDateTime(notification.created_at)}
              </span>
              {notification.report_id && (
                // A notification about work should land where the work can be done:
                // staff and admins act on a report from the staff view, while a
                // citizen only reads their own.
                <Link
                  to={
                    user && user.role !== "citizen"
                      ? `/staff/reports/${notification.report_id}`
                      : `/reports/${notification.report_id}`
                  }
                  className="text-[12px]"
                >
                  Open the report
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
