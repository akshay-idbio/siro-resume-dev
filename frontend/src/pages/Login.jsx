import { useState } from "react";
import { useNavigate } from "react-router-dom";
import config from "../config";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (event) => {
    event.preventDefault();
    setError("");

    if (
      username === config.AUTH_USERNAME &&
      password === config.AUTH_PASSWORD
    ) {
      localStorage.setItem("siro_logged_in", "true");
      navigate("/");
      return;
    }

    setError("Invalid username or password");
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

          <form onSubmit={handleLogin} className="login-form" autoComplete="off">
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                placeholder="Enter username"
                value={username}
                autoComplete="off"
                name="siro_username"
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                autoComplete="new-password"
                name="siro_password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-button">
              Login to Dashboard
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