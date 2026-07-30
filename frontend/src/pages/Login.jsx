import { useState } from "react";
import { useNavigate } from "react-router-dom";
import config from "../config";
import { loginUser, registerUser } from "../api/api";
import "./Login.css";

function PasswordRequirement({ valid, label }) {
  return (
    <div
      className={`password-requirement ${
        valid ? "password-requirement-valid" : ""
      }`}
    >
      <span className="password-check-icon">{valid ? "✓" : ""}</span>
      <span>{label}</span>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const passwordChecks = {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const isPasswordValid = Object.values(passwordChecks).every(Boolean);

  const switchMode = (newMode) => {
    setMode(newMode);
    setError("");
    setSuccess("");
    setPassword("");
    setShowPassword(false);
  };

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
      setError(err.message || "Incorrect email or password.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!isPasswordValid) {
      setError("Please complete all password requirements.");
      return;
    }

    try {
      setSubmitting(true);

      await registerUser({
        name: name.trim(),
        email: email.trim(),
        password,
        company: company.trim(),
        phone: phone.trim(),
      });

      setName("");
      setCompany("");
      setPhone("");
      setPassword("");

      setMode("login");

      setSuccess(
        "Registration submitted successfully. Please wait for admin approval."
      );
    } catch (err) {
      setError(err.message || "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-background-grid" />

      <main
        className={`login-card ${
          mode === "register" ? "login-card-register" : ""
        }`}
      >
        <div className="login-brand">
          <div className="login-logo-row">
            <div className="login-logo-icon">
              <span />
            </div>

            <h1>{config.COMPANY_NAME || "SIROai"}</h1>
          </div>

          <p>AI-powered resume screening platform</p>
        </div>

        <div className="login-mode-switch">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            Login
          </button>

          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => switchMode("register")}
          >
            Register
          </button>
        </div>

        <form
          className="login-form"
          onSubmit={mode === "login" ? handleLogin : handleRegister}
          autoComplete="off"
        >
          {mode === "register" && (
            <>
              <div className="form-group">
                <label htmlFor="name">Full name</label>

                <input
                  id="name"
                  type="text"
                  placeholder="Enter full name"
                  value={name}
                  autoComplete="name"
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>

             

              
            </>
          )}

          <div className="form-group">
            <label htmlFor="email">Email address</label>

            <input
              id="email"
              type="email"
              placeholder="user@domain.com"
              value={email}
              autoComplete={
                mode === "login" ? "username" : "email"
              }
              onChange={(event) => {
                setEmail(event.target.value);

                if (error) {
                  setError("");
                }
              }}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>

            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                autoComplete={
                  mode === "login"
                    ? "current-password"
                    : "new-password"
                }
                minLength={mode === "register" ? 8 : undefined}
                onChange={(event) => {
                  setPassword(event.target.value);

                  if (error) {
                    setError("");
                  }
                }}
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                {showPassword ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.3A10.6 10.6 0 0112 4c5.5 0 9 5 9 5a16 16 0 01-3.2 3.5M6.2 6.2C4.2 7.5 3 9 3 9s3.5 5 9 5c1 0 2-.2 2.8-.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    aria-hidden="true"
                  >
                    <path
                      d="M2.5 12s3.5-5.5 9.5-5.5S21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />

                    <circle
                      cx="12"
                      cy="12"
                      r="2.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {mode === "register" && (
            <div className="password-requirements">
              <PasswordRequirement
                valid={passwordChecks.minLength}
                label="Minimum 8 characters"
              />

              <PasswordRequirement
                valid={passwordChecks.uppercase}
                label="At least one uppercase letter"
              />

              <PasswordRequirement
                valid={passwordChecks.lowercase}
                label="At least one lowercase letter"
              />

              <PasswordRequirement
                valid={passwordChecks.number}
                label="At least one number"
              />

              <PasswordRequirement
                valid={passwordChecks.special}
                label="At least one special character"
              />
            </div>
          )}

          {error && <div className="login-message error">{error}</div>}

          {success && (
            <div className="login-message success">{success}</div>
          )}

          <button
            type="submit"
            className="login-submit-button"
            disabled={submitting}
          >
            {submitting
              ? "Please wait..."
              : mode === "login"
                ? "Sign in securely →"
                : "Create account →"}
          </button>

          {mode === "login" && (
            <button
              type="button"
              className="forgot-password-button"
              onClick={() => {
                setSuccess("");
                setError(
                  "Please contact the administrator to reset your password."
                );
              }}
            >
              Forgot password?
            </button>
          )}
        </form>
      </main>
    </div>
  );
}