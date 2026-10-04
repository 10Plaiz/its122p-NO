import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Loading } from "./ui.js";

// Persistent secondary sub-navigation tabs for the administrative suite.
// Grounded in the Modernist design system with zero border radius, industrial contrast,
// and safety-orange accent highlights for active modules.
const ADMIN_TABS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/reports", label: "Reports", end: false },
  { to: "/admin/users", label: "Users", end: false },
  { to: "/admin/categories", label: "Categories", end: false },
  { to: "/admin/logs", label: "Activity", end: false },
];

export function AdminLayout() {
  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Admin navigation tabs"
        className="flex flex-wrap items-center gap-1 md:gap-2 border-b-2 border-divider"
      >
        {ADMIN_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `px-3 py-2 text-[12px] md:text-[13px] font-heading font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-text hover:border-divider"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      {/* Keeps the admin tabs on screen while a lazily loaded page arrives. */}
      <Suspense fallback={<Loading label="Loading the page" />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
