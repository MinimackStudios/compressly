const crypto = require("crypto");

function selectReleaseAsset(assets, platform, arch) {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const normalized = assets.map((asset) => ({
    ...asset,
    lname: asset && asset.name ? String(asset.name).toLowerCase() : "",
    url: asset && asset.browser_download_url,
  }));
  const extensions =
    platform === "darwin"
      ? [".dmg", ".pkg", ".zip"]
      : platform === "win32"
        ? [".exe", ".msi", ".zip"]
        : [".zip", ".exe", ".msi", ".dmg", ".pkg"];

  if (platform === "darwin") {
    const macAssets = extensions.flatMap((extension) =>
      normalized.filter((asset) => asset.lname.endsWith(extension))
    );
    const isArm64 = (asset) =>
      /(?:^|[-_.])(?:arm64|aarch64)(?=[-_.]|$)/i.test(asset.lname);
    const isX64 = (asset) =>
      /(?:^|[-_.])(?:x64|x86_64|amd64)(?=[-_.]|$)/i.test(asset.lname);
    const isUniversal = (asset) =>
      /(?:^|[-_.])universal(?:[-_.]2)?(?=[-_.]|$)/i.test(asset.lname);

    if (arch === "arm64") {
      return (
        macAssets.find(isArm64) ||
        macAssets.find(isUniversal) ||
        null
      );
    }
    if (arch === "x64") {
      return (
        macAssets.find(isX64) ||
        macAssets.find(isUniversal) ||
        macAssets.find((asset) => !isArm64(asset)) ||
        null
      );
    }
    return macAssets[0] || null;
  }

  for (const extension of extensions) {
    const match = normalized.find((asset) => asset.lname.endsWith(extension));
    if (match) return match;
  }
  const platformMatch = platform
    ? normalized.find((asset) => asset.lname.includes(platform.toLowerCase()))
    : null;
  return platformMatch || normalized[0] || null;
}

function verifyAssetDigest(data, digest) {
  if (!digest) return { verified: false, reason: "missing" };
  const match = /^sha256:([a-f0-9]{64})$/i.exec(String(digest).trim());
  if (!match) return { verified: false, reason: "unsupported" };
  const actual = crypto.createHash("sha256").update(data).digest("hex");
  return {
    verified: actual.toLowerCase() === match[1].toLowerCase(),
    reason: actual.toLowerCase() === match[1].toLowerCase() ? null : "mismatch",
  };
}

module.exports = { selectReleaseAsset, verifyAssetDigest };
