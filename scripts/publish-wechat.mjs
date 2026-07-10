#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const editionPath = path.join(rootDir, "data", "current.json");
const appId = process.env.WECHAT_APP_ID;
const appSecret = process.env.WECHAT_APP_SECRET;
const publishMode = (process.env.WECHAT_PUBLISH_MODE || "draft").toLowerCase();
const coverPath = path.resolve(
  rootDir,
  process.env.WECHAT_COVER_IMAGE || "assets/signal-map.png",
);

if (!appId || !appSecret) {
  console.log("Missing WECHAT_APP_ID or WECHAT_APP_SECRET. Skipping WeChat publish.");
  process.exit(0);
}

if (!["draft", "publish"].includes(publishMode)) {
  throw new Error('WECHAT_PUBLISH_MODE must be either "draft" or "publish".');
}

const edition = JSON.parse(await fs.readFile(editionPath, "utf8"));
const article = buildArticle(edition);

if (process.env.WECHAT_DRY_RUN === "true") {
  console.log(`WeChat dry run: ${article.title}`);
  console.log(`Prepared ${edition.stories.slice(0, 10).length} stories and ${article.content.length} HTML characters.`);
  process.exit(0);
}

const accessToken = await getAccessToken();
const thumbMediaId = await uploadCover(accessToken);
const draftMediaId = await createDraft(accessToken, { ...article, thumbMediaId });

console.log(`WeChat draft created: ${draftMediaId}`);

if (publishMode === "publish") {
  const publishId = await publishDraft(accessToken, draftMediaId);
  console.log(`WeChat publish submitted: ${publishId}`);
} else {
  console.log("WeChat publish mode is draft. Review the article in the Official Account backend before publishing.");
}

function buildArticle(daily) {
  const stories = daily.stories.slice(0, 10);
  const date = formatDate(daily.editionDate);
  const keylines = daily.keylines.slice(0, 3);
  const content = [
    `<p><strong>AI Signal Daily · ${date}</strong></p>`,
    "<p>过去 24 小时，AI 产业的高影响信号集中在模型、产品、商业化、算力与监管。以下为今日值得跟进的精选新闻。</p>",
    "<h2>今日主线</h2>",
    "<ol>",
    ...keylines.map((line) => `<li><strong>${escapeHtml(line.title)}</strong><br>${escapeHtml(line.text)}</li>`),
    "</ol>",
    "<h2>精选新闻</h2>",
    ...stories.flatMap((story, index) => [
      `<h3>${String(index + 1).padStart(2, "0")} · ${escapeHtml(story.title)}</h3>`,
      `<p><strong>来源：</strong>${escapeHtml(story.source.name)} &nbsp; <strong>领域：</strong>${escapeHtml(story.categoryLabel)}</p>`,
      `<p><strong>摘要：</strong>${escapeHtml(story.summary)}</p>`,
      `<p><strong>看点：</strong>${escapeHtml(story.analysis)}</p>`,
    ]),
    "<h2>接下来关注</h2>",
    "<ul>",
    ...daily.watchlist.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`),
    "</ul>",
    "<p>本文由 AI Signal Daily 自动聚合整理；新闻标题与摘要均保留原始来源信息，判断仅供研究参考。</p>",
  ].join("");

  return {
    title: `AI 信号日报｜${date}`,
    digest: `过去 24 小时 AI 新闻精选：${keylines.map((line) => line.title).join("、")}`.slice(0, 120),
    content,
  };
}

function formatDate(value) {
  const [year, month, day] = value.split("-");
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getAccessToken() {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);
  const payload = await requestJson(url);
  return payload.access_token;
}

async function uploadCover(accessToken) {
  const cover = await fs.readFile(coverPath);
  const form = new FormData();
  form.append(
    "media",
    new Blob([cover], { type: contentTypeFor(coverPath) }),
    path.basename(coverPath),
  );

  const url = new URL("https://api.weixin.qq.com/cgi-bin/material/add_material");
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("type", "image");
  const payload = await requestJson(url, { method: "POST", body: form });
  if (!payload.media_id) throw new Error("WeChat did not return a cover media_id.");
  return payload.media_id;
}

async function createDraft(accessToken, article) {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/draft/add");
  url.searchParams.set("access_token", accessToken);
  const payload = await requestJson(url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      articles: [
        {
          title: article.title,
          author: process.env.WECHAT_AUTHOR || "AI Signal Daily",
          digest: article.digest,
          content: article.content,
          content_source_url: process.env.WECHAT_SOURCE_URL || "",
          thumb_media_id: article.thumbMediaId,
          need_open_comment: 0,
          only_fans_can_comment: 0,
        },
      ],
    }),
  });
  if (!payload.media_id) throw new Error("WeChat did not return a draft media_id.");
  return payload.media_id;
}

async function publishDraft(accessToken, mediaId) {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/freepublish/submit");
  url.searchParams.set("access_token", accessToken);
  const payload = await requestJson(url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ media_id: mediaId }),
  });
  if (!payload.publish_id) throw new Error("WeChat did not return a publish_id.");
  return payload.publish_id;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errcode) {
    throw new Error(
      `WeChat API request failed: ${payload.errcode ?? response.status} ${payload.errmsg ?? response.statusText}`,
    );
  }
  return payload;
}

function contentTypeFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}
