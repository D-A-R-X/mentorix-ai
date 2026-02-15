const COURSE_PROGRESS_KEY = "mentorix_course_progress";
const SKILL_WEIGHT = 20;

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
      { title: "Career Planning Basics", platform: "Coursera", difficulty: "Beginner", link: "https://example.com" },
      { title: "Goal Setting for Students", platform: "Udemy", difficulty: "Beginner", link: "https://example.com" },
      { title: "Confidence Building Toolkit", platform: "edX", difficulty: "Beginner", link: "https://example.com" }
    ];
  }

  if (riskLevel === "Medium") {
    return [
      { title: "Career Roadmap Design", platform: "Coursera", difficulty: "Intermediate", link: "https://example.com" },
      { title: "Applied Project Skills", platform: "Udemy", difficulty: "Intermediate", link: "https://example.com" },
      { title: "Decision-Making Frameworks", platform: "edX", difficulty: "Intermediate", link: "https://example.com" }
    ];
  }

  return [
    { title: "Advanced Skill Growth Plan", platform: "Coursera", difficulty: "Advanced", link: "https://example.com" },
    { title: "Portfolio Development", platform: "Udemy", difficulty: "Intermediate", link: "https://example.com" },
    { title: "Leadership in Career Progression", platform: "edX", difficulty: "Intermediate", link: "https://example.com" }
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
          <div class="course-meta">${course.platform} • ${course.difficulty}</div>
          <a class="course-link" href="${course.link}" target="_blank" rel="noopener noreferrer">Start Learning</a>
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

async function analyze() {
  const button = document.getElementById("analyzeBtn");
  const resultCard = document.getElementById("resultCard");
  const originalLabel = button.textContent;

  button.disabled = true;
  button.textContent = "Analyzing...";

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

  const res = await fetch("https://probable-space-pancake-5gr4gg577rp4cvwq9-8000.app.github.dev/analyze-risk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

    const result = await res.json();
    const riskLevel = String(result.risk_level || "");
    const riskClass = riskLevel.toLowerCase() === "low" ? "low" : riskLevel.toLowerCase() === "medium" ? "medium" : "high";
    const scorePercent = Math.max(0, Math.min(100, Math.round((result.stability_score || 0) * 100)));

    document.getElementById("riskLevel").textContent = riskLevel;
    document.getElementById("riskLevel").className = `risk-level ${riskClass}`;
    document.getElementById("stabilityScore").textContent = result.stability_score;
    document.getElementById("analysisSummary").textContent = result.summary || "Assessment completed.";
    document.getElementById("progressText").textContent = `${scorePercent}%`;
    document.getElementById("stabilityProgress").style.width = `${scorePercent}%`;

    document.getElementById("careerDirection").textContent = getCareerDirection(result, data);

    renderCourses(getCoursesByRisk(riskLevel));

    resultCard.classList.remove("result-pop");
    void resultCard.offsetWidth;
    resultCard.classList.add("result-pop");
  } catch (error) {
    document.getElementById("analysisSummary").textContent = "Unable to analyze right now. Please try again.";
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

document.addEventListener("DOMContentLoaded", updateProgressInsight);
