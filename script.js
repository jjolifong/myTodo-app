/**
 * MyToDo — 일정 관리 (바닐라 JS)
 * - todos 배열이 단일 상태(SSOT), DOM은 표현만 담당해 직렬화/역직렬 불일치를 막음
 * - 추가·삭제·완료·필터·마감·테마·localStorage 동작은 기존과 동일한 UX 유지
 */
(function () {
  "use strict";

  const THEME_KEY = "mytodo-theme";
  const STORAGE_KEY = "mytodo-items-v1";

  /** @type {{ id: string, text: string, done: boolean, dueAt: string | null }[]} */
  let todos = [];

  const $ = (id) => document.getElementById(id);

  function nextTodoId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return "todo-" + crypto.randomUUID();
    }
    return "todo-" + String(Date.now()) + "-" + String(Math.random()).slice(2, 8);
  }

  function parseDue(iso) {
    if (!iso || typeof iso !== "string") return null;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : t;
  }

  function formatDueLabel(iso) {
    const ms = parseDue(iso);
    if (ms === null) return "";
    try {
      return new Date(ms).toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  function isOverdue(iso, done) {
    if (done) return false;
    const ms = parseDue(iso);
    if (ms === null) return false;
    return ms < Date.now();
  }

  function isDueSoon(iso, done) {
    if (done) return false;
    const ms = parseDue(iso);
    if (ms === null) return false;
    const now = Date.now();
    if (ms < now) return false;
    return ms - now <= 24 * 60 * 60 * 1000;
  }

  function sortItems(items) {
    return [...items].sort((a, b) => {
      const ad = parseDue(a.dueAt);
      const bd = parseDue(b.dueAt);
      if (ad !== null && bd !== null && ad !== bd) return ad - bd;
      if (ad !== null && bd === null) return -1;
      if (ad === null && bd !== null) return 1;
      return 0;
    });
  }

  function defaultSeed() {
    return [
      { id: nextTodoId(), text: "프로젝트 구조 익히기", done: true, dueAt: null },
      { id: nextTodoId(), text: "HTML·CSS·JS로 일정 앱 만들기", done: false, dueAt: null },
    ];
  }

  /** 로컬 JSON 한 건을 안전히 모델로 바꿔, 잘못된 레코드는 제외해 런타임 오류를 막음 */
  function normalizeIncomingTodo(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = typeof raw.id === "string" && raw.id ? raw.id : nextTodoId();
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text) return null;
    return {
      id,
      text,
      done: !!raw.done,
      dueAt: raw.dueAt && typeof raw.dueAt === "string" ? raw.dueAt : null,
    };
  }

  function loadTodosFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return null;
      return data.map(normalizeIncomingTodo).filter(Boolean);
    } catch {
      return null;
    }
  }

  function persistTodos() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch {
      /* 저장 용량 초과 등 — 앱 크래시보다 조용히 무시 */
    }
  }

  function computeStats(items) {
    const total = items.length;
    const done = items.reduce((n, t) => n + (t.done ? 1 : 0), 0);
    return { total, done, active: total - done };
  }

  /** 통계는 항상 배열에서 계산해 DOM과 숫자가 어긋나지 않게 함 */
  function paintStats(statTotal, statDone, statActive, stats) {
    if (statTotal) statTotal.textContent = String(stats.total);
    if (statDone) statDone.textContent = String(stats.done);
    if (statActive) statActive.textContent = String(stats.active);
  }

  function todoVisibleForFilter(todo, filter) {
    if (filter === "active") return !todo.done;
    if (filter === "done") return todo.done;
    return true;
  }

  function findTodoById(id) {
    return todos.find((t) => t.id === id) || null;
  }

  function updateRowVisual(li) {
    const check = li.querySelector(".todo-item__check");
    const dueEl = li.querySelector(".todo-item__due");
    const iso = li.getAttribute("data-due-at") || "";
    const done = check && check.checked;
    li.classList.toggle("todo-item--overdue", isOverdue(iso, !!done));
    li.classList.toggle("todo-item--soon", isDueSoon(iso, !!done));
    if (dueEl) {
      if (iso) {
        dueEl.textContent = formatDueLabel(iso);
        dueEl.hidden = false;
      } else {
        dueEl.textContent = "";
        dueEl.hidden = true;
      }
    }
  }

  /** 한 li를 todo 모델로부터 생성 — 렌더 경로를 한곳으로 모아 중복 제거 */
  function createTodoRow(todo) {
    const li = document.createElement("li");
    li.className = "todo-item";
    li.setAttribute("data-todo-id", todo.id);
    if (todo.dueAt) li.setAttribute("data-due-at", todo.dueAt);
    else li.removeAttribute("data-due-at");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "todo-item__check";
    check.id = todo.id;
    check.checked = todo.done;

    const body = document.createElement("div");
    body.className = "todo-item__body";

    const label = document.createElement("label");
    label.className = "todo-item__text";
    label.htmlFor = todo.id;
    label.textContent = todo.text;
    label.title = "더블클릭하여 제목 편집";

    const due = document.createElement("time");
    due.className = "todo-item__due";
    due.setAttribute("datetime", todo.dueAt || "");
    due.hidden = !todo.dueAt;

    body.appendChild(label);
    body.appendChild(due);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn-icon btn-icon--reject";
    del.setAttribute("aria-label", "삭제");
    const glyph = document.createElement("span");
    glyph.className = "btn-icon__glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = "×";
    del.appendChild(glyph);

    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(del);

    updateRowVisual(li);
    return li;
  }

  /** 목록 전체를 상태 기준으로 다시 그림 — 추가·일괄삭제·초기 로드 시 한 경로로 통일 */
  function renderFullList(listEl) {
    listEl.innerHTML = "";
    const sorted = sortItems(todos);
    for (let i = 0; i < sorted.length; i++) {
      listEl.appendChild(createTodoRow(sorted[i]));
    }
  }

  /** 필터만 바꿀 때 전체 리렌더 없이 가시성만 토글해 불필요한 깜빡임 감소 */
  function applyFilterClassToRows(listEl, filter) {
    const rows = listEl.querySelectorAll("li.todo-item");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const id = row.getAttribute("data-todo-id");
      const todo = id ? findTodoById(id) : null;
      if (!todo) continue;
      row.classList.toggle("todo-item--hidden", !todoVisibleForFilter(todo, filter));
    }
  }

  function updateEmptyHint(listEl, hintEl) {
    if (!hintEl) return;
    hintEl.hidden = todos.length > 0;
  }

  /** 통계·빈 목록 안내·저장을 한 번에 — UI 갱신 호출을 한 함수로 묶어 누락 방지 */
  function paintChrome(listEl, emptyHint, statTotal, statDone, statActive) {
    const stats = computeStats(todos);
    paintStats(statTotal, statDone, statActive, stats);
    updateEmptyHint(listEl, emptyHint);
    persistTodos();
  }

  function setFilterUI(filter, buttons) {
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const f = b.getAttribute("data-filter");
      const on = f === filter;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function getEffectiveTheme() {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function updateThemeButton(themeToggle) {
    if (!themeToggle) return;
    const mode = getEffectiveTheme();
    const sun = themeToggle.querySelector(".btn-theme__icon--sun");
    const moon = themeToggle.querySelector(".btn-theme__icon--moon");
    const isLight = mode === "light";
    if (sun) {
      sun.removeAttribute("hidden");
      sun.style.setProperty("display", isLight ? "block" : "none", "important");
    }
    if (moon) {
      moon.removeAttribute("hidden");
      moon.style.setProperty("display", isLight ? "none" : "block", "important");
    }
    themeToggle.classList.toggle("btn-theme--state-light", isLight);
    themeToggle.classList.toggle("btn-theme--state-dark", !isLight);
    if (mode === "dark") {
      themeToggle.setAttribute("aria-label", "라이트 모드로 전환");
      themeToggle.setAttribute("aria-pressed", "true");
    } else {
      themeToggle.setAttribute("aria-label", "다크 모드로 전환");
      themeToggle.setAttribute("aria-pressed", "false");
    }
  }

  function initTheme(themeToggle) {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") {
        document.documentElement.setAttribute("data-theme", saved);
      }
    } catch {
      /* 사생활 모드 등에서 접근 불가할 수 있음 */
    }
    updateThemeButton(themeToggle);
  }

  /** 다음 테마로 토글 — attr 분기와 getEffectiveTheme 이중 로직을 제거해 클릭 시 상태 꼬임 방지 */
  function toggleStoredTheme(themeToggle) {
    const next = getEffectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    updateThemeButton(themeToggle);
  }

  function subscribeOsThemeChanges(themeToggle) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (!document.documentElement.getAttribute("data-theme")) {
        updateThemeButton(themeToggle);
      }
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
    } else if (typeof mql.addListener === "function") {
      mql.addListener(handler);
    }
  }

  /**
   * 제목 인라인 편집 — li 없음/리스트 밖 노드면 조용히 return 해 null 참조 예외 방지
   * @param {(nextText: string) => void} onCommit 저장이 확정될 때만 상태 반영
   */
  function beginEditLabel(label, listRoot, onCommit) {
    const li = label.closest(".todo-item");
    if (!li || !listRoot.contains(li)) return;
    if (li.querySelector(".todo-item__edit-input")) return;

    const original = String(label.textContent || "").trim();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "composer-dock__input todo-item__edit-input";
    input.value = original;
    label.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    function finish(save) {
      if (finished) return;
      finished = true;
      const nextLabel = document.createElement("label");
      nextLabel.className = "todo-item__text";
      const idInput = li.querySelector(".todo-item__check");
      nextLabel.htmlFor = idInput ? idInput.id : "";
      nextLabel.title = "더블클릭하여 제목 편집";
      const v = save ? String(input.value || "").trim() : original;
      nextLabel.textContent = v || original;
      input.replaceWith(nextLabel);
      if (save) {
        onCommit(v || original);
      }
    }

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        finish(true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        finish(false);
      }
    });

    input.addEventListener("blur", () => {
      finish(true);
    });
  }

  /** datetime-local 값을 ISO로 통일해 타임존·파싱 실패 시 빈 문자열로 처리 */
  function dueInputToIso(dueInput) {
    if (!dueInput || !dueInput.value) return null;
    const d = new Date(dueInput.value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  /* ---------- DOM 흐름 시각화 패널 (HTML/CSS 없이 script만으로 주입) ---------- */
  const FLOW_LOG_MAX = 5;
  const FLOW_STYLE_ID = "mytodo-dom-flow-style";
  const FLOW_ROOT_ID = "mytodo-dom-flow-root";

  /** 최근 사용자 조작별 흐름 문자열을 쌓아 두고, 패널은 최대 FLOW_LOG_MAX건만 유지 */
  let domFlowEntries = [];
  /** 패널 본문 DOM을 다시 그릴 때 참조 */
  let domFlowListEl = null;
  /** 열림/닫힘 — 토글 버튼 aria와 패널 hidden 동기화 */
  let domFlowPanelOpen = false;

  /** 한 줄 체인(사용자→이벤트→함수→DOM→화면)을 화살표로 이어 붙임 */
  function formatDomFlowChain(parts) {
    return parts.join(" → ");
  }

  function renderDomFlowPanelList() {
    if (!domFlowListEl) return;
    domFlowListEl.textContent = "";
    for (let i = 0; i < domFlowEntries.length; i++) {
      const entry = domFlowEntries[i];
      const block = document.createElement("div");
      block.className = "mytodo-flow-entry";
      const title = document.createElement("div");
      title.className = "mytodo-flow-entry__title";
      title.textContent = entry.title;
      const chain = document.createElement("div");
      chain.className = "mytodo-flow-entry__chain";
      chain.textContent = entry.chain;
      block.appendChild(title);
      block.appendChild(chain);
      domFlowListEl.appendChild(block);
    }
  }

  /**
   * 강의용 흐름 로그 — 기존 핸들러 끝에서 호출만 하므로 앱 동작에는 영향 없음
   * @param {string} title 한 눈에 보는 행동 요약
   * @param {string[]} steps 순서대로 단계 라벨(내부에서 → 로 연결)
   */
  function logDomFlow(title, steps) {
    domFlowEntries.push({
      title,
      chain: formatDomFlowChain(steps),
    });
    if (domFlowEntries.length > FLOW_LOG_MAX) {
      domFlowEntries.shift();
    }
    renderDomFlowPanelList();
  }

  function setDomFlowPanelOpen(open, panel, toggleBtn) {
    domFlowPanelOpen = open;
    if (panel) panel.hidden = !open;
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
      toggleBtn.textContent = open ? "흐름 닫기" : "DOM 흐름";
    }
  }

  /** 우하단 패널·토글을 body에 붙이고 스타일 한 번만 삽입 */
  function installDomFlowPanel() {
    if (document.getElementById(FLOW_ROOT_ID)) return;

    const css = [
      "#" +
        FLOW_ROOT_ID +
        "{position:fixed;z-index:99999;bottom:max(12px,calc(88px + env(safe-area-inset-bottom,0px)));right:max(12px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:min(360px,calc(100vw - 24px));font-family:system-ui,-apple-system,'Segoe UI','Noto Sans KR',sans-serif;font-size:11px;line-height:1.45;color:#f2f2f2;}",
      "#" + FLOW_ROOT_ID + " .mytodo-flow-panel{background:rgba(22,22,28,.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 12px;box-shadow:0 8px 28px rgba(0,0,0,.35);max-height:min(320px,40vh);overflow-y:auto;overflow-x:hidden;}",
      "#" + FLOW_ROOT_ID + " .mytodo-flow-panel[hidden]{display:none!important;}",
      "#" + FLOW_ROOT_ID + " .mytodo-flow-head{margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:-.02em;color:#fff;}",
      "#" + FLOW_ROOT_ID + " .mytodo-flow-entry{padding:8px 0;border-top:1px solid rgba(255,255,255,.1);}",
      "#" + FLOW_ROOT_ID + " .mytodo-flow-entry:first-of-type{border-top:none;padding-top:0;}",
      "#" + FLOW_ROOT_ID + " .mytodo-flow-entry__title{font-weight:700;color:#9ecbff;margin-bottom:4px;font-size:11px;}",
      "#" + FLOW_ROOT_ID + " .mytodo-flow-entry__chain{word-break:break-word;color:#d0d0d8;}",
      "#" + FLOW_ROOT_ID + " .mytodo-flow-toggle{appearance:none;border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:8px 14px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;background:rgba(22,22,28,.9);color:#f2f2f2;box-shadow:0 2px 10px rgba(0,0,0,.25);}",
      "#" + FLOW_ROOT_ID + " .mytodo-flow-toggle:hover{background:rgba(40,40,48,.95);}",
      "#" + FLOW_ROOT_ID + " .mytodo-flow-toggle:focus-visible{outline:2px solid #64b5ff;outline-offset:2px;}",
    ].join("");

    const styleEl = document.createElement("style");
    styleEl.id = FLOW_STYLE_ID;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    const root = document.createElement("div");
    root.id = FLOW_ROOT_ID;
    root.setAttribute("aria-live", "polite");

    const panel = document.createElement("div");
    panel.className = "mytodo-flow-panel";
    panel.id = "mytodo-dom-flow-panel-inner";
    panel.hidden = true;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "DOM 처리 흐름 로그");

    const panelHeading = document.createElement("p");
    panelHeading.className = "mytodo-flow-head";
    panelHeading.textContent = "이벤트 → 함수 → DOM → 화면";

    domFlowListEl = document.createElement("div");
    domFlowListEl.className = "mytodo-flow-list";

    panel.appendChild(panelHeading);
    panel.appendChild(domFlowListEl);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "mytodo-flow-toggle";
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.setAttribute("aria-controls", "mytodo-dom-flow-panel-inner");
    toggleBtn.id = "mytodo-dom-flow-toggle";
    toggleBtn.textContent = "DOM 흐름";

    toggleBtn.addEventListener("click", () => {
      setDomFlowPanelOpen(!domFlowPanelOpen, panel, toggleBtn);
    });

    root.appendChild(panel);
    root.appendChild(toggleBtn);
    document.body.appendChild(root);
  }

  function boot() {
    installDomFlowPanel();

    const list = $("todo-list");
    const statTotal = $("stat-total");
    const statDone = $("stat-done");
    const statActive = $("stat-active");
    const form = $("composer-form");
    const titleInput = $("new-todo");
    const dueInput = $("new-due");
    const dueToggle = $("due-toggle");
    const dueWrap = $("due-wrap");
    const themeToggle = $("theme-toggle");
    const emptyHint = $("empty-hint");
    const clearBtn = $("clear-completed");
    const filterButtons = document.querySelectorAll(".filter-bar__btn");
    let currentFilter = "all";

    initTheme(themeToggle);

    /* 마감은 기본 숨김 — 아이콘으로만 열어 하단 한 줄 UX 유지 */
    if (dueToggle && dueWrap && dueInput) {
      dueToggle.addEventListener("click", () => {
        const willShow = dueWrap.hidden;
        dueWrap.hidden = !willShow;
        dueToggle.setAttribute("aria-expanded", willShow ? "true" : "false");
        if (willShow) {
          dueInput.focus();
          try {
            if (typeof dueInput.showPicker === "function") {
              dueInput.showPicker();
            }
          } catch {
            /* 일부 브라우저/정책에서 showPicker 실패 무시 */
          }
        }
      });
    }

    if (!list) return;

    const stored = loadTodosFromStorage();
    if (stored && stored.length) {
      todos = stored;
    } else {
      todos = defaultSeed();
    }

    renderFullList(list);
    applyFilterClassToRows(list, currentFilter);
    paintChrome(list, emptyHint, statTotal, statDone, statActive);

    list.addEventListener("change", (e) => {
      const t = e.target;
      if (!t.classList || !t.classList.contains("todo-item__check")) return;
      const row = t.closest(".todo-item");
      const id = row && row.getAttribute("data-todo-id");
      if (!id) return;
      const todo = findTodoById(id);
      if (!todo) return;
      todo.done = t.checked;
      updateRowVisual(row);
      applyFilterClassToRows(list, currentFilter);
      paintStats(statTotal, statDone, statActive, computeStats(todos));
      persistTodos();
      logDomFlow("완료 체크", [
        "사용자: 체크박스로 완료/미완료 전환",
        "이벤트: change (input.todo-item__check)",
        "함수: todo.done 반영 → updateRowVisual → applyFilterClassToRows → paintStats → persistTodos",
        "DOM: li 클래스·time·#stat-* 텍스트",
        "화면: 브라우저 페인트(리플로우)",
      ]);
    });

    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-icon--reject");
      if (!btn || !list.contains(btn)) return;
      const row = btn.closest(".todo-item");
      const id = row && row.getAttribute("data-todo-id");
      if (!id || !row) return;
      todos = todos.filter((x) => x.id !== id);
      row.remove();
      paintChrome(list, emptyHint, statTotal, statDone, statActive);
      applyFilterClassToRows(list, currentFilter);
      logDomFlow("할 일 삭제", [
        "사용자: 행의 삭제(×) 클릭",
        "이벤트: click (#todo-list 위임, .btn-icon--reject)",
        "함수: todos.filter → Element.remove → paintChrome → applyFilterClassToRows",
        "DOM: li 제거·통계·empty-hint·localStorage",
        "화면: 브라우저 페인트",
      ]);
    });

    list.addEventListener("dblclick", (e) => {
      const lab = e.target.closest(".todo-item__text");
      if (!lab || !list.contains(lab)) return;
      e.preventDefault();
      const row = lab.closest(".todo-item");
      const id = row && row.getAttribute("data-todo-id");
      if (!id) return;
      beginEditLabel(lab, list, (nextText) => {
        const todo = findTodoById(id);
        if (todo) {
          todo.text = nextText;
          persistTodos();
        }
      });
    });

    if (form && titleInput) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = typeof titleInput.value === "string" ? titleInput.value.trim() : "";
        if (!text) {
          titleInput.focus();
          return;
        }
        const dueAt = dueInputToIso(dueInput);
        todos.push({
          id: nextTodoId(),
          text,
          done: false,
          dueAt,
        });
        titleInput.value = "";
        if (dueInput) dueInput.value = "";
        titleInput.focus();
        renderFullList(list);
        applyFilterClassToRows(list, currentFilter);
        paintChrome(list, emptyHint, statTotal, statDone, statActive);
        logDomFlow("할 일 추가", [
          "사용자: 하단 고정 입력 + 제출(마감은 달력 아이콘으로 선택)",
          "이벤트: submit (composer-form, composer-dock)",
          "함수: todos.push → renderFullList → applyFilterClassToRows → paintChrome",
          "DOM: #todo-list li 재생성·통계·empty-hint·localStorage",
          "화면: 브라우저 페인트",
        ]);
      });
    }

    for (let fi = 0; fi < filterButtons.length; fi++) {
      filterButtons[fi].addEventListener("click", function () {
        const f = this.getAttribute("data-filter");
        if (!f) return;
        currentFilter = f;
        setFilterUI(currentFilter, filterButtons);
        applyFilterClassToRows(list, currentFilter);
        logDomFlow("필터 변경", [
          "사용자: 전체 / 진행 중 / 완료 탭 클릭",
          "이벤트: click (.filter-bar__btn)",
          "함수: setFilterUI → applyFilterClassToRows",
          "DOM: 각 li에 todo-item--hidden 클래스 토글",
          "화면: 브라우저 페인트",
        ]);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        todos = todos.filter((t) => !t.done);
        currentFilter = "all";
        setFilterUI("all", filterButtons);
        renderFullList(list);
        applyFilterClassToRows(list, currentFilter);
        paintChrome(list, emptyHint, statTotal, statDone, statActive);
      });
    }

    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        toggleStoredTheme(themeToggle);
      });
      subscribeOsThemeChanges(themeToggle);
    }

    window.setInterval(() => {
      const rows = list.querySelectorAll("li.todo-item");
      for (let i = 0; i < rows.length; i++) updateRowVisual(rows[i]);
    }, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
