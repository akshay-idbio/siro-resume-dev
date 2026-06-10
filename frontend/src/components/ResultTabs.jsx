import { useState } from "react";
import "./ResultTabs.css";

function FieldRow({ label, value }) {
  return (
    <div className="field-row">
      <span>{label}</span>
      <strong>
        {value === null || value === undefined || value === "" ? "-" : value}
      </strong>
    </div>
  );
}

function ArrayList({ items }) {
  if (!items || items.length === 0) {
    return <div className="empty-text">No data found</div>;
  }

  return (
    <div className="pill-list">
      {items.map((item, index) => (
        <span key={`${item}-${index}`}>{item}</span>
      ))}
    </div>
  );
}

function ResultPanel({ title, result }) {
  if (!result) {
    return <div className="empty-result">No result available</div>;
  }

  if (result.error) {
    return <div className="error-box">{result.error}</div>;
  }

  return (
    <div className="result-panel">
      <div className="score-card">
        <div>
          <span>ATS Score</span>
          <strong>{result.ats_score ?? "-"}</strong>
        </div>

        <div>
          <span>Final Status</span>
          <strong>{result.final_status || "-"}</strong>
        </div>
      </div>

      <h3>{title}</h3>

      <div className="result-grid">
        <FieldRow label="Candidate Name" value={result.candidate_name} />
        <FieldRow label="Phone" value={result.candidate_phone} />
        <FieldRow label="Email" value={result.candidate_email} />
        <FieldRow label="Location" value={result.candidate_location} />

        <FieldRow
          label="Total Experience"
          value={result.candidate_total_experience_years}
        />

        <FieldRow label="Current CTC" value={result.candidate_current_ctc} />
        <FieldRow label="Expected CTC" value={result.candidate_expected_ctc} />
        <FieldRow label="Notice Period" value={result.candidate_notice_period} />
      </div>

      <div className="result-section">
        <h4>Candidate Skills</h4>
        <ArrayList items={result.candidate_skills} />
      </div>

      <div className="result-section">
        <h4>Matching Skills</h4>
        <ArrayList items={result.matching_skills} />
      </div>

      <div className="result-section">
        <h4>Missing Skills</h4>
        <ArrayList items={result.missing_skills} />
      </div>

      <div className="result-section">
        <h4>Assessment</h4>

        <div className="assessment-box">
          <p>
            <b>Experience:</b> {result.experience_match || "-"}
          </p>

          <p>
            <b>Location:</b> {result.location_match || "-"}
          </p>

          <p>
            <b>CTC Risk:</b> {result.ctc_risk || "-"}
          </p>

          <p>
            <b>Notice Risk:</b> {result.notice_period_risk || "-"}
          </p>
        </div>
      </div>

      <div className="result-section">
        <h4>Remarks</h4>
        <div className="remarks-box">{result.remarks || "-"}</div>
      </div>

      <div className="result-section">
        <h4>Mismatch Reasons</h4>
        <ArrayList items={result.mismatch_reasons} />
      </div>
    </div>
  );
}

function ComparisonPanel({ comparison }) {
  if (!comparison || Object.keys(comparison).length === 0) {
    return (
      <div className="empty-result">
        Comparison available only when both AI engines are used.
      </div>
    );
  }

  return (
    <div className="comparison-panel">
      <h3>AI Engine Comparison</h3>

      <div className="comparison-grid">
        <FieldRow
          label="Candidate Name Same"
          value={String(comparison.candidate_name_same)}
        />

        <FieldRow label="Email Same" value={String(comparison.email_same)} />
        <FieldRow label="Phone Same" value={String(comparison.phone_same)} />

        <FieldRow
          label="AI Engine 1 ATS Score"
          value={comparison.openai_ats_score}
        />

        <FieldRow
          label="AI Engine 2 ATS Score"
          value={comparison.claude_ats_score}
        />

        <FieldRow
          label="AI Engine 1 Final Status"
          value={comparison.openai_final_status}
        />

        <FieldRow
          label="AI Engine 2 Final Status"
          value={comparison.claude_final_status}
        />

        <FieldRow label="Score Difference" value={comparison.score_difference} />
      </div>

      <div className="remarks-box">
        {comparison.note ||
          "If both AI engines disagree, send this profile for manual review."}
      </div>
    </div>
  );
}

export default function ResultTabs({ result, processingTime }) {
  const [activeTab, setActiveTab] = useState("engine1");

  if (!result) {
    return null;
  }

  return (
    <div className="tabs-wrapper">
      <div className="result-arrived-banner">
        <div>
          <strong>Analysis completed</strong>

          <span>
            Here are the results from AI Engine 1 and AI Engine 2.
            {processingTime && ` Processed in ${processingTime} seconds.`}
          </span>
        </div>

        {processingTime && (
          <div className="processing-time-pill">{processingTime}s</div>
        )}
      </div>

      <div className="tabs-header">
        <button
          className={activeTab === "engine1" ? "active" : ""}
          onClick={() => setActiveTab("engine1")}
        >
          AI Engine 1
        </button>

        <button
          className={activeTab === "engine2" ? "active" : ""}
          onClick={() => setActiveTab("engine2")}
        >
          AI Engine 2
        </button>

        <button
          className={activeTab === "comparison" ? "active" : ""}
          onClick={() => setActiveTab("comparison")}
        >
          Comparison
        </button>
      </div>

      <div className="tabs-body">
        {activeTab === "engine1" && (
          <ResultPanel
            title="AI Engine 1 Analysis"
            result={result.openai_result}
          />
        )}

        {activeTab === "engine2" && (
          <ResultPanel
            title="AI Engine 2 Analysis"
            result={result.claude_result}
          />
        )}

        {activeTab === "comparison" && (
          <ComparisonPanel comparison={result.comparison} />
        )}
      </div>
    </div>
  );
}