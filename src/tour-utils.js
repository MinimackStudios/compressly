const TOUR_VERSION = "2.0";
const TOUR_STORAGE_KEY = "compressly_tour_seen_2_0";
const TOUR_STEP_IDS = [
  "welcome",
  "standard-controls",
  "details",
  "smart-workspace",
  "smart-preferences",
  "smart-processing",
  "results",
];

function clampTourIndex(index, stepCount = TOUR_STEP_IDS.length) {
  const count = Math.max(1, Number(stepCount) || 1);
  const value = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
  return Math.max(0, Math.min(count - 1, value));
}

function getTourStepId(index) {
  return TOUR_STEP_IDS[clampTourIndex(index)];
}

function hasSeenTour(storage) {
  try {
    return storage && storage.getItem(TOUR_STORAGE_KEY) === "1";
  } catch (e) {
    return false;
  }
}

function markTourSeen(storage) {
  try {
    if (storage) storage.setItem(TOUR_STORAGE_KEY, "1");
    return true;
  } catch (e) {
    return false;
  }
}

function createTourSnapshot(state = {}) {
  return {
    mode: state.mode === "smart" ? "smart" : "standard",
    statusText: String(state.statusText || ""),
    scrollTop: Math.max(0, Number(state.scrollTop) || 0),
    resultsVisible: !!state.resultsVisible,
    detailVisible: !!state.detailVisible,
    focusedId: state.focusedId ? String(state.focusedId) : null,
  };
}

module.exports = {
  TOUR_VERSION,
  TOUR_STORAGE_KEY,
  TOUR_STEP_IDS,
  clampTourIndex,
  getTourStepId,
  hasSeenTour,
  markTourSeen,
  createTourSnapshot,
};
