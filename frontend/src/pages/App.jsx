import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import BulkAnalyze from "./pages/BulkAnalyze";
import HybridAnalyze from "./pages/HybridAnalyze";
import LowCostAnalyze from "./pages/LowCostAnalyze";
import CeoAnalyze from "./pages/CeoAnalyze";

/* ── Auth guard ── */
function ProtectedRoute({ children }) {
  const isLoggedIn = localStorage.getItem("siro_logged_in") === "true";
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return children;
}

/* ── Page transition wrapper ── */
function AnimatedPage({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(14px)";
    el.style.transition = "opacity 0.38s ease, transform 0.38s ease";

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

/* ── Route map (DRY) ── */
const PROTECTED_ROUTES = [
  { path: "/",                component: Home },
  { path: "/bulk-analyze",    component: BulkAnalyze },
  { path: "/hybrid-analyze",  component: HybridAnalyze },
  { path: "/lowcost-analyze", component: LowCostAnalyze },
  { path: "/ceo-analyze",     component: CeoAnalyze },
];

export default function App() {
  const location = useLocation();

  return (
    <Routes location={location} key={location.pathname}>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Protected — each wraps with page-transition animation */}
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

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
