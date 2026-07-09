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
  ["investment", ["funding", "investment", "valuation", "acquire", "deal", "ipo", "stock", "raises", "series a", "venture", "data center", "datacenter"]],
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
  const namedEntities = {
    nbsp: " ",
    apos: "'",
    ndash: "-",
    mdash: "-",
    lsquo: "'",
    rsquo: "'",
    ldquo: '"',
    rdquo: '"',
    hellip: "...",
  };
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => namedEntities[name] || match)
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

function truncateText(value, maxLength = 230) {
  if (value.length <= maxLength) return value;
  const boundary = value.slice(0, maxLength).search(/[。.!?][^。.!?]*$/);
  if (boundary > maxLength * 0.45) return `${value.slice(0, boundary + 1).trim()}`;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

function cleanFeedDescription(item) {
  const title = stripHtml(item.title).toLowerCase();
  const description = stripHtml(item.description)
    .replace(/\bThe post .+ appeared first on .+\.$/i, "")
    .replace(/\bRead more\.?$/i, "")
    .replace(/\s+\[[^\]]*?\]$/g, "")
    .trim();

  if (!description || description.toLowerCase() === title) {
    return "该来源没有提供足够完整的摘要，请打开原文查看详细内容。";
  }

  return truncateText(description);
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

function summaryFor(item) {
  return cleanFeedDescription(item);
}

function analysisFor(category, item) {
  const text = `${item.title} ${stripHtml(item.description)}`.toLowerCase();
  const signals = [];

  if (/(agi|artificial general intelligence|large language models just|llms just)/.test(text)) {
    signals.push("这类观点把 AGI 路线之争重新拉回训练数据和世界模型问题：只扩大文本模型，未必能补足物理世界经验。");
  }
  if (/(robotics|physical ai|robots|real-world data)/.test(text)) {
    signals.push("机器人方向的关键是用低成本数据补足真实世界采集瓶颈，游戏、仿真和交互轨迹可能成为物理 AI 的训练燃料。");
  }
  if (/(video game|simulation|training data)/.test(text)) {
    signals.push("训练数据来源从网页文本扩展到游戏和仿真环境，意味着模型公司会继续寻找更结构化、更可控的数据供给。");
  }
  if (/(shutting up|interrupt|pause|turn-taking|talking to another person)/.test(text)) {
    signals.push("语音交互的重点从“能说话”转向打断、停顿、轮次管理和实时性，这会直接影响助手在日常场景里的可用性。");
  }
  if (/(live translation|speak and listen at the same time|translation|simultaneous)/.test(text)) {
    signals.push("同听同说和实时翻译会把语音模型从聊天功能推向会议、跨语言沟通和现场协作场景。");
  }
  if (/(voice|audio|conversation|live conversations)/.test(text)) {
    signals.push("语音模型的体验差距会体现在延迟、自然停顿、噪声环境和多轮上下文保持，而不是单句生成质量。");
  }
  if (/(video remix|google photos|relighting|background|artistic styles|video)/.test(text)) {
    signals.push("消费级影像产品正在把生成式 AI 做成低门槛编辑能力，真正考验的是效果稳定性、版权边界和用户是否高频使用。");
  }
  if (/(nvidia|gpu|chip|semiconductor|cuda|nemotron|langchain)/.test(text)) {
    signals.push("芯片、模型套件和 Agent 编排框架一起出现时，重点不是单点性能，而是端到端推理成本、部署效率和生态绑定。");
  }
  if (/(government|national security|defense|policy|regulation|copyright|export)/.test(text)) {
    signals.push("政府、国安和监管相关内容会影响模型公司的销售边界、合规成本和跨境可用性。");
  }
  if (/(deepfake|hoax|detector|misinformation|security|ransomware|cyber|safety)/.test(text)) {
    signals.push("安全与真实性议题正在从原则讨论进入可执行工具，媒体、平台和企业需要更快识别合成内容与自动化攻击。");
  }
  if (/(funding|investment|valuation|deal|acquire|data center|datacenter|infrastructure)/.test(text)) {
    signals.push("资本与基础设施信号要和现金流、电力、算力利用率一起看，热度本身不等于可持续商业回报。");
  }
  if (/(grok|xai|openai|claude|gemini|model|llm|benchmark|reasoning)/.test(text)) {
    signals.push("模型新闻需要结合价格、延迟、上下文、工具调用和真实任务稳定性评估，单一榜单不足以判断产品竞争力。");
  }

  const categoryFallbacks = {
    models: "这条新闻属于模型与产品能力信号，后续重点是它能否带来开发者迁移、企业采用或明确的成本优势。",
    research: "这条新闻属于技术路线信号，后续重点是可复现性、工程成本和是否能被开源或商业系统快速吸收。",
    business: "这条新闻属于商业化信号，后续重点是它是否进入高频工作流，并形成稳定付费或留存。",
    investment: "这条新闻属于资本与基础设施信号，后续重点是投入规模、成本压力和真实需求是否匹配。",
    chips: "这条新闻属于算力供应链信号，后续重点是训练/推理成本、供给稳定性和生态兼容性。",
    safety: "这条新闻属于安全治理信号，后续重点是风险是否可量化、工具是否能落地、平台是否会跟进规则。",
    policy: "这条新闻属于监管与公共部门信号，后续重点是政策是否进入执行层面，以及对企业采购和模型发布的影响。",
  };

  return (signals[0] || categoryFallbacks[category] || categoryFallbacks.business);
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
    summary: summaryFor(item),
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
