const API = "/api";
let token = localStorage.getItem("hb_token") || "";
let setupRequired = false;
let selectedDay = "Sunday";
let entries = [];
let taskStates = {};

const schedule = {
  Sunday: {
    label: "FIELD SUPPORT & TRAINING",
    headline: "Launch the week in the field.",
    detail: "Visit active crews, inspect safety, quality, and efficiency, coach in real time, and document while context is fresh.",
    tasks: [
      ["Review attendance and call-outs", "Systems"],
      ["Review crew assignments and route risk", "Systems"],
      ["Visit active crews", "Field"],
      ["Observe safety, quality, and efficiency", "Field"],
      ["Coach technicians and Team Leads", "People"],
      ["Document coaching conversations", "People"],
      ["Check open callbacks and customer issues", "Systems"],
      ["Review revenue and labor trend before close", "Systems"]
    ]
  },
  Monday: {
    label: "SHOP / OFFICE SUPPORT",
    headline: "Develop people and close loops.",
    detail: "One-on-ones, interviews, documentation, training plans, equipment, and leadership follow-up.",
    tasks: [
      ["Meet with Team Leads", "People"],
      ["One-on-one coaching and follow-up", "People"],
      ["Interview candidates", "People"],
      ["Review hiring pipeline", "Systems"],
      ["Review FieldPulse / Clerk / reporting", "Systems"],
      ["Check warehouse and equipment needs", "Systems"],
      ["Prepare training or safety material", "People"],
      ["Weekly leadership development meeting", "People"]
    ]
  },
  Tuesday: {
    label: "FIELD SUPPORT & TRAINING",
    headline: "Turn performance data into field action.",
    detail: "Use labor, revenue, QA, and attendance signals to decide where your time has the highest impact.",
    tasks: [
      ["Review labor % by crew", "Systems"],
      ["Review revenue per truck", "Systems"],
      ["Identify highest-risk crew", "Systems"],
      ["Visit priority crew", "Field"],
      ["Coach one process improvement", "People"],
      ["Verify corrections from prior coaching", "Field"],
      ["Check truck and equipment readiness", "Field"],
      ["Document wins and unresolved risks", "Systems"]
    ]
  },
  Wednesday: {
    label: "SHOP / OFFICE SUPPORT",
    headline: "Improve the system, not only the shift.",
    detail: "Build structure: reporting, SOPs, training, interviews, inventory planning, and operational problem-solving.",
    tasks: [
      ["Review weekly trend and moving average", "Systems"],
      ["Review open employee concerns", "People"],
      ["Conduct interviews", "People"],
      ["Update coaching documentation", "People"],
      ["Update SOPs and training material", "Systems"],
      ["Plan equipment and warehouse needs", "Systems"],
      ["Review callbacks, partials, and quality issues", "Systems"],
      ["Build next-week priorities", "Systems"]
    ]
  },
  Thursday: {
    label: "FIELD SUPPORT & TRAINING",
    headline: "Finish strong, verify standards, and prepare Friday.",
    detail: "Field visibility, follow-through, recognition, risk control, and preparation for Friday morning meetings.",
    tasks: [
      ["Visit active crews", "Field"],
      ["Verify safety standards", "Field"],
      ["Verify QA and cleanup standards", "Field"],
      ["Recognize strong performance", "People"],
      ["Follow up on unresolved coaching", "People"],
      ["Check customer escalations", "Systems"],
      ["Review weekly labor and revenue", "Systems"],
      ["Prepare Friday morning meeting agenda and talking points", "People"],
      ["Confirm Friday morning meeting follow-ups and owners", "Systems"],
      ["Write weekly win and next-week risk", "Systems"]
    ]
  }
};

function isMachineWednesdayWeek(date = new Date()) {
  const start = new Date(Date.UTC(date.getFullYear(), 0, 1));
  const current = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = Math.floor((current - start) / 86400000) + 1;
  const week = Math.ceil((dayNumber + start.getUTCDay()) / 7);
  return week % 2 === 0;
}

function dayTasks(day) {
  const base = [...schedule[day].tasks];
  if (day === "Wednesday" && isMachineWednesdayWeek()) {
    base.splice(5, 0, ["Work on machines: maintenance, repair, and readiness block", "Field"]);
  }
  return base;
}

async function api(path, options = {}) {
  const headers = {"Content-Type":"application/json", ...(options.headers || {})};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(API + path, {...options, headers});
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      token = "";
      localStorage.removeItem("hb_token");
      renderAuthState();
    }
    throw new Error(data.detail || `Request failed (${response.status})`);
  }
  return data;
}

async function boot() {
  const status = await api("/auth/status");
  setupRequired = status.setup_required;
  await Promise.all([loadEntries(), loadTasks()]);
  bindEvents();
  renderAll();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
}

async function loadEntries() { entries = await api("/entries"); }
async function loadTasks() { taskStates = await api("/tasks"); }

function bindEvents() {
  unlockBtn.addEventListener("click", openAuth);
  lockBtn.addEventListener("click", lockEditing);
  authCancel.addEventListener("click", () => authDialog.close());
  authForm.addEventListener("submit", submitAuth);
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => openTab(btn.dataset.tab)));
  document.querySelectorAll(".quick-card").forEach(btn => btn.addEventListener("click", () => openTab(btn.dataset.tab)));
  document.querySelectorAll(".cancel-edit").forEach(btn => btn.addEventListener("click", () => resetForm(btn.dataset.kind)));
  coachingForm.addEventListener("submit", submitCoaching);
  visitForm.addEventListener("submit", submitVisit);
  candidateForm.addEventListener("submit", submitCandidate);
  actionForm.addEventListener("submit", submitAction);
  reviewForm.addEventListener("submit", submitReview);
}

function renderAll() {
  renderAuthState(); renderDays(); renderMission(); renderMetrics(); renderEntries(); renderFocus();
  todayLabel.textContent = new Date().toLocaleDateString([], {weekday:"long", month:"short", day:"numeric"});
}

function renderAuthState() {
  const unlocked = Boolean(token);
  lockState.textContent = unlocked ? "UNLOCKED" : "LOCKED";
  lockState.className = "status-badge " + (unlocked ? "unlocked" : "locked");
  unlockBtn.classList.toggle("hidden", unlocked);
  lockBtn.classList.toggle("hidden", !unlocked);
}

function openAuth() {
  authTitle.textContent = setupRequired ? "Create edit password" : "Unlock editing";
  authHelp.textContent = setupRequired ? "First run: create the password that protects all edits." : "Enter your password to edit schedule tasks and records.";
  authSubmit.textContent = setupRequired ? "Create password" : "Unlock";
  authError.textContent = ""; passwordInput.value = ""; authDialog.showModal();
  setTimeout(() => passwordInput.focus(), 50);
}

async function submitAuth(event) {
  event.preventDefault(); authError.textContent = "";
  try {
    const path = setupRequired ? "/auth/setup" : "/auth/login";
    const data = await api(path, {method:"POST", body:JSON.stringify({password:passwordInput.value})});
    token = data.token; localStorage.setItem("hb_token", token); setupRequired = false; authDialog.close(); renderAuthState();
  } catch (error) { authError.textContent = error.message; }
}

function lockEditing() { token = ""; localStorage.removeItem("hb_token"); renderAuthState(); }
function requireUnlocked() { if (token) return true; openAuth(); return false; }

function renderDays() {
  dayStrip.innerHTML = "";
  Object.keys(schedule).forEach(day => {
    const button = document.createElement("button");
    button.className = "day-btn" + (selectedDay === day ? " active" : "");
    button.textContent = day.slice(0,3).toUpperCase();
    button.onclick = () => { selectedDay = day; renderDays(); renderMission(); };
    dayStrip.appendChild(button);
  });
}

function renderMission() {
  const mission = schedule[selectedDay];
  missionLabel.textContent = mission.label; missionHeadline.textContent = mission.headline; missionDetail.textContent = mission.detail; taskList.innerHTML = "";
  const machineWeek = isMachineWednesdayWeek();
  alternateWednesdayBanner.classList.toggle("hidden", selectedDay !== "Wednesday");
  if (selectedDay === "Wednesday") {
    alternateWednesdayBanner.textContent = machineWeek
      ? "THIS WEDNESDAY: Machine rotation is ON — maintenance, repairs, and readiness block included."
      : "THIS WEDNESDAY: Machine rotation is OFF — next alternating Wednesday will include the machine block.";
  }
  dayTasks(selectedDay).forEach(([text, category]) => {
    const key = `${selectedDay}:${text}`;
    const row = document.createElement("label");
    row.className = "task-row" + (taskStates[key] ? " done" : "");
    row.innerHTML = `<input type="checkbox" ${taskStates[key] ? "checked" : ""}/><span class="task-text">${escapeHtml(text)}</span><span class="tag">${category}</span>`;
    row.querySelector("input").addEventListener("change", async event => {
      if (!requireUnlocked()) { event.target.checked = Boolean(taskStates[key]); return; }
      try {
        const done = event.target.checked;
        await api(`/tasks/${encodeURIComponent(key)}`, {method:"PUT", body:JSON.stringify({done})});
        taskStates[key] = done; renderAll();
      } catch (error) { alert(error.message); event.target.checked = !event.target.checked; }
    });
    taskList.appendChild(row);
  });
}

function kindEntries(kind) { return entries.filter(entry => entry.kind === kind); }

function renderMetrics() {
  const allTasks = Object.keys(schedule).flatMap(day => dayTasks(day).map(([text]) => `${day}:${text}`));
  const completed = allTasks.filter(key => taskStates[key]).length;
  weekPct.textContent = `${Math.round((completed / allTasks.length) * 100)}%`;
  const visits = kindEntries("visit"), coaching = kindEntries("coaching"), candidates = kindEntries("candidate"), actions = kindEntries("action");
  visitsMetric.textContent = visits.length; coachMetric.textContent = coaching.length; actionsMetric.textContent = actions.filter(e => !e.payload.done).length;
  const counts = {People:0,Field:0,Systems:0};
  Object.keys(schedule).forEach(day => dayTasks(day).forEach(([text, category]) => { if (taskStates[`${day}:${text}`]) counts[category]++; }));
  pulsePeople.textContent = counts.People; pulseField.textContent = counts.Field; pulseSystem.textContent = counts.Systems;
  visitKpi.textContent = `${visits.length}/6`; coachKpi.textContent = `${coaching.length}/8`; intKpi.textContent = `${candidates.length}/3`;
  visitBar.style.width = `${Math.min(100, visits.length / 6 * 100)}%`;
  coachBar.style.width = `${Math.min(100, coaching.length / 8 * 100)}%`;
  intBar.style.width = `${Math.min(100, candidates.length / 3 * 100)}%`;
}

function renderFocus() {
  const openActions = kindEntries("action").filter(e => !e.payload.done);
  const due = [...openActions].sort((a,b) => (a.payload.due || "9999").localeCompare(b.payload.due || "9999"))[0];
  if (due) { focusText.textContent = `Priority: ${due.payload.title}. Owner: ${due.payload.owner || "Unassigned"}. Due: ${due.payload.due || "Not set"}.`; return; }
  const visits = kindEntries("visit").length;
  if (visits < 6) { focusText.textContent = `${6 - visits} more crew visit${6 - visits === 1 ? "" : "s"} to hit the weekly field-visibility target.`; return; }
  focusText.textContent = "Field visibility target reached. Shift focus to unresolved coaching follow-ups, labor trend, and Friday meeting preparation.";
}

function renderEntries() {
  renderActivity();
  renderKind("coaching", coachingList, e => ({title:`${e.payload.name} • ${e.payload.topic}`, body:e.payload.notes || "No notes.", meta:`Follow-up: ${e.payload.follow || "not set"}`}));
  renderKind("visit", visitsList, e => ({title:`${e.payload.crew} • ${e.payload.focus}`, body:e.payload.notes || "No notes.", meta:formatDate(e.created_at)}));
  renderKind("candidate", candidateList, e => ({title:`${e.payload.name} • ${e.payload.status}`, body:e.payload.notes || "No notes.", meta:formatDate(e.created_at)}));
  renderKind("action", actionList, e => ({title:`${e.payload.done ? "✓ " : ""}${e.payload.title}`, body:`${e.payload.owner || "Unassigned"} • ${e.payload.priority}`, meta:`Due: ${e.payload.due || "not set"}`, extra:`<button class="btn ghost" onclick="toggleAction(${e.id})">${e.payload.done ? "Reopen" : "Complete"}</button>`}));
  renderKind("weekly_review", reviewList, e => ({title:`Revenue ${e.payload.revenue || "—"} • Labor ${e.payload.labor || "—"}`, body:e.payload.notes || "No notes.", meta:`QA audits: ${e.payload.qa || 0} • Escalations closed: ${e.payload.esc || 0}`}));
}

function renderActivity() {
  const latest = [...entries].sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,30);
  if (!latest.length) { activityList.innerHTML = `<p class="muted">No activity yet. Unlock editing and capture your first record.</p>`; return; }
  activityList.innerHTML = latest.map(e => {
    const label = {coaching:"Coaching",visit:"Crew Visit",candidate:"Interview",action:"Action",weekly_review:"Weekly Review",note:"Note"}[e.kind] || e.kind;
    return `<article class="entry-card"><div class="entry-top"><span class="entry-title">${label}</span><span class="entry-meta">${formatDate(e.created_at)}</span></div><p>${escapeHtml(summaryFor(e))}</p></article>`;
  }).join("");
}

function summaryFor(e) {
  const p = e.payload;
  if (e.kind === "coaching") return `${p.name} — ${p.topic}`;
  if (e.kind === "visit") return `${p.crew} — ${p.focus}`;
  if (e.kind === "candidate") return `${p.name} — ${p.status}`;
  if (e.kind === "action") return p.title;
  if (e.kind === "weekly_review") return `Revenue ${p.revenue || "—"} / Labor ${p.labor || "—"}`;
  return "Record updated";
}

function renderKind(kind, container, formatter) {
  const rows = kindEntries(kind);
  if (!rows.length) { container.innerHTML = `<p class="muted">No records yet.</p>`; return; }
  container.innerHTML = rows.map(e => {
    const v = formatter(e);
    return `<article class="entry-card"><div class="entry-top"><span class="entry-title">${escapeHtml(v.title)}</span><span class="entry-meta">${formatDate(e.updated_at)}</span></div><p>${escapeHtml(v.body)}</p><div class="entry-meta">${escapeHtml(v.meta || "")}</div><div class="entry-actions">${v.extra || ""}<button class="btn ghost" onclick="startEdit('${kind}',${e.id})">Edit</button><button class="btn danger" onclick="deleteEntry(${e.id})">Delete</button></div></article>`;
  }).join("");
}

function openTab(name) {
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === name));
  document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("active", panel.id === `panel-${name}`));
  document.querySelector(".workspace").scrollIntoView({behavior:"smooth",block:"start"});
}

async function saveEntry(kind, id, payload) {
  if (!requireUnlocked()) return false;
  const options = id ? {method:"PUT",body:JSON.stringify({payload})} : {method:"POST",body:JSON.stringify({kind,payload})};
  await api(id ? `/entries/${id}` : "/entries", options);
  await loadEntries(); renderAll(); return true;
}

async function submitCoaching(e){e.preventDefault();const id=Number(coachingId.value)||null;if(await saveEntry("coaching",id,{name:coachName.value.trim(),topic:coachTopic.value,notes:coachNotes.value.trim(),follow:coachFollow.value}))resetForm("coaching")}
async function submitVisit(e){e.preventDefault();const id=Number(visitId.value)||null;if(await saveEntry("visit",id,{crew:visitCrew.value.trim(),focus:visitFocus.value,notes:visitNotes.value.trim()}))resetForm("visit")}
async function submitCandidate(e){e.preventDefault();const id=Number(candidateId.value)||null;if(await saveEntry("candidate",id,{name:candName.value.trim(),status:candStatus.value,notes:candNotes.value.trim()}))resetForm("candidate")}
async function submitAction(e){e.preventDefault();const id=Number(actionId.value)||null;const existing=entries.find(x=>x.id===id);if(await saveEntry("action",id,{title:actionTitle.value.trim(),owner:actionOwner.value.trim(),due:actionDue.value,priority:actionPriority.value,done:existing?.payload.done||false}))resetForm("action")}
async function submitReview(e){e.preventDefault();const id=Number(reviewId.value)||null;if(await saveEntry("weekly_review",id,{revenue:wrRevenue.value.trim(),labor:wrLabor.value.trim(),qa:wrQa.value,esc:wrEsc.value,notes:wrNotes.value.trim()}))resetForm("weekly_review")}

function startEdit(kind,id){
  if(!requireUnlocked())return; const e=entries.find(x=>x.id===id); if(!e)return; const p=e.payload;
  if(kind==="coaching"){coachingId.value=id;coachName.value=p.name||"";coachTopic.value=p.topic||"Performance";coachNotes.value=p.notes||"";coachFollow.value=p.follow||"";openTab("coaching")}
  else if(kind==="visit"){visitId.value=id;visitCrew.value=p.crew||"";visitFocus.value=p.focus||"QA";visitNotes.value=p.notes||"";openTab("visits")}
  else if(kind==="candidate"){candidateId.value=id;candName.value=p.name||"";candStatus.value=p.status||"Scheduled";candNotes.value=p.notes||"";openTab("interviews")}
  else if(kind==="action"){actionId.value=id;actionTitle.value=p.title||"";actionOwner.value=p.owner||"";actionDue.value=p.due||"";actionPriority.value=p.priority||"High";openTab("actions")}
  else if(kind==="weekly_review"){reviewId.value=id;wrRevenue.value=p.revenue||"";wrLabor.value=p.labor||"";wrQa.value=p.qa||"";wrEsc.value=p.esc||"";wrNotes.value=p.notes||"";openTab("review")}
  document.querySelector(`.cancel-edit[data-kind="${kind}"]`)?.classList.remove("hidden");
}

function resetForm(kind){
  const map={coaching:[coachingForm,coachingId],visit:[visitForm,visitId],candidate:[candidateForm,candidateId],action:[actionForm,actionId],weekly_review:[reviewForm,reviewId]};
  const [form,idField]=map[kind]; form.reset(); idField.value=""; document.querySelector(`.cancel-edit[data-kind="${kind}"]`)?.classList.add("hidden");
}

async function deleteEntry(id){if(!requireUnlocked())return;if(!confirm("Delete this record?"))return;try{await api(`/entries/${id}`,{method:"DELETE"});await loadEntries();renderAll()}catch(e){alert(e.message)}}
async function toggleAction(id){if(!requireUnlocked())return;const e=entries.find(x=>x.id===id);if(!e)return;await saveEntry("action",id,{...e.payload,done:!e.payload.done})}
function formatDate(value){return new Date(value).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
window.startEdit=startEdit;window.deleteEntry=deleteEntry;window.toggleAction=toggleAction;
boot().catch(error=>{console.error(error);alert("Startup failed: "+error.message)});
