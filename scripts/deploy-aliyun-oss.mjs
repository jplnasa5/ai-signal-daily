#!/usr/bin/env node

import { createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import { extname, join, relative } from "node:path";
import { request } from "node:https";

const DEFAULT_DEPLOY_PATHS = ["index.html", "assets", "data"];

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

const requiredEnv = [
  "ALIYUN_ACCESS_KEY_ID",
  "ALIYUN_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_ENDPOINT",
];

const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  const message = `Missing Aliyun OSS env vars: ${missingEnv.join(", ")}`;
  if (process.env.ALIYUN_OSS_REQUIRED === "true") {
    throw new Error(message);
  }

  console.log(`${message}. Skipping Aliyun OSS deploy.`);
  process.exit(0);
}

const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
const securityToken =
  process.env.ALIYUN_OSS_SECURITY_TOKEN || process.env.ALIYUN_SECURITY_TOKEN || "";
const bucket = process.env.ALIYUN_OSS_BUCKET;
const endpoint = normalizeEndpoint(process.env.ALIYUN_OSS_ENDPOINT);
const prefix = normalizePrefix(process.env.ALIYUN_OSS_PREFIX || "");
const deployPaths = parseDeployPaths(process.env.ALIYUN_OSS_DEPLOY_PATHS);

const files = await collectFiles(process.cwd(), deployPaths);

if (files.length === 0) {
  throw new Error(`No files found for deploy paths: ${deployPaths.join(", ")}`);
}

console.log(`Deploying ${files.length} files to oss://${bucket}/${prefix}`);

for (const file of files) {
  const relativePath = toPosixPath(relative(process.cwd(), file));
  const objectKey = prefix ? `${prefix}/${relativePath}` : relativePath;
  await uploadFile(file, objectKey);
  console.log(`Uploaded ${objectKey}`);
}

console.log("Aliyun OSS deploy complete.");

function parseDeployPaths(value) {
  if (!value) {
    return DEFAULT_DEPLOY_PATHS;
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeEndpoint(value) {
  return value.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function normalizePrefix(value) {
  return value.replace(/^\/+|\/+$/g, "");
}

async function collectFiles(root, paths) {
  const output = [];

  for (const path of paths) {
    const absolutePath = join(root, path);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat) {
      console.warn(`Deploy path not found, skipping: ${path}`);
      continue;
    }

    if (stat.isFile()) {
      output.push(absolutePath);
    } else if (stat.isDirectory()) {
      await walkDirectory(absolutePath, output);
    }
  }

  return output.sort();
}

async function walkDirectory(directory, output) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(absolutePath, output);
    } else if (entry.isFile()) {
      output.push(absolutePath);
    }
  }
}

async function uploadFile(file, objectKey) {
  const body = await fs.readFile(file);
  const contentType = getContentType(file);
  const date = new Date().toUTCString();
  const headers = {
    "Cache-Control": getCacheControl(objectKey),
    "Content-Length": body.length,
    "Content-Type": contentType,
    Date: date,
    "x-oss-object-acl": "public-read",
  };

  if (securityToken) {
    headers["x-oss-security-token"] = securityToken;
  }

  headers.Authorization = signRequest({
    method: "PUT",
    contentType,
    date,
    headers,
    objectKey,
  });

  await putObject(objectKey, headers, body);
}

function getContentType(file) {
  return MIME_TYPES.get(extname(file).toLowerCase()) || "application/octet-stream";
}

function getCacheControl(objectKey) {
  if (
    objectKey.endsWith("index.html") ||
    objectKey.startsWith("data/") ||
    objectKey.includes("/data/")
  ) {
    return "no-cache, max-age=0, must-revalidate";
  }

  if (objectKey.endsWith(".css") || objectKey.endsWith(".js")) {
    return "public, max-age=300, must-revalidate";
  }

  return "public, max-age=86400";
}

function signRequest({ method, contentType, date, headers, objectKey }) {
  const canonicalizedOSSHeaders = Object.entries(headers)
    .filter(([name]) => name.toLowerCase().startsWith("x-oss-"))
    .sort(([left], [right]) => left.toLowerCase().localeCompare(right.toLowerCase()))
    .map(([name, value]) => `${name.toLowerCase()}:${String(value).trim()}\n`)
    .join("");

  const canonicalizedResource = `/${bucket}/${objectKey}`;
  const stringToSign = [
    method,
    "",
    contentType,
    date,
  ].join("\n") + `\n${canonicalizedOSSHeaders}${canonicalizedResource}`;

  const signature = createHmac("sha1", accessKeySecret)
    .update(stringToSign, "utf8")
    .digest("base64");

  return `OSS ${accessKeyId}:${signature}`;
}

function putObject(objectKey, headers, body) {
  const options = {
    hostname: `${bucket}.${endpoint}`,
    method: "PUT",
    path: `/${encodeObjectKey(objectKey)}`,
    headers,
    timeout: 30000,
  };

  return new Promise((resolve, reject) => {
    const req = request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(
            new Error(
              `OSS PUT ${objectKey} failed with ${res.statusCode}: ${responseBody}`,
            ),
          );
        }
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`OSS PUT ${objectKey} timed out`));
    });
    req.on("error", reject);
    req.end(body);
  });
}

function encodeObjectKey(objectKey) {
  return objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function toPosixPath(value) {
  return value.split("\\").join("/");
}
