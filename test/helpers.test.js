const test = require("node:test");
const assert = require("node:assert/strict");

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
} = require("../src/media-utils");
const { selectReleaseAsset, verifyAssetDigest } = require("../src/update-utils");

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
