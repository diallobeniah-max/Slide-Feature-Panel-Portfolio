export const OCR_CHAR_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'\".,!?;:-()/#&@%$+*= ";

function cleanOcrWord(value) {
  return String(value || "")
    .replace(/[|]+/g, "I")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulOcrWord(word) {
  const compact = word.replace(/\s/g, "");
  if (!compact) return false;
  if (!/[A-Za-z0-9]/.test(compact)) return false;
  if (compact.length === 1 && !/[AIa0-9]/.test(compact)) return false;
  const useful = (compact.match(/[A-Za-z0-9]/g) || []).length;
  return useful / compact.length >= 0.45;
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
          if (confidence < 12 || !isUsefulOcrWord(text)) continue;
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
      const tolerance = Math.max(9, Math.min(candidate.height, word.height) * 0.8);
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

export function cleanOcrText(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[^\w'"#&@%$+/.,!?;:()=\-\s]/g, " ")
        .replace(/\s+([,.!?;:])/g, "$1")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(shouldKeepOcrLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
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
    usefulChars,
    compactLength: compact.length,
  };
}

export function shouldKeepOcrLine(line) {
  const stats = getOcrLineStats(line);
  if (!stats.compactLength) return false;
  if (stats.usefulChars / stats.compactLength < 0.38) return false;
  if (stats.longerWords.length >= 2) return true;
  if (stats.longerWords.length === 1 && stats.letters >= 4) return true;
  return stats.words.length >= 2 && stats.usefulChars >= 5;
}

function wrapOcrText(value, maxLineLength = 42) {
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

export function normalizeOcrDisplayText(value, maxLineLength = 42) {
  const rawLines = String(value || "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[^\w'"#&@%$+/.,!?;:()=\-\s]/g, " ")
        .replace(/\s+([,.!?;:])/g, "$1")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  if (!rawLines.length) return "";

  const sourceLines = rawLines.filter(shouldKeepOcrLine);
  if (!sourceLines.length) return "";

  const averageLineLength =
    sourceLines.reduce((total, line) => total + line.length, 0) / sourceLines.length;
  const tinyLineCount = sourceLines.filter((line) => {
    const stats = getOcrLineStats(line);
    return line.length < 8 || stats.longerWords.length === 0;
  }).length;
  const shouldPreserveLineBreaks =
    sourceLines.length >= 2 &&
    averageLineLength >= Math.min(20, maxLineLength * 0.55) &&
    tinyLineCount / sourceLines.length <= 0.35;

  return wrapOcrText(
    shouldPreserveLineBreaks ? sourceLines.join("\n") : sourceLines.join(" "),
    maxLineLength,
  );
}

function scoreOcrText(text, confidence) {
  const words = text.match(/[A-Za-z]{2,}/g) || [];
  const usefulWords = words.filter((word) => word.length > 2).length;
  const lineBonus = Math.min(String(text).split(/\r?\n/).length, 8) * 10;
  return confidence + usefulWords * 8 + Math.min(text.length, 320) * 0.12 + lineBonus;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function getCrops(profile) {
  const shared = [
    { left: 0, top: 0, width: 1, height: 1, psm: "sparse" },
    { left: 0.03, top: 0.04, width: 0.94, height: 0.42, psm: "block" },
    { left: 0.03, top: 0.3, width: 0.94, height: 0.44, psm: "block" },
    { left: 0.03, top: 0.58, width: 0.94, height: 0.38, psm: "block" },
  ];
  if (profile === "spell") {
    return [
      ...shared,
      { left: 0, top: 0, width: 0.52, height: 1, psm: "sparse" },
      { left: 0.48, top: 0, width: 0.52, height: 1, psm: "sparse" },
    ];
  }
  return shared;
}

function paintOcrMode(ctx, width, height, mode) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3] / 255;
    const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) * alpha + 255 * (1 - alpha);
    const maxChannel = Math.max(red, green, blue);
    const minChannel = Math.min(red, green, blue);
    const saturation = maxChannel ? (maxChannel - minChannel) / maxChannel : 0;
    let next = luminance;

    if (mode === "highContrast") {
      next = luminance > 142 ? 255 : 0;
    } else if (mode === "darkText") {
      next = luminance < 158 || (saturation > 0.28 && luminance < 210) ? 0 : 255;
    } else if (mode === "lightText") {
      next = luminance > 142 && saturation < 0.72 ? 0 : 255;
    } else if (mode === "colorText") {
      next = saturation > 0.2 && luminance < 238 ? 0 : 255;
    }

    data[index] = next;
    data[index + 1] = next;
    data[index + 2] = next;
    data[index + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

export async function imageToOcrSources(url, { profile = "instagram" } = {}) {
  const image = await loadImage(url);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const modes = ["grayscale", "highContrast", "darkText", "lightText", "colorText"];
  const sources = [];

  getCrops(profile).forEach((crop, cropIndex) => {
    modes.forEach((mode) => {
      const sourceX = Math.round(sourceWidth * crop.left);
      const sourceY = Math.round(sourceHeight * crop.top);
      const cropWidth = Math.max(1, Math.round(sourceWidth * crop.width));
      const cropHeight = Math.max(1, Math.round(sourceHeight * crop.height));
      const scale = Math.max(1.5, Math.min(3.4, 2800 / Math.max(cropWidth, cropHeight)));
      const width = Math.max(1, Math.round(cropWidth * scale));
      const height = Math.max(1, Math.round(cropHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);
      paintOcrMode(ctx, width, height, mode);
      sources.push({
        cropIndex,
        key: `${profile}-${mode}-${cropIndex}`,
        mode,
        psm: crop.psm,
        source: canvas.toDataURL("image/png"),
      });
    });
  });

  return sources;
}

export async function runBrowserOcr(
  imageUrl,
  { maxLineLength = 42, onProgress, profile = "instagram" } = {},
) {
  const { createWorker, PSM } = await import("tesseract.js");
  const sources = await imageToOcrSources(imageUrl, { profile });
  let worker;
  try {
    worker = await createWorker(
      "eng",
      1,
      {
        logger: (message) => {
          if (typeof message.progress === "number") {
            onProgress?.(Math.round(message.progress * 100));
          }
        },
      },
      {
        load_system_dawg: "0",
        load_freq_dawg: "0",
      },
    );

    const candidates = [];
    for (let index = 0; index < sources.length; index += 1) {
      const pageSegMode =
        sources[index].psm === "block" ? PSM.SINGLE_BLOCK : PSM.SPARSE_TEXT;
      await worker.setParameters({
        tessedit_char_whitelist: OCR_CHAR_WHITELIST,
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: pageSegMode,
        user_defined_dpi: "300",
      });
      const result = await worker.recognize(sources[index].source, {}, { blocks: true });
      const confidence = Math.round(result.data.confidence || 0);
      const text = normalizeOcrDisplayText(arrangeOcrWords(result.data), maxLineLength);
      const score = scoreOcrText(text, confidence);
      if (text) candidates.push({ confidence, score, text });
      onProgress?.(Math.max(5, Math.min(98, Math.round(((index + 1) / sources.length) * 100))));
    }

    const best = candidates.reduce(
      (winner, candidate) => (candidate.score > winner.score ? candidate : winner),
      { confidence: 0, score: 0, text: "" },
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
      mergedText && (mergedLines.length > best.text.split(/\r?\n/).length || mergedScore >= best.score * 0.78)
        ? mergedText
        : best.text;

    return {
      confidence: best.confidence,
      text: finalText || "",
    };
  } finally {
    if (worker) await worker.terminate();
  }
}
