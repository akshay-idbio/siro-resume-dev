import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import BulkAnalyze from "./pages/BulkAnalyze";
import HybridAnalyze from "./pages/HybridAnalyze";
import LowCostAnalyze from "./pages/LowCostAnalyze";
import CeoAnalyze from "./pages/CeoAnalyze";

function ProtectedRoute({ children }) {
  const isLoggedIn = localStorage.getItem("siro_logged_in") === "true";

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />

      <Route
        path="/bulk-analyze"
        element={
          <ProtectedRoute>
            <BulkAnalyze />
          </ProtectedRoute>
        }
      />

      <Route
        path="/hybrid-analyze"
        element={
          <ProtectedRoute>
            <HybridAnalyze />
          </ProtectedRoute>
        }
      />

      <Route
        path="/lowcost-analyze"
        element={
          <ProtectedRoute>
            <LowCostAnalyze />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ceo-analyze"
        element={
          <ProtectedRoute>
            <CeoAnalyze />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}