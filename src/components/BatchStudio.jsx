import React, { useState, useRef, useCallback, useMemo } from "react";
import JSZip from "jszip";
import {
  Upload,
  Download,
  Trash2,
  Zap,
  FileArchive,
  Plus,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Loader2,
  Music,
  Film,
  X,
  Split,
  Eye,
  Check,
  Maximize,
  ZoomIn,
  Edit3,
  Scissors,
  ChevronRight,
} from "lucide-react";
import { Card, Button, Badge, RangeSlider, Input } from "./ui";

// --- Utilities ---
const formatSize = (bytes) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const formatTime = (seconds) => {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const getSupportedMimeType = (isAudio, preferredType) => {
  const videoTypes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  const audioTypes = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"];
  if (preferredType && MediaRecorder.isTypeSupported(preferredType))
    return preferredType;
  const searchList = isAudio ? audioTypes : videoTypes;
  for (const type of searchList) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
};

// --- Main Panel ---
export default function BatchStudioPanel() {
  // Asset Management
  const [files, setFiles] = useState([]);
  const [processedFiles, setProcessedFiles] = useState([]);

  // Processing Config
  const [quality, setQuality] = useState(1.0);
  const [targetImgFormat, setTargetImgFormat] = useState("image/jpeg");
  const [targetVidFormat, setTargetVidFormat] = useState("video/mp4");
  const [vidOutputMode, setVidOutputMode] = useState("video");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // UI & View States
  const [previewId, setPreviewId] = useState(null);
  const [trimmingId, setTrimmingId] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [zoomMode, setZoomMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFauxFullscreen, setIsFauxFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Interaction Refs
  const [zoomPan, setZoomPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const originalVideoRef = useRef(null);
  const trimVideoRef = useRef(null);

  const autoScale = useMemo(() => {
    if (quality < 0.4) return 0.5;
    if (quality < 0.7) return 0.75;
    return 1.0;
  }, [quality]);

  // File handling
  const processNewFiles = (uploadedFiles) => {
    const newFiles = Array.from(uploadedFiles).map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      type: file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "image",
      name: file.name,
      originalSize: file.size,
      preview: URL.createObjectURL(file),
      status: "pending",
      trim: { start: 0, end: 0, hasBeenTrimmed: false },
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleFileUpload = (e) => processNewFiles(e.target.files);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) processNewFiles(e.dataTransfer.files);
  };

  const updateTrimRange = (id, start, end) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, trim: { ...f.trim, start, end, hasBeenTrimmed: true } }
          : f,
      ),
    );
  };

  // Processing Engine
  const processMedia = useCallback(async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(0);
    const results = [...processedFiles];

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      if (processedFiles.find((p) => p.id === item.id)) continue;

      await new Promise((r) => setTimeout(r, 120));
      setProgress(Math.round((i / files.length) * 100));

      if (item.type === "image") {
        const img = new Image();
        img.src = item.preview;
        await new Promise((r) => {
          img.onload = r;
        });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = img.width * autoScale;
        canvas.height = img.height * autoScale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL(targetImgFormat, quality);
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        results.push({
          ...item,
          processedUrl: dataUrl,
          processedSize: blob.size,
          blob,
          status: "done",
          dimensions: `${Math.round(canvas.width)}x${Math.round(canvas.height)}`,
        });
      } else {
        const video = document.createElement("video");
        video.src = item.preview;
        video.muted = true;
        video.setAttribute("playsinline", "");
        await new Promise((r) => {
          video.onloadedmetadata = r;
        });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = video.videoWidth * autoScale;
        canvas.height = video.videoHeight * autoScale;

        const startTime = item.trim?.start || 0;
        const endTime =
          item.trim?.end && item.trim.end > 0 ? item.trim.end : video.duration;

        video.currentTime = startTime;
        await new Promise((r) => {
          video.onseeked = r;
        });

        const stream = canvas.captureStream(30);
        const mimeType = getSupportedMimeType(
          vidOutputMode === "audio",
          vidOutputMode === "audio" ? "audio/webm" : "video/webm;codecs=vp8",
        );
        if (!mimeType) continue;

        const videoBitrate = Math.max(500000, quality * 25000000);
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: vidOutputMode === "audio" ? 0 : videoBitrate,
          audioBitsPerSecond: quality * 320000,
        });

        const chunks = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        const processPromise = new Promise((resolve) => {
          recorder.onstop = () => {
            const finalType =
              vidOutputMode === "audio" ? "audio/mpeg" : targetVidFormat;
            const blob = new Blob(chunks, { type: finalType });
            resolve({
              ...item,
              processedUrl: URL.createObjectURL(blob),
              processedSize: blob.size,
              blob,
              status: "done",
              outputType: vidOutputMode,
              dimensions:
                vidOutputMode === "audio"
                  ? "Studio Audio"
                  : `${Math.round(canvas.width)}x${Math.round(canvas.height)}`,
            });
          };
        });

        recorder.start();
        await video.play();

        const drawFrame = () => {
          if (video.currentTime >= endTime || video.ended || video.paused) {
            if (recorder.state !== "inactive") recorder.stop();
            return;
          }
          if (vidOutputMode === "video")
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          requestAnimationFrame(drawFrame);
        };
        drawFrame();
        results.push(await processPromise);
      }

      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setProcessedFiles(results);
    setIsProcessing(false);
  }, [
    files,
    processedFiles,
    quality,
    targetImgFormat,
    targetVidFormat,
    autoScale,
    vidOutputMode,
  ]);

  const downloadZip = async () => {
    const zip = new JSZip();
    processedFiles.forEach((file) => {
      const ext =
        file.type === "image"
          ? targetImgFormat.split("/")[1]
          : file.outputType === "audio"
            ? "mp3"
            : targetVidFormat.split("/")[1];
      zip.file(`${file.name.split(".")[0]}_opt.${ext}`, file.blob);
    });
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `studio_bundle_${Date.now()}.zip`;
    link.click();
  };

  // Pan & Zoom handlers
  const handlePanStart = (e) => {
    if (!zoomMode) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX - zoomPan.x, y: e.clientY - zoomPan.y };
  };
  const handlePanMove = (e) => {
    if (!isPanning || !zoomMode) return;
    setZoomPan({
      x: e.clientX - panStart.current.x,
      y: e.clientY - panStart.current.y,
    });
  };
  const handlePanEnd = () => setIsPanning(false);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      if (originalVideoRef.current)
        originalVideoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      if (originalVideoRef.current) originalVideoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const currentPreview = files.find((f) => f.id === previewId);
  const currentResult = processedFiles.find((p) => p.id === previewId);
  const currentTrimmingItem = files.find((f) => f.id === trimmingId);

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[22em_1fr] items-start">
      {/* Left: Config Panel */}
      <aside className="grid content-start gap-5 panel-enter-aside">
        <Card className="p-6 flex flex-col gap-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Batch Studio
            </p>
            <h2 className="mt-1 text-2xl font-black italic tracking-tight text-zinc-900 dark:text-zinc-50">
              Batch Process Assets
            </h2>
          </div>
          <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4 text-zinc-500">
            <Zap size={16} />
            <h3 className="font-bold text-[10px] uppercase tracking-widest">
              Engine Config
            </h3>
          </div>

          <div className="space-y-4">
            {/* Image Format */}
            <Card className="p-5 shadow-none border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-3 text-center">
                Image Format
              </label>
              <div className="grid grid-cols-3 gap-2">
                {["jpeg", "png", "webp"].map((fmt) => (
                  <Button
                    key={fmt}
                    variant={
                      targetImgFormat === `image/${fmt}` ? "primary" : "outline"
                    }
                    size="sm"
                    onClick={() => setTargetImgFormat(`image/${fmt}`)}
                  >
                    {fmt}
                  </Button>
                ))}
              </div>
            </Card>

            {/* Export Mode */}
            <Card className="p-5 shadow-none border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-3 text-center">
                Export Mode
              </label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Button
                  variant={vidOutputMode === "video" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setVidOutputMode("video")}
                >
                  Video
                </Button>
                <Button
                  variant={vidOutputMode === "audio" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setVidOutputMode("audio")}
                >
                  Audio
                </Button>
              </div>
              {vidOutputMode === "video" ? (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  {["mp4", "webm"].map((fmt) => (
                    <Button
                      key={fmt}
                      variant={
                        targetVidFormat === `video/${fmt}`
                          ? "primary"
                          : "secondary"
                      }
                      size="sm"
                      onClick={() => setTargetVidFormat(`video/${fmt}`)}
                    >
                      {fmt}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full disabled"
                    disabled
                  >
                    Lossless MP3
                  </Button>
                </div>
              )}
            </Card>

            {/* Quality Slider */}
            <Card className="p-5 shadow-none border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
              <RangeSlider
                label="Engine Intensity"
                valueLabel={`${Math.round(quality * 100)}%`}
                min="0.05"
                max="1"
                step="0.01"
                value={quality}
                onChange={(e) => setQuality(parseFloat(e.target.value))}
              />
              <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                <span>Processing Scale</span>
                <span className="text-zinc-900 dark:text-zinc-100 font-mono">
                  {Math.round(autoScale * 100)}%
                </span>
              </div>
            </Card>

            {/* Process Button */}
            <div className="pt-2">
              {isProcessing ? (
                <Card className="p-5 space-y-4 border-zinc-200 dark:border-zinc-700">
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-zinc-950 dark:bg-zinc-100 h-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-500 uppercase tracking-widest">
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin" size={14} /> Processing
                    </span>
                    <span>{progress}%</span>
                  </div>
                </Card>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={files.length === 0}
                  onClick={processMedia}
                  icon={Zap}
                >
                  Start Session
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Download ZIP */}
        {processedFiles.length > 0 && !isProcessing && (
          <Card className="p-5 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white dark:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-900 dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-600">
                <Check size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-900 dark:text-zinc-100">
                  Ready
                </span>
                <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">
                  {processedFiles.length} Objects
                </span>
              </div>
            </div>
            <Button variant="secondary" size="icon" onClick={downloadZip}>
              <FileArchive size={20} />
            </Button>
          </Card>
        )}
      </aside>

      {/* Right: Queue */}
      <section className="grid content-start gap-5 panel-enter-main">
        <div className="flex justify-between items-center px-2">
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full ${files.length > 0 ? "bg-zinc-900 dark:bg-zinc-100 animate-pulse" : "bg-zinc-300 dark:bg-zinc-700"}`}
            />
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              Task Queue <Badge variant="default">{files.length}</Badge>
            </h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current.click()}
            icon={Plus}
          >
            Append Asset
          </Button>
        </div>

        {!files.length ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
            className={`h-[400px] border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center space-y-6 transition-all cursor-pointer group ${isDragging ? "border-zinc-950 bg-zinc-50 dark:border-white dark:bg-zinc-900/50" : "border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/30 hover:border-zinc-400 dark:hover:border-zinc-600"}`}
          >
            <div
              className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-transform duration-500 ${isDragging ? "scale-110 bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 group-hover:scale-105"}`}
            >
              <Upload size={36} />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-black tracking-tight uppercase text-zinc-900 dark:text-zinc-100">
                {isDragging ? "Release Media" : "Drop Media Here"}
              </p>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest">
                Support for image, video & audio
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {files.map((file) => {
              const res = processedFiles.find((p) => p.id === file.id);
              const savings = res
                ? Math.round(
                    ((file.originalSize - res.processedSize) /
                      file.originalSize) *
                      100,
                  )
                : 0;
              return (
                <Card
                  key={file.id}
                  onClick={() => setPreviewId(file.id)}
                  className="p-4 flex items-center gap-4 md:gap-6 group cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
                >
                  <div className="flex-1 flex items-center gap-6">
                    {/* Source */}
                    <div className="flex items-center gap-4 min-w-[220px] border-r border-zinc-100 dark:border-zinc-800 pr-6">
                      <div className="w-14 h-14 bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-hidden relative shrink-0">
                        {file.type === "video" ? (
                          <video
                            src={file.preview}
                            className="w-full h-full object-cover"
                          />
                        ) : file.type === "audio" ? (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400">
                            <Music size={20} />
                          </div>
                        ) : (
                          <img
                            src={file.preview}
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        )}
                      </div>
                      <div className="space-y-1 overflow-hidden">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest truncate">
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 font-mono">
                          <span>IN: {formatSize(file.originalSize)}</span>
                          {(file.type === "video" || file.type === "audio") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 p-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTrimmingId(file.id);
                              }}
                            >
                              <Edit3 size={12} />
                            </Button>
                          )}
                        </div>
                        {file.trim.hasBeenTrimmed && (
                          <Badge variant="black" className="mt-1 gap-1">
                            <Scissors size={10} /> {formatTime(file.trim.start)}{" "}
                            - {formatTime(file.trim.end)}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="text-zinc-300 dark:text-zinc-600 shrink-0">
                      {isProcessing && !res ? (
                        <Loader2
                          size={16}
                          className="animate-spin text-zinc-900 dark:text-white"
                        />
                      ) : (
                        <ChevronRight size={20} />
                      )}
                    </div>

                    {/* Result */}
                    <div className="flex-1 flex items-center gap-4 pl-2">
                      {res ? (
                        <>
                          <div className="w-14 h-14 bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-hidden relative shrink-0 group-hover:scale-105 transition-transform">
                            {res.outputType === "audio" ? (
                              <div className="w-full h-full flex items-center justify-center text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800">
                                <Music size={20} />
                              </div>
                            ) : file.type === "video" ? (
                              <video
                                src={res.processedUrl}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src={res.processedUrl}
                                className="w-full h-full object-cover"
                                alt=""
                              />
                            )}
                            <div className="absolute bottom-0 right-0 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 p-1">
                              <Eye size={10} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-black text-zinc-900 dark:text-white uppercase tracking-widest font-mono">
                              OUT: {formatSize(res.processedSize)}
                            </p>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                              {res.dimensions}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="opacity-40 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          Awaiting Engine
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-4">
                    {res && savings > 0 && (
                      <Badge variant={savings > 0 ? "success" : "default"}>
                        -{savings}%
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFiles((prev) =>
                          prev.filter((f) => f.id !== file.id),
                        );
                      }}
                    >
                      <Trash2
                        size={18}
                        className="text-zinc-400 hover:text-red-500 transition-colors"
                      />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <input
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileUpload}
        />
      </section>

      {/* --- MODAL: MEDIA CLIPPER --- */}
      {trimmingId && currentTrimmingItem && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8">
          <div
            className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md"
            onClick={() => setTrimmingId(null)}
          />
          <Card className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[32px] overflow-hidden shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-3 text-zinc-900 dark:text-white font-bold">
                <Scissors size={20} />
                <p className="text-sm uppercase tracking-widest">
                  Media Clipper
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTrimmingId(null)}
              >
                <X size={20} />
              </Button>
            </div>

            <div className="p-8 space-y-8">
              <div className="aspect-video bg-zinc-950 rounded-2xl overflow-hidden relative shadow-inner flex items-center justify-center">
                {currentTrimmingItem.type === "video" ? (
                  <video
                    ref={trimVideoRef}
                    src={currentTrimmingItem.preview}
                    className="w-full h-full object-contain"
                    onLoadedMetadata={(e) => {
                      if (currentTrimmingItem.trim.end === 0)
                        updateTrimRange(trimmingId, 0, e.target.duration);
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-white gap-6">
                    <Music size={48} className="animate-pulse text-zinc-700" />
                    <audio
                      ref={trimVideoRef}
                      src={currentTrimmingItem.preview}
                      onLoadedMetadata={(e) => {
                        if (currentTrimmingItem.trim.end === 0)
                          updateTrimRange(trimmingId, 0, e.target.duration);
                      }}
                    />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      Waveform Scrubber Active
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="flex justify-between text-[11px] font-bold uppercase text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-6 py-3 rounded-2xl shadow-inner border border-zinc-200 dark:border-zinc-700">
                  <span>IN: {formatTime(currentTrimmingItem.trim.start)}</span>
                  <span className="text-zinc-900 dark:text-zinc-100 font-mono tracking-tighter">
                    REGION:{" "}
                    {formatTime(
                      (currentTrimmingItem.trim.end || 0) -
                        currentTrimmingItem.trim.start,
                    )}
                  </span>
                  <span>OUT: {formatTime(currentTrimmingItem.trim.end)}</span>
                </div>

                <div className="space-y-6 px-2">
                  <RangeSlider
                    label="Mark Entry"
                    valueLabel={formatTime(currentTrimmingItem.trim.start)}
                    min={0}
                    max={currentTrimmingItem.trim.end || 100}
                    step={0.01}
                    value={currentTrimmingItem.trim.start}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      updateTrimRange(
                        trimmingId,
                        val,
                        currentTrimmingItem.trim.end,
                      );
                      if (trimVideoRef.current)
                        trimVideoRef.current.currentTime = val;
                    }}
                  />
                  <RangeSlider
                    label="Mark Exit"
                    valueLabel={formatTime(currentTrimmingItem.trim.end)}
                    min={currentTrimmingItem.trim.start}
                    max={trimVideoRef.current?.duration || 100}
                    step={0.01}
                    value={currentTrimmingItem.trim.end}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      updateTrimRange(
                        trimmingId,
                        currentTrimmingItem.trim.start,
                        val,
                      );
                      if (trimVideoRef.current)
                        trimVideoRef.current.currentTime = val;
                    }}
                  />
                </div>
              </div>

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                icon={Check}
                onClick={() => setTrimmingId(null)}
              >
                Clip Selection
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* --- MODAL: PREVIEW --- */}
      {previewId && currentPreview && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center ${isFauxFullscreen ? "p-0" : "p-4 sm:p-8"}`}
        >
          <div
            className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xl"
            onClick={() => {
              setPreviewId(null);
              setIsFauxFullscreen(false);
            }}
          />
          <Card
            className={`relative transition-all duration-500 bg-white dark:bg-zinc-900 overflow-hidden shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800 ${isFauxFullscreen ? "w-full h-full rounded-none" : "w-full max-w-6xl rounded-[32px] max-h-[94vh]"}`}
          >
            {/* Modal Header */}
            <div className="p-5 px-8 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-900 dark:text-white shadow-inner">
                  <Film size={20} />
                </div>
                <div className="flex flex-col text-zinc-900 dark:text-white">
                  <p className="text-sm font-black uppercase tracking-widest truncate max-w-[280px]">
                    {currentPreview.name}
                  </p>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    {formatSize(currentPreview.originalSize)} MASTER SOURCE
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {currentResult && (
                  <>
                    <Button
                      variant={zoomMode ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => {
                        setZoomMode(!zoomMode);
                        setZoomPan({ x: 0, y: 0 });
                      }}
                      icon={ZoomIn}
                    >
                      {zoomMode ? "Exit Zoom" : "Zoom (x3)"}
                    </Button>
                    <Button
                      variant={compareMode ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => setCompareMode(!compareMode)}
                      icon={Split}
                    >
                      Compare
                    </Button>
                    <Button
                      variant={isFauxFullscreen ? "primary" : "secondary"}
                      size="icon"
                      onClick={() => setIsFauxFullscreen((v) => !v)}
                    >
                      <Maximize size={18} />
                    </Button>
                    <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-2" />
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setPreviewId(null);
                    setIsFauxFullscreen(false);
                  }}
                >
                  <X size={24} />
                </Button>
              </div>
            </div>

            {/* Viewer */}
            <div
              className={`flex-1 bg-zinc-100 dark:bg-zinc-950 overflow-hidden relative flex items-center justify-center min-h-[400px] ${zoomMode ? "cursor-grab active:cursor-grabbing" : ""}`}
              onMouseDown={handlePanStart}
              onMouseMove={handlePanMove}
              onMouseUp={handlePanEnd}
              onMouseLeave={handlePanEnd}
            >
              <div
                className={`w-full h-full flex transition-all duration-300 ${compareMode ? "gap-4 p-4" : ""}`}
                style={
                  zoomMode
                    ? {
                        transform: `scale(3) translate(${zoomPan.x}px, ${zoomPan.y}px)`,
                      }
                    : {}
                }
              >
                {/* Original pane (compare mode only) */}
                <div
                  className={`flex-1 flex flex-col items-center justify-center relative bg-zinc-950 rounded-[24px] overflow-hidden shadow-inner border border-zinc-200/5 dark:border-white/5 ${compareMode ? "" : "hidden"}`}
                >
                  <p className="absolute top-4 left-4 z-10 text-[9px] font-bold text-white bg-black/50 px-3 py-1.5 rounded-xl uppercase tracking-widest backdrop-blur-md border border-white/10">
                    Source
                  </p>
                  {currentPreview.type === "video" ? (
                    <video
                      ref={originalVideoRef}
                      src={currentPreview.preview}
                      className="max-w-full max-h-full"
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={currentPreview.preview}
                      className="max-w-full max-h-full object-contain"
                      alt=""
                    />
                  )}
                </div>

                {/* Processed pane */}
                <div className="flex-1 flex flex-col items-center justify-center relative bg-zinc-950 rounded-[24px] overflow-hidden shadow-inner border border-zinc-200/5 dark:border-white/5">
                  <p className="absolute top-4 left-4 z-10 text-[9px] font-bold text-white bg-black/50 px-3 py-1.5 rounded-xl uppercase tracking-widest backdrop-blur-md border border-white/10">
                    {currentResult ? "Processed" : "Awaiting..."}
                  </p>
                  {currentResult ? (
                    currentResult.outputType === "audio" ? (
                      <div className="space-y-8 flex flex-col items-center text-center p-16">
                        <div className="w-32 h-32 bg-white/5 rounded-[40px] flex items-center justify-center text-white border border-white/10 shadow-lg animate-pulse">
                          <Music size={64} />
                        </div>
                        <audio
                          ref={videoRef}
                          src={currentResult.processedUrl}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                        />
                        <p className="text-white font-black uppercase tracking-widest text-[11px]">
                          Master Track Ready
                        </p>
                      </div>
                    ) : (
                      <video
                        ref={videoRef}
                        src={currentResult.processedUrl}
                        className="max-w-full max-h-full"
                        playsInline
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                      />
                    )
                  ) : currentPreview.type === "video" ? (
                    <video
                      ref={videoRef}
                      src={currentPreview.preview}
                      className="max-w-full max-h-full opacity-30"
                      playsInline
                    />
                  ) : (
                    <img
                      src={currentPreview.preview}
                      className="max-w-full max-h-full object-contain opacity-30"
                      alt=""
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Playback Controls */}
            {(currentPreview.type === "video" ||
              (currentResult && currentResult.outputType === "audio")) && (
              <div className="p-6 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex flex-col items-center gap-4 shrink-0">
                <div className="flex items-center gap-8">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="w-12 h-12 rounded-2xl"
                    onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime -= 5;
                    }}
                  >
                    <RotateCcw size={20} />
                  </Button>
                  <Button
                    variant="primary"
                    size="icon"
                    className="w-16 h-16 rounded-[24px] shadow-lg"
                    onClick={togglePlay}
                  >
                    {isPlaying ? (
                      <Pause size={28} className="fill-current" />
                    ) : (
                      <Play size={28} className="fill-current ml-1" />
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="w-12 h-12 rounded-2xl"
                    onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime += 5;
                    }}
                  >
                    <RotateCw size={20} />
                  </Button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="p-6 bg-zinc-50 dark:bg-zinc-900 flex justify-between items-center px-8 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
              <div className="text-[10px] font-mono font-medium text-zinc-500 uppercase tracking-widest">
                {currentResult
                  ? `OUT: ${formatSize(currentResult.processedSize)} [${currentResult.dimensions}]`
                  : "AWAITING ENGINE..."}
              </div>
              {currentResult && (
                <Button
                  variant="primary"
                  size="md"
                  icon={Download}
                  onClick={() => {
                    const link = document.createElement("a");
                    link.href = currentResult.processedUrl;
                    link.download = currentResult.name;
                    link.click();
                  }}
                >
                  Save Object
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
