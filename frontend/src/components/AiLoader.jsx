import "./AiLoader.css";

export default function AiLoader() {
  return (
    <div className="ai-loader-overlay">
      <div className="ai-loader-card">
        <div className="ai-orbit">
          <div className="orbit-ring ring-one"></div>
          <div className="orbit-ring ring-two"></div>
          <div className="brain-core">AI</div>
        </div>

        <h2>Analyzing Resumes</h2>

        <p>
          AI is reading candidate resumes, extracting profile details, comparing
          skills, experience, location, CTC, and overall suitability with the
          available job requirements.
        </p>

        <div className="loader-steps">
          <span>Reading candidate resumes</span>
          <span>Extracting candidate profiles</span>
          <span>Matching job requirements</span>
          <span>Preparing final Excel output</span>
        </div>

        <div className="progress-line">
          <div></div>
        </div>
      </div>
    </div>
  );
}