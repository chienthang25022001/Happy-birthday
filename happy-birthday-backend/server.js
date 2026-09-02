"use strict";

/**
 * Happy Birthday Memory Book - automatic media backend
 *
 * Put ORIGINAL files in ./media-original (subfolders are allowed).
 * The server automatically creates browser-friendly files in ./media-optimized:
 *   images -> WebP (max 1600px, auto-rotated)
 *   videos -> MP4 H.264/AAC (max 1280px, fast-start)
 *
 * Originals are never modified or deleted.
 */

const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { URL } = require("url");

let sharp;
let chokidar;
let ffmpegStatic;

try { sharp = require("sharp"); } catch {}
try { chokidar = require("chokidar"); } catch {}
try { ffmpegStatic = require("ffmpeg-static"); } catch {}

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const FRONTEND_ROOT = path.resolve(ROOT, "..", "frontend");
const STORY_FILE = path.join(ROOT, "story.json");
const RAW_ROOT = path.join(ROOT, "media-original");
const OPT_ROOT = path.join(ROOT, "media-optimized");
const OPT_IMAGES = path.join(OPT_ROOT, "images");
const OPT_VIDEOS = path.join(OPT_ROOT, "videos");
const MANIFEST_FILE = path.join(OPT_ROOT, "manifest.json");

const IMAGE_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif",
  ".gif", ".bmp", ".tif", ".tiff", ".dng"
]);

const VIDEO_EXTS = new Set([
  ".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".wmv", ".flv",
  ".mpeg", ".mpg", ".mts", ".m2ts", ".3gp", ".3g2", ".ts", ".vob", ".ogv"
]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const state = {
  processing: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
  currentFile: null,
  converted: 0,
  reused: 0,
  skipped: 0,
  total: 0,
  manifest: { items: [] }
};

let processingPromise = null;
let rebuildTimer = null;

function log(...args) {
  console.log(`[${new Date().toLocaleTimeString()}]`, ...args);
}

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

function safeName(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "media";
}

function shortHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function ffmpegPath() {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  return process.env.FFMPEG_PATH || "ffmpeg";
}

async function ensureDirs() {
  await Promise.all([
    fsp.mkdir(RAW_ROOT, { recursive: true }),
    fsp.mkdir(OPT_IMAGES, { recursive: true }),
    fsp.mkdir(OPT_VIDEOS, { recursive: true })
  ]);
}

async function walk(dir, base = dir) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
  catch { return []; }

  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(absolute, base));
    else if (entry.isFile()) out.push({ absolute, relative: path.relative(base, absolute) });
  }
  return out;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, "utf8")); }
  catch { return fallback; }
}

async function readStoryConfig() {
  return readJson(STORY_FILE, {
    bookTitle: "Happy Birthday!",
    subtitle: "Những kỷ niệm dành riêng cho em.",
    finalTitle: "HAPPY BIRTHDAY",
    finalMessage: "Chúc em tuổi 25 thật rực rỡ.",
    videoEvery: 5,
    chapters: [],
    wishes: []
  });
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"], ...options });
    let stderr = "";
    child.stderr?.on("data", chunk => {
      stderr += chunk.toString();
      if (stderr.length > 16000) stderr = stderr.slice(-16000);
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with code ${code}\n${stderr}`));
    });
  });
}

async function imageWithSharp(input, output) {
  if (!sharp) throw new Error("sharp is not installed");

  // animated:true keeps animated GIF/WebP readable; output remains WebP.
  const pipeline = sharp(input, { animated: true, failOn: "none" })
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 });

  await pipeline.toFile(output);
}

async function imageWithFFmpeg(input, output) {
  const tempPng = output.replace(/\.webp$/i, ".fallback.png");
  try {
    await spawnCommand(ffmpegPath(), [
      "-y", "-hide_banner", "-loglevel", "error", "-i", input,
      "-frames:v", "1",
      "-vf", "scale=1600:1600:force_original_aspect_ratio=decrease",
      tempPng
    ]);
    if (!sharp) throw new Error("sharp is required to finish fallback image conversion");
    await sharp(tempPng).resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toFile(output);
  } finally {
    try { await fsp.unlink(tempPng); } catch {}
  }
}

async function imageWithSips(input, output) {
  if (process.platform !== "darwin") throw new Error("sips fallback is macOS only");
  const tempJpg = output.replace(/\.webp$/i, ".sips.jpg");
  try {
    await spawnCommand("sips", ["-s", "format", "jpeg", "-Z", "1600", input, "--out", tempJpg]);
    if (!sharp) throw new Error("sharp is required to finish sips fallback image conversion");
    await sharp(tempJpg).resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toFile(output);
  } finally {
    try { await fsp.unlink(tempJpg); } catch {}
  }
}

async function convertImage(input, output) {
  const temp = output.replace(/\.webp$/i, ".tmp.webp");
  try {
    await imageWithSharp(input, temp);
  } catch (firstError) {
    log("  sharp could not read image; trying fallback:", path.basename(input));
    try {
      await imageWithFFmpeg(input, temp);
    } catch (secondError) {
      if (process.platform === "darwin") {
        await imageWithSips(input, temp);
      } else {
        throw new Error(`${firstError.message}; fallback: ${secondError.message}`);
      }
    }
  }
  await fsp.rename(temp, output);
}

async function convertVideo(input, output) {
  const temp = output.replace(/\.mp4$/i, ".tmp.mp4");
  const args = [
    "-y", "-hide_banner", "-loglevel", "warning",
    "-i", input,
    "-map", "0:v:0", "-map", "0:a?",
    "-vf", "scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-movflags", "+faststart",
    "-max_muxing_queue_size", "2048",
    temp
  ];

  try {
    await spawnCommand(ffmpegPath(), args);
    await fsp.rename(temp, output);
  } catch (error) {
    try { await fsp.unlink(temp); } catch {}
    throw error;
  }
}

function classify(file) {
  const ext = path.extname(file.relative).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  return null;
}

function outputFor(file, type) {
  const parsed = path.parse(file.relative);
  const identity = file.relative.replace(/\\/g, "/");
  const base = `${safeName(parsed.name)}_${shortHash(identity)}`;
  if (type === "image") return path.join(OPT_IMAGES, `${base}.webp`);
  return path.join(OPT_VIDEOS, `${base}.mp4`);
}

async function sourceSignature(file) {
  const stat = await fsp.stat(file.absolute);
  return { mtimeMs: Math.round(stat.mtimeMs), size: stat.size };
}

function sameSignature(oldItem, sig, outputPath) {
  return Boolean(
    oldItem &&
    oldItem.sourceMtimeMs === sig.mtimeMs &&
    oldItem.sourceSize === sig.size &&
    fs.existsSync(outputPath)
  );
}

async function cleanOrphans(validOutputNames) {
  for (const dir of [OPT_IMAGES, OPT_VIDEOS]) {
    let names = [];
    try { names = await fsp.readdir(dir); } catch {}
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const absolute = path.join(dir, name);
      if (!validOutputNames.has(absolute)) {
        try { await fsp.unlink(absolute); } catch {}
      }
    }
  }
}

async function rebuildMedia(reason = "manual") {
  if (processingPromise) return processingPromise;

  processingPromise = (async () => {
    await ensureDirs();
    state.processing = true;
    state.lastStartedAt = new Date().toISOString();
    state.lastError = null;
    state.currentFile = null;
    state.converted = 0;
    state.reused = 0;
    state.skipped = 0;

    log(`Media scan started (${reason})`);

    const previous = await readJson(MANIFEST_FILE, { items: [] });
    const previousBySource = new Map((previous.items || []).map(item => [item.source, item]));

    const allFiles = (await walk(RAW_ROOT)).sort((a, b) => naturalCompare(a.relative, b.relative));
    const supported = allFiles
      .map(file => ({ ...file, type: classify(file) }))
      .filter(file => file.type);

    state.total = supported.length;
    state.skipped = allFiles.length - supported.length;

    const items = [];
    const validOutputs = new Set();

    for (let index = 0; index < supported.length; index++) {
      const file = supported[index];
      state.currentFile = file.relative;
      const outputPath = outputFor(file, file.type);
      validOutputs.add(outputPath);
      const sig = await sourceSignature(file);
      const oldItem = previousBySource.get(file.relative);

      const outputRel = path.relative(OPT_ROOT, outputPath).replace(/\\/g, "/");

      if (sameSignature(oldItem, sig, outputPath)) {
        state.reused++;
        log(`[${index + 1}/${supported.length}] cache: ${file.relative}`);
      } else {
        log(`[${index + 1}/${supported.length}] convert ${file.type}: ${file.relative}`);
        try {
          if (file.type === "image") await convertImage(file.absolute, outputPath);
          else await convertVideo(file.absolute, outputPath);
          state.converted++;
        } catch (error) {
          state.skipped++;
          log(`  ⚠ skipped ${file.relative}: ${error.message.split("\n")[0]}`);
          continue;
        }
      }

      items.push({
        source: file.relative,
        type: file.type,
        sourceMtimeMs: sig.mtimeMs,
        sourceSize: sig.size,
        output: outputRel,
        fileName: path.basename(outputPath)
      });
    }

    await cleanOrphans(validOutputs);

    const manifest = {
      generatedAt: new Date().toISOString(),
      sourceFolder: "media-original",
      items
    };
    await fsp.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf8");
    state.manifest = manifest;
    state.currentFile = null;
    state.processing = false;
    state.lastFinishedAt = new Date().toISOString();
    log(`Media ready: ${items.filter(x => x.type === "image").length} images, ${items.filter(x => x.type === "video").length} videos.`);
    return manifest;
  })().catch(error => {
    state.processing = false;
    state.currentFile = null;
    state.lastError = error.message;
    log("Media processing error:", error.message);
    throw error;
  }).finally(() => {
    processingPromise = null;
  });

  return processingPromise;
}

function scheduleRebuild(reason) {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildMedia(reason).catch(() => {});
  }, 900);
}

function mediaYear(source = "") {
  const first = String(source).replace(/\\/g, "/").split("/")[0];
  return /^(19|20)\d{2}$/.test(first) ? first : null;
}

function buildMediaTimeline(images, videos, config) {
  // V9: media is grouped by the year folder inside media-original.
  // Every year gets its own animated divider page BEFORE that year's photos/videos.
  // All videos are preserved and distributed evenly through the photos for that year.
  const buckets = new Map();
  const put = (item) => {
    const key = item.year || "other";
    if (!buckets.has(key)) buckets.set(key, { images: [], videos: [] });
    buckets.get(key)[item.type === "image" ? "images" : "videos"].push(item);
  };
  images.forEach(put);
  videos.forEach(put);

  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    return Number(a) - Number(b);
  });

  const timeline = [];
  for (const key of keys) {
    const group = buckets.get(key);
    if (key !== "other") {
      timeline.push({
        id: `year-${key}`,
        type: "year",
        year: key,
        title: `Kỷ niệm ${key}`,
        countImages: group.images.length,
        countVideos: group.videos.length
      });
    }

    if (!group.images.length) {
      group.videos.forEach(v => timeline.push(v));
      continue;
    }

    let vIndex = 0;
    const imageCount = group.images.length;
    const videoCount = group.videos.length;
    group.images.forEach((image, i) => {
      timeline.push(image);
      // Cumulative distribution guarantees every video is included exactly once.
      const shouldHavePlaced = Math.floor(((i + 1) * videoCount) / imageCount);
      while (vIndex < shouldHavePlaced && vIndex < videoCount) {
        timeline.push(group.videos[vIndex++]);
      }
    });
    while (vIndex < videoCount) timeline.push(group.videos[vIndex++]);
  }

  return timeline.map((item, index) => ({ ...item, timelineIndex: index }));
}

async function createStoryPayload() {
  // First request waits for any active conversion, so the book never sees half-built media.
  if (processingPromise) await processingPromise;
  else if (!state.manifest.items?.length) await rebuildMedia("first API request");

  const config = await readStoryConfig();
  const items = state.manifest.items || [];
  let imageN = 0;
  let videoN = 0;

  const images = items.filter(x => x.type === "image").map(item => ({
    id: `image-${++imageN}`,
    type: "image",
    year: mediaYear(item.source),
    fileName: item.source,
    url: `/media-optimized/${encodeURI(item.output).replace(/#/g, "%23")}`,
    order: imageN
  }));

  const videos = items.filter(x => x.type === "video").map(item => ({
    id: `video-${++videoN}`,
    type: "video",
    year: mediaYear(item.source),
    fileName: item.source,
    url: `/media-optimized/${encodeURI(item.output).replace(/#/g, "%23")}`,
    order: videoN
  }));

  return {
    ...config,
    generatedAt: new Date().toISOString(),
    counts: { images: images.length, videos: videos.length },
    images,
    videos,
    media: buildMediaTimeline(images, videos, config)
  };
}

function resolveInside(root, urlPath, prefix) {
  let rel;
  try { rel = decodeURIComponent(urlPath.slice(prefix.length)); }
  catch { return null; }
  rel = rel.replace(/\\/g, "/");
  if (!rel || rel.startsWith("/") || rel.includes("../") || rel.includes("\0")) return null;
  const abs = path.resolve(root, rel);
  const base = path.resolve(root);
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}

async function serveFile(req, res, filePath, cache = true) {
  let stat;
  try { stat = await fsp.stat(filePath); }
  catch { return json(res, 404, { error: "File not found" }); }
  if (!stat.isFile()) return json(res, 404, { error: "File not found" });

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || "application/octet-stream";
  const range = req.headers.range;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", cache ? "public, max-age=86400" : "no-store");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) { res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }); return res.end(); }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= stat.size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }); return res.end();
    }
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Content-Length": end - start + 1
    });
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  res.writeHead(200, { "Content-Length": stat.size });
  fs.createReadStream(filePath).pipe(res);
}

async function serveFrontend(req, res, pathname) {
  const routes = {
    "/": "index.html",
    "/index.html": "index.html",
    "/style.css": "style.css",
    "/app.js": "app.js"
  };
  const file = routes[pathname];
  if (!file) return false;
  await serveFile(req, res, path.join(FRONTEND_ROOT, file), false);
  return true;
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  try {
    if (req.method === "GET" && pathname === "/api/story") {
      return json(res, 200, await createStoryPayload());
    }
    if (req.method === "GET" && pathname === "/api/media-status") {
      return json(res, 200, { ...state, manifest: undefined });
    }
    if (req.method === "POST" && pathname === "/api/rebuild-media") {
      scheduleRebuild("API rebuild");
      return json(res, 202, { ok: true, message: "Media rebuild scheduled" });
    }
    if (req.method === "GET" && pathname.startsWith("/media-optimized/")) {
      const file = resolveInside(OPT_ROOT, pathname, "/media-optimized/");
      if (!file) return json(res, 400, { error: "Invalid media path" });
      return serveFile(req, res, file, true);
    }
    if (await serveFrontend(req, res, pathname)) return;
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    log("Request error:", error.message);
    return json(res, 500, { error: error.message });
  }
}

async function start() {
  await ensureDirs();

  if (!sharp || !chokidar) {
    console.error("\n❌ Missing npm packages. Run this inside happy-birthday-backend:\n   npm install\n");
    process.exit(1);
  }

  const server = http.createServer(requestHandler);
  server.listen(PORT, HOST, () => {
    console.log("\n============================================================");
    console.log("🎁 HAPPY BIRTHDAY MEMORY BOOK");
    console.log(`🌐 Website: http://localhost:${PORT}`);
    console.log(`📁 Put originals here: ${RAW_ROOT}`);
    console.log("🪄 Images -> WebP | Videos -> MP4 H.264/AAC");
    console.log("============================================================\n");
  });

  // Convert existing files immediately. The web server stays available while this runs.
  rebuildMedia("startup").catch(() => {});

  const watcher = chokidar.watch(RAW_ROOT, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 }
  });
  watcher.on("add", p => scheduleRebuild(`added ${path.basename(p)}`));
  watcher.on("change", p => scheduleRebuild(`changed ${path.basename(p)}`));
  watcher.on("unlink", p => scheduleRebuild(`removed ${path.basename(p)}`));
  watcher.on("addDir", () => scheduleRebuild("folder added"));
  watcher.on("unlinkDir", () => scheduleRebuild("folder removed"));
}

start().catch(error => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
