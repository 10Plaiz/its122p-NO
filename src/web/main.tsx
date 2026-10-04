import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { IdleSignOut } from "./components/IdleTimeoutDialog.js";
import { ToastProvider } from "./components/Toast.js";
import { AuthProvider } from "./lib/auth.js";
import { AppRoutes } from "./routes.js";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
          <IdleSignOut />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
