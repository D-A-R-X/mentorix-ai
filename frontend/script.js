/* ─────────────────────────────────────────────────────────────
   Mentorix AI — script.js
───────────────────────────────────────────────────────────── */

let trendChartInstance = null;
const COURSE_PROGRESS_KEY = "mentorix_course_progress";
const SKILL_WEIGHT = 20;

/* ── API URL ───────────────────────────────────────────────── */
function getApiBaseUrl() {
  const h = window.location.hostname;
  if (h.includes("github.dev") || h.includes("app.github.dev")) {
    const swapped = h.replace(/-5500\./, "-8000.").replace(/-5500-/, "-8000-");
    if (swapped !== h) return `https://${swapped}`;
  }
  if (h === "localhost" || h === "127.0.0.1") return "http://127.0.0.1:8000";
  return "https://mentorix-ai-backend.onrender.com";
}

const API_BASE_URL = getApiBaseUrl();
console.log("API BASE:", API_BASE_URL);

/* ── Health Check ──────────────────────────────────────────── */
async function checkBackendHealth() {
  const dot   = document.getElementById("statusDot");
  const label = document.getElementById("statusLabel");
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) throw new Error();
    if (dot)   dot.className   = "status-dot ok";
    if (label) label.textContent = "Backend online";
  } catch {
    if (dot)   dot.className   = "status-dot err";
    if (label) label.textContent = "Backend offline — make port 8000 Public in Codespaces";
  }
}

/* ── Persona Switching ─────────────────────────────────────── */
function initPersonaButtons() {
  const btns = document.querySelectorAll(".persona-btn");
  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const status = btn.dataset.status;
      document.getElementById("status").value = status;
      showPersonaFields(status);
    });
  });
}

function showPersonaFields(status) {
  document.getElementById("studentFields").style.display      = status === "student"               ? "block" : "none";
  document.getElementById("professionalFields").style.display = status === "working_professional"  ? "block" : "none";
  document.getElementById("switcherFields").style.display     = status === "career_switcher"       ? "block" : "none";
}

/* ── Form Parsing (persona-aware) ─────────────────────────── */
function parseFormData() {
  const status = document.getElementById("status")?.value || "student";
  const g = (id) => document.getElementById(id);

  const base = {
    email:          g("email")?.value?.trim() || "",
    current_status: status,
    confidence:     parseInt(g("confidence")?.value) || 0,
    career_changes: parseInt(g("changes")?.value)    || 0,
    decision_time:  parseInt(g("time")?.value)       || 0,
  };

  if (status === "student") {
    return {
      ...base,
      cgpa:                parseFloat(g("cgpa")?.value)    || 0,
      backlogs:            parseInt(g("backlogs")?.value)  || 0,
      tech_interest:       parseInt(g("tech")?.value)      || 3,
      core_interest:       parseInt(g("core")?.value)      || 3,
      management_interest: parseInt(g("mgmt")?.value)      || 3,
      years_experience:    0,
    };
  }

  if (status === "working_professional") {
    const exp = parseInt(g("experience")?.value) || 0;
    return {
      ...base,
      cgpa:                0,        // normalized in backend from exp
      backlogs:            0,
      tech_interest:       parseInt(g("proTech")?.value)  || 3,
      management_interest: parseInt(g("proMgmt")?.value)  || 3,
      core_interest:       parseInt(g("proCore")?.value)  || 3,
      years_experience:    exp,
      current_job_role:    g("jobRole")?.value?.trim()    || "",
      industry:            g("industry")?.value?.trim()   || "",
    };
  }

  if (status === "career_switcher") {
    return {
      ...base,
      cgpa:                7,        // default for switchers in backend
      backlogs:            0,
      tech_interest:       parseInt(g("switchTech")?.value)  || 3,
      management_interest: parseInt(g("switchMgmt")?.value)  || 3,
      core_interest:       parseInt(g("switchCore")?.value)  || 3,
      years_experience:    parseInt(g("switchExp")?.value)   || 0,
      current_course:      g("prevField")?.value?.trim()     || "",
      industry:            g("targetField")?.value?.trim()   || "",
    };
  }

  return base;
}

function validateForm(data) {
  if (!data.email || !data.email.includes("@"))
    return "Please enter a valid email address.";
  if (!data.confidence || isNaN(data.confidence))
    return "Please fill in your confidence level.";
  if (data.current_status === "student" && (!data.cgpa || isNaN(data.cgpa)))
    return "Please enter your CGPA.";
  return null;
}

/* ── Main Analyze ──────────────────────────────────────────── */
async function analyze() {
  const btn  = document.getElementById("analyzeBtn");
  const data = parseFormData();

  const err = validateForm(data);
  if (err) { showError(err); return; }

  if (btn) {
    btn.disabled = true;
    btn.querySelector(".btn-text").textContent = "Analyzing...";
    btn.querySelector(".btn-icon").style.animation = "spin 0.8s linear infinite";
  }

  try {
    const res = await fetch(`${API_BASE_URL}/analyze-risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || "Analysis failed");

    renderResults(result);

  } catch (error) {
    showError(error.message || "Analysis failed. Make sure port 8000 is Public in Codespaces.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.querySelector(".btn-text").textContent = "Run Analysis";
      btn.querySelector(".btn-icon").style.animation = "";
    }
  }
}

/* ── Render Results ────────────────────────────────────────── */
function renderResults(result) {
  const grid = document.getElementById("resultsGrid");
  if (grid) { grid.style.display = "grid"; setTimeout(() => grid.scrollIntoView({ behavior: "smooth" }), 100); }

  const el  = (id) => document.getElementById(id);
  const rec = result.recommendation || {};
  const risk = result.risk_level || "–";

  // Risk card
  if (el("riskBadge")) { el("riskBadge").textContent = risk + " Risk"; el("riskBadge").className = `risk-badge ${risk}`; }
  if (el("stabilityScore")) el("stabilityScore").textContent = result.stability_index ? (result.stability_index * 100).toFixed(1) + "%" : "–";
  if (el("trendLabel")) {
    const t = result.trend || "–";
    el("trendLabel").textContent = t === "improving" ? "📈 Improving" : t === "declining" ? "📉 Declining" : t === "stable" ? "➡️ Stable" : t;
  }
  if (el("volatilityLabel")) {
    const v = result.volatility || 0;
    el("volatilityLabel").textContent = v > 0.01 ? `⚠️ ${(v * 100).toFixed(1)}%` : "✅ Stable";
  }
  if (el("analysisSummary")) el("analysisSummary").textContent = result.summary || "Assessment complete.";
  if (el("reasonList")) {
    const reasons = result.reasons || [];
    el("reasonList").innerHTML = reasons.map(r => `<li>${r}</li>`).join("");
  }

  // Direction card
  if (el("careerDirection")) el("careerDirection").textContent = result.career_direction || "–";
  if (el("careerInsight"))   el("careerInsight").textContent   = result.insight || "–";
  if (el("directionIcon"))   el("directionIcon").textContent   = getDirectionIcon(result.career_direction);
  if (el("trackBadge"))      el("trackBadge").textContent      = (rec.track || "–").replace(/_/g, " ");

  // Engine scores
  renderScoreBars(rec.decision_scores || {}, rec.track);
  if (el("momentumVal")) el("momentumVal").textContent = rec.momentum_bonus ?? "–";
  if (el("penaltyVal"))  el("penaltyVal").textContent  = rec.volatility_penalty ?? "–";

  // Chart, courses, history
  renderTrendChart(result.history || []);
  renderCourses(rec.courses || []);
  renderHistory(result.history || []);

  if (el("footerEnv")) el("footerEnv").textContent = API_BASE_URL.includes("render") ? "Production" : "Dev";
}

/* ── Score Bars ────────────────────────────────────────────── */
function renderScoreBars(scores, winningTrack) {
  const c = document.getElementById("scoreBars");
  if (!c || !scores || !Object.keys(scores).length) return;
  const maxScore = Math.max(...Object.values(scores), 1);
  const labels = {
    software_track:"Software", core_track:"Core Eng",
    management_track:"Management", foundation_track:"Foundation",
    career_acceleration_track:"Acceleration", skill_upgrade_track:"Skill Upgrade",
    transition_track:"Transition"
  };
  c.innerHTML = Object.entries(scores).map(([k, v]) => {
    const pct = Math.min(Math.round((v / maxScore) * 100), 100);
    const cls = k === winningTrack ? "winning" : k === "foundation_track" ? "foundation" : "";
    return `<div class="score-bar-row">
      <span class="score-bar-label">${labels[k] || k}</span>
      <div class="score-bar-track"><div class="score-bar-fill ${cls}" style="width:${pct}%"></div></div>
      <span class="score-bar-val">${v}</span>
    </div>`;
  }).join("");
}

/* ── Trend Chart ───────────────────────────────────────────── */
function renderTrendChart(history) {
  const canvas = document.getElementById("trendChart");
  const hint   = document.getElementById("chartHint");
  if (!canvas) return;
  if (!history || history.length < 2) { if (hint) hint.style.display = "block"; return; }
  if (hint) hint.style.display = "none";

  const sorted = [...history].reverse();
  const labels = sorted.map((_, i) => `S${i + 1}`);
  const data   = sorted.map(h => parseFloat((h.stability_score * 100).toFixed(1)));

  if (trendChartInstance) trendChartInstance.destroy();

  trendChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Stability %", data,
        borderColor: "#6c3bce",
        backgroundColor: "rgba(108,59,206,0.07)",
        pointBackgroundColor: "#6c3bce",
        pointRadius: 4, tension: 0.4, fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#0f0a1e", titleColor: "#e2e8f0", bodyColor: "#94a3b8" }
      },
      scales: {
        x: { grid: { color: "rgba(108,59,206,0.08)" }, ticks: { color: "#9ca3af", font: { family: "JetBrains Mono", size: 10 } } },
        y: { min: 0, max: 100, grid: { color: "rgba(108,59,206,0.08)" }, ticks: { color: "#9ca3af", font: { family: "JetBrains Mono", size: 10 }, callback: v => v + "%" } }
      }
    }
  });
}

/* ── Courses ───────────────────────────────────────────────── */
function loadCourseProgress() {
  try { return JSON.parse(localStorage.getItem(COURSE_PROGRESS_KEY) || "{}"); } catch { return {}; }
}

function saveCourseProgress(p) { localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(p)); }

function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

window.markCourseStatus = function(id, status) {
  const p = loadCourseProgress(); p[id] = status; saveCourseProgress(p);
  const el = document.getElementById(`status-${id}`);
  if (el) {
    el.textContent = status === "completed" ? "✅ Completed" : "⏳ In Progress";
    el.style.color = status === "completed" ? "var(--green)" : "var(--yellow)";
  }
  updateProgress();
};

function renderCourses(courses) {
  const g = document.getElementById("coursesGrid");
  if (!g) return;
  if (!courses || !courses.length) { g.innerHTML = '<p class="empty-state">No courses for this track.</p>'; return; }
  const p = loadCourseProgress();
  g.innerHTML = courses.map(c => {
    const id = slugify(c.title);
    const s  = p[id];
    return `<div class="course-item">
      <h3>${c.title}</h3>
      <div class="course-meta">${c.provider} · ${c.duration}</div>
      <a class="course-link" href="${c.url}" target="_blank" rel="noopener">Start Learning →</a>
      <div class="course-actions">
        <button class="course-action-btn" onclick="markCourseStatus('${id}','started')">Started</button>
        <button class="course-action-btn" onclick="markCourseStatus('${id}','completed')">Done ✓</button>
      </div>
      <div class="course-status" id="status-${id}" style="color:${s==='completed'?'var(--green)':s==='started'?'var(--yellow)':'var(--muted)'}">
        ${s === "completed" ? "✅ Completed" : s === "started" ? "⏳ In Progress" : ""}
      </div>
    </div>`;
  }).join("");
  updateProgress();
}

/* ── History ───────────────────────────────────────────────── */
function renderHistory(history) {
  const c = document.getElementById("historySection");
  if (!c) return;
  if (!history || !history.length) { c.innerHTML = '<p class="empty-state">No previous assessments yet.</p>'; return; }
  c.innerHTML = history.map(item => {
    const risk  = item.risk_level || "–";
    const score = typeof item.stability_score === "number" ? (item.stability_score * 100).toFixed(0) + "%" : "–";
    const track = (item.track || "–").replace(/_/g, " ");
    const date  = item.created_at ? new Date(item.created_at).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "–";
    return `<div class="history-item">
      <span class="history-risk ${risk}">${risk} Risk</span>
      <span class="history-score">Stability ${score}</span>
      <span class="history-track">${track}</span>
      <span class="history-date">${date}</span>
    </div>`;
  }).join("");
}

/* ── Progress ──────────────────────────────────────────────── */
function updateProgress() {
  const p = loadCourseProgress();
  const vals = Object.values(p);
  const done = vals.filter(s => s === "completed").length;
  const total = vals.length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  const pts   = done * SKILL_WEIGHT;
  const el = (id) => document.getElementById(id);
  if (el("completionPercent")) el("completionPercent").textContent = pct + "%";
  if (el("skillGrowth"))       el("skillGrowth").textContent = pts;
  if (el("progressFill"))      el("progressFill").style.width = pct + "%";
  if (el("progressHint"))      el("progressHint").textContent = done === 0
    ? "Start a course to track your growth."
    : done < 3 ? `${done} course${done > 1 ? "s" : ""} done — keep going!`
    : "Excellent momentum. Your learning is building real career readiness.";
}

/* ── Direction Icon ────────────────────────────────────────── */
function getDirectionIcon(d) {
  if (!d) return "🎯";
  const l = d.toLowerCase();
  if (l.includes("software") || l.includes("data")) return "💻";
  if (l.includes("management") || l.includes("product")) return "📊";
  if (l.includes("core")) return "⚙️";
  if (l.includes("transition") || l.includes("switch")) return "🔄";
  return "🔭";
}

/* ── Error ─────────────────────────────────────────────────── */
function showError(msg) {
  const s = document.getElementById("analysisSummary");
  if (s) s.textContent = "⚠️ " + msg;
  const g = document.getElementById("resultsGrid");
  if (g) g.style.display = "grid";
  const r = document.getElementById("riskCard");
  if (r) r.scrollIntoView({ behavior: "smooth" });
}

/* ── Init ──────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("analyzeBtn")?.addEventListener("click", analyze);
  initPersonaButtons();
  updateProgress();
  checkBackendHealth();
  const fe = document.getElementById("footerEnv");
  if (fe) fe.textContent = API_BASE_URL.includes("render") ? "Production" : "Development";
});