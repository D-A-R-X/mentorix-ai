let csiChartInstance = null;
const COURSE_PROGRESS_KEY = "mentorix_course_progress";
const SKILL_WEIGHT = 20;

const DEFAULT_PROD_API_BASE_URL = "https://mentorix-ai-backend.onrender.com";
const queryApiBase = new URLSearchParams(window.location.search).get("api");
const storedApiBase = localStorage.getItem("mentorix_api_base_url");
const runtimeApiBase =
  queryApiBase ||
  storedApiBase ||
  window.MENTORIX_API_BASE_URL ||
  (window.location.hostname.includes("vercel.app") ? DEFAULT_PROD_API_BASE_URL : "");

const API_BASE_URL = runtimeApiBase.trim().replace(/\/$/, "");
const ANALYZE_ENDPOINT = API_BASE_URL ? `${API_BASE_URL}/analyze-risk` : "/analyze-risk";
const HEALTH_ENDPOINT = API_BASE_URL ? `${API_BASE_URL}/health` : "/health";


function setBackendStatus(message, statusClass = "warning") {
  const el = document.getElementById("backendStatus");
  if (!el) return;
  el.textContent = message;
  el.className = `backend-status ${statusClass}`;
}

function initializeApiConfig() {
  const input = document.getElementById("apiBaseInput");
  const info = document.getElementById("apiEndpointInfo");
  if (!input || !info) return;

  input.value = API_BASE_URL;
  info.textContent = `Using API endpoint: ${ANALYZE_ENDPOINT}`;
}

function saveApiBaseUrl() {
  const input = document.getElementById("apiBaseInput");
  if (!input) return;

  const value = input.value.trim().replace(/\/$/, "");
  if (value) {
    localStorage.setItem("mentorix_api_base_url", value);
  } else {
    localStorage.removeItem("mentorix_api_base_url");
  }
  window.location.reload();
}

function loadCourseProgress() {
  try {
    return JSON.parse(localStorage.getItem(COURSE_PROGRESS_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

function saveCourseProgress(progress) {
  localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(progress));
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getInsightMessage(skillScore, completedCourses) {
  if (completedCourses === 0) {
    return "Start one recommended course to begin measurable skill growth.";
  }
  if (skillScore < 40) {
    return "Good start. Complete more courses to build stronger career momentum.";
  }
  if (skillScore < 80) {
    return "You are building consistent momentum. Keep finishing applied learning modules.";
  }
  return "Excellent consistency. Your learning discipline is strongly improving career readiness.";
}

function updateProgressInsight() {
  const progress = loadCourseProgress();
  const statuses = Object.values(progress);
  const completedCourses = statuses.filter((s) => s === "completed").length;
  const startedCourses = statuses.filter((s) => s === "started").length;
  const totalTracked = statuses.length;

  const completionPercent = totalTracked ? Math.round((completedCourses / totalTracked) * 100) : 0;
  const skillScore = completedCourses * SKILL_WEIGHT;

  document.getElementById("completionPercent").textContent = `${completionPercent}%`;
  document.getElementById("skillGrowth").textContent = `${completedCourses} completed, ${startedCourses} started`;
  document.getElementById("skillScore").textContent = String(skillScore);
  document.getElementById("progressHint").textContent = getInsightMessage(skillScore, completedCourses);
}

function markCourseStatus(courseId, status) {
  const progress = loadCourseProgress();
  progress[courseId] = status;
  saveCourseProgress(progress);

  const courseStatusEl = document.getElementById(`status-${courseId}`);
  if (courseStatusEl) {
    courseStatusEl.textContent = status === "completed" ? "Status: Completed ✅" : "Status: Started ⏳";
  }

  updateProgressInsight();
}

function getFallbackCoursesByRisk(riskLevel) {
  if (riskLevel === "High") {
    return [
      { title: "Career Planning Basics", provider: "Coursera", duration: "4 weeks", url: "https://example.com" },
      { title: "Goal Setting for Students", provider: "Udemy", duration: "3 weeks", url: "https://example.com" },
      { title: "Confidence Building Toolkit", provider: "edX", duration: "4 weeks", url: "https://example.com" }
    ];
  }

  if (riskLevel === "Medium") {
    return [
      { title: "Career Roadmap Design", provider: "Coursera", duration: "5 weeks", url: "https://example.com" },
      { title: "Applied Project Skills", provider: "Udemy", duration: "6 weeks", url: "https://example.com" },
      { title: "Decision-Making Frameworks", provider: "edX", duration: "4 weeks", url: "https://example.com" }
    ];
  }

  return [
    { title: "Advanced Skill Growth Plan", provider: "Coursera", duration: "6 weeks", url: "https://example.com" },
    { title: "Portfolio Development", provider: "Udemy", duration: "5 weeks", url: "https://example.com" },
    { title: "Leadership in Career Progression", provider: "edX", duration: "4 weeks", url: "https://example.com" }
  ];
}

function renderCourses(courses) {
  const coursesGrid = document.getElementById("coursesGrid");
  const progress = loadCourseProgress();

  coursesGrid.innerHTML = courses
    .map((course) => {
      const courseId = slugify(course.title);
      const status = progress[courseId] || "not-started";
      const statusText = status === "completed" ? "Status: Completed ✅" : status === "started" ? "Status: Started ⏳" : "Status: Not started";

      return `
        <div class="course-item">
          <h3>${course.title}</h3>
          <div class="course-meta">${course.provider} • ${course.duration}</div>
          <a class="course-link" href="${course.url}" target="_blank" rel="noopener noreferrer">Start Learning</a>
          <div class="course-actions">
            <button class="course-action-btn" type="button" onclick="markCourseStatus('${courseId}', 'started')">Mark as Started</button>
            <button class="course-action-btn" type="button" onclick="markCourseStatus('${courseId}', 'completed')">Mark as Completed</button>
          </div>
          <div class="course-status" id="status-${courseId}">${statusText}</div>
        </div>
      `;
    })
    .join("");

  updateProgressInsight();
}

function parseFormData() {
  const status = document.getElementById("status").value;

  return {
    cgpa: parseFloat(document.getElementById("cgpa").value),
    backlogs: parseInt(document.getElementById("backlogs").value, 10),
    tech_interest: parseInt(document.getElementById("tech").value, 10),
    core_interest: parseInt(document.getElementById("core").value, 10),
    management_interest: parseInt(document.getElementById("mgmt").value, 10),
    confidence: parseInt(document.getElementById("confidence").value, 10),
    career_changes: parseInt(document.getElementById("changes").value, 10),
    decision_time: parseInt(document.getElementById("time").value, 10),

    // NEW Persona Fields
    current_status: status,
    current_course: document.getElementById("currentCourse")?.value || null,
    current_job_role: document.getElementById("jobRole")?.value || null,
    industry: document.getElementById("industry")?.value || null,
    years_experience: parseInt(document.getElementById("experience")?.value || "0", 10)
  };
}

function hasInvalidNumberValues(data) {
  return Object.values(data).some((value) => Number.isNaN(value));
}

async function parseResponse(res) {
  const raw = await res.text();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { detail: raw.slice(0, 180) };
  }
}

async function checkBackendHealth() {
  const button = document.getElementById("analyzeBtn");

  try {
    const res = await fetch(HEALTH_ENDPOINT, { method: "GET" });
    if (!res.ok) {
      throw new Error(`Backend health check failed (${res.status})`);
    }
    setBackendStatus(`Backend connected: ${HEALTH_ENDPOINT}`, "ok");
  } catch (error) {
    button.disabled = false;
    setBackendStatus(`Backend unreachable: ${HEALTH_ENDPOINT}`, "error");
    document.getElementById("analysisSummary").textContent =
      `Backend is unreachable at ${HEALTH_ENDPOINT}. Set window.MENTORIX_API_BASE_URL in index.html or use ?api=https://your-backend-url.`;
  }
}

async function analyze() {
  const button = document.getElementById("analyzeBtn");
  const resultCard = document.getElementById("resultCard");
  const originalLabel = button.textContent;
  const data = parseFormData();
  const csi = result.career_stability_index;
  document.getElementById("stabilityScore").textContent = csi;

if (Array.isArray(result.history)) {
  renderCSIChart(result.history);
}
  if (hasInvalidNumberValues(data)) {
    document.getElementById("analysisSummary").textContent = "Please fill all fields with valid numbers before analyzing.";
    return;
  }

  button.disabled = true;
  button.textContent = "Analyzing...";

  try {
    const res = await fetch(ANALYZE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await parseResponse(res);
    if (!res.ok) {
      const errorText = result?.detail || result?.errors?.join("; ") || `Request failed with status ${res.status}`;
      throw new Error(errorText);
    }

    const riskLevel = String(result.risk_level || "");
    const riskClass = riskLevel.toLowerCase() === "low" ? "low" : riskLevel.toLowerCase() === "medium" ? "medium" : "high";
    const scorePercent = Math.max(0, Math.min(100, Math.round((result.stability_score || 0) * 100)));

    document.getElementById("riskLevel").textContent = riskLevel;
    document.getElementById("riskLevel").className = `risk-level ${riskClass}`;
    document.getElementById("stabilityScore").textContent = result.stability_score;
    document.getElementById("analysisSummary").textContent = result.insight || result.summary || "Assessment completed.";
    document.getElementById("progressText").textContent = `${scorePercent}%`;
    document.getElementById("stabilityProgress").style.width = `${scorePercent}%`;

    document.getElementById("careerDirection").textContent = result.career_direction || "Career direction unavailable.";

    const recommendedBundle = result?.recommendation || result?.recommendations || {};
    const recommendedCourses = recommendedBundle?.courses;
    renderCourses(Array.isArray(recommendedCourses) && recommendedCourses.length ? recommendedCourses : getFallbackCoursesByRisk(riskLevel));

    const reasons = Array.isArray(result?.reasons) && result.reasons.length ? result.reasons : ["No specific reasons returned."];
    document.getElementById("reasonList").innerHTML = reasons.map((reason) => `<li>${reason}</li>`).join("");

    resultCard.classList.remove("result-pop");
    void resultCard.offsetWidth;
    resultCard.classList.add("result-pop");
  } catch (error) {
    setBackendStatus(`Request failed at ${ANALYZE_ENDPOINT}`, "error");
    document.getElementById("analysisSummary").textContent = error.message || "Unable to analyze right now. Please try again.";
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initializeApiConfig();
  const saveBtn = document.getElementById("saveApiBaseBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveApiBaseUrl);
  }

  updateProgressInsight();
  checkBackendHealth();

  const statusSelect = document.getElementById("status");
  const studentFields = document.getElementById("studentFields");
  const professionalFields = document.getElementById("professionalFields");

 function togglePersonaFields() {
  const status = statusSelect.value;

  const academicFields = document.getElementById("academicFields");

  if (status === "working_professional") {
    studentFields.style.display = "none";
    professionalFields.style.display = "block";
    academicFields.style.display = "none";
  } 
  else if (status === "career_switcher") {
    studentFields.style.display = "none";
    professionalFields.style.display = "none";
    academicFields.style.display = "block"; 
  } 
  else {
    studentFields.style.display = "block";
    professionalFields.style.display = "none";
    academicFields.style.display = "block";
  }
}

  statusSelect.addEventListener("change", togglePersonaFields);
  togglePersonaFields(); // run once on load
});
function renderCSIChart(history) {
  const ctx = document.getElementById("csiChart").getContext("2d");

  const labels = history.map(entry => {
    const date = new Date(entry[1]);
    return date.toLocaleDateString();
  });

  const scores = history.map(entry => entry[0]);

  if (csiChartInstance) {
    csiChartInstance.destroy();
  }

  csiChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Career Stability Index",
        data: scores,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: {
          min: 0,
          max: 100
        }
      }
    }
  });
}