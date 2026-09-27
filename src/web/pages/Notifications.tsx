import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, EmptyState, Loading } from "../components/ui.js";
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
  const [filter, setFilter] = useState<"all" | "unread">("all");
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
  const displayedNotifications =
    filter === "unread" ? notifications.filter((n) => !n.is_read) : notifications;

  return (
    <div className="flex flex-col gap-7 sm:gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-divider">
        <div className="flex flex-col gap-1.5">
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

      {!loading && notifications.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <div className="seg" role="tablist" aria-label="Notification filter">
            <label className="seg-opt">
              <input
                type="radio"
                name="notif-filter"
                value="all"
                checked={filter === "all"}
                onChange={() => setFilter("all")}
              />
              All ({notifications.length})
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                name="notif-filter"
                value="unread"
                checked={filter === "unread"}
                onChange={() => setFilter("unread")}
              />
              Unread ({unread})
            </label>
          </div>
        </div>
      )}

      {filter === "unread" && unread === 0 && notifications.length > 0 && (
        <div className="card p-6 bg-surface border border-divider flex flex-col items-center justify-center text-center gap-3 py-10">
          <div className="w-10 h-10 border-2 border-accent text-accent flex items-center justify-center font-bold text-lg">
            ✓
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-[17px] font-bold text-text !m-0">You are all caught up!</h3>
            <p className="text-[13px] text-neutral-600 !m-0">
              No unread notifications left in your inbox.
            </p>
          </div>
          {user?.role === "staff" && (
            <Link to="/staff/queue" className="btn btn-primary text-[13px] mt-2">
              Go to My queue &rarr;
            </Link>
          )}
          {user?.role === "citizen" && (
            <Link to="/my-reports" className="btn btn-primary text-[13px] mt-2">
              View My reports &rarr;
            </Link>
          )}
          {user?.role === "admin" && (
            <Link to="/admin" className="btn btn-primary text-[13px] mt-2">
              Open Admin dashboard &rarr;
            </Link>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-4 list-none !p-0 !m-0">
        {displayedNotifications.map((notification) => (
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

function formatNotificationTimestamp(iso: string) {
  const date = new Date(iso);
  const dateStr = date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
  return { dateStr, timeStr };
}

function NotificationCard({ notification, role, onMarkRead, isPending }: NotificationCardProps) {
  const reportTarget =
    role && role !== "citizen"
      ? `/staff/reports/${notification.report_id}`
      : `/reports/${notification.report_id}`;

  const hasActions = !notification.is_read || Boolean(notification.report_id);
  const { dateStr, timeStr } = formatNotificationTimestamp(notification.created_at);

  return (
    <article
      className={`card p-5 sm:p-6 min-h-[96px] sm:min-h-[98px] transition-colors border ${
        notification.is_read
          ? "border-divider bg-surface opacity-80 hover:opacity-100"
          : "border-divider border-l-4 border-l-accent bg-surface shadow-xs"
      }`}
    >
      <div className="flex items-stretch justify-between gap-4 sm:gap-6 h-full">
        {/* Unit 1: Identity & Notification Content */}
        <div className="flex flex-col gap-2 flex-1 min-w-0 justify-center">
          <div className="flex items-center gap-2.5 flex-wrap">
            {!notification.is_read && (
              <span className="tag tag-accent text-[11px] font-bold tracking-wide">
                New
              </span>
            )}
            <time
              dateTime={notification.created_at}
              className="inline-flex items-center gap-2 text-[12px] font-medium text-neutral-800 select-text"
            >
              <span>{dateStr}</span>
              <span className="text-neutral-500 font-normal text-[11px]">{timeStr}</span>
            </time>
          </div>

          <p className="text-[14px] sm:text-[15px] font-medium text-text select-text cursor-text leading-relaxed break-words !m-0">
            {notification.message}
          </p>
        </div>

        {/* Unit 2: Actions Column (Open report anchored to bottom right in both states) */}
        {hasActions && (
          <div className="flex flex-col items-end justify-between self-stretch shrink-0">
            {!notification.is_read ? (
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={() => onMarkRead(notification.id)}
                className="text-[12px] py-1.5 px-3 shrink-0 touch-manipulation cursor-pointer"
                aria-label="Mark notification as read"
              >
                {isPending ? "Marking…" : "Mark read"}
              </Button>
            ) : (
              <div aria-hidden="true" className="h-0" />
            )}

            {notification.report_id && (
              <Link
                to={reportTarget}
                className="mt-auto pt-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent select-text whitespace-nowrap"
                aria-label={`Open report #${notification.report_id}`}
              >
                Open report <span aria-hidden="true">&rarr;</span>
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
