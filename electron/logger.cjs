const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

let logRoot = process.cwd();
let lastError = null;
let ocrAssetsLoaded = false;

function configureLogger(root) {
  logRoot = root || logRoot;
}

function getLogPath() {
  return path.join(logRoot, "flow.log");
}

function sanitizeValue(value) {
  if (typeof value !== "string") return value;
  if (!value.includes("\\") && !value.includes("/")) return value;
  return path.basename(value);
}

function sanitizeMeta(meta = {}) {
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map(sanitizeValue) : sanitizeValue(value),
    ]),
  );
}

async function writeLog(level, message, meta = {}) {
  const payload = {
    at: new Date().toISOString(),
    level,
    message: String(message || "Unknown event"),
    ...sanitizeMeta(meta),
  };

  if (level === "error") {
    lastError = {
      at: payload.at,
      message: payload.message,
      code: payload.code || "",
    };
  }

  try {
    await fs.mkdir(logRoot, { recursive: true });
    await fs.appendFile(getLogPath(), `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // Logging must never break the app.
  }
}

function logInfo(message, meta) {
  return writeLog("info", message, meta);
}

function logError(message, error, meta = {}) {
  return writeLog("error", message, {
    ...meta,
    error: error?.message || error || "",
    code: error?.code || "",
  });
}

function setOcrAssetsLoaded(value) {
  ocrAssetsLoaded = Boolean(value);
}

function getDiagnostics(extra = {}) {
  return {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    logFile: getLogPath(),
    lastError,
    ocrAssetsLoaded,
    ...extra,
  };
}

module.exports = {
  configureLogger,
  getDiagnostics,
  logError,
  logInfo,
  setOcrAssetsLoaded,
};
