async function analyze() {
  const data = {
    cgpa: parseFloat(document.getElementById("cgpa").value),
    backlogs: parseInt(document.getElementById("backlogs").value),
    tech_interest: parseInt(document.getElementById("tech").value),
    core_interest: parseInt(document.getElementById("core").value),
    management_interest: parseInt(document.getElementById("mgmt").value),
    confidence: parseInt(document.getElementById("confidence").value),
    career_changes: parseInt(document.getElementById("changes").value),
    decision_time: parseInt(document.getElementById("time").value)
  };

  const res = await fetch("https://mentorix-ai-backend.onrender.com/analyze-risk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await res.json();

  document.getElementById("result").innerHTML = `
    <b>Risk Level:</b> ${result.risk_level}<br>
    <b>Stability Score:</b> ${result.stability_score}<br>
    <b>Reasons:</b>
    <ul>${result.reasons.map(r => `<li>${r}</li>`).join("")}</ul>
  `;
}
