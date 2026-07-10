import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import MainAiAnalyze from "./pages/MainAiAnalyze";
import AdminDashboard from "./pages/AdminDashboard";
import BulkAnalyze from "./pages/BulkAnalyze";
import HybridAnalyze from "./pages/HybridAnalyze";
import LowCostAnalyze from "./pages/LowCostAnalyze";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("siro_token");
  const isLoggedIn = localStorage.getItem("siro_logged_in") === "true";

  if (!token || !isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AnimatedPage({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.opacity = "0";
    el.style.transform = "translateY(14px)";
    el.style.transition = "opacity 0.28s ease, transform 0.28s ease";

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      });
    });

    return () => cancelAnimationFrame(raf);
  }, []);

  return <div ref={ref}>{children}</div>;
}

const PROTECTED_ROUTES = [
  { path: "/", component: MainAiAnalyze },
  { path: "/main-ai", component: MainAiAnalyze },
  { path: "/admin", component: AdminDashboard },

  // old pages kept for later, not main flow now
  { path: "/bulk-analyze", component: BulkAnalyze },
  { path: "/hybrid-analyze", component: HybridAnalyze },
  { path: "/hybrid-ai", component: HybridAnalyze },
  { path: "/lowcost-analyze", component: LowCostAnalyze },
  { path: "/lowcost-ai", component: LowCostAnalyze },
];

export default function App() {
  const location = useLocation();

  return (
    <Routes location={location} key={location.pathname}>
      <Route path="/login" element={<Login />} />

      {PROTECTED_ROUTES.map(({ path, component: Component }) => (
        <Route
          key={path}
          path={path}
          element={
            <ProtectedRoute>
              <AnimatedPage>
                <Component />
              </AnimatedPage>
            </ProtectedRoute>
          }
        />
      ))}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
