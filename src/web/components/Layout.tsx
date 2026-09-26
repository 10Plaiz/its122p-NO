import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { useApi } from "../lib/useApi.js";
import { ROLE_LABEL } from "../lib/types.js";
import type { Notification } from "../lib/types.js";

// The shell every screen renders inside. The links a visitor sees come from their
// role, but that is presentation only — each route is guarded, and the server
// checks permissions again on every request.

type Link = { to: string; label: string };

const PUBLIC_LINKS: Link[] = [
  { to: "/board", label: "Community board" },
];

const LINKS_BY_ROLE: Record<string, Link[]> = {
  citizen: [
    { to: "/report/new", label: "Report an issue" },
    { to: "/my-reports", label: "My reports" },
  ],
  staff: [{ to: "/staff/queue", label: "My queue" }],
  admin: [{ to: "/admin", label: "Admin" }],
};

function NotificationLink() {
  // Signed-in only; the badge is the unread count the notifications route returns.
  const { data } = useApi<{ notifications: Notification[]; unread: number }>("/notifications");
  const unread = data?.unread ?? 0;

  return (
    <NavLink to="/notifications">
      Notifications
      {unread > 0 && (
        <span className="ml-1.5 bg-accent text-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold">
          {unread}
        </span>
      )}
    </NavLink>
  );
}

export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation, or it covers the page it just opened.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const links = [...PUBLIC_LINKS, ...(user ? (LINKS_BY_ROLE[user.role] ?? []) : [])];

  function handleSignOut() {
    signOut();
    navigate("/");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="nav flex-wrap">
        <NavLink to="/" className="nav-brand">
          KAMOTI
        </NavLink>

        <button
          type="button"
          className="btn btn-secondary nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="main-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>

        <nav
          id="main-menu"
          className={`${menuOpen ? "flex" : "hidden"} md:flex w-full md:w-auto flex-col md:flex-row md:items-center gap-3 md:gap-4 pt-3 md:pt-0`}
        >
          {links.map((link) => (
            <NavLink key={link.to} to={link.to}>
              {link.label}
            </NavLink>
          ))}

          {user ? (
            <>
              <NotificationLink />
              <span className="text-muted font-mono text-[11px]">
                {user.name} &middot; {ROLE_LABEL[user.role]}
              </span>
              <button type="button" className="btn btn-ghost" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/signin">Sign in</NavLink>
          )}
        </nav>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 md:py-8">
        <Outlet />
      </main>

      <footer className="border-t-2 border-divider px-4 py-4 text-muted font-mono text-[10px]">
        KAMOTI &middot; Key Alert and Monitoring for Online Tracking of Infrastructures
      </footer>
    </div>
  );
}
