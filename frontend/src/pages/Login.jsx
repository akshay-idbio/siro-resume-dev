import { useState } from "react";
import { useNavigate } from "react-router-dom";
import config from "../config";
import { loginUser, registerUser } from "../api/api";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      setSubmitting(true);

      await loginUser({
        email: email.trim(),
        password,
      });

      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      setSubmitting(true);

      await registerUser({
        name: name.trim(),
        email: email.trim(),
        password,
        company: company.trim(),
        phone: phone.trim(),
      });

      setSuccess("Registration submitted. Please wait for admin approval.");
      setMode("login");
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="shape shape-one" />
      <div className="shape shape-two" />
      <div className="shape shape-three" />

      <main className="login-shell">
        <section className="login-visual">
          <div className="visual-overlay" />

          <div className="visual-content">
            <span className="eyebrow">AI RESUME INTELLIGENCE</span>

            <h1>
              Screen faster.
              <br />
              Shortlist smarter.
            </h1>

            <p>
              Compare resumes with job requirements using AI-powered screening,
              ATS scoring, cost tracking, and recruiter-ready Excel output.
            </p>

            <div className="visual-actions">
              <span>Talent Intelligence</span>
              <span>Precision Matching</span>
              <span>Decision Reports</span>
            </div>
          </div>
        </section>

        <section className="login-panel">
          <div className="login-brand">
            <div className="brand-mark">AI</div>

            <h2>{config.COMPANY_NAME}</h2>
            <p>{config.COMPANY_SUBTITLE}</p>
          </div>

          <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
            <button
              type="button"
              className="login-button"
              style={{
                opacity: mode === "login" ? 1 : 0.55,
                padding: "12px 14px",
              }}
              onClick={() => {
                setMode("login");
                setError("");
                setSuccess("");
              }}
            >
              Login
            </button>

            <button
              type="button"
              className="login-button"
              style={{
                opacity: mode === "register" ? 1 : 0.55,
                padding: "12px 14px",
              }}
              onClick={() => {
                setMode("register");
                setError("");
                setSuccess("");
              }}
            >
              Register
            </button>
          </div>

          <form
            onSubmit={mode === "login" ? handleLogin : handleRegister}
            className="login-form"
            autoComplete="off"
          >
            {mode === "register" && (
              <>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    placeholder="Enter full name"
                    value={name}
                    autoComplete="off"
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="Enter email"
                value={email}
                autoComplete="off"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <div className="login-error">{error}</div>}
            {success && <div className="login-error" style={{ background: "#ecfdf5", color: "#047857" }}>{success}</div>}

            <button type="submit" className="login-button" disabled={submitting}>
              {submitting
                ? "Please wait..."
                : mode === "login"
                  ? "Login to Dashboard"
                  : "Create Account"}
            </button>
          </form>

          <div className="login-footer">
            Secure internal access for recruiters and screening teams.
          </div>
        </section>
      </main>
    </div>
  );
}
