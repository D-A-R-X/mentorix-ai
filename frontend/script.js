const COURSE_PROGRESS_KEY = "mentorix_course_progress";
const SKILL_WEIGHT = 20;

const DEFAULT_BACKEND_URL = "https://mentorix-ai-backend.onrender.com";
const runtimeApiBase =
  new URLSearchParams(window.location.search).get("api") ||
  localStorage.getItem("mentorix_api_base_url") ||
  window.MENTORIX_API_BASE_URL ||
  DEFAULT_BACKEND_URL;

const API_BASE_URL = runtimeApiBase.trim().replace(/\/$/, "");
const ANALYZE_ENDPOINT = `${API_BASE_URL}/analyze-risk`;
const HEALTH_ENDPOINT = `${API_BASE_URL}/health`;
console.log("Mentorix JS loaded");
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

function getCareerDirection(result, data) {
  if (result.risk_level === "High") {
    return "Recommended Direction: Start with a focused foundation path and regular mentor check-ins before finalizing a specialization.";
  }

  if (data.tech_interest >= data.core_interest && data.tech_interest >= data.management_interest) {
    return "Recommended Direction: Technology-focused pathway (software, data, or AI tracks) based on your stronger tech inclination.";
  }

  if (data.management_interest >= data.tech_interest && data.management_interest >= data.core_interest) {
    return "Recommended Direction: Management-oriented pathway (product, operations, or leadership readiness).";
  }

  return "Recommended Direction: Core-domain specialization with gradual cross-skilling for flexibility.";
}

function getCoursesByRisk(riskLevel) {
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
  return {
    cgpa: parseFloat(document.getElementById("cgpa").value),
    backlogs: parseInt(document.getElementById("backlogs").value, 10),
    tech_interest: parseInt(document.getElementById("tech").value, 10),
    core_interest: parseInt(document.getElementById("core").value, 10),
    management_interest: parseInt(document.getElementById("mgmt").value, 10),
    confidence: parseInt(document.getElementById("confidence").value, 10),
    career_changes: parseInt(document.getElementById("changes").value, 10),
    decision_time: parseInt(document.getElementById("time").value, 10)
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
  } catch (error) {
    button.disabled = false;
    document.getElementById("analysisSummary").textContent =
      "Backend is unreachable. Set window.MENTORIX_API_BASE_URL in index.html or use ?api=https://your-backend-url.";
  }
}

async function analyze() {
  const button = document.getElementById("analyzeBtn");
  const resultCard = document.getElementById("resultCard");
  const originalLabel = button.textContent;
  const data = parseFormData();

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
    document.getElementById("analysisSummary").textContent = result.insight || "Assessment completed.";
    document.getElementById("progressText").textContent = `${scorePercent}%`;
    document.getElementById("stabilityProgress").style.width = `${scorePercent}%`;

    document.getElementById("careerDirection").textContent = result.career_direction || "Career direction unavailable.";

    const recommendedCourses = result?.recommendation?.courses;
    renderCourses(Array.isArray(recommendedCourses) && recommendedCourses.length ? recommendedCourses : getFallbackCoursesByRisk(riskLevel));

    resultCard.classList.remove("result-pop");
    void resultCard.offsetWidth;
    resultCard.classList.add("result-pop");
  } catch (error) {
    document.getElementById("analysisSummary").textContent = error.message || "Unable to analyze right now. Please try again.";
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateProgressInsight();
  checkBackendHealth();
});
