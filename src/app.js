import {
  PAGE_COUNT,
  EDITION,
  STORAGE_KEY,
  normalizeState,
  mergeVisited,
  isComplete,
  nextUnread,
  spreadForPage,
  turnPage,
  pageFromHash,
  readSaved,
  persist,
} from "./state.js";
import { initComments } from "./comments.js";
import { initAmbience } from "./ambience.js";
const $ = (id) => document.getElementById(id);
const node = (tag, className = "", text) => {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
let storage = null;
try {
  storage = window.localStorage;
} catch {
  /* The reader also works without storage. */
}
let state = readSaved(storage),
  current = pageFromHash(location.hash) ?? state.page,
  single = matchMedia("(max-width:680px)").matches,
  textMode = false,
  book = null,
  commentsStarted = false;
let visible = new Map(),
  timeouts = [],
  lastFocus = null;
const stage = $("book-stage"),
  setAmbience = initAmbience();
const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries)
      visible.set(e.target, e.isIntersecting && e.intersectionRatio >= 0.3);
    checkOpened();
  },
  { threshold: [0, 0.3] },
);
function save() {
  const r = persist(storage, { ...state, page: current });
  state = r.state;
  $("storage-notice").hidden = r.ok;
}
function checkOpened() {
  if (
    document.visibilityState !== "visible" ||
    document.querySelector("dialog[open]")
  )
    return;
  const ids = [...visible]
    .filter(
      ([card, shown]) =>
        shown && card.isConnected && card.dataset.ready === "true",
    )
    .map(([card]) => +card.dataset.page);
  if (!ids.some((id) => !state.visited.includes(id))) return;
  state.visited = mergeVisited(state.visited, ids);
  save();
  updateProgress();
}
function updateProgress() {
  const count = state.visited.length,
    complete = isComplete(state.visited);
  $("progress").value = count;
  $("progress-label").textContent = `${count} of 80 pages opened`;
  $("lock-count").textContent =
    `${80 - count} ${80 - count === 1 ? "page" : "pages"} left to open`;
  $("next-unread").hidden = complete;
  $("comments-locked").hidden = complete;
  $("comments-open").hidden = !complete;
  if (complete && !commentsStarted) {
    commentsStarted = true;
    initComments(() => isComplete(state.visited));
  }
  for (const item of document.querySelectorAll(".contents-item"))
    updateContentsItem(item, book.pages[+item.dataset.page]);
}
function go(page, { scroll = true } = {}) {
  current = page;
  history.replaceState(null, "", `#page=${current}`);
  save();
  render();
  if (scroll)
    $("reader").scrollIntoView({ block: "start", behavior: "instant" });
}
function openUnread() {
  go(nextUnread(state.visited) ?? current);
  $("reader").focus({ preventScroll: true });
}
function openDialog(dialog, trigger) {
  lastFocus = trigger;
  dialog.showModal();
}
for (const dialog of [$("contents-dialog"), $("zoom-dialog")]) {
  dialog.addEventListener("close", () => {
    lastFocus?.focus({ preventScroll: true });
    checkOpened();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  });
}
function makePaper(end = false) {
  const paper = node("aside", `page-shell ${end ? "endpaper" : "intro"}`),
    heading = node("h2");
  paper.append(
    node("span", "eyebrow", end ? "BEYOND THE LAST FRAME" : "A SCI-FI ROMANCE"),
  );
  if (end) heading.textContent = "Some stories stay with you.";
  else
    heading.append(
      "One story.",
      document.createElement("br"),
      node("em", "", "Two worlds."),
    );
  paper.append(
    heading,
    node("div", "paper-rule"),
    node(
      "p",
      "",
      end
        ? "Take a moment. Then tell us what this one left behind."
        : "A familiar face. An impossible distance. A love that refuses to stay in one world.",
    ),
  );
  const action = node(
    "button",
    "intro-action",
    end ? "Join the conversation" : "Begin reading",
  );
  action.type = "button";
  action.append(node("span", "", "→"));
  action.addEventListener("click", () =>
    end ? $("discussion").scrollIntoView({ behavior: "smooth" }) : go(1),
  );
  paper.append(action);
  return paper;
}
function makeTranscript(page) {
  const article = node("article", "transcript");
  article.tabIndex = 0;
  article.setAttribute("aria-label", `${page.label} transcript`);
  article.append(node("h2", "", page.title));
  if (page.kind === "cover")
    article.append(
      node(
        "p",
        "",
        "Multiversal Love. The complete illustrated sci-fi romance.",
      ),
    );
  else if (page.kind === "story")
    article.append(node("p", "pdf-text", page.text));
  else
    page.panels.forEach((panel, i) => {
      article.append(
        node("h3", "", `Panel ${i + 1}`),
        node("p", "panel-description", panel.description),
      );
      for (const speech of panel.dialogue) {
        const p = node("p");
        p.append(
          node("strong", "", `${speech.speaker}: `),
          document.createTextNode(speech.text),
        );
        article.append(p);
      }
    });
  return article;
}
function makePage(id) {
  const page = book.pages[id],
    card = node("div", "page-shell");
  card.dataset.page = String(id);
  card.dataset.ready = "false";
  card.setAttribute(
    "aria-label",
    `${id ? "Page " : ""}${page.label}: ${page.title}`,
  );
  if (textMode) {
    card.append(makeTranscript(page));
    card.dataset.ready = "true";
    return card;
  }
  const image = new Image(),
    button = node("button", "page-art"),
    loading = node("div", "page-load");
  image.width = book.width;
  image.height = book.height;
  image.decoding = "async";
  image.alt = `${id ? "Page " : ""}${page.label} — ${page.title}. Use Read text for the transcript.`;
  button.type = "button";
  button.disabled = true;
  button.setAttribute(
    "aria-label",
    `Enlarge ${id ? `page ${page.label}` : "cover"}`,
  );
  loading.append(
    node("p", "", `Opening ${id ? `page ${page.label}` : "cover"}…`),
  );
  const stem = String(id).padStart(3, "0"),
    src = `assets/pages/${stem}.webp`;
  button.addEventListener("click", () => {
    const full = new Image();
    full.src = src;
    full.alt = image.alt;
    full.width = book.width;
    full.height = book.height;
    $("zoom-title").textContent = `${page.label} · ${page.title}`;
    $("zoom-content").replaceChildren(full);
    openDialog($("zoom-dialog"), button);
  });
  const failure = () => {
    if (!card.isConnected || card.dataset.ready === "true") return;
    clearTimeout(timer);
    loading.replaceChildren(
      node("p", "", "This page couldn’t open. Please try again."),
    );
    const retry = node("button", "button", "Retry page");
    retry.type = "button";
    retry.addEventListener("click", render);
    loading.append(retry);
  };
  const timer = setTimeout(failure, 25000);
  timeouts.push(timer);
  image.addEventListener("error", failure);
  image.addEventListener("load", async () => {
    try {
      await image.decode();
    } catch {
      failure();
      return;
    }
    clearTimeout(timer);
    if (!card.isConnected) return;
    card.dataset.ready = "true";
    image.classList.add("loaded");
    button.disabled = false;
    loading.remove();
    checkOpened();
  });
  image.sizes = single
    ? "(max-width:680px) 92vw, 600px"
    : "(max-width:760px) 46vw, 525px";
  image.srcset = `assets/pages/${stem}-small.webp 800w, ${src} 1600w`;
  image.src = src;
  button.append(image);
  card.append(button, loading);
  return card;
}
function render() {
  if (!book) return;
  observer.disconnect();
  visible = new Map();
  timeouts.forEach(clearTimeout);
  timeouts = [];
  const ids = single ? [current] : spreadForPage(current);
  stage.classList.toggle("single", single);
  stage.replaceChildren();
  if (!single && current === 0) stage.append(makePaper());
  for (const id of ids) {
    const card = makePage(id);
    stage.append(card);
    observer.observe(card);
  }
  if (!single && current === 79) stage.append(makePaper(true));
  const page = book.pages[current];
  setAmbience(current);
  $("scene-kicker").textContent = current
    ? `SCENE ${String(Math.ceil(current / 2)).padStart(2, "0")} / 40`
    : "OPEN THE BOOK";
  $("scene-title").textContent = page.title;
  $("page-label").textContent = current
    ? `Page${ids.length > 1 ? "s" : ""} ${ids.map((id) => String(id).padStart(2, "0")).join(" — ")} / 79`
    : "Cover";
  $("previous").disabled = current === 0;
  $("next").disabled = ids.at(-1) === 79;
  $("layout-button").textContent = single ? "Two pages" : "Single page";
  $("layout-button").setAttribute("aria-pressed", String(single));
  $("text-button").textContent = textMode ? "View artwork" : "Read text";
  $("text-button").setAttribute("aria-pressed", String(textMode));
  document.title = `${current ? `Page ${page.label}` : "Cover"} · ${page.title} — Multiversal Love`;
  updateProgress();
  const next = turnPage(current, 1, single);
  if (!textMode && next !== current)
    for (const id of single ? [next] : spreadForPage(next)) {
      const warm = new Image();
      warm.src = `assets/pages/${String(id).padStart(3, "0")}-small.webp`;
    }
}
function updateContentsItem(item, page) {
  const seen = state.visited.includes(page.id);
  item.setAttribute(
    "aria-label",
    `${page.id ? "Page " : ""}${page.label}: ${page.title}, ${seen ? "opened" : "unread"}`,
  );
  if ((single ? [current] : spreadForPage(current)).includes(page.id))
    item.setAttribute("aria-current", "page");
  else item.removeAttribute("aria-current");
  const label = item.querySelector("span");
  label.textContent = `${page.id ? "Page " : ""}${page.label}${seen ? " ✓" : ""}`;
  label.classList.toggle("seen", seen);
}
function buildContents() {
  $("contents-grid").replaceChildren(
    ...book.pages.map((page) => {
      const item = node("button", "contents-item");
      item.type = "button";
      item.dataset.page = String(page.id);
      const img = new Image();
      img.src = `assets/thumbs/${String(page.id).padStart(3, "0")}.webp`;
      img.alt = "";
      img.width = 180;
      img.height = 278;
      img.loading = "lazy";
      item.append(img, node("span"));
      updateContentsItem(item, page);
      item.addEventListener("click", () => {
        $("contents-dialog").close();
        go(page.id);
      });
      return item;
    }),
  );
}
$("previous").addEventListener("click", () =>
  go(turnPage(current, -1, single)),
);
$("next").addEventListener("click", () => go(turnPage(current, 1, single)));
$("next-unread").addEventListener("click", openUnread);
$("finish-reading").addEventListener("click", openUnread);
$("layout-button").addEventListener("click", () => {
  single = !single;
  render();
});
$("text-button").addEventListener("click", () => {
  textMode = !textMode;
  render();
});
$("contents-button").addEventListener("click", () => {
  if (book) {
    buildContents();
    openDialog($("contents-dialog"), $("contents-button"));
  }
});
$("close-contents").addEventListener("click", () =>
  $("contents-dialog").close(),
);
$("close-zoom").addEventListener("click", () => $("zoom-dialog").close());
document.addEventListener("keydown", (event) => {
  if (
    !book ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    document.querySelector("dialog[open]")
  )
    return;
  if (
    event.target.closest(
      "input,textarea,select,[contenteditable=true],.transcript",
    )
  )
    return;
  if (event.target !== document.body && !event.target.closest("#reader"))
    return;
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  go(turnPage(current, event.key === "ArrowRight" ? 1 : -1, single));
});
window.addEventListener("hashchange", () => {
  const p = pageFromHash(location.hash);
  if (p !== null) go(p);
});
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  try {
    state.visited = mergeVisited(
      state.visited,
      normalizeState(JSON.parse(event.newValue)).visited,
    );
    updateProgress();
  } catch {
    /* Ignore corrupted foreign state. */
  }
});
document.addEventListener("visibilitychange", checkOpened);
async function boot() {
  stage.replaceChildren(node("p", "loading-message", "Opening the book…"));
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("assets/book.json", {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (
      data.edition !== EDITION ||
      data.pages?.length !== PAGE_COUNT ||
      !data.pages.every((p, i) => p.id === i)
    )
      throw new Error();
    book = data;
    save();
    render();
  } catch {
    const box = node("div", "fatal-error");
    box.append(
      node("h2", "", "The book couldn’t open."),
      node(
        "p",
        "",
        "Check your connection, then try again. Your saved place is safe.",
      ),
    );
    const retry = node("button", "button", "Try again");
    retry.type = "button";
    retry.addEventListener("click", boot);
    box.append(retry);
    stage.replaceChildren(box);
  } finally {
    clearTimeout(timer);
  }
}
boot();
