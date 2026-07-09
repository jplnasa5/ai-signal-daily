const categories = [
  { id: "all", label: "全部" },
  { id: "models", label: "大模型" },
  { id: "research", label: "技术" },
  { id: "business", label: "商业" },
  { id: "investment", label: "投资" },
  { id: "chips", label: "芯片" },
  { id: "safety", label: "安全" },
  { id: "policy", label: "监管" },
];

const state = {
  edition: null,
  category: "all",
  query: "",
};

const el = (id) => document.getElementById(id);

function formatTime(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function impactLabel(impact) {
  return impact === "high" ? "高影响" : impact === "medium" ? "中影响" : "观察";
}

function sourceName(story) {
  return story.source?.name || story.sourceName || "Source";
}

function renderMeta() {
  const edition = state.edition;
  el("edition-date").textContent = edition.editionDate || "--";
  el("update-window").textContent = `${formatTime(edition.windowStart)} - ${formatTime(edition.windowEnd)}`;
  el("daily-summary").textContent = edition.summary;

  const metrics = [
    ["stories", "重点新闻"],
    ["sources", "来源覆盖"],
    ["xSignals", "X 热点"],
    ["investmentMentions", "投资/商业信号"],
  ];

  el("metric-strip").innerHTML = metrics
    .map(([key, label]) => {
      const value = edition.metrics?.[key] ?? 0;
      return `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`;
    })
    .join("");
}

function renderKeylines() {
  el("keylines").innerHTML = (state.edition.keylines || [])
    .map(
      (line) => `
        <article class="keyline">
          <strong>${line.title}</strong>
          <p>${line.text}</p>
        </article>
      `,
    )
    .join("");
}

function renderTabs() {
  el("filter-tabs").innerHTML = categories
    .map(
      (category) => `
        <button type="button" role="tab" aria-selected="${state.category === category.id}" data-category="${category.id}">
          ${category.label}
        </button>
      `,
    )
    .join("");

  el("filter-tabs").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      renderTabs();
      renderStories();
    });
  });
}

function matchesStory(story) {
  const categoryMatch = state.category === "all" || story.category === state.category;
  const query = state.query.trim().toLowerCase();
  if (!query) return categoryMatch;
  const haystack = [
    story.title,
    story.summary,
    story.analysis,
    story.category,
    story.source?.name,
    ...(story.tags || []),
  ]
    .join(" ")
    .toLowerCase();
  return categoryMatch && haystack.includes(query);
}

function renderStories() {
  const stories = (state.edition.stories || []).filter(matchesStory);

  if (!stories.length) {
    el("story-list").innerHTML = `<div class="empty-state">没有匹配的新闻，换个关键词或分类试试。</div>`;
    return;
  }

  el("story-list").innerHTML = stories
    .map((story, index) => {
      const tags = (story.tags || []).map((tag) => `<span class="tag">${tag}</span>`).join("");
      const link = story.url || "#";
      return `
        <article class="story-card">
          <div class="story-rank">
            <span class="rank-number">${String(index + 1).padStart(2, "0")}</span>
            <span class="impact ${story.impact || "low"}">${impactLabel(story.impact)}</span>
            <span>${story.categoryLabel || story.category}</span>
          </div>
          <div class="story-body">
            <div class="story-meta">
              <span>${sourceName(story)}</span>
              <span>${formatTime(story.publishedAt)}</span>
              <span>${story.region || "Global"}</span>
            </div>
            <h3><a href="${link}" target="_blank" rel="noreferrer">${story.title}</a></h3>
            <p class="story-summary"><strong>摘要</strong>${story.summary}</p>
            <p class="analysis"><strong>看点</strong>${story.analysis}</p>
            <div class="tag-row">${tags}</div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTrends() {
  el("x-trends").innerHTML = (state.edition.xTrends || [])
    .map(
      (trend) => `
        <article class="trend">
          <div class="trend-top">
            <strong><a href="${trend.url || "https://x.com/search"}" target="_blank" rel="noreferrer">${trend.topic}</a></strong>
            <span class="heat">${trend.heat}</span>
          </div>
          <p>${trend.signal}</p>
          <span class="tag">${trend.category}</span>
        </article>
      `,
    )
    .join("");
}

function renderBriefings() {
  el("briefings").innerHTML = (state.edition.briefings || [])
    .map(
      (brief) => `
        <article class="briefing">
          <strong>${brief.title}</strong>
          <p>${brief.text}</p>
        </article>
      `,
    )
    .join("");
}

function renderWatchlist() {
  el("watchlist").innerHTML = (state.edition.watchlist || [])
    .map((item) => `<li>${item}</li>`)
    .join("");
}

function renderSources() {
  el("source-grid").innerHTML = (state.edition.sources || [])
    .map(
      (source) => `
        <article class="source">
          <strong>${source.name}</strong>
          <span>${source.type} · ${source.region}</span>
          <p><a href="${source.url}" target="_blank" rel="noreferrer">查看来源</a></p>
        </article>
      `,
    )
    .join("");
}

function render() {
  renderMeta();
  renderKeylines();
  renderTabs();
  renderStories();
  renderTrends();
  renderBriefings();
  renderWatchlist();
  renderSources();
}

async function loadEdition() {
  try {
    const response = await fetch("data/current.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.edition = await response.json();
    render();
  } catch (error) {
    el("story-list").innerHTML = `
      <div class="empty-state">
        日报数据暂时不可用。请确认已生成 data/current.json，并通过本地服务或部署环境访问页面。
      </div>
    `;
    console.error(error);
  }
}

function initTheme() {
  const stored = localStorage.getItem("ai-signal-theme");
  if (stored) document.documentElement.dataset.theme = stored;

  el("theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = current;
    localStorage.setItem("ai-signal-theme", current);
  });
}

function initSearch() {
  el("search-input").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderStories();
  });
}

initTheme();
initSearch();
loadEdition();
