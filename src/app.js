const DB_NAME = "reminder-pwa-db";
const DB_VERSION = 1;
const STORE = "tasks";

const categories = [
  { id: "life", name: "生活", icon: "🏠" },
  { id: "study", name: "学习", icon: "📚" },
  { id: "work", name: "工作", icon: "💼" },
  { id: "health", name: "健康", icon: "💪" },
  { id: "money", name: "财务", icon: "💰" }
];

const emojis = ["🏠", "📚", "💼", "🛒", "💪", "🎯"];
const labels = {
  short: "短期",
  long: "长期",
  recurring: "循环",
  daily: "每天",
  weekdays: "工作日",
  weekly: "每周",
  monthly: "每月"
};

const el = {
  form: document.querySelector("#taskForm"),
  title: document.querySelector("#titleInput"),
  date: document.querySelector("#dateInput"),
  dateRow: document.querySelector("#dateRow"),
  startDateLabel: document.querySelector("#startDateLabel"),
  endDateField: document.querySelector("#endDateField"),
  endDate: document.querySelector("#endDateInput"),
  noEndDate: document.querySelector("#noEndDateInput"),
  noEndDateWrap: document.querySelector("#noEndDateWrap"),
  time: document.querySelector("#timeInput"),
  startTimeLabel: document.querySelector("#startTimeLabel"),
  endTimeField: document.querySelector("#endTimeField"),
  endTime: document.querySelector("#endTimeInput"),
  noExactTime: document.querySelector("#noExactTimeInput"),
  timeRow: document.querySelector("#timeRow"),
  note: document.querySelector("#noteInput"),
  category: document.querySelector("#categoryInput"),
  kind: document.querySelector("#kindInput"),
  repeat: document.querySelector("#repeatInput"),
  repeatWrap: document.querySelector("#repeatWrap"),
  emoji: document.querySelector("#emojiInput"),
  emojiPicker: document.querySelector("#emojiPicker"),
  customEmojiRow: document.querySelector("#customEmojiRow"),
  kindTabs: document.querySelectorAll(".kind-tab"),
  list: document.querySelector("#list"),
  summary: document.querySelector("#summary"),
  completedBtn: document.querySelector("#completedBtn"),
  addBtn: document.querySelector("#addBtn"),
  addSheet: document.querySelector("#addSheet"),
  cancelBtn: document.querySelector("#cancelBtn"),
  sheetTitle: document.querySelector("#sheetTitle"),
  saveBtn: document.querySelector("#saveBtn"),
  themeBtn: document.querySelector("#themeBtn"),
  currentTime: document.querySelector("#currentTime"),
  currentDate: document.querySelector("#currentDate"),
  installBtn: document.querySelector("#installBtn"),
  fireworks: document.querySelector("#fireworks")
};

let db;
let view = "active";
let activeKind = "short";
let tasks = [];
let deferredInstallPrompt = null;
let theme = localStorage.getItem("themeMode") || "light";
let editingTaskId = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("status", "status");
        store.createIndex("dueAt", "dueAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(mode = "readonly") {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function getAllTasks() {
  return new Promise((resolve, reject) => {
    const request = tx().getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveTask(task) {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").put(task);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function removeTask(id) {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDue(value) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const day = sameDay ? "今天" : date.toDateString() === tomorrow.toDateString() ? "明天" : `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDay(value) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay) return "今天";
  if (date.toDateString() === tomorrow.toDateString()) return "明天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatTaskWindow(task) {
  const start = new Date(task.dueAt);
  if (!task.endAt) {
    return task.hasTime === false
      ? `自${formatDay(task.dueAt)}起，持续进行`
      : `自${formatDue(task.dueAt)}起，持续进行`;
  }

  const end = new Date(task.endAt);
  const sameDay = start.toDateString() === end.toDateString();
  const timeText = task.hasTime === false ? "" : ` ${pad(start.getHours())}:${pad(start.getMinutes())}`;

  if (!task.endAt || task.endAt === task.dueAt) {
    return task.hasTime === false ? formatDay(task.dueAt) : formatDue(task.dueAt);
  }

  if (sameDay) {
    if (task.hasTime === false) return formatDay(task.dueAt);
    return `${formatDay(task.dueAt)} ${pad(start.getHours())}:${pad(start.getMinutes())}-${pad(end.getHours())}:${pad(end.getMinutes())}`;
  }

  const endTime = task.hasTime === false ? "" : ` ${pad(end.getHours())}:${pad(end.getMinutes())}`;
  return `${formatDay(task.dueAt)}${timeText} - ${formatDay(task.endAt)}${endTime}`;
}

function categoryFor(id) {
  return categories.find((item) => item.id === id) || categories[0];
}

function isToday(task) {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayEnd = dayStart + 86_399_999;
  return new Date(task.dueAt).getTime() <= dayEnd && getEndTime(task) >= dayStart;
}

function getEndTime(task) {
  return task.endAt ? new Date(task.endAt).getTime() : Number.POSITIVE_INFINITY;
}

function isOverdue(task) {
  return task.status === "active" && getEndTime(task) < Date.now();
}

function compareActiveTasks(a, b) {
  const aOverdue = isOverdue(a);
  const bOverdue = isOverdue(b);
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
  return getEndTime(a) - getEndTime(b);
}

function nextRecurringDate(task) {
  const next = new Date(task.dueAt);
  const advance = () => {
    const originalDay = next.getDate();
    if (task.repeat === "daily") next.setDate(next.getDate() + 1);
    if (task.repeat === "weekly") next.setDate(next.getDate() + 7);
    if (task.repeat === "monthly") {
      next.setMonth(next.getMonth() + 1);
      if (next.getDate() !== originalDay) next.setDate(0);
    }
    if (task.repeat === "weekdays") {
      do {
        next.setDate(next.getDate() + 1);
      } while ([0, 6].includes(next.getDay()));
    }
  };

  do {
    advance();
  } while (next.getTime() <= Date.now());
  return next.toISOString();
}

function nextRecurringWindow(task) {
  const start = new Date(task.dueAt).getTime();
  const duration = task.endAt ? Math.max(new Date(task.endAt).getTime() - start, 0) : null;
  const dueAt = nextRecurringDate(task);
  const endAt = duration === null ? null : new Date(new Date(dueAt).getTime() + duration).toISOString();
  return { dueAt, endAt };
}

async function refresh() {
  tasks = await getAllTasks();
  const waitingRecurringTasks = tasks.filter((task) => task.kind === "recurring" && task.status === "waiting" && new Date(task.dueAt).getTime() <= Date.now());
  if (waitingRecurringTasks.length) {
    await Promise.all(waitingRecurringTasks.map((task) => saveTask({
      ...task,
      status: "active",
      updatedAt: new Date().toISOString()
    })));
    tasks = await getAllTasks();
  }
  tasks.sort(compareActiveTasks);
  render();
}

function repeatLabel(task) {
  if (task.repeat !== "weekly") return labels[task.repeat];
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `每周${weekdays[new Date(task.dueAt).getDay()]}`;
}

function renderSummary(activeTasks, completedTasks) {
  const visible = activeTasks.filter((task) => task.kind === activeKind);
  const today = visible.filter(isToday).length;
  const overdue = visible.filter(isOverdue).length;
  el.summary.innerHTML = `
    <div class="metric"><strong>${visible.length}</strong><span>${labels[activeKind]}</span></div>
    <div class="metric"><strong>${today}</strong><span>今天</span></div>
    <div class="metric"><strong>${overdue}</strong><span>已到点</span></div>
  `;
  el.completedBtn.textContent = view === "completed" ? "返回待完成" : `查看已完成 ${completedTasks.length}`;
}

function render() {
  const activeTasks = tasks.filter((task) => task.status === "active");
  const completedTasks = tasks
    .filter((task) => task.status === "completed")
    .sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt));

  renderSummary(activeTasks, completedTasks);

  if (view === "completed") {
    renderTaskList(completedTasks, true);
    return;
  }

  renderTaskList(activeTasks.filter((task) => task.kind === activeKind).sort(compareActiveTasks), false);
}

function renderTaskList(items, completed) {
  if (!items.length) {
    const emptyText = completed ? "还没有完成记录" : `${labels[activeKind]}这里还空着`;
    el.list.innerHTML = `<div class="empty">${emptyText}</div>`;
    return;
  }

  el.list.innerHTML = items.map((task) => {
    const category = categoryFor(task.category);
    const repeat = task.kind === "recurring" ? `<span class="pill">${repeatLabel(task)}</span>` : "";
    const completedAt = completed ? `<span class="pill">完成于 ${formatDue(task.completedAt || task.updatedAt)}</span>` : "";
    const overdue = !completed && isOverdue(task) ? `<span class="pill urgent">已超时</span>` : "";
    const note = task.note ? `<div class="note">${escapeHtml(task.note)}</div>` : "";
    const check = completed
      ? `<button class="check-button undo-check" data-undo="${task.id}" aria-label="取消完成"><span>↺</span></button>`
      : `<button class="check-button" data-complete="${task.id}" aria-label="完成"><span>✓</span></button>`;
    const action = completed
      ? `<button class="delete-button" data-delete="${task.id}" aria-label="删除">×</button>`
      : `<button class="delete-button" data-delete="${task.id}" aria-label="删除">×</button>`;
    const details = `
      <p class="task-title">${task.emoji} ${escapeHtml(task.title)}</p>
      <div class="task-meta">
        <span class="pill">${category.icon} ${category.name}</span>
        <span class="pill">${labels[task.kind]}</span>
        <span class="pill">${formatTaskWindow(task)}</span>
        ${repeat}
        ${overdue}
        ${completedAt}
      </div>
      ${note}
    `;
    const content = completed
      ? `<div class="task-content">${details}</div>`
      : `<button class="task-content" type="button" data-edit="${task.id}" aria-label="编辑 ${escapeHtml(task.title)}">${details}</button>`;
    return `
      <article class="task-item ${isOverdue(task) && !completed ? "is-overdue" : ""}">
        ${check}
        ${content}
        ${action}
      </article>
    `;
  }).join("");
}

function setSheetMode(editing) {
  el.sheetTitle.textContent = editing ? "编辑提醒" : "新提醒";
  el.saveBtn.textContent = editing ? "保存" : "完成";
}

function openAddSheet() {
  el.addSheet.classList.remove("hidden");
  el.addSheet.setAttribute("aria-hidden", "false");
  el.title.focus();
}

function openCreateSheet() {
  editingTaskId = null;
  initForm();
  setSheetMode(false);
  openAddSheet();
}

function dateForInput(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeForInput(value) {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function openEditSheet(id) {
  const task = tasks.find((item) => item.id === id && item.status === "active");
  if (!task) return;

  editingTaskId = task.id;
  el.title.value = task.title;
  el.note.value = task.note || "";
  el.category.value = task.category;
  el.kind.value = task.kind;
  el.repeat.value = task.repeat || "daily";
  el.emoji.value = task.emoji || categoryFor(task.category).icon;
  el.date.value = dateForInput(task.dueAt);
  el.noExactTime.checked = task.hasTime === false;
  el.time.value = task.hasTime === false ? "" : timeForInput(task.dueAt);
  el.endDate.value = task.endAt ? dateForInput(task.endAt) : "";
  el.endTime.value = task.endAt && task.hasTime !== false ? timeForInput(task.endAt) : "";
  el.noEndDate.checked = task.kind === "long" && !task.endAt;
  el.timeRow.classList.toggle("disabled", el.noExactTime.checked);
  el.customEmojiRow.classList.toggle("hidden", emojis.includes(el.emoji.value));
  updateFormControls();
  updateEmojiChoice();
  setSheetMode(true);
  openAddSheet();
}

function closeAddSheet() {
  el.addSheet.classList.add("hidden");
  el.addSheet.setAttribute("aria-hidden", "true");
}

function applyTheme() {
  document.body.classList.toggle("theme-night", theme === "night");
  el.themeBtn.textContent = theme === "night" ? "☀" : "🌙";
  el.themeBtn.setAttribute("aria-label", theme === "night" ? "切换浅色模式" : "切换夜晚模式");
  el.themeBtn.title = theme === "night" ? "切换浅色模式" : "切换夜晚模式";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "night" ? "#070b14" : "#f2f2f7";
}

function toggleTheme() {
  theme = theme === "night" ? "light" : "night";
  localStorage.setItem("themeMode", theme);
  applyTheme();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

async function completeTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  const completion = {
    ...task,
    id: crypto.randomUUID(),
    originalId: task.originalId || task.id,
    status: "completed",
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await saveTask(completion);

  if (task.kind === "recurring") {
    const next = nextRecurringWindow(task);
    task.dueAt = next.dueAt;
    task.endAt = next.endAt;
    task.status = "waiting";
    task.updatedAt = new Date().toISOString();
    await saveTask(task);
  } else {
    await removeTask(task.id);
  }

  fireworkBurst();
  await refresh();
}

async function undoCompleteTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  await removeTask(task.id);
  await saveTask({
    ...task,
    id: task.originalId || crypto.randomUUID(),
    originalId: undefined,
    status: "active",
    completedAt: undefined,
    updatedAt: new Date().toISOString()
  });
  view = "active";
  await refresh();
}

function fireworkBurst() {
  const canvas = el.fireworks;
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const colors = ["#f3bd4e", "#167a73", "#3978d4", "#e8566f", "#8a63d2"];
  const particles = Array.from({ length: 90 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 90;
    const speed = 2 + Math.random() * 5;
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.44,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      life: 60 + Math.random() * 20,
      color: colors[index % colors.length]
    };
  });

  let frame = 0;
  function draw() {
    frame += 1;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.07;
      p.life -= 1;
      ctx.globalAlpha = Math.max(p.life / 80, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (frame < 86) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
  draw();
}

function initForm() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 10);
  el.date.value = toDateInput(now);
  el.endDate.value = "";
  el.noEndDate.checked = false;
  el.time.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  el.endTime.value = "";
  el.noExactTime.checked = false;
  el.timeRow.classList.remove("disabled");
  el.kind.value = "short";
  el.repeat.value = "daily";
  el.emoji.value = "📚";

  el.category.innerHTML = categories.map((category) => {
    return `<option value="${category.id}">${category.icon} ${category.name}</option>`;
  }).join("");
  el.category.value = "study";

  el.emojiPicker.innerHTML = emojis.map((emoji) => {
    return `<button class="emoji-choice" type="button" data-emoji="${emoji}">${emoji}</button>`;
  }).join("") + '<button class="emoji-choice emoji-add" type="button" data-custom-emoji aria-label="自定义图标" title="自定义图标">＋</button>';
  el.customEmojiRow.classList.add("hidden");
  updateFormControls();
  updateEmojiChoice();
}

function updateEmojiChoice() {
  document.querySelectorAll(".emoji-choice").forEach((button) => {
    button.classList.toggle("active", button.dataset.emoji === el.emoji.value);
  });
}

function updateEndDateState() {
  const openEnded = el.kind.value === "long" && el.noEndDate.checked;
  el.endDate.disabled = openEnded;
  el.endTime.disabled = openEnded || el.noExactTime.checked;
}

function updateFormControls() {
  const isRecurring = el.kind.value === "recurring";
  const isLong = el.kind.value === "long";
  el.repeatWrap.classList.toggle("hidden", !isRecurring);
  el.noEndDateWrap.classList.toggle("hidden", !isLong);
  el.dateRow.classList.toggle("single-field", isRecurring);
  el.timeRow.classList.toggle("single-field", isRecurring);
  el.endDateField.classList.toggle("hidden", isRecurring);
  el.endTimeField.classList.toggle("hidden", isRecurring);
  el.startDateLabel.textContent = isRecurring ? "首次执行日期" : "开始日期";
  el.startTimeLabel.textContent = isRecurring ? "执行时间" : "开始时间";
  if (isRecurring) {
    el.endDate.value = "";
    el.endTime.value = "";
  }
  if (!isLong) el.noEndDate.checked = false;
  updateEndDateState();
}

function updateCurrentTime() {
  const now = new Date();
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  el.currentTime.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  el.currentDate.textContent = `${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
}

function bindEvents() {
  el.kind.addEventListener("change", () => {
    updateFormControls();
  });

  el.emojiPicker.addEventListener("click", (event) => {
    const custom = event.target.closest("[data-custom-emoji]");
    if (custom) {
      el.customEmojiRow.classList.remove("hidden");
      el.emoji.value = "";
      el.emoji.focus();
      updateEmojiChoice();
      return;
    }
    const button = event.target.closest("[data-emoji]");
    if (!button) return;
    el.emoji.value = button.dataset.emoji;
    el.customEmojiRow.classList.add("hidden");
    updateEmojiChoice();
  });

  el.emoji.addEventListener("input", updateEmojiChoice);

  el.noExactTime.addEventListener("change", () => {
    el.timeRow.classList.toggle("disabled", el.noExactTime.checked);
    updateEndDateState();
  });

  el.noEndDate.addEventListener("change", updateEndDateState);

  el.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const hasTime = !el.noExactTime.checked;
    const startTime = hasTime ? el.time.value || "09:00" : "00:00";
    const isOpenEnded = el.kind.value === "long" && el.noEndDate.checked;
    const endDate = isOpenEnded ? "" : el.endDate.value || el.date.value;
    const endTime = hasTime ? el.endTime.value || el.time.value || "23:59" : "23:59";
    const startDateTime = new Date(`${el.date.value}T${startTime}`);
    let endDateTime = null;
    if (!isOpenEnded) {
      endDateTime = new Date(`${endDate}T${endTime}`);
      if (endDateTime < startDateTime) {
        endDateTime = new Date(startDateTime);
      }
    }
    const dueAt = startDateTime.toISOString();
    const endAt = endDateTime?.toISOString() || null;
    const existingTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) : null;
    await saveTask({
      ...existingTask,
      id: existingTask?.id || crypto.randomUUID(),
      title: el.title.value.trim(),
      note: el.note.value.trim(),
      category: el.category.value,
      kind: el.kind.value,
      repeat: el.kind.value === "recurring" ? el.repeat.value : null,
      emoji: el.emoji.value.trim() || categoryFor(el.category.value).icon,
      dueAt,
      endAt,
      hasTime,
      status: existingTask?.status || "active",
      createdAt: existingTask?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    editingTaskId = null;
    el.form.reset();
    initForm();
    closeAddSheet();
    await refresh();
  });

  el.kindTabs.forEach((button) => {
    button.addEventListener("click", () => {
      activeKind = button.dataset.kind;
      view = "active";
      el.kindTabs.forEach((tab) => tab.classList.toggle("active", tab === button));
      render();
    });
  });

  el.completedBtn.addEventListener("click", () => {
    view = view === "completed" ? "active" : "completed";
    render();
  });

  el.addBtn.addEventListener("click", openCreateSheet);
  el.cancelBtn.addEventListener("click", closeAddSheet);
  el.addSheet.addEventListener("click", (event) => {
    if (event.target === el.addSheet) closeAddSheet();
  });

  el.themeBtn.addEventListener("click", toggleTheme);

  el.list.addEventListener("click", async (event) => {
    const complete = event.target.closest("[data-complete]");
    const undo = event.target.closest("[data-undo]");
    const del = event.target.closest("[data-delete]");
    const edit = event.target.closest("[data-edit]");
    if (complete) {
      const item = complete.closest(".task-item");
      item?.classList.add("completing");
      window.setTimeout(() => completeTask(complete.dataset.complete), 260);
      return;
    }
    if (undo) {
      await undoCompleteTask(undo.dataset.undo);
      return;
    }
    if (del) {
      await removeTask(del.dataset.delete);
      await refresh();
      return;
    }
    if (edit) openEditSheet(edit.dataset.edit);
  });

  el.installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    el.installBtn.classList.add("hidden");
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    el.installBtn.classList.remove("hidden");
  });
}

async function init() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
  }

  db = await openDb();
  applyTheme();
  initForm();
  bindEvents();
  updateCurrentTime();
  await refresh();
  setInterval(async () => {
    await refresh();
  }, 30_000);
  setInterval(updateCurrentTime, 15_000);
}

init();
