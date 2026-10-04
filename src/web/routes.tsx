import { lazy } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { AdminLayout } from "./components/AdminLayout.js";
import { Loading } from "./components/ui.js";
import { useAuth } from "./lib/auth.js";
import { PROOF_STEP_PATH, residencyLocked } from "./lib/residency.js";
import type { Role } from "./lib/types.js";

import { EntryPage } from "./pages/Entry.js";
import { BoardPage } from "./pages/Board.js";
import { SignInPage } from "./pages/SignIn.js";
import { RegisterPage } from "./pages/Register.js";
import { NewReportPage } from "./pages/NewReport.js";
import { MyReportsPage } from "./pages/MyReports.js";
import { ReportDetailPage } from "./pages/ReportDetail.js";
import { NotificationsPage } from "./pages/Notifications.js";
import { AccountPage } from "./pages/Account.js";

// KI-21: staff and admin screens load on first visit, so citizens, who are most
// visitors, never download them. Layout and AdminLayout hold the Suspense fallback.
const StaffQueuePage = lazy(() => import("./pages/StaffQueue.js").then((m) => ({ default: m.StaffQueuePage })));
const StaffReportPage = lazy(() => import("./pages/StaffReport.js").then((m) => ({ default: m.StaffReportPage })));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboard.js").then((m) => ({ default: m.AdminDashboardPage })));
const AdminReportsPage = lazy(() => import("./pages/AdminReports.js").then((m) => ({ default: m.AdminReportsPage })));
const AdminUsersPage = lazy(() => import("./pages/AdminUsers.js").then((m) => ({ default: m.AdminUsersPage })));
const AdminCategoriesPage = lazy(() => import("./pages/AdminCategories.js").then((m) => ({ default: m.AdminCategoriesPage })));
const AdminLogsPage = lazy(() => import("./pages/AdminLogs.js").then((m) => ({ default: m.AdminLogsPage })));

// Decides what to render, nothing more. Every endpoint behind these screens checks
// the caller's role again server-side, so editing the URL reveals nothing.
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Must not redirect while the first /auth/me is still in flight, or a reload on a
  // protected page would bounce a signed-in user back to sign-in.
  if (loading) return <Loading label="Checking your session" />;

  // Remember where they were headed so sign-in can send them back.
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;

  if (!roles.includes(user.role)) return <Navigate to="/" replace />;

  // UA-8: a citizen without an accepted proof of residency can use nothing signed
  // in until they upload one. The server refuses the same requests.
  if (residencyLocked(user)) return <Navigate to={PROOF_STEP_PATH} replace />;

  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<EntryPage />} />
        <Route path="board" element={<BoardPage />} />
        <Route path="signin" element={<SignInPage />} />
        <Route path="register" element={<RegisterPage />} />

        <Route
          path="report/new"
          element={
            <RequireRole roles={["citizen"]}>
              <NewReportPage />
            </RequireRole>
          }
        />
        <Route
          path="my-reports"
          element={
            <RequireRole roles={["citizen"]}>
              <MyReportsPage />
            </RequireRole>
          }
        />
        {/* Owner, assigned staff and admins all read the same screen; the server
            decides which of them may see this particular report. */}
        <Route
          path="reports/:id"
          element={
            <RequireRole roles={["citizen", "staff", "admin"]}>
              <ReportDetailPage />
            </RequireRole>
          }
        />
        <Route
          path="notifications"
          element={
            <RequireRole roles={["citizen", "staff", "admin"]}>
              <NotificationsPage />
            </RequireRole>
          }
        />

        {/* UA-13: a citizen's own details. */}
        <Route
          path="account"
          element={
            <RequireRole roles={["citizen"]}>
              <AccountPage />
            </RequireRole>
          }
        />

        {/* Admins share the staff work view so they can act on any report, which is
            what assertCanUpdate already allows them to do. */}
        <Route
          path="staff/queue"
          element={
            <RequireRole roles={["staff"]}>
              <StaffQueuePage />
            </RequireRole>
          }
        />
        <Route
          path="staff/reports/:id"
          element={
            <RequireRole roles={["staff", "admin"]}>
              <StaffReportPage />
            </RequireRole>
          }
        />

        <Route
          path="admin"
          element={
            <RequireRole roles={["admin"]}>
              <AdminLayout />
            </RequireRole>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="reports" element={<AdminReportsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="logs" element={<AdminLogsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export { RequireRole };
