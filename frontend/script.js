const COURSE_PROGRESS_KEY = "mentorix_course_progress";
const SKILL_WEIGHT = 20;

/* ===============================
   Environment Detection
================================ */

function getApiBaseUrl() {
  const hostname = window.location.hostname;

  // GitHub Codespaces — handles both URL formats
  if (hostname.includes("github.dev") || hostname.includes("app.github.dev")) {
    // Format 1: name-5500.app.github.dev → name-8000.app.github.dev
    // Format 2: name-5500.preview.app.github.dev → same swap
    const swapped = hostname
      .replace(/-5500\./, "-8000.")
      .replace(/-5500-/, "-8000-");

    if (swapped !== hostname) {
      return `https://${swapped}`;
    }

    // Fallback: manually build from current origin
    console.warn("Could not auto-detect backend URL, check port mapping.");
  }

  // Local development
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://127.0.0.1:8000";
  }

  // Production
  return "https://mentorix-ai-backend.onrender.com";
}

const API_BASE_URL = getApiBaseUrl();
const ANALYZE_ENDPOINT = `${API_BASE_URL}/analyze-risk`;
const HEALTH_ENDPOINT = `${API_BASE_URL}/health`;

console.log("API BASE:", API_BASE_URL);
console.log("Mentorix JS loaded");

/* ===============================
   Local Storage Progress
================================ */

function loadCourseProgress() {
  try {
    return JSON.parse(localStorage.getItem(COURSE_PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCourseProgress(progress) {
  localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(progress));
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/* ===============================
   Progress Insight
================================ */

function getInsightMessage(skillScore, completedCourses) {
  if (completedCourses === 0)
    return "Start one recommended course to begin measurable skill growth.";
  if (skillScore < 40)
    return "Good start. Complete more courses to build stronger career momentum.";
  if (skillScore < 80)
    return "You are building consistent momentum. Keep finishing applied learning modules.";
  return "Excellent consistency. Your learning discipline is strongly improving career readiness.";
}

function updateProgressInsight() {
  const progress = loadCourseProgress();
  const statuses = Object.values(progress);

  const completedCourses = statuses.filter(s => s === "completed").length;
  const startedCourses = statuses.filter(s => s === "started").length;
  const totalTracked = statuses.length;

  const completionPercent = totalTracked
    ? Math.round((completedCourses / totalTracked) * 100)
    : 0;

  const skillScore = completedCourses * SKILL_WEIGHT;

  const completionEl = document.getElementById("completionPercent");
  if (completionEl) completionEl.textContent = `${completionPercent}%`;

  const skillGrowthEl = document.getElementById("skillGrowth");
  if (skillGrowthEl)
    skillGrowthEl.textContent = `${completedCourses} completed, ${startedCourses} started`;

  const skillScoreEl = document.getElementById("skillScore");
  if (skillScoreEl) skillScoreEl.textContent = skillScore;

  const progressHintEl = document.getElementById("progressHint");
  if (progressHintEl)
    progressHintEl.textContent = getInsightMessage(skillScore, completedCourses);
}

/* ===============================
   Course Rendering
================================ */

function markCourseStatus(courseId, status) {
  const progress = loadCourseProgress();
  progress[courseId] = status;
  saveCourseProgress(progress);

  const statusEl = document.getElementById(`status-${courseId}`);
  if (statusEl) {
    statusEl.textContent =
      status === "completed"
        ? "Status: Completed ✅"
        : "Status: Started ⏳";
  }

  updateProgressInsight();
}

function renderCourses(courses) {
  const grid = document.getElementById("coursesGrid");
  if (!grid) return;

  const progress = loadCourseProgress();

  grid.innerHTML = courses
    .map(course => {
      const courseId = slugify(course.title);
      const status = progress[courseId] || "not-started";

      return `
        <div class="course-item">
          <h3>${course.title}</h3>
          <div class="course-actions">
            <button onclick="markCourseStatus('${courseId}', 'started')">
              Mark as Started
            </button>
            <button onclick="markCourseStatus('${courseId}', 'completed')">
              Mark as Completed
            </button>
          </div>
          <div id="status-${courseId}">
            Status: ${status}
          </div>
        </div>
      `;
    })
    .join("");

  updateProgressInsight();
}

/* ===============================
   History Rendering
================================ */

function renderHistory(history) {
  const container = document.getElementById("historySection");
  if (!container) return;

  if (!history || !history.length) {
    container.innerHTML = "<p>No previous assessments yet.</p>";
    return;
  }

  container.innerHTML = history
    .map(item => `
      <div class="history-item">
        <strong>${item.risk_level}</strong>
        <span>Score: ${item.stability_score}</span>
        <small>${new Date(item.created_at).toLocaleString()}</small>
      </div>
    `)
    .join("");
}

/* ===============================
   Form Handling
================================ */

function parseFormData() {
  return {
    email: document.getElementById("email")?.value || "",
    cgpa: parseFloat(document.getElementById("cgpa")?.value),
    backlogs: parseInt(document.getElementById("backlogs")?.value),
    tech_interest: parseInt(document.getElementById("tech")?.value),
    core_interest: parseInt(document.getElementById("core")?.value),
    management_interest: parseInt(document.getElementById("mgmt")?.value),
    confidence: parseInt(document.getElementById("confidence")?.value),
    career_changes: parseInt(document.getElementById("changes")?.value),
    decision_time: parseInt(document.getElementById("time")?.value)
  };
}

function hasInvalidNumberValues(data) {
  return Object.entries(data)
    .filter(([key]) => key !== "email")
    .some(([_, value]) => Number.isNaN(value));
}

async function parseResponse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

/* ===============================
   Backend Health Check
================================ */

async function checkBackendHealth() {
  try {
    const res = await fetch(HEALTH_ENDPOINT);
    if (!res.ok) throw new Error();
    console.log("✅ Backend reachable at", API_BASE_URL);
  } catch {
    const summary = document.getElementById("analysisSummary");
    if (summary)
      summary.textContent = "⚠️ Backend is unreachable. Check that port 8000 is public in Codespaces.";
    console.error("❌ Backend unreachable at", API_BASE_URL);
  }
}

/* ===============================
   Analyze
================================ */

async function analyze() {
  const button = document.getElementById("analyzeBtn");
  const originalText = button?.textContent;
  const data = parseFormData();

  if (hasInvalidNumberValues(data)) {
    document.getElementById("analysisSummary").textContent =
      "Please fill all fields correctly.";
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Analyzing...";
  }

  try {
    const res = await fetch(ANALYZE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await parseResponse(res);
    if (!res.ok) throw new Error(result.detail || "Request failed");

    document.getElementById("riskLevel").textContent = result.risk_level;
    document.getElementById("stabilityScore").textContent = result.stability_score;
    document.getElementById("analysisSummary").textContent =
      result.insight || "Assessment complete.";

    // ✅ Added: render career direction
    const careerEl = document.getElementById("careerDirection");
    if (careerEl) careerEl.textContent = result.career_direction || "N/A";

    renderCourses(result?.recommendation?.courses || []);
    renderHistory(result.history || []);

  } catch (error) {
    document.getElementById("analysisSummary").textContent =
      error.message || "Analysis failed.";
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

/* ===============================
   Init
================================ */

document.addEventListener("DOMContentLoaded", () => {
  // Wire up analyze button
  const btn = document.getElementById("analyzeBtn");
  if (btn) btn.addEventListener("click", analyze);

  updateProgressInsight();
  checkBackendHealth();
});