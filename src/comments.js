import { config } from "./config.js?v=20261010-2";
const markerFor = (book) => !book || book.id === "multiversal-love" ? config.reviewMarker : `<!-- comic-review:${book.id}:${book.edition} -->`;
export function makeReviewUrl(text, book) {
  const value = text.trim();
  if (value.length < 3 || value.length > config.commentLimit)
    throw new Error("Write between 3 and 600 characters.");
  const url = new URL(`https://github.com/${config.repository}/issues/new`);
  url.searchParams.set(
    "title",
    `${config.reviewPrefix}${value.replace(/\s+/g, " ").slice(0, 65)}`,
  );
  url.searchParams.set("body", `${value}\n\n${markerFor(book)}`);
  return url.href;
}
export const isBookReview = (issue, book) =>
  !issue.pull_request &&
  issue.state === "open" &&
  typeof issue.body === "string" &&
  issue.body.includes(markerFor(book)) &&
  issue.title?.startsWith(config.reviewPrefix);
export const reviewText = (issue, book) =>
  issue.body.replaceAll(markerFor(book), "").trim();
export function initComments(canComment, getBook = () => null) {
  const $ = (id) => document.getElementById(id),
    field = $("comment");
  let busy = false,
    pageNumber = 1,
    generation = 0,
    aborter,
    rendered = new Set();
  const error = (message) => {
    $("comment-error").textContent = message;
    $("comment-error").hidden = !message;
    field.setAttribute("aria-invalid", String(Boolean(message)));
  };
  field.addEventListener("input", () => {
    $("comment-count").textContent = `${field.value.length}/600`;
    if (
      field.getAttribute("aria-invalid") === "true" &&
      field.value.trim().length >= 3
    )
      error("");
  });
  $("comment-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!canComment()) return;
    try {
      const href = makeReviewUrl(field.value, getBook());
      error("");
      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
      $("comment-status").replaceChildren(
        document.createTextNode(
          "Finish posting in the GitHub tab, then refresh here. Nothing is posted until you confirm there. ",
        ),
      );
      const fallback = link.cloneNode();
      fallback.textContent = "Open your GitHub draft";
      $("comment-status").append(fallback);
    } catch (e) {
      error(e.message);
      field.focus();
    }
  });
  function appendComment(issue) {
    if (rendered.has(issue.id)) return;
    rendered.add(issue.id);
    const card = document.createElement("article");
    card.className = "comment-card";
    const header = document.createElement("header"),
      author = document.createElement("strong"),
      date = document.createElement("time");
    author.textContent = issue.user?.login || "Reader";
    date.dateTime = issue.created_at;
    const d = new Date(issue.created_at);
    date.textContent = Number.isNaN(d.valueOf())
      ? ""
      : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(d);
    header.append(author, date);
    const text = document.createElement("p");
    text.textContent = reviewText(issue, getBook());
    const link = document.createElement("a");
    link.href = `https://github.com/${config.repository}/issues/${Number(issue.number)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Read or reply on GitHub ↗";
    card.append(header, text, link);
    $("comment-list").append(card);
  }
  async function load(reset = false) {
    if (!canComment() || (busy && !reset)) return;
    aborter?.abort();
    aborter = new AbortController();
    const ownAborter = aborter,
      request = ++generation,
      requestedPage = reset ? 1 : pageNumber;
    busy = true;
    $("refresh-comments").disabled = true;
    $("more-comments").disabled = true;
    $("comments-status").textContent = "Loading reader comments…";
    $("comment-list").setAttribute("aria-busy", "true");
    const timer = setTimeout(() => ownAborter.abort(), 15000);
    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.repository}/issues?state=open&sort=created&direction=desc&per_page=30&page=${requestedPage}`,
        {
          signal: ownAborter.signal,
          headers: { Accept: "application/vnd.github+json" },
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 403 || response.status === 429
            ? "GitHub is limiting requests. Wait a little, then refresh."
            : response.status === 404
              ? "The public comment repository isn’t available yet. Try again after publication."
              : "Comments couldn’t load. Check your connection and refresh.",
        );
      const issues = await response.json();
      if (!Array.isArray(issues))
        throw new Error("Comments couldn’t load. Please refresh.");
      if (request !== generation) return;
      if (reset) {
        $("comment-list").replaceChildren();
        rendered = new Set();
      }
      issues.filter((issue) => isBookReview(issue, getBook())).forEach(appendComment);
      const more = /<[^>]+>;\s*rel="next"/.test(
        response.headers.get("link") || "",
      );
      $("more-comments").hidden = !more;
      pageNumber = requestedPage + 1;
      $("comments-status").textContent = rendered.size
        ? `${rendered.size} reader ${rendered.size === 1 ? "comment" : "comments"} loaded.`
        : more
          ? "No reader comments in this batch. Load more to keep looking."
          : "No comments yet. Leave the first thought.";
    } catch (e) {
      if (request === generation)
        $("comments-status").textContent =
          e.name === "AbortError"
            ? "Comments took too long. Refresh to try again."
            : e.message;
    } finally {
      clearTimeout(timer);
      if (request === generation) {
        busy = false;
        $("refresh-comments").disabled = false;
        $("more-comments").disabled = false;
        $("comment-list").setAttribute("aria-busy", "false");
      }
    }
  }
  $("refresh-comments").addEventListener("click", () => load(true));
  $("more-comments").addEventListener("click", () => load());
  const drafts = new Map();
  let draftBook = null;
  return {
    refresh: () => load(true),
    reset: () => {
      aborter?.abort(); generation++; busy = false; pageNumber = 1; rendered = new Set();
      if (draftBook) drafts.set(draftBook, field.value);
      draftBook = getBook()?.id;
      field.value = drafts.get(draftBook) || "";
      $("comment-count").textContent = `${field.value.length}/600`;
      error("");
      $("comment-list").replaceChildren(); $("comments-status").textContent = "";
      $("comment-status").replaceChildren();
      $("refresh-comments").disabled = false; $("more-comments").hidden = true;
      $("comment-list").setAttribute("aria-busy", "false");
    },
  };
}
