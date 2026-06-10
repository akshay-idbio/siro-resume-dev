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
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-orb">AI</div>
          <h1>{config.COMPANY_NAME}</h1>
          <p>{config.COMPANY_SUBTITLE}</p>
        </div>

       
            <form onSubmit={handleLogin} className="login-form" autoComplete="off">
          <label>Username</label>
          <input
  type="text"
  placeholder="Enter username"
  value={username}
  autoComplete="off"
  name="siro_username"
  onChange={(e) => setUsername(e.target.value)}
/>
<label>Password</label>
<input
  type="password"
  placeholder="Enter password"
  value={password}
  autoComplete="new-password"
  name="siro_password"
  onChange={(e) => setPassword(e.target.value)}
/>

          
          

          {error && <div className="login-error">{error}</div>}

          <button className="primary-button" type="submit">
            Login
          </button>
        </form>

        
      </div>
    </div>
  );
}