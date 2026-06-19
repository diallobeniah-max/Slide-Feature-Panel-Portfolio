export const OCR_CHAR_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'\".,!?;:-()/#&@%$+*=[]{}<> ";

const MAX_FAST_DIMENSION = 1800;
const MAX_ACCURATE_DIMENSION = 3400;
const MIN_FAST_DIMENSION = 1200;
const MIN_ACCURATE_DIMENSION = 1800;
const MIN_SELECTED_DIMENSION = 1400;
const OCR_CANVAS_PADDING = 36;

let workerPromise = null;
let workerInstance = null;
let paddlePromise = null;
let paddleInstance = null;
let activeRunId = 0;
let activeProgress = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanOcrWord(value) {
  return String(value || "")
    .replace(/[|]+/g, "I")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulOcrWord(word) {
  const compact = String(word || "").replace(/\s/g, "");
  if (!compact) return false;
  if (!/[A-Za-z0-9]/.test(compact)) return false;
  if (compact.length === 1 && !/[AIa0-9]/.test(compact)) return false;
  const useful = (compact.match(/[A-Za-z0-9]/g) || []).length;
  return useful / compact.length >= 0.34;
}

function getWordBox(word) {
  const box = word?.bbox || {};
  const x0 = Number(box.x0 || 0);
  const y0 = Number(box.y0 || 0);
  const x1 = Number(box.x1 || x0);
  const y1 = Number(box.y1 || y0);
  return {
    x0,
    y0,
    x1,
    y1,
    centerY: y0 + (y1 - y0) / 2,
    height: Math.max(1, y1 - y0),
    width: Math.max(1, x1 - x0),
  };
}

export function collectOcrWords(data) {
  const words = [];
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
  for (const block of blocks) {
    const paragraphs = Array.isArray(block?.paragraphs) ? block.paragraphs : [];
    for (const paragraph of paragraphs) {
      const lines = Array.isArray(paragraph?.lines) ? paragraph.lines : [];
      for (const line of lines) {
        const lineWords = Array.isArray(line?.words) ? line.words : [];
        for (const word of lineWords) {
          const text = cleanOcrWord(word?.text);
          const confidence = Number(word?.confidence || 0);
          if (confidence < 6 || !isUsefulOcrWord(text)) continue;
          words.push({ ...getWordBox(word), confidence, text });
        }
      }
    }
  }
  return words;
}

export function arrangeOcrWords(data) {
  const words = collectOcrWords(data);
  if (!words.length) return cleanOcrText(data?.text || "");

  const sorted = [...words].sort((a, b) => a.centerY - b.centerY || a.x0 - b.x0);
  const rows = [];
  for (const word of sorted) {
    const row = rows.find((candidate) => {
      const tolerance = Math.max(8, Math.min(candidate.height, word.height) * 0.82);
      return Math.abs(candidate.centerY - word.centerY) <= tolerance;
    });

    if (row) {
      row.words.push(word);
      row.centerY =
        row.words.reduce((total, item) => total + item.centerY, 0) /
        row.words.length;
      row.height = Math.max(row.height, word.height);
    } else {
      rows.push({ centerY: word.centerY, height: word.height, words: [word] });
    }
  }

  return rows
    .sort((a, b) => a.centerY - b.centerY)
    .map((row) =>
      row.words
        .sort((a, b) => a.x0 - b.x0)
        .map((word) => word.text)
        .join(" ")
        .replace(/\s+([,.!?;:])/g, "$1")
        .replace(/(["'])\s+/g, "$1")
        .trim(),
    )
    .filter(shouldKeepOcrLine)
    .join("\n")
    .trim();
}

export function getReadableOcrWords(value) {
  return String(value || "").match(/[A-Za-z0-9][A-Za-z0-9'"#&@%$/+.=:-]*/g) || [];
}

export function getOcrLineStats(line) {
  const words = getReadableOcrWords(line);
  const longerWords = words.filter((word) => /[A-Za-z]/.test(word) && word.length >= 3);
  const compact = String(line || "").replace(/\s/g, "");
  const letters = (compact.match(/[A-Za-z]/g) || []).length;
  const digits = (compact.match(/[0-9]/g) || []).length;
  const usefulChars = letters + digits;

  return {
    words,
    longerWords,
    letters,
    digits,
    usefulChars,
    compactLength: compact.length,
  };
}

export function shouldKeepOcrLine(line) {
  const stats = getOcrLineStats(line);
  if (!stats.compactLength) return false;
  if (stats.usefulChars / stats.compactLength < 0.3) return false;
  if (stats.longerWords.length === 0) return false;
  if (stats.longerWords.length === 1 && stats.words.length > 3 && stats.letters / stats.words.length < 3) {
    return false;
  }
  if (stats.longerWords.length >= 2) return true;
  if (stats.longerWords.length === 1 && stats.letters >= 3) return true;
  return stats.words.length >= 2 && stats.usefulChars >= 6;
}

export function cleanOcrText(value) {
  return String(value || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[^\w'"#&@%$+/.,!?;:()=\-[\]{}<>\s]/g, " ")
        .replace(/\b[A-Za-z]\b/g, (match) => (/[AIa]/.test(match) ? match : " "))
        .replace(/\s+([,.!?;:])/g, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .trim(),
    )
    .filter(shouldKeepOcrLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wrapOcrText(value, maxLineLength = 72) {
  return String(value || "")
    .split(/\r?\n/)
    .flatMap((line) => {
      const words = line.trim().split(/\s+/).filter(Boolean);
      if (!words.length) return [];

      const wrapped = [];
      let current = "";
      for (const word of words) {
        if (!current) {
          current = word;
        } else if (`${current} ${word}`.length <= maxLineLength) {
          current = `${current} ${word}`;
        } else {
          wrapped.push(current);
          current = word;
        }
      }
      if (current) wrapped.push(current);
      return wrapped;
    })
    .filter((line) => line.trim())
    .join("\n")
    .trim();
}

export function normalizeOcrDisplayText(value, maxLineLength = 72) {
  const cleaned = cleanOcrText(value);
  if (!cleaned) return "";

  const lines = cleaned.split(/\r?\n/).filter(Boolean);
  const averageLineLength =
    lines.reduce((total, line) => total + line.length, 0) / lines.length;
  const tinyLineCount = lines.filter((line) => {
    const stats = getOcrLineStats(line);
    return line.length < 8 || stats.longerWords.length === 0;
  }).length;
  const preserveBreaks =
    lines.length >= 2 && averageLineLength >= 18 && tinyLineCount / lines.length <= 0.35;

  return wrapOcrText(preserveBreaks ? lines.join("\n") : lines.join(" "), maxLineLength);
}

function scoreOcrText(text, confidence) {
  const words = text.match(/[A-Za-z]{2,}/g) || [];
  const usefulWords = words.filter((word) => word.length > 2).length;
  const noiseChars = (text.match(/[^\w\s'"#&@%$+/.,!?;:()=-]/g) || []).length;
  const lineBonus = Math.min(10, String(text || "").split(/\r?\n/).filter(Boolean).length) * 2;
  return confidence + usefulWords * 10 + Math.min(text.length, 520) * 0.14 + lineBonus - noiseChars * 4;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded for OCR."));
    image.src = url;
  });
}

function normalizeCrop(crop) {
  if (!crop) return null;
  const x = clamp(Number(crop.x) || 0, 0, 1);
  const y = clamp(Number(crop.y) || 0, 0, 1);
  const width = clamp(Number(crop.width) || 0, 0, 1 - x);
  const height = clamp(Number(crop.height) || 0, 0, 1 - y);
  if (width < 0.02 || height < 0.02) return null;
  return { x, y, width, height };
}

function sharpenImageData(ctx, width, height, amount = 0.35) {
  const source = ctx.getImageData(0, 0, width, height);
  const input = source.data;
  const output = new Uint8ClampedArray(input);
  const kernel = [0, -amount, 0, -amount, 1 + amount * 4, -amount, 0, -amount, 0];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        let kernelIndex = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const sourceIndex = ((y + ky) * width + (x + kx)) * 4 + channel;
            value += input[sourceIndex] * kernel[kernelIndex];
            kernelIndex += 1;
          }
        }
        output[index + channel] = clamp(value, 0, 255);
      }
    }
  }

  ctx.putImageData(new ImageData(output, width, height), 0, 0);
}

function processPixels(ctx, width, height, mode) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const contrast = mode === "fast" ? 1.25 : mode === "soft" ? 1.18 : 1.55;
  const threshold = mode === "threshold";
  const invertLightText = mode === "lightText";

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3] / 255;
    let luminance =
      (red * 0.2126 + green * 0.7152 + blue * 0.0722) * alpha + 255 * (1 - alpha);
    luminance = clamp((luminance - 128) * contrast + 128, 0, 255);

    if (invertLightText) {
      luminance = luminance > 145 ? 0 : 255;
    } else if (threshold) {
      luminance = luminance > 142 ? 255 : 0;
    }

    data[index] = luminance;
    data[index + 1] = luminance;
    data[index + 2] = luminance;
    data[index + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  if (mode !== "fast" && mode !== "soft") sharpenImageData(ctx, width, height, mode === "threshold" ? 0.22 : 0.38);
}

function createSourceCanvas(image, { crop, mode, scanMode, preprocess = true }) {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const safeCrop = normalizeCrop(crop) || { x: 0, y: 0, width: 1, height: 1 };
  const sourceX = Math.round(naturalWidth * safeCrop.x);
  const sourceY = Math.round(naturalHeight * safeCrop.y);
  const cropWidth = Math.max(1, Math.round(naturalWidth * safeCrop.width));
  const cropHeight = Math.max(1, Math.round(naturalHeight * safeCrop.height));
  const maxDimension = scanMode === "fast" ? MAX_FAST_DIMENSION : MAX_ACCURATE_DIMENSION;
  const minDimension = scanMode === "fast" ? MIN_FAST_DIMENSION : MIN_ACCURATE_DIMENSION;
  const scaleByMax = Math.min(1, maxDimension / Math.max(cropWidth, cropHeight));
  const targetMin = safeCrop.width < 0.98 || safeCrop.height < 0.98 ? MIN_SELECTED_DIMENSION : minDimension;
  const scaleByMin = Math.max(1, targetMin / Math.max(cropWidth, cropHeight));
  const scale = clamp(Math.max(scaleByMax, scaleByMin), 0.25, scanMode === "fast" ? 3.5 : 5);
  const contentWidth = Math.max(1, Math.round(cropWidth * scale));
  const contentHeight = Math.max(1, Math.round(cropHeight * scale));
  const pad = scanMode === "fast" ? Math.round(OCR_CANVAS_PADDING * 0.65) : OCR_CANVAS_PADDING;
  const width = contentWidth + pad * 2;
  const height = contentHeight + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, pad, pad, contentWidth, contentHeight);
  if (preprocess && mode !== "raw") {
    processPixels(ctx, width, height, mode);
  }
  return canvas;
}

function buildSourcePlan({ profile, scanMode, crop, preprocess = true }) {
  const selectedCrop = normalizeCrop(crop);
  const regionCrops = selectedCrop
    ? []
    : [
        { x: 0, y: 0.42, width: 1, height: 0.58, label: "bottom" },
        { x: 0, y: 0.08, width: 1, height: 0.84, label: "center" },
      ];
  if (!preprocess) {
    return [
      { mode: "raw", psm: "auto", crop: selectedCrop },
      { mode: "raw", psm: "sparse", crop: selectedCrop },
    ];
  }

  if (scanMode === "fast") {
    return [
      { mode: "fast", psm: "auto", crop: selectedCrop },
      { mode: "soft", psm: "block", crop: selectedCrop },
    ];
  }

  if (selectedCrop) {
    return [
      { mode: "raw", psm: "auto", crop: selectedCrop },
      { mode: "soft", psm: "auto", crop: selectedCrop },
      { mode: "accurate", psm: "auto", crop: selectedCrop },
      { mode: "threshold", psm: "block", crop: selectedCrop },
      { mode: "lightText", psm: "sparse", crop: selectedCrop },
    ];
  }

  if (profile === "instagram") {
    return [
      { mode: "raw", psm: "sparse", crop: null },
      { mode: "soft", psm: "auto", crop: null },
      { mode: "accurate", psm: "sparse", crop: null },
      { mode: "threshold", psm: "sparse", crop: null },
      { mode: "lightText", psm: "sparse", crop: null },
      ...regionCrops.flatMap((region) => [
        { mode: "soft", psm: "sparse", crop: region },
        { mode: "threshold", psm: "sparse", crop: region },
        { mode: "lightText", psm: "sparse", crop: region },
      ]),
    ];
  }

  return [
    { mode: "raw", psm: "auto", crop: null },
    { mode: "soft", psm: "auto", crop: null },
    { mode: "accurate", psm: "auto", crop: null },
    { mode: "accurate", psm: "block", crop: null },
    { mode: "threshold", psm: "block", crop: null },
    { mode: "lightText", psm: "sparse", crop: null },
    ...regionCrops.flatMap((region) => [
      { mode: "raw", psm: "sparse", crop: region },
      { mode: "soft", psm: "sparse", crop: region },
      { mode: "threshold", psm: "sparse", crop: region },
      { mode: "lightText", psm: "sparse", crop: region },
    ]),
  ];
}

export async function imageToOcrSources(
  url,
  { profile = "instagram", scanMode = "accurate", crop = null, preprocess = true } = {},
) {
  const image = await loadImage(url);
  const plan = buildSourcePlan({ profile, scanMode, crop, preprocess });
  return plan.map((source, index) => {
    const canvas = createSourceCanvas(image, {
      crop: source.crop,
      mode: source.mode,
      scanMode,
      preprocess,
    });
    return {
      key: `${profile}-${scanMode}-${source.mode}-${index}`,
      mode: source.mode,
      psm: source.psm,
      canvas,
      source: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  });
}

async function ensureOcrWorker() {
  if (workerInstance) return workerInstance;
  if (workerPromise) return workerPromise;

  const { createWorker } = await import("tesseract.js");
  const baseUrl = import.meta.env.BASE_URL || "/";
  const langPath = `${baseUrl.replace(/\/?$/, "/")}tessdata`;

  workerPromise = createWorker(
    "eng",
    1,
    {
      langPath,
      logger: (message) => {
        if (typeof message.progress === "number" && activeProgress) {
          activeProgress(message.progress);
        }
      },
    },
    {},
  ).then((worker) => {
    workerInstance = worker;
    return worker;
  });

  return workerPromise;
}

async function ensurePaddleOcr() {
  if (paddleInstance) return paddleInstance;
  if (paddlePromise) return paddlePromise;

  paddlePromise = import("@paddleocr/paddleocr-js")
    .then(async ({ PaddleOCR }) => {
      const baseUrl = import.meta.env.BASE_URL || "/";
      const assetBase = `${baseUrl.replace(/\/?$/, "/")}ort/`;
      const ocr = await PaddleOCR.create({
        textDetectionModelName: "PP-OCRv5_mobile_det",
        textRecognitionModelName: "PP-OCRv5_mobile_rec",
        textDetectionBatchSize: 1,
        textRecognitionBatchSize: 6,
        ortOptions: {
          backend: "wasm",
          wasmPaths: assetBase,
          numThreads: 1,
          simd: true,
        },
      });
      paddleInstance = ocr;
      return ocr;
    })
    .catch((error) => {
      paddlePromise = null;
      paddleInstance = null;
      throw error;
    });

  return paddlePromise;
}

function normalizePaddleText(items, maxLineLength) {
  const lines = (Array.isArray(items) ? items : [])
    .map((item) => ({
      text: cleanOcrText(item?.text || ""),
      score: Number(item?.score || 0),
      poly: item?.poly || item?.box || [],
    }))
    .filter((item) => item.text && item.score >= 0.18)
    .sort((a, b) => {
      const ay = Math.min(...a.poly.map((point) => Number(point?.[1] ?? point?.y ?? 0)));
      const by = Math.min(...b.poly.map((point) => Number(point?.[1] ?? point?.y ?? 0)));
      const ax = Math.min(...a.poly.map((point) => Number(point?.[0] ?? point?.x ?? 0)));
      const bx = Math.min(...b.poly.map((point) => Number(point?.[0] ?? point?.x ?? 0)));
      return ay - by || ax - bx;
    })
    .map((item) => item.text);

  return normalizeOcrDisplayText(lines.join("\n"), maxLineLength);
}

async function runPaddleCandidate(sources, { maxLineLength, onStatus }) {
  if (!sources.length) return null;
  onStatus?.("Loading PaddleOCR detector");
  const ocr = await ensurePaddleOcr();
  const source = sources[0];
  onStatus?.("Reading with PaddleOCR");
  const [result] = await ocr.predict(source.canvas, {
    textDetLimitSideLen: 1280,
    textDetThresh: 0.2,
    textDetBoxThresh: 0.35,
    textDetUnclipRatio: 1.8,
    textRecScoreThresh: 0.18,
  });
  const confidence = Math.round(
    ((result?.items || []).reduce((total, item) => total + Number(item?.score || 0), 0) /
      Math.max(1, (result?.items || []).length)) *
      100,
  );
  const text = normalizePaddleText(result?.items || [], maxLineLength);
  if (!text) return null;
  return {
    confidence,
    engine: "paddle",
    mode: "paddle",
    score: scoreOcrText(text, confidence) + 12,
    text,
  };
}

export async function cancelBrowserOcr() {
  activeRunId += 1;
  activeProgress = null;
  if (workerInstance) {
    const worker = workerInstance;
    workerInstance = null;
    workerPromise = null;
    await worker.terminate().catch(() => {});
  }
  if (paddleInstance?.dispose) {
    await paddleInstance.dispose().catch(() => {});
  }
  paddleInstance = null;
  paddlePromise = null;
}

export async function runBrowserOcr(
  imageUrl,
  {
    maxLineLength = 72,
    onProgress,
    onStatus,
    profile = "instagram",
    scanMode = "accurate",
    crop = null,
    preprocess = true,
  } = {},
) {
  const runId = activeRunId + 1;
  activeRunId = runId;
  const { PSM } = await import("tesseract.js");

  onStatus?.("Preparing image");
  onProgress?.(3);
  const sources = await imageToOcrSources(imageUrl, {
    profile,
    scanMode,
    crop,
    preprocess,
  });
  if (runId !== activeRunId) throw new Error("OCR scan cancelled.");

  const candidates = [];

  if (scanMode !== "fast") {
    try {
      onProgress?.(8);
      const paddleCandidate = await runPaddleCandidate(sources, { maxLineLength, onStatus });
      if (paddleCandidate) candidates.push(paddleCandidate);
    } catch (error) {
      console.info("PaddleOCR unavailable, falling back to Tesseract.", error);
    }
  }

  onStatus?.("Loading Tesseract OCR");
  const worker = await ensureOcrWorker();
  if (runId !== activeRunId) throw new Error("OCR scan cancelled.");

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const pageSegMode =
      source.psm === "block"
        ? PSM.SINGLE_BLOCK
        : source.psm === "line"
          ? PSM.SINGLE_LINE
          : source.psm === "sparse"
            ? PSM.SPARSE_TEXT
            : PSM.AUTO;
    const sourceStart = 12 + Math.round((index / sources.length) * 78);
    const sourceSpan = Math.max(7, Math.round(78 / sources.length));

    onStatus?.(`Reading text ${index + 1}/${sources.length}`);
    activeProgress = (progress) => {
      onProgress?.(Math.min(92, sourceStart + Math.round(progress * sourceSpan)));
    };

    const parameters = {
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: pageSegMode,
      user_defined_dpi: "300",
    };
    if (source.mode === "threshold" || source.mode === "lightText") {
      parameters.tessedit_char_whitelist = OCR_CHAR_WHITELIST;
    }
    await worker.setParameters(parameters);

    const result = await worker.recognize(source.source, {}, { blocks: true });
    if (runId !== activeRunId) throw new Error("OCR scan cancelled.");

    const confidence = Math.round(result.data.confidence || 0);
    const arrangedText = arrangeOcrWords(result.data);
    const rawText = normalizeOcrDisplayText(result.data?.text || "", maxLineLength);
    const text = normalizeOcrDisplayText(
      arrangedText && scoreOcrText(arrangedText, confidence) >= scoreOcrText(rawText, confidence) * 0.8
        ? arrangedText
        : rawText,
      maxLineLength,
    );
    const score = scoreOcrText(text, confidence);
    if (text) candidates.push({ confidence, score, text, mode: source.mode, engine: "tesseract" });
    onProgress?.(Math.min(94, sourceStart + sourceSpan));
  }

  activeProgress = null;
  onStatus?.("Cleaning text");

  const best = candidates.reduce(
    (winner, candidate) => (candidate.score > winner.score ? candidate : winner),
    { confidence: 0, score: 0, text: "", mode: "none" },
  );
  const mergedLines = [];
  const seen = new Set();

  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    for (const line of candidate.text.split(/\r?\n/)) {
      const normalized = line.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (!normalized || seen.has(normalized) || !shouldKeepOcrLine(line)) continue;
      seen.add(normalized);
      mergedLines.push(line.trim());
    }
  }

  const mergedText = normalizeOcrDisplayText(mergedLines.join("\n"), maxLineLength);
  const mergedScore = scoreOcrText(mergedText, best.confidence);
  const finalText =
    mergedText &&
    mergedLines.length > best.text.split(/\r?\n/).filter(Boolean).length + 2 &&
    mergedScore >= best.score * 1.08
      ? mergedText
      : best.text;

  onProgress?.(100);
  onStatus?.("Done");

  return {
    confidence: best.confidence,
    engine: best.engine || "tesseract",
    mode: best.mode,
    sourceCount: sources.length,
    text: finalText || "",
  };
}
