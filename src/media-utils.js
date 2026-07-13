const path = require("path");

function getImageOutputExtension(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  return ext === ".bmp" || ext === ".tif" || ext === ".tiff" ? ".jpg" : ext;
}

function buildAvailableOutputPath(inputPath, outputExtension, existsSync) {
  const parsed = path.parse(inputPath);
  let suffix = "";
  let count = 0;
  let candidate;
  do {
    candidate = path.join(
      parsed.dir,
      `${parsed.name}_compressed${suffix}${outputExtension}`
    );
    count += 1;
    suffix = `-${count}`;
  } while (existsSync(candidate));
  return candidate;
}

function isWithinTarget(actualBytes, targetBytes) {
  return Number(actualBytes) <= Number(targetBytes);
}

function calculateRetryScale(actualBytes, targetBytes) {
  if (!(actualBytes > 0) || !(targetBytes > 0)) return 0.75;
  return Math.max(0.25, Math.min(0.95, (targetBytes * 0.97) / actualBytes));
}

function formatSizeWarning(actualBytes, targetBytes) {
  const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(2);
  return `Over target: ${mb(actualBytes)} MB produced, ${mb(targetBytes)} MB requested`;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "Unavailable";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "Unavailable";
  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatReduction(originalBytes, outputBytes) {
  if (!(originalBytes > 0) || !(outputBytes >= 0)) return "Unavailable";
  return `${Math.max(0, (1 - outputBytes / originalBytes) * 100).toFixed(1)}%`;
}

function isValidTargetSize(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function isValidFps(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 120;
}

function selectPreset(value, presets) {
  const normalized = String(Number(value));
  return presets.map(String).includes(normalized) ? normalized : "custom";
}

function getSmartQualitySettings(profile) {
  const profiles = {
    fidelity: { imageQuality: 92, videoCrf: 19, audioBitrateKbps: 256 },
    balanced: { imageQuality: 86, videoCrf: 22, audioBitrateKbps: 192 },
    compact: { imageQuality: 78, videoCrf: 25, audioBitrateKbps: 128 },
  };
  return profiles[profile] || profiles.balanced;
}

function getMediaDetailCapabilities(kind) {
  const normalized = String(kind || "").toLowerCase();
  const isImage = normalized === "image";
  const isVideo = normalized === "video";
  const isAudio = normalized === "audio";

  return {
    duration: isVideo || isAudio,
    dimensions: isVideo || isImage,
    fps: isVideo,
    videoCodec: isVideo,
    audio: isVideo || isAudio,
    resolutionSetting: isVideo || isImage,
  };
}

module.exports = {
  getImageOutputExtension,
  buildAvailableOutputPath,
  isWithinTarget,
  calculateRetryScale,
  formatSizeWarning,
  formatBytes,
  formatDuration,
  formatReduction,
  isValidTargetSize,
  isValidFps,
  selectPreset,
  getSmartQualitySettings,
  getMediaDetailCapabilities,
};
