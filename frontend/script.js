/* ─────────────────────────────────────────────────────────────
   Mentorix AI — script.js  (with JWT auth)
───────────────────────────────────────────────────────────── */

let trendChartInstance = null;
const COURSE_PROGRESS_KEY = "mentorix_course_progress";
const SKILL_WEIGHT = 20;

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

function getToken()    { return localStorage.getItem("mentorix_token"); }
function getUserName() { return localStorage.getItem("mentorix_name") || "User"; }

function logout() {
  localStorage.removeItem("mentorix_token");
  localStorage.removeItem("mentorix_email");
  localStorage.removeItem("mentorix_name");
  window.location.href = "login.html";
}

function requireAuth() {
  if (!getToken()) { window.location.href = "login.html"; return false; }
  return true;
}

function authHeaders() {
  return { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` };
}

function renderUserHeader() {
  const label = document.getElementById("statusLabel");
  if (label) label.textContent = getUserName();
  const headerInner = document.querySelector(".header-inner");
  if (headerInner && !document.getElementById("logoutBtn")) {
    const btn = document.createElement("button");
    btn.id = "logoutBtn"; btn.textContent = "Sign Out"; btn.onclick = logout;
    btn.style.cssText = "font-family:'JetBrains Mono',monospace;font-size:11px;color:#6b7280;background:transparent;border:1px solid #e8e3f5;padding:5px 12px;border-radius:6px;cursor:pointer;";
    btn.onmouseenter = () => { btn.style.color="#6c3bce"; btn.style.borderColor="#6c3bce"; };
    btn.onmouseleave = () => { btn.style.color="#6b7280"; btn.style.borderColor="#e8e3f5"; };
    headerInner.appendChild(btn);
  }
}

async function checkBackendHealth() {
  const dot = document.getElementById("statusDot");
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) throw new Error();
    if (dot) dot.className = "status-dot ok";
  } catch { if (dot) dot.className = "status-dot err"; }
}

function initSliders() {
  const sliderMap = [
    {id:"confidence",badge:"confidenceVal"},{id:"tech",badge:"techVal"},
    {id:"core",badge:"coreVal"},{id:"mgmt",badge:"mgmtVal"},
    {id:"proTech",badge:"proTechVal"},{id:"proMgmt",badge:"proMgmtVal"},
    {id:"proCore",badge:"proCoreVal"},{id:"switchTech",badge:"switchTechVal"},
    {id:"switchMgmt",badge:"switchMgmtVal"},{id:"switchCore",badge:"switchCoreVal"},
  ];
  sliderMap.forEach(({id,badge}) => {
    const slider=document.getElementById(id), badgeEl=document.getElementById(badge);
    if(!slider||!badgeEl) return;
    updateSliderFill(slider);
    slider.addEventListener("input",()=>{
      badgeEl.textContent=slider.value; updateSliderFill(slider);
      badgeEl.style.transform="scale(1.2)";
      setTimeout(()=>{badgeEl.style.transform="scale(1)";},150);
    });
  });
}

function updateSliderFill(slider) {
  const min=parseInt(slider.min)||1, max=parseInt(slider.max)||5;
  const pct=((parseInt(slider.value)-min)/(max-min))*100;
  slider.style.background=`linear-gradient(to right,#6c3bce ${pct}%,#e8e3f5 ${pct}%)`;
}

function initPersonaButtons() {
  document.querySelectorAll(".persona-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".persona-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("status").value=btn.dataset.status;
      showPersonaFields(btn.dataset.status);
    });
  });
}

function showPersonaFields(status) {
  document.getElementById("studentFields").style.display      = status==="student"              ? "block":"none";
  document.getElementById("professionalFields").style.display = status==="working_professional" ? "block":"none";
  document.getElementById("switcherFields").style.display     = status==="career_switcher"      ? "block":"none";
}

function parseFormData() {
  const status=document.getElementById("status")?.value||"student";
  const g=(id)=>document.getElementById(id);
  const sv=(id)=>parseInt(g(id)?.value)||3;
  const base={current_status:status,confidence:sv("confidence"),career_changes:parseInt(g("changes")?.value)||0,decision_time:parseInt(g("time")?.value)||0};
  if(status==="student") return{...base,cgpa:parseFloat(g("cgpa")?.value)||0,backlogs:parseInt(g("backlogs")?.value)||0,tech_interest:sv("tech"),core_interest:sv("core"),management_interest:sv("mgmt"),years_experience:0};
  if(status==="working_professional") return{...base,cgpa:0,backlogs:0,tech_interest:sv("proTech"),management_interest:sv("proMgmt"),core_interest:sv("proCore"),years_experience:parseInt(g("experience")?.value)||0,current_job_role:g("jobRole")?.value?.trim()||"",industry:g("industry")?.value?.trim()||""};
  if(status==="career_switcher") return{...base,cgpa:7,backlogs:0,tech_interest:sv("switchTech"),management_interest:sv("switchMgmt"),core_interest:sv("switchCore"),years_experience:parseInt(g("switchExp")?.value)||0,current_course:g("prevField")?.value?.trim()||"",industry:g("targetField")?.value?.trim()||""};
  return base;
}

async function analyze() {
  if(!requireAuth()) return;
  const btn=document.getElementById("analyzeBtn");
  const data=parseFormData();
  if(data.current_status==="student"&&(!data.cgpa||isNaN(data.cgpa))){showError("Please enter your CGPA.");return;}
  if(btn){btn.disabled=true;btn.querySelector(".btn-text").textContent="Analyzing...";btn.querySelector(".btn-icon").style.animation="spin 0.8s linear infinite";}
  try {
    const res=await fetch(`${API_BASE_URL}/analyze-risk`,{method:"POST",headers:authHeaders(),body:JSON.stringify(data)});
    if(res.status===401){logout();return;}
    const result=await res.json();
    if(!res.ok) throw new Error(result.detail||"Analysis failed");
    renderResults(result);
  } catch(error){showError(error.message||"Analysis failed.");}
  finally{if(btn){btn.disabled=false;btn.querySelector(".btn-text").textContent="Run Analysis";btn.querySelector(".btn-icon").style.animation="";}}
}

function renderResults(result) {
  const grid=document.getElementById("resultsGrid");
  if(grid){grid.style.display="grid";setTimeout(()=>grid.scrollIntoView({behavior:"smooth"}),100);}
  const el=(id)=>document.getElementById(id);
  const rec=result.recommendation||{}, risk=result.risk_level||"–";
  if(el("riskBadge")){el("riskBadge").textContent=risk+" Risk";el("riskBadge").className=`risk-badge ${risk}`;}
  if(el("stabilityScore")) el("stabilityScore").textContent=result.stability_index?(result.stability_index*100).toFixed(1)+"%":"–";
  if(el("trendLabel")){const t=result.trend||"–";el("trendLabel").textContent=t==="improving"?"📈 Improving":t==="declining"?"📉 Declining":t==="stable"?"➡️ Stable":t;}
  if(el("volatilityLabel")){const v=result.volatility||0;el("volatilityLabel").textContent=v>0.0002?`⚠️ ${(v*100).toFixed(2)}%`:"✅ Stable";}
  if(el("analysisSummary")) el("analysisSummary").textContent=result.summary||"Assessment complete.";
  if(el("reasonList")) el("reasonList").innerHTML=(result.reasons||[]).map(r=>`<li>${r}</li>`).join("");
  if(el("careerDirection")) el("careerDirection").textContent=result.career_direction||"–";
  if(el("careerInsight")) el("careerInsight").textContent=result.insight||"–";
  if(el("directionIcon")) el("directionIcon").textContent=getDirectionIcon(result.career_direction);
  if(el("trackBadge")) el("trackBadge").textContent=(rec.track||"–").replace(/_/g," ");
  renderScoreBars(rec.decision_scores||{},rec.track);
  if(el("momentumVal")) el("momentumVal").textContent=rec.momentum_bonus??"–";
  if(el("penaltyVal")) el("penaltyVal").textContent=rec.volatility_penalty??"–";
  renderTrendChart(result.history||[]);
  renderCourses(rec.courses||[]);
  renderHistory(result.history||[]);
  if(el("footerEnv")) el("footerEnv").textContent=API_BASE_URL.includes("render")?"Production":"Dev";
}

function renderScoreBars(scores,winningTrack) {
  const c=document.getElementById("scoreBars");
  if(!c||!scores||!Object.keys(scores).length) return;
  const maxScore=Math.max(...Object.values(scores),1);
  const labels={software_track:"Software",core_track:"Core Eng",management_track:"Management",foundation_track:"Foundation",career_acceleration_track:"Acceleration",skill_upgrade_track:"Skill Upgrade",transition_track:"Transition"};
  c.innerHTML=Object.entries(scores).map(([k,v])=>{
    const pct=Math.min(Math.round((v/maxScore)*100),100);
    const cls=k===winningTrack?"winning":k==="foundation_track"?"foundation":"";
    return `<div class="score-bar-row"><span class="score-bar-label">${labels[k]||k}</span><div class="score-bar-track"><div class="score-bar-fill ${cls}" style="width:${pct}%"></div></div><span class="score-bar-val">${v}</span></div>`;
  }).join("");
}

function renderTrendChart(history) {
  const canvas=document.getElementById("trendChart"), hint=document.getElementById("chartHint");
  if(!canvas) return;
  if(!history||history.length<2){if(hint)hint.style.display="block";return;}
  if(hint) hint.style.display="none";
  const sorted=[...history].reverse();
  if(trendChartInstance) trendChartInstance.destroy();
  trendChartInstance=new Chart(canvas,{type:"line",data:{labels:sorted.map((_,i)=>`S${i+1}`),datasets:[{label:"Stability %",data:sorted.map(h=>parseFloat((h.stability_score*100).toFixed(1))),borderColor:"#6c3bce",backgroundColor:"rgba(108,59,206,0.07)",pointBackgroundColor:"#6c3bce",pointRadius:4,tension:0.4,fill:true}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#9ca3af",font:{family:"JetBrains Mono",size:10}}},y:{min:0,max:100,ticks:{color:"#9ca3af",callback:v=>v+"%"}}}}});
}

function loadCourseProgress(){try{return JSON.parse(localStorage.getItem(COURSE_PROGRESS_KEY)||"{}");}catch{return{};}}
function saveCourseProgress(p){localStorage.setItem(COURSE_PROGRESS_KEY,JSON.stringify(p));}
function slugify(t){return t.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");}

window.markCourseStatus=function(id,status){
  const p=loadCourseProgress();p[id]=status;saveCourseProgress(p);
  const el=document.getElementById(`status-${id}`);
  if(el){el.textContent=status==="completed"?"✅ Completed":"⏳ In Progress";el.style.color=status==="completed"?"var(--green)":"var(--yellow)";}
  updateProgress();
};

function renderCourses(courses){
  const g=document.getElementById("coursesGrid");
  if(!g) return;
  if(!courses||!courses.length){g.innerHTML='<p class="empty-state">No courses for this track.</p>';return;}
  const p=loadCourseProgress();
  g.innerHTML=courses.map(c=>{const id=slugify(c.title),s=p[id];return`<div class="course-item"><h3>${c.title}</h3><div class="course-meta">${c.provider} · ${c.duration}</div><a class="course-link" href="${c.url}" target="_blank">Start Learning →</a><div class="course-actions"><button class="course-action-btn" onclick="markCourseStatus('${id}','started')">Started</button><button class="course-action-btn" onclick="markCourseStatus('${id}','completed')">Done ✓</button></div><div class="course-status" id="status-${id}" style="color:${s==='completed'?'var(--green)':s==='started'?'var(--yellow)':'var(--muted)'}">${s==="completed"?"✅ Completed":s==="started"?"⏳ In Progress":""}</div></div>`;}).join("");
  updateProgress();
}

function renderHistory(history){
  const c=document.getElementById("historySection");
  if(!c) return;
  if(!history||!history.length){c.innerHTML='<p class="empty-state">No previous assessments yet.</p>';return;}
  c.innerHTML=history.map(item=>{const risk=item.risk_level||"–",score=typeof item.stability_score==="number"?(item.stability_score*100).toFixed(0)+"%":"–",track=(item.track||"–").replace(/_/g," "),date=item.created_at?new Date(item.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"–";return`<div class="history-item"><span class="history-risk ${risk}">${risk} Risk</span><span class="history-score">Stability ${score}</span><span class="history-track">${track}</span><span class="history-date">${date}</span></div>`;}).join("");
}

function updateProgress(){
  const p=loadCourseProgress(),vals=Object.values(p);
  const done=vals.filter(s=>s==="completed").length,total=vals.length;
  const pct=total?Math.round((done/total)*100):0;
  const el=(id)=>document.getElementById(id);
  if(el("completionPercent")) el("completionPercent").textContent=pct+"%";
  if(el("skillGrowth")) el("skillGrowth").textContent=done*SKILL_WEIGHT;
  if(el("progressFill")) el("progressFill").style.width=pct+"%";
  if(el("progressHint")) el("progressHint").textContent=done===0?"Start a course to track your growth.":done<3?`${done} course${done>1?"s":""} done — keep going!`:"Excellent momentum!";
}

function getDirectionIcon(d){
  if(!d) return"🎯";const l=d.toLowerCase();
  if(l.includes("software")||l.includes("data")) return"💻";
  if(l.includes("management")||l.includes("product")) return"📊";
  if(l.includes("core")) return"⚙️";
  if(l.includes("transition")||l.includes("switch")) return"🔄";
  return"🔭";
}

function showError(msg){
  const s=document.getElementById("analysisSummary");
  if(s) s.textContent="⚠️ "+msg;
  const g=document.getElementById("resultsGrid");
  if(g) g.style.display="grid";
}

document.addEventListener("DOMContentLoaded",()=>{
  if(!requireAuth()) return;
  renderUserHeader();
  document.getElementById("analyzeBtn")?.addEventListener("click",analyze);
  initPersonaButtons();
  initSliders();
  updateProgress();
  checkBackendHealth();
  const fe=document.getElementById("footerEnv");
  if(fe) fe.textContent=API_BASE_URL.includes("render")?"Production":"Development";
});