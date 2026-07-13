const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
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
  parseSsimOutput,
  getSsimSampleTimestamps,
  summarizeSmartBatch,
} = require("../src/media-utils");
const { selectReleaseAsset, verifyAssetDigest } = require("../src/update-utils");
const {
  TOUR_STORAGE_KEY,
  TOUR_STEP_IDS,
  clampTourIndex,
  getTourStepId,
  hasSeenTour,
  markTourSeen,
  createTourSnapshot,
} = require("../src/tour-utils");

test("BMP and TIFF inputs are deliberately converted to JPEG", () => {
  assert.equal(getImageOutputExtension("photo.bmp"), ".jpg");
  assert.equal(getImageOutputExtension("photo.tif"), ".jpg");
  assert.equal(getImageOutputExtension("photo.TIFF"), ".jpg");
  assert.equal(getImageOutputExtension("photo.png"), ".png");
});

test("output paths avoid collisions while using the output format extension", () => {
  const existing = new Set(["/tmp/photo_compressed.jpg"]);
  assert.equal(
    buildAvailableOutputPath("/tmp/photo.tiff", ".jpg", (p) => existing.has(p)),
    "/tmp/photo_compressed-1.jpg"
  );
});

test("release selection uses platform-appropriate installers", () => {
  const assets = [
    { name: "Compressly.exe" },
    { name: "Compressly.dmg" },
    { name: "Compressly.zip" },
  ];
  assert.equal(selectReleaseAsset(assets, "darwin").name, "Compressly.dmg");
  assert.equal(selectReleaseAsset(assets, "win32").name, "Compressly.exe");
});

test("Apple Silicon updates require an arm64 or universal macOS asset", () => {
  const assets = [
    { name: "Compressly-2.0.0-x64.dmg" },
    { name: "Compressly-2.0.0-arm64.zip" },
    { name: "Compressly-2.0.0-arm64.dmg" },
  ];
  assert.equal(
    selectReleaseAsset(assets, "darwin", "arm64").name,
    "Compressly-2.0.0-arm64.dmg"
  );
  assert.equal(
    selectReleaseAsset(
      [{ name: "Compressly-2.0.0-universal.dmg" }],
      "darwin",
      "arm64"
    ).name,
    "Compressly-2.0.0-universal.dmg"
  );
  assert.equal(
    selectReleaseAsset(
      [{ name: "Compressly-2.0.0-x64.dmg" }],
      "darwin",
      "arm64"
    ),
    null
  );
});

test("GitHub SHA-256 digests are validated", () => {
  const bytes = Buffer.from("trusted update");
  const digest =
    "sha256:3e815a6f9d8c44b0c2fc5d26f77545bb0d4378f1693d3dc425e654261f8780fc";
  assert.equal(verifyAssetDigest(bytes, digest).verified, true);
  assert.equal(verifyAssetDigest(Buffer.from("tampered"), digest).reason, "mismatch");
  assert.equal(verifyAssetDigest(bytes, null).reason, "missing");
});

test("target-size results and retry corrections are explicit", () => {
  const mb = 1024 * 1024;
  assert.equal(isWithinTarget(10 * mb, 10 * mb), true);
  assert.equal(isWithinTarget(10 * mb + 1, 10 * mb), false);
  assert.equal(calculateRetryScale(12 * mb, 10 * mb).toFixed(3), "0.808");
  assert.match(formatSizeWarning(12 * mb, 10 * mb), /12\.00 MB produced/);
});

test("preset selection preserves custom target and FPS values", () => {
  assert.equal(selectPreset(10, [1, 5, 10, 25]), "10");
  assert.equal(selectPreset(7.5, [1, 5, 10, 25]), "custom");
  assert.equal(isValidTargetSize(0.01), true);
  assert.equal(isValidTargetSize(0), false);
  assert.equal(isValidFps(60), true);
  assert.equal(isValidFps(59.94), false);
  assert.equal(isValidFps(121), false);
});

test("detail values use compact readable formatting", () => {
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2.00 MB");
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(3661), "1:01:01");
  assert.equal(formatReduction(1000, 250), "75.0%");
});

test("smart compression profiles become progressively smaller", () => {
  const fidelity = getSmartQualitySettings("fidelity");
  const balanced = getSmartQualitySettings("balanced");
  const compact = getSmartQualitySettings("compact");
  assert.ok(fidelity.imageQuality > balanced.imageQuality);
  assert.ok(balanced.imageQuality > compact.imageQuality);
  assert.ok(fidelity.videoCrf < balanced.videoCrf);
  assert.ok(balanced.videoCrf < compact.videoCrf);
  assert.ok(fidelity.audioBitrateKbps > compact.audioBitrateKbps);
  assert.deepEqual(getSmartQualitySettings("unknown"), balanced);
});

test("detail capabilities keep video-only information on videos", () => {
  const video = getMediaDetailCapabilities("Video");
  const image = getMediaDetailCapabilities("Image");
  const audio = getMediaDetailCapabilities("Audio");

  assert.equal(video.fps, true);
  assert.equal(video.videoCodec, true);
  assert.equal(image.fps, false);
  assert.equal(image.videoCodec, false);
  assert.equal(image.dimensions, true);
  assert.equal(audio.fps, false);
  assert.equal(audio.videoCodec, false);
  assert.equal(audio.audio, true);
  assert.equal(audio.duration, true);
});

test("SSIM output and bounded sample timestamps are parsed consistently", () => {
  assert.equal(parseSsimOutput("SSIM Y:0.98 All:0.987320 (18.9)"), 0.98732);
  assert.equal(parseSsimOutput("no metric"), null);
  assert.deepEqual(getSsimSampleTimestamps(2), [0.5, 1, 1.5]);
  assert.deepEqual(getSsimSampleTimestamps(10), [1, 3, 5, 7, 9]);
  assert.deepEqual(getSsimSampleTimestamps(0), []);
});

test("Smart batch summaries use successful outputs and measured visual files", () => {
  const summary = summarizeSmartBatch([
    { status: "done", originalBytes: 1000, outputBytes: 600, similarity: 98 },
    { status: "done", originalBytes: 3000, outputBytes: 1200, similarity: 96 },
    { status: "done", originalBytes: 500, outputBytes: 250, similarity: null },
    { status: "error", originalBytes: 500 },
    { status: "cancelled", originalBytes: 500 },
  ], 12.5);
  assert.equal(summary.successful, 3);
  assert.equal(summary.failed, 1);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.originalBytes, 4500);
  assert.equal(summary.outputBytes, 2050);
  assert.equal(summary.bytesSaved, 2450);
  assert.equal(summary.reductionPercent.toFixed(1), "54.4");
  assert.equal(summary.visualSimilarity, 97);
  assert.equal(summary.visualDifference, 3);
  assert.equal(summary.measuredVisualFiles, 2);
  assert.equal(summary.elapsedSeconds, 12.5);

  const larger = summarizeSmartBatch([
    { status: "done", originalBytes: 100, outputBytes: 125, similarity: null },
  ]);
  assert.equal(larger.bytesSaved, -25);
  assert.equal(larger.reductionPercent, -25);
  assert.equal(larger.visualSimilarity, null);

  const empty = summarizeSmartBatch([
    { status: "done", originalBytes: 0, outputBytes: 0, similarity: null },
  ]);
  assert.equal(empty.reductionPercent, null);
});

test("the Version 2.0 tour has bounded ordered navigation", () => {
  assert.equal(TOUR_STEP_IDS.length, 7);
  assert.deepEqual(TOUR_STEP_IDS, [
    "welcome",
    "standard-controls",
    "details",
    "smart-workspace",
    "smart-preferences",
    "smart-processing",
    "results",
  ]);
  assert.equal(clampTourIndex(-4), 0);
  assert.equal(clampTourIndex(99), 6);
  assert.equal(getTourStepId(3), "smart-workspace");
});

test("tour persistence and restoration snapshots fail safely", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(hasSeenTour(storage), false);
  assert.equal(markTourSeen(storage), true);
  assert.equal(values.get(TOUR_STORAGE_KEY), "1");
  assert.equal(hasSeenTour(storage), true);
  assert.deepEqual(createTourSnapshot({
    mode: "smart",
    statusText: "Ready",
    scrollTop: 42,
    resultsVisible: true,
    detailVisible: false,
    focusedId: "aboutBtn",
  }), {
    mode: "smart",
    statusText: "Ready",
    scrollTop: 42,
    resultsVisible: true,
    detailVisible: false,
    focusedId: "aboutBtn",
  });
  assert.equal(hasSeenTour({ getItem: () => { throw new Error("blocked"); } }), false);
});

test("user-controlled filenames are rendered as text, not HTML", () => {
  const rendererSource = fs.readFileSync(
    require.resolve("../src/renderer.js"),
    "utf8"
  );
  assert.match(rendererSource, /item\.textContent = `\$\{filename\}/);
  assert.doesNotMatch(rendererSource, /listEl\.innerHTML\s*=/);
});
