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
      <header className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-divider">
        <div className="flex flex-col gap-1">
          <h2 className="text-[28px] sm:text-[32px] font-bold text-text leading-tight !m-0">
            Notifications
          </h2>
          <p className="text-neutral-700 text-[13px] font-medium !m-0">
            {unread > 0 ? `${unread} unread` : "You are up to date."}
          </p>
        </div>

        {unread > 0 && (
          <Button
            type="button"
            variant="secondary"
            disabled={markAll.pending}
            onClick={async () => {
              const done = await markAll.run();
              if (done) reload();
            }}
            className="text-[13px]"
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

      <ul className="flex flex-col gap-3 list-none !p-0 !m-0">
        {notifications.map((notification) => (
          <li key={notification.id} className="list-none !p-0 !m-0">
            <NotificationCard
              notification={notification}
              role={user?.role}
              onMarkRead={async (id) => {
                const done = await markOne.run(id);
                if (done) reload();
              }}
              isPending={markOne.pending}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface NotificationCardProps {
  notification: Notification;
  role?: Role;
  onMarkRead: (id: number) => void;
  isPending: boolean;
}

function NotificationCard({ notification, role, onMarkRead, isPending }: NotificationCardProps) {
  const reportTarget =
    role && role !== "citizen"
      ? `/staff/reports/${notification.report_id}`
      : `/reports/${notification.report_id}`;

  return (
    <article
      className={`card p-4 flex flex-col gap-3 transition-colors border ${
        notification.is_read
          ? "border-divider bg-surface opacity-80 hover:opacity-100"
          : "border-divider border-l-4 border-l-accent bg-surface shadow-xs"
      }`}
    >
      {/* Unit 1: Identity & Controls */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {!notification.is_read && (
              <span className="tag tag-accent text-[11px] font-bold tracking-wide">
                New
              </span>
            )}
            <time className="text-[11px] font-mono font-medium text-neutral-600 select-text">
              {formatDateTime(notification.created_at)}
            </time>
          </div>

          <p className="text-[14px] font-medium text-text select-text cursor-text leading-snug break-words !m-0">
            {notification.message}
          </p>
        </div>

        {!notification.is_read && (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => onMarkRead(notification.id)}
            className="text-[12px] py-1 px-3 shrink-0 touch-manipulation cursor-pointer"
            aria-label="Mark notification as read"
          >
            {isPending ? "Marking…" : "Mark read"}
          </Button>
        )}
      </div>

      {/* Unit 2: Action Tray */}
      {notification.report_id && (
        <div className="pt-2 border-t border-divider/60 flex items-center justify-between">
          <Link
            to={reportTarget}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline select-text"
          >
            Open report <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      )}
    </article>
  );
}
