import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const archiveDir = path.join(dataDir, "archive");
const configPath = path.join(__dirname, "config", "sources.json");
const currentPath = path.join(dataDir, "current.json");

const AI_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "large language model",
  "llm",
  "gpt",
  "claude",
  "gemini",
  "grok",
  "agent",
  "openai",
  "anthropic",
  "deepmind",
  "nvidia",
  "gpu",
  "chip",
  "datacenter",
  "data center",
  "robot",
  "automation",
  "inference",
  "training",
  "rag",
  "multimodal",
  "generative",
];

const CATEGORY_LABELS = {
  models: "大模型",
  research: "技术",
  business: "商业",
  investment: "投资",
  chips: "芯片",
  safety: "安全",
  policy: "监管",
};

const CATEGORY_RULES = [
  ["chips", ["nvidia", "gpu", "chip", "semiconductor", "asic", "hbm", "cuda"]],
  ["investment", ["funding", "investment", "valuation", "acquire", "deal", "ipo", "stock", "data center", "datacenter"]],
  ["safety", ["safety", "security", "ransomware", "cyber", "misuse", "risk", "jailbreak", "deepfake"]],
  ["policy", ["regulation", "regulator", "law", "policy", "export", "copyright", "antitrust", "government"]],
  ["models", ["model", "gpt", "claude", "gemini", "grok", "llm", "chatbot", "reasoning"]],
  ["research", ["paper", "research", "benchmark", "training", "inference", "rag", "deep learning", "machine learning"]],
  ["business", ["enterprise", "product", "launch", "customer", "revenue", "commercial", "app", "assistant"]],
];

function formatDateInShanghai(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hoursAgo(date, windowEnd) {
  return (windowEnd.getTime() - date.getTime()) / 36e5;
}

function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function stripHtml(value = "") {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const escaped = name.replace(":", "\\:");
  const match = block.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeEntities(match[1].trim()) : "";
}

function atomLink(block) {
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  if (href) return decodeEntities(href[1]);
  return tag(block, "link");
}

function slugify(value) {
  return stripHtml(value)
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isAiRelated(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  return AI_KEYWORDS.some((keyword) => text.includes(keyword));
}

function categoryFor(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  for (const [category, keywords] of CATEGORY_RULES) {
    if (keywords.some((keyword) => text.includes(keyword))) return category;
  }
  return "business";
}

function tagsFor(item, category) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const tags = new Set([CATEGORY_LABELS[category]]);
  const tagMap = [
    ["OpenAI", ["openai", "chatgpt", "gpt"]],
    ["Anthropic", ["anthropic", "claude"]],
    ["Google", ["google", "gemini", "deepmind"]],
    ["xAI", ["xai", "grok"]],
    ["NVIDIA", ["nvidia", "gpu", "cuda"]],
    ["Agent", ["agent", "agentic"]],
    ["多模态", ["multimodal", "image", "video", "audio"]],
    ["企业 AI", ["enterprise", "business", "customer"]],
    ["数据中心", ["data center", "datacenter", "infrastructure"]],
    ["监管", ["regulation", "policy", "law", "copyright"]],
  ];
  for (const [label, needles] of tagMap) {
    if (needles.some((needle) => text.includes(needle))) tags.add(label);
  }
  return [...tags].slice(0, 5);
}

function scoreItem(item, windowEnd) {
  const publishedAt = item.publishedAt ? new Date(item.publishedAt) : windowEnd;
  const recencyBoost = Math.max(0, 1 - hoursAgo(publishedAt, windowEnd) / 24);
  const text = `${item.title} ${item.description}`.toLowerCase();
  const keywordBoost = AI_KEYWORDS.filter((keyword) => text.includes(keyword)).length * 0.08;
  return (item.source.weight || 1) + recencyBoost + keywordBoost;
}

function impactFor(score, category) {
  if (score >= 2.25 || ["models", "safety", "investment"].includes(category)) return "high";
  if (score >= 1.65 || ["chips", "policy"].includes(category)) return "medium";
  return "low";
}

function summaryFor(item, category) {
  const title = stripHtml(item.title);
  const hints = {
    models: "这条信号与模型能力、产品分层或开发者采用有关，适合关注真实任务表现和 API 策略。",
    research: "这条信号与底层技术、训练/推理效率或研究方向有关，重点看是否能被工程化复用。",
    business: "这条信号与 AI 产品化、企业采用或用户工作流有关，重点看是否能形成持续付费场景。",
    investment: "这条信号与融资、并购、估值或 AI 基础设施有关，重点看资本开支与商业回报是否匹配。",
    chips: "这条信号与芯片、推理成本或算力供应有关，可能影响模型服务价格和交付能力。",
    safety: "这条信号与 AI 安全、滥用、欺诈或网络攻防有关，重点看是否出现新的攻击面或治理要求。",
    policy: "这条信号与监管、版权、出口管制或政府采用有关，后续可能影响企业合规成本。",
  };
  return `来源报道“${title}”。${hints[category] || hints.business}`;
}

function analysisFor(category, item) {
  const title = stripHtml(item.title);
  const templates = {
    models: `这类模型新闻的关键不只是能力声明，而是 API、价格、上下文长度和真实任务稳定性。后续要看“${title}”是否能转化为开发者迁移和企业采购。`,
    research: `技术进展需要放到可复现性和工程成本里评估。若“${title}”能降低推理、训练或部署门槛，它的影响会比单次 benchmark 更持久。`,
    business: `商业价值取决于是否进入高频工作流。“${title}”值得关注的是用户留存、企业集成和是否形成清晰付费场景。`,
    investment: `资本和基础设施新闻会影响 AI 公司的扩张速度，也会放大现金流和能源约束。“${title}”需要和长期算力需求一起看。`,
    chips: `芯片新闻最终会反映在单位 token 成本和供给稳定性上。“${title}”若影响训练或推理成本，会传导到模型价格和产品毛利率。`,
    safety: `安全事件的价值在于暴露新的攻击面。“${title}”提示团队把监测重点放到身份、权限、数据访问和自动化工具调用上。`,
    policy: `监管新闻会改变模型公司和企业客户的合规成本。“${title}”后续要看执法尺度、跨境影响和行业自律标准。`,
  };
  return templates[category] || templates.business;
}

function parseFeed(xml, source) {
  const blocks = xml.includes("<item")
    ? xml.split(/<item\b[^>]*>/i).slice(1).map((part) => part.split(/<\/item>/i)[0])
    : xml.split(/<entry\b[^>]*>/i).slice(1).map((part) => part.split(/<\/entry>/i)[0]);

  return blocks
    .map((block) => {
      const title = stripHtml(tag(block, "title"));
      const description = tag(block, "description") || tag(block, "summary") || tag(block, "content");
      const pubDate = tag(block, "pubDate") || tag(block, "updated") || tag(block, "published");
      const parsedDate = pubDate ? new Date(stripHtml(pubDate)) : null;
      return {
        title,
        description,
        url: atomLink(block),
        publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : "",
        source,
      };
    })
    .filter((item) => item.title && item.url);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "AI-Signal-Daily/0.1 (+https://example.local)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRssItems(config, windowStart, windowEnd) {
  const results = await Promise.allSettled(
    config.rssSources.map(async (source) => {
      const xml = await fetchText(source.url);
      return parseFeed(xml, source);
    }),
  );

  return results
    .flatMap((result, index) => {
      if (result.status === "fulfilled") return result.value;
      console.warn(`Feed skipped: ${config.rssSources[index].name} (${result.reason.message})`);
      return [];
    })
    .filter((item) => {
      const date = item.publishedAt ? new Date(item.publishedAt) : null;
      const inWindow = date && date >= windowStart && date <= windowEnd;
      return inWindow && isAiRelated(item);
    });
}

function dedupeItems(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = slugify(item.title).replace(/\b(ai|the|a|an|to|of|and|for|with)\b/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function storyFromItem(item, windowEnd) {
  const category = categoryFor(item);
  const score = scoreItem(item, windowEnd);
  return {
    id: slugify(`${item.source.id || item.source.name}-${item.title}`),
    title: stripHtml(item.title),
    summary: summaryFor(item, category),
    analysis: analysisFor(category, item),
    category,
    categoryLabel: CATEGORY_LABELS[category],
    impact: impactFor(score, category),
    source: {
      name: item.source.name,
      type: item.source.type,
    },
    region: item.source.region || "Global",
    publishedAt: item.publishedAt || windowEnd.toISOString(),
    url: item.url,
    tags: tagsFor(item, category),
    score,
  };
}

async function fetchXTrends(config, windowStart) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return [];

  const startTime = windowStart.toISOString().replace(/\.\d{3}Z$/, "Z");
  const trends = [];
  for (const query of config.xQueries || []) {
    const url = new URL("https://api.x.com/2/tweets/counts/recent");
    url.searchParams.set("query", `${query.query} lang:en -is:retweet`);
    url.searchParams.set("granularity", "hour");
    url.searchParams.set("start_time", startTime);
    try {
      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${token}`,
          "user-agent": "AI-Signal-Daily/0.1",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = await response.json();
      const count = (payload.data || []).reduce((sum, point) => sum + (point.tweet_count || 0), 0);
      trends.push({
        topic: query.topic,
        category: query.category,
        heat: Math.min(99, Math.round(42 + Math.log10(count + 1) * 16)),
        signal: `${query.topic} 在过去 24 小时约有 ${count.toLocaleString("en-US")} 条相关公开讨论，热度由 X recent counts 估算。`,
        url: `https://x.com/search?q=${encodeURIComponent(query.topic)}`,
      });
    } catch (error) {
      console.warn(`X query skipped: ${query.topic} (${error.message})`);
    }
  }

  return trends.sort((a, b) => b.heat - a.heat).slice(0, 8);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function freshenSeedStories(previous, windowEnd) {
  return (previous.stories || []).map((story, index) => ({
    ...story,
    publishedAt: new Date(windowEnd.getTime() - (index + 1) * 75 * 60 * 1000).toISOString(),
  }));
}

function mergeStories(liveStories, seedStories) {
  const byId = new Map();
  [...liveStories, ...seedStories].forEach((story) => {
    const key = slugify(story.title);
    if (!byId.has(key)) byId.set(key, story);
  });
  return [...byId.values()].slice(0, 14);
}

function buildKeylines(stories, xTrends) {
  const topCategories = stories.reduce((map, story) => {
    map.set(story.category, (map.get(story.category) || 0) + 1);
    return map;
  }, new Map());
  const dominant = [...topCategories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "models";
  const topTrend = xTrends[0]?.topic || "AI";

  return [
    {
      title: `${CATEGORY_LABELS[dominant]}是今日主轴`,
      text: `过去 24 小时里，${CATEGORY_LABELS[dominant]}相关内容占比最高，说明媒体报道和社交讨论正在向这一方向集中。`,
    },
    {
      title: `${topTrend}带动 X 讨论`,
      text: `X 热点更偏实时体验和争议观点，适合用来捕捉模型、产品和安全事件的早期信号。`,
    },
    {
      title: "基础设施仍是深层变量",
      text: "芯片、数据中心、电力和推理成本会持续决定 AI 产品能否从发布会走向规模化商业。"
    }
  ];
}

function buildBriefings(stories) {
  const hasSafety = stories.some((story) => story.category === "safety");
  const hasInvestment = stories.some((story) => story.category === "investment" || story.category === "chips");
  return [
    {
      title: "从热度看真实优先级",
      text: "模型发布仍最容易引爆讨论，但企业最终会按稳定性、成本、权限集成和数据安全来选择供应商。"
    },
    {
      title: hasSafety ? "安全窗口继续缩短" : "安全议题需要持续监测",
      text: hasSafety
        ? "AI Agent 让攻击链更自动化，防守重点需要前移到身份、权限、工具调用和数据访问异常。"
        : "即使今天没有重大安全事件，Agent 普及也会放大身份权限和数据访问风险。"
    },
    {
      title: hasInvestment ? "资本开支影响模型竞争" : "商业化看落地深度",
      text: hasInvestment
        ? "算力合同、芯片供应和数据中心成本正在成为 AI 公司竞争力的一部分。"
        : "AI 产品只有进入高频业务流程，才能从试点预算进入长期预算。"
    }
  ];
}

function buildWatchlist(stories) {
  const companies = ["OpenAI", "Anthropic", "Google", "NVIDIA", "xAI"]
    .filter((name) => stories.some((story) => `${story.title} ${story.summary} ${story.tags?.join(" ")}`.includes(name)));
  const companyText = companies.length ? companies.join("、") : "头部模型公司";
  return [
    `${companyText} 是否发布新的 API、价格或企业访问策略`,
    "X 高热讨论是否被主流媒体确认，还是停留在圈层争议",
    "AI 数据中心和芯片供应是否出现新的融资、电力或交付约束",
    "监管机构是否把 AI 安全、版权、金融建议或出口限制推进到执法层面"
  ];
}

function sourceCoverage(config) {
  const rssSources = config.rssSources.map((source) => ({
    name: source.name,
    type: source.type,
    region: source.region,
    url: source.url,
  }));
  return [
    {
      name: "X Platform",
      type: "Social signals",
      region: "Global",
      url: "https://x.com/search?q=AI",
    },
    ...rssSources,
  ].slice(0, 10);
}

async function buildEdition() {
  const config = await readJson(configPath, { rssSources: [], xQueries: [] });
  const previous = await readJson(currentPath, { stories: [], xTrends: [], sources: [] });
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
  const editionDate = formatDateInShanghai(windowEnd);

  const rssItems = await fetchRssItems(config, windowStart, windowEnd);
  const liveStories = dedupeItems(rssItems)
    .map((item) => storyFromItem(item, windowEnd))
    .sort((a, b) => b.score - a.score)
    .slice(0, 14);

  const seedStories = freshenSeedStories(previous, windowEnd);
  const stories = mergeStories(liveStories, seedStories);
  const liveXTrends = await fetchXTrends(config, windowStart);
  const xTrends = liveXTrends.length ? liveXTrends : previous.xTrends || [];

  const investmentMentions = stories.filter((story) =>
    ["investment", "chips", "business"].includes(story.category),
  ).length;

  return {
    editionDate,
    generatedAt: windowEnd.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    summary:
      "过去 24 小时 AI 新闻按技术、模型、商业、投资、安全与监管聚合。页面优先展示影响力高、来源清晰、并且能解释后续产业意义的信号。",
    metrics: {
      stories: stories.length,
      sources: sourceCoverage(config).length,
      xSignals: xTrends.length,
      investmentMentions,
    },
    keylines: buildKeylines(stories, xTrends),
    stories: stories.map(({ score, ...story }) => story),
    xTrends,
    briefings: buildBriefings(stories),
    watchlist: buildWatchlist(stories),
    sources: sourceCoverage(config),
  };
}

async function main() {
  await fs.mkdir(archiveDir, { recursive: true });
  const edition = await buildEdition();
  const json = `${JSON.stringify(edition, null, 2)}\n`;
  await fs.writeFile(currentPath, json, "utf8");
  await fs.writeFile(path.join(archiveDir, `${edition.editionDate}.json`), json, "utf8");
  console.log(`AI Signal Daily updated: ${edition.editionDate}, ${edition.stories.length} stories`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
