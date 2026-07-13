const crypto = require("crypto");

function selectReleaseAsset(assets, platform) {
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
