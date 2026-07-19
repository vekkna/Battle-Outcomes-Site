const STORAGE_KEY = "matchup-board-units-v1";
const STORAGE_COOKIE = "matchup-board-units-v1";
const RECOVERY_KEY = "matchup-board-roster-recovered-2026-07-18";
const VIEW_KEY = "matchup-board-view-v2";
const MATCHUP_ORDER_KEY = "matchup-board-matchup-orders-v1";
const MATRIX_SORT_KEY = "matchup-board-matrix-sort-v1";
const MATRIX_CUSTOM_ORDER_KEY = "matchup-board-matrix-custom-order-v1";
const COUNTER_THRESHOLD_KEY = "matchup-board-counter-threshold-v1";
const UNIT_SETS_KEY = "matchup-board-unit-sets-v1";
const UNIT_SET_COOKIE_PREFIX = "matchup-board-unit-set-v1-";
const DRILL_EFFECT_KEY = "matchup-board-drill-effect-v1";
const SPEED_EFFECT_KEY = "matchup-board-speed-effect-v1";
const SIMILARITY_METRIC_KEY = "matchup-board-similarity-metric-v1";
const MAX_UNITS = 16;
const MIN_UNITS = 2;
const PALETTE = ["#c95f4b", "#597fb3", "#d49a38", "#64865a", "#8b68a5", "#3e9a96"];

const DEFAULT_UNITS = [
  { id: "heavy-infantry", name: "Heavy Infantry", strike: 6, drill: 0, speed: 0, ap: false, defense: 5, hp: 7, color: "#c95f4b" },
  { id: "spearmen", name: "Spearmen", strike: 5, drill: 0, speed: 0, ap: false, defense: 5, hp: 7, color: "#597fb3" },
  { id: "skirmishers", name: "Skirmishers", strike: 4, drill: 0, speed: 0, ap: false, defense: 3, hp: 7, color: "#d49a38" },
  { id: "cavalry", name: "Cavalry", strike: 7, drill: 0, speed: 0, ap: false, defense: 4, hp: 7, color: "#64865a" }
];

// Recovered from the previous preview origin (http://127.0.0.1:53788).
// This is used once when the current origin only has the example roster.
const RECOVERED_UNITS = [
  { id: "skirmishers", name: "Light Infantry", strike: 6, drill: 0, ap: false, defense: 5, hp: 7, color: "#c95f4b" },
  { id: "spearmen", name: "Spearmen", strike: 5, drill: 0, ap: false, defense: 5, hp: 7, color: "#597fb3" },
  { id: "heavy-infantry", name: "Heavy Infantry", strike: 4, drill: 0, ap: false, defense: 3, hp: 7, color: "#d49a38" },
  { id: "unit-1784286539565-6a7fb6ee3a8618", name: "Fanatics", strike: 7, drill: 0, ap: false, defense: 4, hp: 7, color: "#64865a" },
  { id: "unit-1784282608507-5f497a71b3ddd8", name: "Halberds", strike: 3, drill: 0, ap: true, defense: 3, hp: 7, color: "#3e9a96" },
  { id: "cavalry", name: "Heavy Cavalry", strike: 3, drill: 0, ap: false, defense: 6, hp: 7, color: "#64865a" },
  { id: "unit-1784282596293-1f8c1e30496298", name: "Infantry", strike: 4, drill: 0, ap: false, defense: 5, hp: 7, color: "#8b68a5" },
  { id: "unit-1784283739165-e3ceef4d099108", name: "Cavalry", strike: 3, drill: 0, ap: false, defense: 5, hp: 7, color: "#c95f4b" },
  { id: "unit-1784283773309-18aaaed3017128", name: "Light Cavalry", strike: 3, drill: 0, ap: false, defense: 4, hp: 7, color: "#597fb3" },
  { id: "unit-1784286577839-4820f65e87148", name: "Lancers", strike: 2, drill: 0, ap: true, defense: 4, hp: 7, color: "#64865a" }
];

const unitGrid = document.querySelector("#unitGrid");
const unitCount = document.querySelector("#unitCount");
const addUnitButton = document.querySelector("#addUnitButton");
const resetButton = document.querySelector("#resetButton");
const setManager = document.querySelector("#setManager");
const setsButton = document.querySelector("#setsButton");
const setsCount = document.querySelector("#setsCount");
const setMenu = document.querySelector("#setMenu");
const setSaveForm = document.querySelector("#setSaveForm");
const setName = document.querySelector("#setName");
const setList = document.querySelector("#setList");
const setEmpty = document.querySelector("#setEmpty");
const drillEffectToggle = document.querySelector("#drillEffectToggle");
const speedEffectToggle = document.querySelector("#speedEffectToggle");
const saveState = document.querySelector("#saveState");
const resultStage = document.querySelector("#resultStage");
const resultsMeta = document.querySelector("#resultsMeta");
const outcomeKey = document.querySelector(".outcome-key");
const unitCardTemplate = document.querySelector("#unitCardTemplate");
const viewButtons = [...document.querySelectorAll(".view-button")];

let unitLoadNeedsPersist = false;
let units = loadUnits();
let shownUnits = cloneUnits(units);
let activeView = loadView();
let matrixSort = loadMatrixSort();
let matrixCustomOrder = loadMatrixCustomOrder();
let counterThreshold = loadCounterThreshold();
let drillEffectEnabled = loadDrillEffect();
let speedEffectEnabled = loadSpeedEffect();
let similarityMetric = loadSimilarityMetric();
let matchupCache = new Map();
let updateTimer = null;
let draggedUnitId = null;
let draggedMatchup = null;
let draggedMatrixUnitId = null;
let matchupOrders = loadMatchupOrders();
let unitSetsNeedPersist = false;
let unitSets = loadUnitSets();

function cloneUnits(value) {
  return value.map(unit => ({ ...unit }));
}

function safeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function sanitiseUnits(value) {
  return value.slice(0, MAX_UNITS).map((unit, index) => ({
    id: String(unit.id || `unit-${Date.now()}-${index}`),
    name: String(unit.name || "").trim().slice(0, 24) || `Unit ${index + 1}`,
    strike: safeNumber(unit.strike, 1, 1, 99),
    drill: safeNumber(unit.drill, 0, 0, 99),
    speed: safeNumber(unit.speed, 0, 0, 99),
    ap: Boolean(unit.ap),
    defense: safeNumber(unit.defense, 4, 1, 6),
    hp: safeNumber(unit.hp, 7, 1, 99),
    color: /^#[0-9a-f]{6}$/i.test(unit.color) ? unit.color : PALETTE[index % PALETTE.length]
  }));
}

function validSavedUnits(value) {
  return Array.isArray(value) && value.length >= MIN_UNITS;
}

function isExampleRoster(value) {
  if (!validSavedUnits(value) || value.length !== DEFAULT_UNITS.length) return false;
  const comparable = unitsToCompare => sanitiseUnits(unitsToCompare).map(({ id, name, strike, drill, speed, ap, defense, hp, color }) => (
    { id, name, strike, drill, speed, ap, defense, hp, color }
  ));
  return JSON.stringify(comparable(value)) === JSON.stringify(comparable(DEFAULT_UNITS));
}

function readCookieValue(name) {
  try {
    const prefix = `${name}=`;
    const stored = document.cookie.split("; ").find(item => item.startsWith(prefix));
    return stored ? decodeURIComponent(stored.slice(prefix.length)) : null;
  } catch (_) {
    return null;
  }
}

function writeCookieValue(name, value) {
  try {
    const encoded = encodeURIComponent(value);
    if (encoded.length <= 3800) {
      document.cookie = `${name}=${encoded}; Max-Age=157680000; Path=/; SameSite=Lax`;
    }
  } catch (_) {
    // Cookies may be unavailable for file URLs; origin-local storage still works there.
  }
}

function loadCookieUnits() {
  try {
    const saved = JSON.parse(readCookieValue(STORAGE_COOKIE));
    return validSavedUnits(saved) ? saved : null;
  } catch (_) {
    return null;
  }
}

function deleteCookieValue(name) {
  try {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch (_) {
    // Cookies may be unavailable for file URLs.
  }
}

function packSetUnits(value) {
  return sanitiseUnits(value).map(unit => [
    unit.id,
    unit.name,
    unit.strike,
    unit.ap ? 1 : 0,
    unit.defense,
    unit.hp,
    unit.color,
    unit.drill,
    unit.speed
  ]);
}

function unpackSetUnits(value) {
  if (!Array.isArray(value)) return null;
  const unpacked = value.map(unit => Array.isArray(unit) ? {
    id: unit[0],
    name: unit[1],
    strike: unit[2],
    ap: unit[3] === 1,
    defense: unit[4],
    hp: unit[5],
    color: unit[6],
    drill: unit[7],
    speed: unit[8]
  } : unit);
  return validSavedUnits(unpacked) ? sanitiseUnits(unpacked) : null;
}

function normaliseUnitSet(value, fallbackIndex = 0) {
  if (!value || typeof value !== "object") return null;
  const savedUnits = unpackSetUnits(value.units);
  if (!savedUnits) return null;
  const rawId = String(value.id || "");
  const id = /^[a-z0-9-]+$/i.test(rawId)
    ? rawId
    : `set-${Date.now()}-${fallbackIndex}-${Math.random().toString(16).slice(2)}`;
  const name = String(value.name || "").trim().slice(0, 32);
  if (!name) return null;
  return {
    id,
    name,
    units: savedUnits,
    updatedAt: Number(value.updatedAt) || Date.now()
  };
}

function loadUnitSets() {
  let localSets = [];
  try {
    const saved = JSON.parse(localStorage.getItem(UNIT_SETS_KEY));
    if (Array.isArray(saved)) {
      localSets = saved.map(normaliseUnitSet).filter(Boolean);
    }
  } catch (_) {
    // Try the cross-port cookie copies below.
  }

  try {
    const index = JSON.parse(readCookieValue(UNIT_SETS_KEY));
    if (Array.isArray(index)) {
      const localById = new Map(localSets.map(set => [set.id, set]));
      return index.map((entry, position) => {
        const id = String(entry?.id || "");
        let cookieSet = null;
        try {
          const packedUnits = JSON.parse(readCookieValue(`${UNIT_SET_COOKIE_PREFIX}${id}`));
          cookieSet = normaliseUnitSet({ ...entry, id, units: packedUnits }, position);
        } catch (_) {
          // Fall back to the origin-local copy if this individual cookie is unavailable.
        }
        return cookieSet || localById.get(id) || null;
      }).filter(Boolean);
    }
  } catch (_) {
    // Fall back to origin-local saved sets.
  }

  if (localSets.length) unitSetsNeedPersist = true;
  return localSets;
}

function saveUnitSets() {
  const localValue = unitSets.map(set => ({
    ...set,
    units: sanitiseUnits(set.units)
  }));
  try {
    localStorage.setItem(UNIT_SETS_KEY, JSON.stringify(localValue));
  } catch (_) {
    // Cookie copies can still preserve the sets for localhost previews.
  }

  const index = unitSets.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
  writeCookieValue(UNIT_SETS_KEY, JSON.stringify(index));
  unitSets.forEach(set => {
    writeCookieValue(`${UNIT_SET_COOKIE_PREFIX}${set.id}`, JSON.stringify(packSetUnits(set.units)));
  });
}

function loadUnits() {
  const cookieSaved = loadCookieUnits();
  if (cookieSaved) return sanitiseUnits(cookieSaved);

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (validSavedUnits(saved) && !isExampleRoster(saved)) {
      // Mirror a legacy origin-local save into a port-independent localhost cookie.
      unitLoadNeedsPersist = true;
      return sanitiseUnits(saved);
    }

    const recoveryApplied = localStorage.getItem(RECOVERY_KEY) === "1";
    if (!recoveryApplied) {
      unitLoadNeedsPersist = true;
      return sanitiseUnits(RECOVERED_UNITS);
    }

    if (validSavedUnits(saved)) return sanitiseUnits(saved);
  } catch (_) {
    // Use the examples when stored data is unavailable or malformed.
  }
  return cloneUnits(DEFAULT_UNITS);
}

function loadView() {
  const saved = localStorage.getItem(VIEW_KEY);
  return ["bars", "matrix", "similarity", "counters", "profile"].includes(saved) ? saved : "matrix";
}

function loadSimilarityMetric() {
  try {
    const saved = readCookieValue(SIMILARITY_METRIC_KEY) ?? localStorage.getItem(SIMILARITY_METRIC_KEY);
    return ["overall", "specialization"].includes(saved) ? saved : "overall";
  } catch (_) {
    return "overall";
  }
}

function saveSimilarityMetric() {
  try {
    localStorage.setItem(SIMILARITY_METRIC_KEY, similarityMetric);
  } catch (_) {
    // The selected metric still works for the current session.
  }
  writeCookieValue(SIMILARITY_METRIC_KEY, similarityMetric);
}

function loadMatrixSort() {
  const saved = readCookieValue(MATRIX_SORT_KEY) || localStorage.getItem(MATRIX_SORT_KEY);
  return ["roster", "strength", "similar", "custom"].includes(saved) ? saved : "roster";
}

function saveMatrixSort() {
  try {
    localStorage.setItem(MATRIX_SORT_KEY, matrixSort);
  } catch (_) {
    // The selected order still works for the current session.
  }
  writeCookieValue(MATRIX_SORT_KEY, matrixSort);
}

function loadMatrixCustomOrder() {
  try {
    const saved = JSON.parse(readCookieValue(MATRIX_CUSTOM_ORDER_KEY) || localStorage.getItem(MATRIX_CUSTOM_ORDER_KEY));
    return Array.isArray(saved) ? saved.map(String) : [];
  } catch (_) {
    return [];
  }
}

function saveMatrixCustomOrder() {
  const value = JSON.stringify(matrixCustomOrder);
  try {
    localStorage.setItem(MATRIX_CUSTOM_ORDER_KEY, value);
  } catch (_) {
    // Custom ordering still works for the current session.
  }
  writeCookieValue(MATRIX_CUSTOM_ORDER_KEY, value);
}

function loadCounterThreshold() {
  const saved = Number(localStorage.getItem(COUNTER_THRESHOLD_KEY));
  return [60, 65, 70, 75, 80].includes(saved) ? saved : 80;
}

function loadDrillEffect() {
  try {
    const saved = readCookieValue(DRILL_EFFECT_KEY) ?? localStorage.getItem(DRILL_EFFECT_KEY);
    return saved === null ? true : saved === "1";
  } catch (_) {
    return true;
  }
}

function saveDrillEffect() {
  const value = drillEffectEnabled ? "1" : "0";
  try {
    localStorage.setItem(DRILL_EFFECT_KEY, value);
  } catch (_) {
    // The toggle still works for the current session.
  }
  writeCookieValue(DRILL_EFFECT_KEY, value);
}

function loadSpeedEffect() {
  try {
    const saved = readCookieValue(SPEED_EFFECT_KEY) ?? localStorage.getItem(SPEED_EFFECT_KEY);
    return saved === null ? true : saved === "1";
  } catch (_) {
    return true;
  }
}

function saveSpeedEffect() {
  const value = speedEffectEnabled ? "1" : "0";
  try {
    localStorage.setItem(SPEED_EFFECT_KEY, value);
  } catch (_) {
    // The toggle still works for the current session.
  }
  writeCookieValue(SPEED_EFFECT_KEY, value);
}

function saveUnits() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(units));
    localStorage.setItem(RECOVERY_KEY, "1");
  } catch (_) {
    // The app remains fully usable when local storage is blocked.
  }

  writeCookieValue(STORAGE_COOKIE, JSON.stringify(sanitiseUnits(units)));
}

function loadMatchupOrders() {
  try {
    const saved = JSON.parse(localStorage.getItem(MATCHUP_ORDER_KEY));
    if (saved && typeof saved === "object" && !Array.isArray(saved)) return saved;
  } catch (_) {
    // Fall back to the unit order when custom matchup ordering is unavailable.
  }
  return {};
}

function saveMatchupOrders() {
  try {
    localStorage.setItem(MATCHUP_ORDER_KEY, JSON.stringify(matchupOrders));
  } catch (_) {
    // Reordering still works for the current session when storage is blocked.
  }
}

function setUpdating(value) {
  saveState.classList.toggle("pending", value);
  saveState.lastChild.textContent = value ? "Saved · updating" : "Saved locally";
}

function updateResults(immediate = false) {
  if (updateTimer !== null) window.clearTimeout(updateTimer);
  setUpdating(true);

  const commit = () => {
    updateTimer = null;
    shownUnits = sanitiseUnits(units);
    matchupCache.clear();
    renderResults();
    setUpdating(false);
  };

  if (immediate) commit();
  else updateTimer = window.setTimeout(commit, 140);
}

function renderEditor() {
  unitGrid.replaceChildren();

  units.forEach(unit => {
    const card = unitCardTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.id = unit.id;
    card.style.setProperty("--unit-color", unit.color);

    const nameInput = card.querySelector('[data-field="name"]');
    const colorInput = card.querySelector('[data-field="color"]');
    const strikeInput = card.querySelector('[data-field="strike"]');
    const drillInput = card.querySelector('[data-field="drill"]');
    const speedInput = card.querySelector('[data-field="speed"]');
    const defenseInput = card.querySelector('[data-field="defense"]');
    const hpInput = card.querySelector('[data-field="hp"]');
    const apInput = card.querySelector('[data-field="ap"]');
    const removeButton = card.querySelector('[data-action="remove"]');

    nameInput.value = unit.name;
    colorInput.value = unit.color;
    strikeInput.value = unit.strike;
    drillInput.value = unit.drill;
    speedInput.value = unit.speed;
    defenseInput.value = unit.defense;
    hpInput.value = unit.hp;
    apInput.checked = unit.ap;
    removeButton.disabled = units.length <= MIN_UNITS;
    removeButton.setAttribute("aria-label", `Remove ${unit.name}`);

    unitGrid.append(card);
  });

  unitCount.textContent = `${units.length} / ${MAX_UNITS}`;
  addUnitButton.disabled = units.length >= MAX_UNITS;
}

function clearDropIndicators(container) {
  container.querySelectorAll(".drop-before, .drop-after").forEach(card => {
    card.classList.remove("drop-before", "drop-after");
  });
}

function reorderUnits(draggedId, targetId, insertAfter) {
  if (!draggedId || !targetId || draggedId === targetId) return;
  const fromIndex = units.findIndex(unit => unit.id === draggedId);
  if (fromIndex < 0) return;

  const reordered = [...units];
  const [moved] = reordered.splice(fromIndex, 1);
  let targetIndex = reordered.findIndex(unit => unit.id === targetId);
  if (targetIndex < 0) return;
  if (insertAfter) targetIndex += 1;
  reordered.splice(targetIndex, 0, moved);
  units = reordered;

  saveUnits();
  renderEditor();
  updateResults(true);
}

function makeSortable(container, cardSelector, idAttribute) {
  container.addEventListener("mousedown", event => {
    if (!event.target.closest('[data-action="drag"][data-drag-scope="card"]')) return;
    const card = event.target.closest(cardSelector);
    if (card) card.draggable = true;
  });

  container.addEventListener("dragstart", event => {
    const card = event.target.closest(cardSelector);
    if (!card || event.target !== card) return;
    if (!card.draggable) {
      event.preventDefault();
      return;
    }

    draggedUnitId = card.dataset[idAttribute];
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedUnitId);
  });

  container.addEventListener("dragover", event => {
    if (!draggedUnitId) return;
    const target = event.target.closest(cardSelector);
    if (!target || target.dataset[idAttribute] === draggedUnitId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    clearDropIndicators(container);
    const bounds = target.getBoundingClientRect();
    const insertAfter = event.clientX > bounds.left + bounds.width / 2;
    target.classList.add(insertAfter ? "drop-after" : "drop-before");
  });

  container.addEventListener("drop", event => {
    const target = event.target.closest(cardSelector);
    if (!target || !draggedUnitId) return;
    event.preventDefault();
    const insertAfter = target.classList.contains("drop-after");
    const targetId = target.dataset[idAttribute];
    clearDropIndicators(container);
    reorderUnits(draggedUnitId, targetId, insertAfter);
    draggedUnitId = null;
  });

  container.addEventListener("dragend", event => {
    const card = event.target.closest(cardSelector);
    if (!card || event.target !== card) return;
    card.classList.remove("dragging");
    card.removeAttribute("draggable");
    clearDropIndicators(container);
    draggedUnitId = null;
  });

  container.addEventListener("mouseup", event => {
    const card = event.target.closest(cardSelector);
    if (card && !card.classList.contains("dragging")) card.removeAttribute("draggable");
  });
}

function clearMatchupDropIndicators() {
  resultStage.querySelectorAll(".row-drop-before, .row-drop-after").forEach(row => {
    row.classList.remove("row-drop-before", "row-drop-after");
  });
}

function orderedOpponentsFor(unit) {
  const opponents = shownUnits.filter(opponent => opponent.id !== unit.id);
  const savedOrder = Array.isArray(matchupOrders[unit.id]) ? matchupOrders[unit.id] : [];
  const savedPositions = new Map(savedOrder.map((id, index) => [id, index]));
  const fallbackPositions = new Map(opponents.map((opponent, index) => [opponent.id, index]));

  return [...opponents].sort((a, b) => {
    const aSaved = savedPositions.has(a.id);
    const bSaved = savedPositions.has(b.id);
    if (aSaved && bSaved) return savedPositions.get(a.id) - savedPositions.get(b.id);
    if (aSaved) return -1;
    if (bSaved) return 1;
    return fallbackPositions.get(a.id) - fallbackPositions.get(b.id);
  });
}

function reorderMatchups(ownerId, draggedId, targetId, insertAfter) {
  const owner = shownUnits.find(unit => unit.id === ownerId);
  if (!owner || draggedId === targetId) return;
  const order = orderedOpponentsFor(owner).map(opponent => opponent.id);
  const fromIndex = order.indexOf(draggedId);
  if (fromIndex < 0) return;

  const [moved] = order.splice(fromIndex, 1);
  let targetIndex = order.indexOf(targetId);
  if (targetIndex < 0) return;
  if (insertAfter) targetIndex += 1;
  order.splice(targetIndex, 0, moved);
  matchupOrders[ownerId] = order;
  saveMatchupOrders();
  renderResults();
}

function enableMatchupRowSorting() {
  resultStage.addEventListener("mousedown", event => {
    if (!event.target.closest('[data-action="drag"][data-drag-scope="row"]')) return;
    const row = event.target.closest(".matchup-row");
    if (row) row.draggable = true;
  });

  resultStage.addEventListener("dragstart", event => {
    const row = event.target.closest(".matchup-row");
    if (!row || event.target !== row || !row.draggable) return;
    draggedMatchup = { ownerId: row.dataset.ownerId, opponentId: row.dataset.opponentId };
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${draggedMatchup.ownerId}:${draggedMatchup.opponentId}`);
  });

  resultStage.addEventListener("dragover", event => {
    if (!draggedMatchup) return;
    const target = event.target.closest(".matchup-row");
    if (!target
      || target.dataset.ownerId !== draggedMatchup.ownerId
      || target.dataset.opponentId === draggedMatchup.opponentId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    clearMatchupDropIndicators();
    const bounds = target.getBoundingClientRect();
    const insertAfter = event.clientY > bounds.top + bounds.height / 2;
    target.classList.add(insertAfter ? "row-drop-after" : "row-drop-before");
  });

  resultStage.addEventListener("drop", event => {
    if (!draggedMatchup) return;
    const target = event.target.closest(".matchup-row");
    if (!target || target.dataset.ownerId !== draggedMatchup.ownerId) return;
    event.preventDefault();
    const insertAfter = target.classList.contains("row-drop-after");
    reorderMatchups(
      draggedMatchup.ownerId,
      draggedMatchup.opponentId,
      target.dataset.opponentId,
      insertAfter
    );
    clearMatchupDropIndicators();
    draggedMatchup = null;
  });

  resultStage.addEventListener("dragend", event => {
    const row = event.target.closest(".matchup-row");
    if (!row || event.target !== row) return;
    row.classList.remove("dragging");
    row.removeAttribute("draggable");
    clearMatchupDropIndicators();
    draggedMatchup = null;
  });

  resultStage.addEventListener("mouseup", event => {
    const row = event.target.closest(".matchup-row");
    if (row && !row.classList.contains("dragging")) row.removeAttribute("draggable");
  });
}

function hitChance(attacker, defender) {
  if (attacker.ap) return 4 / 6;
  return (7 - defender.defense) / 6;
}

function explodingHitDistribution(dice, chance, lethalHits) {
  const cap = Math.max(1, lethalHits);
  const explodeChance = 1 / 6;
  const missChance = 1 - chance;
  const nonExplodingHitChance = chance - explodeChance;
  const singleDie = new Float64Array(cap + 1);
  singleDie[0] = missChance;

  let representedChance = missChance;
  for (let hits = 1; hits < cap; hits += 1) {
    singleDie[hits] = explodeChance ** (hits - 1)
      * (nonExplodingHitChance + explodeChance * missChance);
    representedChance += singleDie[hits];
  }
  singleDie[cap] = Math.max(0, 1 - representedChance);

  let distribution = new Float64Array(cap + 1);
  distribution[0] = 1;
  for (let die = 0; die < dice; die += 1) {
    const combined = new Float64Array(cap + 1);
    for (let currentHits = 0; currentHits <= cap; currentHits += 1) {
      if (distribution[currentHits] === 0) continue;
      for (let addedHits = 0; addedHits <= cap; addedHits += 1) {
        const totalHits = Math.min(cap, currentHits + addedHits);
        combined[totalHits] += distribution[currentHits] * singleDie[addedHits];
      }
    }
    distribution = combined;
  }

  return distribution;
}

function expectedAttackTurnsToKill(hitDistribution, hp) {
  const turns = new Float64Array(hp + 1);
  const successfulTurnChance = 1 - hitDistribution[0];

  for (let remainingHp = 1; remainingHp <= hp; remainingHp += 1) {
    let futureTurns = 0;
    for (let hits = 1; hits < hitDistribution.length && hits < remainingHp; hits += 1) {
      futureTurns += hitDistribution[hits] * turns[remainingHp - hits];
    }
    turns[remainingHp] = (1 + futureTurns) / successfulTurnChance;
  }

  return turns[hp];
}

function effectiveStrikes(a, b) {
  let adjustmentA = 0;
  let adjustmentB = 0;
  if (drillEffectEnabled && a.drill !== b.drill) {
    adjustmentA = a.drill > b.drill ? 1 : -1;
    adjustmentB = -adjustmentA;
  }
  return {
    strikeA: Math.max(0, a.strike + adjustmentA),
    strikeB: Math.max(0, b.strike + adjustmentB),
    adjustmentA,
    adjustmentB
  };
}

function speedAttackerFor(a, b) {
  if (!speedEffectEnabled || a.speed === b.speed) return null;
  return a.speed > b.speed ? "a" : "b";
}

function matchupKey(a, b) {
  const unitKey = unit => [unit.id, unit.strike, unit.drill, unit.speed, unit.ap ? 1 : 0, unit.defense, unit.hp].join(":");
  return `${drillEffectEnabled ? 1 : 0}:${speedEffectEnabled ? 1 : 0}|${unitKey(a)}|${unitKey(b)}`;
}

function getMatchup(a, b) {
  const key = matchupKey(a, b);
  const cached = matchupCache.get(key);
  if (cached) return cached;

  const chanceA = hitChance(a, b);
  const chanceB = hitChance(b, a);
  const { strikeA, strikeB, adjustmentA, adjustmentB } = effectiveStrikes(a, b);
  const hitsA = explodingHitDistribution(strikeA, chanceA, b.hp);
  const hitsB = explodingHitDistribution(strikeB, chanceB, a.hp);
  const makeTable = () => Array.from({ length: a.hp + 1 }, () => new Float64Array(b.hp + 1));
  const aFirst = makeTable();
  const bFirst = makeTable();
  const aVictoryTurnsFromA = makeTable();
  const aVictoryTurnsFromB = makeTable();
  const aVictoryHpFromA = makeTable();
  const aVictoryHpFromB = makeTable();
  const bVictoryTurnsFromA = makeTable();
  const bVictoryTurnsFromB = makeTable();
  const bVictoryHpFromA = makeTable();
  const bVictoryHpFromB = makeTable();
  const battleTurnsFromA = makeTable();
  const battleTurnsFromB = makeTable();
  const aActivationsFromA = makeTable();
  const aActivationsFromB = makeTable();
  const bActivationsFromA = makeTable();
  const bActivationsFromB = makeTable();

  for (let hpA = 1; hpA <= a.hp; hpA += 1) {
    for (let hpB = 1; hpB <= b.hp; hpB += 1) {
      let aPositiveResult = 0;
      let aTurnsAfterAHit = 0;
      let aHpAfterAHit = 0;
      let bTurnsAfterAHit = 0;
      let bHpAfterAHit = 0;
      let battleTurnsAfterAHit = 0;
      let aActivationsAfterAHit = 0;
      let bActivationsAfterAHit = 0;
      for (let hits = 1; hits < hitsA.length; hits += 1) {
        const probability = hitsA[hits];
        if (hits >= hpB) {
          aPositiveResult += probability;
          aHpAfterAHit += probability * hpA;
        } else {
          const remainingB = hpB - hits;
          aPositiveResult += probability * bFirst[hpA][remainingB];
          aTurnsAfterAHit += probability * aVictoryTurnsFromB[hpA][remainingB];
          aHpAfterAHit += probability * aVictoryHpFromB[hpA][remainingB];
          bTurnsAfterAHit += probability * bVictoryTurnsFromB[hpA][remainingB];
          bHpAfterAHit += probability * bVictoryHpFromB[hpA][remainingB];
          battleTurnsAfterAHit += probability * battleTurnsFromB[hpA][remainingB];
          aActivationsAfterAHit += probability * aActivationsFromB[hpA][remainingB];
          bActivationsAfterAHit += probability * bActivationsFromB[hpA][remainingB];
        }
      }

      let bPositiveResult = 0;
      let aTurnsAfterBHit = 0;
      let aHpAfterBHit = 0;
      let bTurnsAfterBHit = 0;
      let bHpAfterBHit = 0;
      let battleTurnsAfterBHit = 0;
      let aActivationsAfterBHit = 0;
      let bActivationsAfterBHit = 0;
      for (let hits = 1; hits < hitsB.length; hits += 1) {
        const probability = hitsB[hits];
        if (hits >= hpA) {
          bHpAfterBHit += probability * hpB;
        } else {
          const remainingA = hpA - hits;
          bPositiveResult += probability * aFirst[remainingA][hpB];
          aTurnsAfterBHit += probability * aVictoryTurnsFromA[remainingA][hpB];
          aHpAfterBHit += probability * aVictoryHpFromA[remainingA][hpB];
          bTurnsAfterBHit += probability * bVictoryTurnsFromA[remainingA][hpB];
          bHpAfterBHit += probability * bVictoryHpFromA[remainingA][hpB];
          battleTurnsAfterBHit += probability * battleTurnsFromA[remainingA][hpB];
          aActivationsAfterBHit += probability * aActivationsFromA[remainingA][hpB];
          bActivationsAfterBHit += probability * bActivationsFromA[remainingA][hpB];
        }
      }

      const denominator = 1 - hitsA[0] * hitsB[0];
      aFirst[hpA][hpB] = (aPositiveResult + hitsA[0] * bPositiveResult) / denominator;
      bFirst[hpA][hpB] = bPositiveResult + hitsB[0] * aFirst[hpA][hpB];

      aVictoryTurnsFromA[hpA][hpB] = (
        hitsA[0] * aTurnsAfterBHit
        + aTurnsAfterAHit
        + aFirst[hpA][hpB]
      ) / denominator;
      aVictoryTurnsFromB[hpA][hpB] = hitsB[0] * aVictoryTurnsFromA[hpA][hpB] + aTurnsAfterBHit;
      aVictoryHpFromA[hpA][hpB] = (hitsA[0] * aHpAfterBHit + aHpAfterAHit) / denominator;
      aVictoryHpFromB[hpA][hpB] = hitsB[0] * aVictoryHpFromA[hpA][hpB] + aHpAfterBHit;

      const bWinChanceFromB = 1 - bFirst[hpA][hpB];
      bVictoryTurnsFromA[hpA][hpB] = (
        hitsA[0] * (bTurnsAfterBHit + bWinChanceFromB)
        + bTurnsAfterAHit
      ) / denominator;
      bVictoryTurnsFromB[hpA][hpB] = hitsB[0] * bVictoryTurnsFromA[hpA][hpB]
        + bTurnsAfterBHit
        + bWinChanceFromB;
      bVictoryHpFromA[hpA][hpB] = (hitsA[0] * bHpAfterBHit + bHpAfterAHit) / denominator;
      bVictoryHpFromB[hpA][hpB] = hitsB[0] * bVictoryHpFromA[hpA][hpB] + bHpAfterBHit;

      battleTurnsFromA[hpA][hpB] = (
        1
        + hitsA[0]
        + hitsA[0] * battleTurnsAfterBHit
        + battleTurnsAfterAHit
      ) / denominator;
      battleTurnsFromB[hpA][hpB] = 1
        + hitsB[0] * battleTurnsFromA[hpA][hpB]
        + battleTurnsAfterBHit;

      aActivationsFromA[hpA][hpB] = (
        1
        + hitsA[0] * aActivationsAfterBHit
        + aActivationsAfterAHit
      ) / denominator;
      aActivationsFromB[hpA][hpB] = hitsB[0] * aActivationsFromA[hpA][hpB]
        + aActivationsAfterBHit;
      bActivationsFromA[hpA][hpB] = (
        hitsA[0] * (1 + bActivationsAfterBHit)
        + bActivationsAfterAHit
      ) / denominator;
      bActivationsFromB[hpA][hpB] = 1
        + hitsB[0] * bActivationsFromA[hpA][hpB]
        + bActivationsAfterBHit;
    }
  }

  const chanceAWhenFirst = aFirst[a.hp][b.hp];
  const chanceAWhenSecond = bFirst[a.hp][b.hp];
  const normalStateMetrics = (hpA, hpB) => ({
    chanceA: (aFirst[hpA][hpB] + bFirst[hpA][hpB]) / 2,
    battleTurns: (battleTurnsFromA[hpA][hpB] + battleTurnsFromB[hpA][hpB]) / 2,
    battleRounds: (aActivationsFromA[hpA][hpB] + bActivationsFromB[hpA][hpB]) / 2,
    weightedTurnsA: (aVictoryTurnsFromA[hpA][hpB] + aVictoryTurnsFromB[hpA][hpB]) / 2,
    weightedHpA: (aVictoryHpFromA[hpA][hpB] + aVictoryHpFromB[hpA][hpB]) / 2,
    weightedTurnsB: (bVictoryTurnsFromA[hpA][hpB] + bVictoryTurnsFromB[hpA][hpB]) / 2,
    weightedHpB: (bVictoryHpFromA[hpA][hpB] + bVictoryHpFromB[hpA][hpB]) / 2
  });
  const normalMetrics = normalStateMetrics(a.hp, b.hp);
  const speedAttacker = speedAttackerFor(a, b);
  let chanceAOverall = normalMetrics.chanceA;
  let battleTurns = normalMetrics.battleTurns;
  let battleRounds = normalMetrics.battleRounds;
  let weightedTurnsA = normalMetrics.weightedTurnsA;
  let weightedHpA = normalMetrics.weightedHpA;
  let weightedTurnsB = normalMetrics.weightedTurnsB;
  let weightedHpB = normalMetrics.weightedHpB;

  if (speedAttacker) {
    chanceAOverall = 0;
    battleTurns = 1;
    battleRounds = 1;
    weightedTurnsA = 0;
    weightedHpA = 0;
    weightedTurnsB = 0;
    weightedHpB = 0;
    const openingHits = speedAttacker === "a" ? hitsA : hitsB;
    openingHits.forEach((probability, hits) => {
      if (!probability) return;
      const isLethal = speedAttacker === "a" ? hits >= b.hp : hits >= a.hp;
      if (isLethal) {
        if (speedAttacker === "a") {
          chanceAOverall += probability;
          weightedTurnsA += probability;
          weightedHpA += probability * a.hp;
        } else {
          weightedTurnsB += probability;
          weightedHpB += probability * b.hp;
        }
        return;
      }

      const remainingHpA = speedAttacker === "b" ? a.hp - hits : a.hp;
      const remainingHpB = speedAttacker === "a" ? b.hp - hits : b.hp;
      const continuation = normalStateMetrics(remainingHpA, remainingHpB);
      const chanceB = 1 - continuation.chanceA;
      chanceAOverall += probability * continuation.chanceA;
      battleTurns += probability * continuation.battleTurns;
      battleRounds += probability * continuation.battleRounds;
      weightedTurnsA += probability * (
        continuation.weightedTurnsA
        + (speedAttacker === "a" ? continuation.chanceA : 0)
      );
      weightedHpA += probability * continuation.weightedHpA;
      weightedTurnsB += probability * (
        continuation.weightedTurnsB
        + (speedAttacker === "b" ? chanceB : 0)
      );
      weightedHpB += probability * continuation.weightedHpB;
    });
  }

  chanceAOverall = Math.min(1, Math.max(0, chanceAOverall));
  const chanceBOverall = 1 - chanceAOverall;
  const shareA = chanceAOverall * 100;
  const soloTurnsA = expectedAttackTurnsToKill(hitsA, b.hp);
  const soloTurnsB = expectedAttackTurnsToKill(hitsB, a.hp);
  const victoryTurnsA = chanceAOverall > Number.EPSILON ? weightedTurnsA / chanceAOverall : null;
  const victoryHpA = chanceAOverall > Number.EPSILON
    ? Math.min(a.hp, Math.max(1, weightedHpA / chanceAOverall))
    : null;
  const victoryTurnsB = chanceBOverall > Number.EPSILON ? weightedTurnsB / chanceBOverall : null;
  const victoryHpB = chanceBOverall > Number.EPSILON
    ? Math.min(b.hp, Math.max(1, weightedHpB / chanceBOverall))
    : null;
  const result = {
    a,
    b,
    effectiveStrikeA: strikeA,
    effectiveStrikeB: strikeB,
    strikeAdjustmentA: adjustmentA,
    strikeAdjustmentB: adjustmentB,
    speedAttacker,
    hitChanceA: chanceA,
    hitChanceB: chanceB,
    expectedHitsA: strikeA * chanceA / (1 - 1 / 6),
    expectedHitsB: strikeB * chanceB / (1 - 1 / 6),
    chanceAWhenFirst,
    chanceAWhenSecond,
    shareA,
    victoryTurnsA,
    victoryTurnsB,
    victoryHpA,
    victoryHpB,
    battleTurns,
    battleRounds,
    soloTurnsA,
    soloTurnsB,
    winner: shareA > 50.000001 ? "a" : shareA < 49.999999 ? "b" : "even"
  };

  const reverse = {
    a: b,
    b: a,
    effectiveStrikeA: strikeB,
    effectiveStrikeB: strikeA,
    strikeAdjustmentA: adjustmentB,
    strikeAdjustmentB: adjustmentA,
    speedAttacker: speedAttacker === "a" ? "b" : speedAttacker === "b" ? "a" : null,
    hitChanceA: chanceB,
    hitChanceB: chanceA,
    expectedHitsA: strikeB * chanceB / (1 - 1 / 6),
    expectedHitsB: strikeA * chanceA / (1 - 1 / 6),
    chanceAWhenFirst: 1 - chanceAWhenSecond,
    chanceAWhenSecond: 1 - chanceAWhenFirst,
    shareA: 100 - shareA,
    victoryTurnsA: victoryTurnsB,
    victoryTurnsB: victoryTurnsA,
    victoryHpA: victoryHpB,
    victoryHpB: victoryHpA,
    battleTurns,
    battleRounds,
    soloTurnsA: soloTurnsB,
    soloTurnsB: soloTurnsA,
    winner: shareA < 49.999999 ? "a" : shareA > 50.000001 ? "b" : "even"
  };

  matchupCache.set(key, result);
  matchupCache.set(matchupKey(b, a), reverse);
  return result;
}

function hitTarget(attacker, defender) {
  return attacker.ap ? "3+ (AP)" : `${defender.defense}+`;
}

function matchupStrikeText(unit, effectiveStrike, adjustment) {
  if (!adjustment) return `${effectiveStrike} dice`;
  const signedAdjustment = adjustment > 0 ? "+1" : "−1";
  return `${effectiveStrike} dice (base STR ${unit.strike}, Drill ${signedAdjustment})`;
}

function matchupInitiativeText(matchup) {
  if (!matchup.speedAttacker) return "Battle values average both possible attack orders.";
  const attacker = matchup.speedAttacker === "a" ? matchup.a : matchup.b;
  return `${attacker.name} makes one free opening attack due to higher Speed; the remaining fight averages both possible attack orders.`;
}

function matchupTitle(matchup) {
  return `Expected combat duration: ${formatMetric(matchup.battleRounds)} rounds. ${matchup.a.name}: ${matchupStrikeText(matchup.a, matchup.effectiveStrikeA, matchup.strikeAdjustmentA)} hitting on ${hitTarget(matchup.a, matchup.b)}, ${matchup.expectedHitsA.toFixed(2)} expected hits per attack with exploding 6s and ${formatMetric(matchup.soloTurnsA)} uninterrupted rounds to kill. When it wins: ${formatMetric(matchup.victoryHpA)} HP remaining. ${matchup.b.name}: ${matchupStrikeText(matchup.b, matchup.effectiveStrikeB, matchup.strikeAdjustmentB)} hitting on ${hitTarget(matchup.b, matchup.a)}, ${matchup.expectedHitsB.toFixed(2)} expected hits per attack with exploding 6s and ${formatMetric(matchup.soloTurnsB)} uninterrupted rounds to kill. When it wins: ${formatMetric(matchup.victoryHpB)} HP remaining. ${matchupInitiativeText(matchup)}`;
}

function comparisonsFor(unit) {
  return orderedOpponentsFor(unit).map(opponent => getMatchup(unit, opponent));
}

function averageShare(matchups) {
  return matchups.reduce((sum, matchup) => sum + matchup.shareA, 0) / matchups.length;
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function closeSetMenu() {
  setMenu.hidden = true;
  setsButton.setAttribute("aria-expanded", "false");
}

function renderUnitSets() {
  setsCount.textContent = String(unitSets.length);
  setEmpty.hidden = unitSets.length > 0;
  setList.replaceChildren();

  unitSets.forEach(set => {
    const item = createElement("div", "set-item");
    item.dataset.setId = set.id;
    const details = createElement("div", "set-item-details");
    details.append(
      createElement("strong", "", set.name),
      createElement("span", "", `${set.units.length} units`)
    );

    const loadButton = createElement("button", "set-item-load", "Load");
    loadButton.type = "button";
    loadButton.dataset.action = "load-set";
    loadButton.setAttribute("aria-label", `Load ${set.name}`);

    const deleteButton = createElement("button", "set-item-delete", "Delete");
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete-set";
    deleteButton.setAttribute("aria-label", `Delete ${set.name}`);

    item.append(details, loadButton, deleteButton);
    setList.append(item);
  });
}

function saveNamedUnitSet(name) {
  const cleanName = name.trim().slice(0, 32);
  if (!cleanName) return;
  const existing = unitSets.find(set => set.name.toLowerCase() === cleanName.toLowerCase());
  const saved = {
    id: existing?.id || `set-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: cleanName,
    units: sanitiseUnits(units),
    updatedAt: Date.now()
  };
  unitSets = [saved, ...unitSets.filter(set => set.id !== saved.id)];
  saveUnitSets();
  renderUnitSets();
  setName.value = "";
  setName.focus();
}

function loadNamedUnitSet(id) {
  const saved = unitSets.find(set => set.id === id);
  if (!saved) return;
  if (updateTimer !== null) {
    window.clearTimeout(updateTimer);
    updateTimer = null;
  }
  units = sanitiseUnits(saved.units);
  shownUnits = cloneUnits(units);
  matchupOrders = {};
  matrixCustomOrder = units.map(unit => unit.id);
  matchupCache.clear();
  saveUnits();
  saveMatchupOrders();
  saveMatrixCustomOrder();
  renderEditor();
  renderResults();
  setUpdating(false);
  closeSetMenu();
}

function deleteNamedUnitSet(id) {
  const saved = unitSets.find(set => set.id === id);
  if (!saved || !window.confirm(`Delete the saved set “${saved.name}”?`)) return;
  unitSets = unitSets.filter(set => set.id !== id);
  deleteCookieValue(`${UNIT_SET_COOKIE_PREFIX}${id}`);
  saveUnitSets();
  renderUnitSets();
}

function createUnitHeading(unit) {
  const heading = createElement("div", "unit-heading");
  const dot = createElement("span", "unit-dot");
  dot.style.setProperty("--dot-color", unit.color);
  heading.append(dot, createElement("span", "", unit.name));
  return heading;
}

function shareLabel(matchup) {
  return `${Math.round(matchup.shareA)}%`;
}

function victoryDetails(matchup) {
  const useA = matchup.winner !== "b";
  return {
    unit: useA ? matchup.a : matchup.b,
    rounds: matchup.battleRounds,
    hp: useA ? matchup.victoryHpA : matchup.victoryHpB,
    isEven: matchup.winner === "even"
  };
}

function formatMetric(value) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(1).replace(/\.0$/, "");
}

function renderBars() {
  const groups = createElement("div", "matchup-groups");
  groups.dataset.count = String(shownUnits.length);

  shownUnits.forEach(unit => {
    const comparisons = comparisonsFor(unit);
    const card = createElement("article", "matchup-card");
    card.dataset.unitId = unit.id;
    const head = createElement("div", "matchup-card-head");
    const title = createElement("div", "matchup-card-title");
    const dragHandle = createElement("button", "drag-handle", "⠿");
    dragHandle.type = "button";
    dragHandle.dataset.action = "drag";
    dragHandle.dataset.dragScope = "card";
    dragHandle.title = "Drag to reorder";
    dragHandle.setAttribute("aria-label", `Drag to reorder ${unit.name}`);
    const average = createElement("span", "average-badge", `AVG ${Math.round(averageShare(comparisons))}`);
    title.append(dragHandle, createUnitHeading(unit));
    head.append(title, average);

    const list = createElement("div", "matchup-list");
    list.style.setProperty("--rows", comparisons.length);

    comparisons.forEach(matchup => {
      const row = createElement("div", "matchup-row");
      row.dataset.ownerId = unit.id;
      row.dataset.opponentId = matchup.b.id;
      const labels = createElement("div", "matchup-labels");
      const labelMain = createElement("div", "matchup-label-main");
      const rowDragHandle = createElement("button", "drag-handle matchup-row-handle", "⠿");
      rowDragHandle.type = "button";
      rowDragHandle.dataset.action = "drag";
      rowDragHandle.dataset.dragScope = "row";
      rowDragHandle.title = "Drag to reorder this matchup";
      rowDragHandle.setAttribute("aria-label", `Drag ${unit.name} vs ${matchup.b.name} to reorder`);
      labelMain.append(rowDragHandle, createElement("span", "", `vs ${matchup.b.name}`));
      labels.append(
        labelMain,
        createElement("strong", "", shareLabel(matchup))
      );

      const bar = createElement("div", "duel-bar");
      bar.title = matchupTitle(matchup);
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", `${unit.name} ${Math.round(matchup.shareA)} percent, ${matchup.b.name} ${Math.round(100 - matchup.shareA)} percent. ${matchupTitle(matchup)}`);
      const own = createElement("span", "duel-segment");
      const opponent = createElement("span", "duel-segment");
      own.style.width = `${matchup.shareA}%`;
      own.style.background = unit.color;
      opponent.style.width = `${100 - matchup.shareA}%`;
      opponent.style.background = matchup.b.color;
      bar.append(own, opponent);

      const victory = victoryDetails(matchup);
      const readout = createElement("div", "victory-readout");
      const victor = createElement("span", "victor-name");
      const victorDot = createElement("i", "victor-dot");
      victorDot.style.setProperty("--victor-color", victory.unit.color);
      victor.append(
        victorDot,
        createElement("span", "", `${victory.isEven ? "if " : ""}${victory.unit.name}`)
      );

      const facts = createElement("span", "victory-facts");
      const turns = createElement("span", "victory-metric");
      turns.title = "Expected rounds until either unit dies";
      turns.append(
        createElement("i", "turn-icon", "◷"),
        createElement("b", "", `${formatMetric(victory.rounds)} rounds`)
      );
      const hp = createElement("span", "victory-metric hp-metric");
      hp.title = `Expected HP remaining when ${victory.unit.name} wins`;
      hp.append(
        createElement("i", "heart-icon", "♥"),
        createElement("b", "", `${formatMetric(victory.hp)} HP`)
      );
      const hpGauge = createElement("span", "survivor-gauge");
      hpGauge.style.setProperty("--hp-left", `${Number.isFinite(victory.hp) ? Math.min(100, victory.hp / victory.unit.hp * 100) : 0}%`);
      hpGauge.style.setProperty("--victor-color", victory.unit.color);
      hp.append(hpGauge);
      facts.append(turns, hp);
      readout.append(victor, facts);

      row.append(labels, bar, readout);
      list.append(row);
    });

    card.append(head, list);
    groups.append(card);
  });

  resultStage.replaceChildren(groups);
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function mixColours(baseHex, colourHex, amount) {
  const base = hexToRgb(baseHex);
  const colour = hexToRgb(colourHex);
  const mix = channel => Math.round(base[channel] + (colour[channel] - base[channel]) * amount);
  return `rgb(${mix("r")}, ${mix("g")}, ${mix("b")})`;
}

function semanticMatrixColour(share) {
  const neutral = hexToRgb("#eeece5");
  const endpoint = hexToRgb(share >= 50 ? "#187659" : "#824a7a");
  const amount = Math.pow(Math.min(1, Math.abs(share - 50) / 35), .75);
  const channel = name => Math.round(neutral[name] + (endpoint[name] - neutral[name]) * amount);
  const rgb = { r: channel("r"), g: channel("g"), b: channel("b") };
  const luminance = (rgb.r * .2126 + rgb.g * .7152 + rgb.b * .0722) / 255;
  return {
    background: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    foreground: luminance < .52 ? "#ffffff" : "#202521"
  };
}

function strengthEntries() {
  return shownUnits.map((unit, index) => {
    const matchups = shownUnits
      .filter(opponent => opponent.id !== unit.id)
      .map(opponent => getMatchup(unit, opponent));
    return {
      unit,
      index,
      average: averageShare(matchups),
      wins: matchups.filter(matchup => matchup.shareA > 50).length
    };
  });
}

function matchupPatternDistance(a, b, centreProfiles = false) {
  const commonOpponents = shownUnits.filter(unit => unit.id !== a.id && unit.id !== b.id);
  if (!commonOpponents.length) return 0;
  const profileA = commonOpponents.map(opponent => getMatchup(a, opponent).shareA);
  const profileB = commonOpponents.map(opponent => getMatchup(b, opponent).shareA);
  const averageA = centreProfiles ? profileA.reduce((sum, value) => sum + value, 0) / profileA.length : 0;
  const averageB = centreProfiles ? profileB.reduce((sum, value) => sum + value, 0) / profileB.length : 0;
  const squaredDifference = commonOpponents.reduce((total, _, index) => {
    const difference = ((profileA[index] - averageA) - (profileB[index] - averageB)) / 50;
    return total + difference * difference;
  }, 0);
  return Math.sqrt(squaredDifference / commonOpponents.length);
}

function matrixUnitOrder() {
  if (matrixSort === "roster") return [...shownUnits];
  if (matrixSort === "custom") {
    const unitsById = new Map(shownUnits.map(unit => [unit.id, unit]));
    const ordered = matrixCustomOrder
      .map(id => unitsById.get(id))
      .filter(Boolean);
    const orderedIds = new Set(ordered.map(unit => unit.id));
    return [...ordered, ...shownUnits.filter(unit => !orderedIds.has(unit.id))];
  }
  if (shownUnits.length < 3) return [...shownUnits];
  const entries = strengthEntries();
  const entryById = new Map(entries.map(entry => [entry.unit.id, entry]));
  const strengthOrder = [...entries].sort((a, b) =>
    b.average - a.average || b.wins - a.wins || a.index - b.index
  );
  if (matrixSort === "strength") return strengthOrder.map(entry => entry.unit);

  const distanceCache = new Map();
  const distance = (a, b) => {
    const key = [a.id, b.id].sort().join("|");
    if (distanceCache.has(key)) return distanceCache.get(key);
    const value = matchupPatternDistance(a, b);
    distanceCache.set(key, value);
    return value;
  };
  const pathCost = path => path.slice(1).reduce(
    (total, unit, index) => total + distance(path[index], unit),
    0
  );
  const improvePath = original => {
    let path = [...original];
    let improved = true;
    while (improved) {
      improved = false;
      const currentCost = pathCost(path);
      for (let start = 0; start < path.length - 1 && !improved; start += 1) {
        for (let end = start + 1; end < path.length; end += 1) {
          const candidate = [
            ...path.slice(0, start),
            ...path.slice(start, end + 1).reverse(),
            ...path.slice(end + 1)
          ];
          if (pathCost(candidate) < currentCost - 1e-9) {
            path = candidate;
            improved = true;
            break;
          }
        }
      }
    }
    return path;
  };

  let bestPath = null;
  let bestCost = Infinity;
  shownUnits.forEach(firstUnit => {
    const path = [firstUnit];
    const remaining = shownUnits.filter(unit => unit.id !== firstUnit.id);
    while (remaining.length) {
      const last = path[path.length - 1];
      remaining.sort((a, b) => {
        const difference = distance(last, a) - distance(last, b);
        if (Math.abs(difference) > 1e-9) return difference;
        const aEntry = entryById.get(a.id);
        const bEntry = entryById.get(b.id);
        return bEntry.average - aEntry.average || aEntry.index - bEntry.index;
      });
      path.push(remaining.shift());
    }
    const improved = improvePath(path);
    const firstEntry = entryById.get(improved[0].id);
    const lastEntry = entryById.get(improved[improved.length - 1].id);
    if (lastEntry.average > firstEntry.average + 1e-9) improved.reverse();
    const cost = pathCost(improved);
    if (cost < bestCost - 1e-9) {
      bestPath = improved;
      bestCost = cost;
    }
  });
  return bestPath || strengthOrder.map(entry => entry.unit);
}

function reorderMatrixUnits(draggedId, targetId, insertAfter) {
  if (!draggedId || !targetId || draggedId === targetId) return;
  const order = matrixUnitOrder().map(unit => unit.id);
  const fromIndex = order.indexOf(draggedId);
  if (fromIndex < 0) return;

  const [moved] = order.splice(fromIndex, 1);
  let targetIndex = order.indexOf(targetId);
  if (targetIndex < 0) return;
  if (insertAfter) targetIndex += 1;
  order.splice(targetIndex, 0, moved);
  matrixCustomOrder = order;
  saveMatrixCustomOrder();
  renderMatrix();
}

function clearMatrixDropIndicators(grid) {
  grid.querySelectorAll(".matrix-row-drop-before, .matrix-row-drop-after").forEach(item => {
    item.classList.remove("matrix-row-drop-before", "matrix-row-drop-after");
  });
}

function markMatrixDropRow(grid, rowId, insertAfter) {
  clearMatrixDropIndicators(grid);
  grid.querySelectorAll("[data-matrix-row-id]").forEach(item => {
    if (item.dataset.matrixRowId === rowId) {
      item.classList.add(insertAfter ? "matrix-row-drop-after" : "matrix-row-drop-before");
    }
  });
}

function enableMatrixRowSorting(grid) {
  grid.addEventListener("mousedown", event => {
    const handle = event.target.closest('[data-action="drag-matrix-row"]');
    const row = handle?.closest(".matrix-row");
    if (row) row.draggable = true;
  });

  grid.addEventListener("dragstart", event => {
    const row = event.target.closest(".matrix-row");
    if (!row?.draggable) {
      event.preventDefault();
      return;
    }
    draggedMatrixUnitId = row.dataset.matrixRowId;
    grid.querySelectorAll("[data-matrix-row-id]").forEach(item => {
      item.classList.toggle("matrix-row-dragging", item.dataset.matrixRowId === draggedMatrixUnitId);
    });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedMatrixUnitId);
  });

  grid.addEventListener("dragover", event => {
    if (!draggedMatrixUnitId) return;
    const target = event.target.closest("[data-matrix-row-id]");
    const targetId = target?.dataset.matrixRowId;
    if (!targetId || targetId === draggedMatrixUnitId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rowHead = [...grid.querySelectorAll(".matrix-row")]
      .find(row => row.dataset.matrixRowId === targetId);
    if (!rowHead) return;
    const bounds = rowHead.getBoundingClientRect();
    markMatrixDropRow(grid, targetId, event.clientY > bounds.top + bounds.height / 2);
  });

  grid.addEventListener("drop", event => {
    const target = event.target.closest("[data-matrix-row-id]");
    const targetId = target?.dataset.matrixRowId;
    if (!draggedMatrixUnitId || !targetId) return;
    event.preventDefault();
    const insertAfter = target.classList.contains("matrix-row-drop-after");
    clearMatrixDropIndicators(grid);
    const draggedId = draggedMatrixUnitId;
    draggedMatrixUnitId = null;
    reorderMatrixUnits(draggedId, targetId, insertAfter);
  });

  grid.addEventListener("dragend", () => {
    draggedMatrixUnitId = null;
    clearMatrixDropIndicators(grid);
    grid.querySelectorAll(".matrix-row-dragging").forEach(item => item.classList.remove("matrix-row-dragging"));
    grid.querySelectorAll(".matrix-row[draggable]").forEach(row => { row.draggable = false; });
  });

  grid.addEventListener("mouseup", event => {
    const row = event.target.closest(".matrix-row");
    if (row && !draggedMatrixUnitId) row.removeAttribute("draggable");
  });
}

function renderMatrix() {
  const view = createElement("div", "matrix-view");
  const toolbar = createElement("div", "visual-toolbar matrix-toolbar");
  const sortControl = createElement("div", "mini-switcher");
  [
    ["roster", "Roster"],
    ["strength", "Strength"],
    ["similar", "Similar matchups"],
    ["custom", "Custom"]
  ].forEach(([value, label]) => {
    const button = createElement("button", matrixSort === value ? "active" : "", label);
    button.type = "button";
    button.title = value === "strength"
      ? "Order by average win chance against the current roster"
      : value === "similar"
        ? "Place units with similar matchup patterns together"
        : value === "custom"
          ? "Drag matrix rows into your preferred order"
          : "Use your manually arranged roster order";
    button.addEventListener("click", () => {
      if (value === "custom" && !matrixCustomOrder.length) {
        matrixCustomOrder = matrixUnitOrder().map(unit => unit.id);
        saveMatrixCustomOrder();
      }
      matrixSort = value;
      saveMatrixSort();
      renderMatrix();
    });
    sortControl.append(button);
  });
  toolbar.append(
    createElement("span", "visual-toolbar-label", "Order"),
    sortControl,
    createElement(
      "span",
      "visual-toolbar-note",
      matrixSort === "custom" ? "Drag row handles to reorder" : "Cell: row win chance · expected rounds"
    )
  );

  const matrixUnits = matrixUnitOrder();
  const strengths = new Map(strengthEntries().map(entry => [entry.unit.id, entry.average]));
  const grid = createElement("div", "matrix-grid");
  grid.style.setProperty("--unit-total", matrixUnits.length);
  grid.classList.toggle("dense", matrixUnits.length > 8);
  grid.append(createElement("div", "matrix-corner", "Row win %"));

  matrixUnits.forEach(unit => {
    const column = createElement("div", "matrix-column");
    column.append(createElement("span", "", unit.name));
    column.title = unit.name;
    grid.append(column);
  });

  matrixUnits.forEach(rowUnit => {
    const rowHead = createElement("div", "matrix-row");
    rowHead.dataset.matrixRowId = rowUnit.id;
    if (matrixSort === "custom") {
      const dragHandle = createElement("button", "drag-handle matrix-row-handle", "⠿");
      dragHandle.type = "button";
      dragHandle.dataset.action = "drag-matrix-row";
      dragHandle.title = `Drag ${rowUnit.name} to reorder the matrix`;
      dragHandle.setAttribute("aria-label", `Drag ${rowUnit.name} to reorder the matrix`);
      rowHead.append(dragHandle);
    }
    rowHead.append(
      createUnitHeading(rowUnit),
      createElement("span", "matrix-row-score", `${Math.round(strengths.get(rowUnit.id))}`)
    );
    grid.append(rowHead);

    matrixUnits.forEach(opponent => {
      if (rowUnit.id === opponent.id) {
        const cell = createElement("div", "matrix-cell diagonal", "—");
        cell.dataset.matrixRowId = rowUnit.id;
        grid.append(cell);
        return;
      }

      const matchup = getMatchup(rowUnit, opponent);
      const cell = createElement("div", "matrix-cell");
      cell.dataset.matrixRowId = rowUnit.id;
      cell.append(
        createElement("strong", "matrix-cell-chance", `${Math.round(matchup.shareA)}%`),
        createElement("span", "matrix-cell-rounds", `◷ ${formatMetric(matchup.battleRounds)}r`)
      );
      const colour = semanticMatrixColour(matchup.shareA);
      cell.style.background = colour.background;
      cell.style.color = colour.foreground;
      cell.style.setProperty("--row-color", "#187659");
      cell.style.setProperty("--opponent-color", "#824a7a");
      cell.style.setProperty("--share", `${matchup.shareA}%`);
      cell.title = matchupTitle(matchup);
      cell.setAttribute("role", "img");
      cell.setAttribute("aria-label", `${rowUnit.name} has a ${Math.round(matchup.shareA)} percent chance to beat ${opponent.name}`);
      grid.append(cell);
    });
  });

  const legend = createElement("div", "matrix-legend");
  legend.append(
    createElement("span", "", "Column favoured · 0%"),
    createElement("span", "legend-gradient"),
    createElement("span", "", "100% · Row favoured")
  );
  view.append(toolbar, grid, legend);
  resultStage.replaceChildren(view);
  if (matrixSort === "custom") enableMatrixRowSorting(grid);
}

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(tag, attributes = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function similarityLayout(units, metric) {
  const count = units.length;
  const distances = Array.from({ length: count }, () => new Float64Array(count));
  for (let first = 0; first < count; first += 1) {
    for (let second = first + 1; second < count; second += 1) {
      const value = matchupPatternDistance(units[first], units[second], metric === "specialization");
      distances[first][second] = value;
      distances[second][first] = value;
    }
  }

  let positions = units.map((_, index) => {
    const angle = Math.PI * 2 * index / count;
    const radius = 1 + (index % 3) * .08;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });

  for (let iteration = 0; iteration < 300; iteration += 1) {
    const next = positions.map((position, first) => {
      let x = 0;
      let y = 0;
      for (let second = 0; second < count; second += 1) {
        if (first === second) continue;
        const dx = position.x - positions[second].x;
        const dy = position.y - positions[second].y;
        const currentDistance = Math.max(1e-9, Math.hypot(dx, dy));
        const scale = distances[first][second] / currentDistance;
        x += scale * dx;
        y += scale * dy;
      }
      return { x: x / count, y: y / count };
    });
    const centre = next.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 });
    centre.x /= count;
    centre.y /= count;
    let movement = 0;
    next.forEach((point, index) => {
      point.x -= centre.x;
      point.y -= centre.y;
      movement += Math.hypot(point.x - positions[index].x, point.y - positions[index].y);
    });
    positions = next;
    if (movement < 1e-8) break;
  }

  return { positions, distances };
}

function fitSimilarityLayout(positions, width, height) {
  const paddingX = 115;
  const paddingY = 55;
  const xs = positions.map(point => point.x);
  const ys = positions.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX < 1e-9 && spanY < 1e-9) {
    return positions.map(() => ({ x: width / 2, y: height / 2 }));
  }
  const scale = Math.min(
    (width - paddingX * 2) / Math.max(spanX, 1e-9),
    (height - paddingY * 2) / Math.max(spanY, 1e-9)
  );
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  return positions.map(point => ({
    x: width / 2 + (point.x - centreX) * scale,
    y: height / 2 + (point.y - centreY) * scale
  }));
}

function renderSimilarity() {
  const view = createElement("div", "similarity-view");
  const specializationMode = similarityMetric === "specialization";
  const toolbar = createElement("div", "visual-toolbar similarity-toolbar");
  const metricControl = createElement("div", "mini-switcher");
  [
    ["overall", "Overall results"],
    ["specialization", "Specialization"]
  ].forEach(([value, label]) => {
    const button = createElement("button", similarityMetric === value ? "active" : "", label);
    button.type = "button";
    button.title = value === "specialization"
      ? "Compare preferred and unfavourable opponents after removing each unit's average strength"
      : "Compare raw win probabilities against common opponents";
    button.addEventListener("click", () => {
      similarityMetric = value;
      saveSimilarityMetric();
      renderSimilarity();
    });
    metricControl.append(button);
  });
  toolbar.append(
    createElement("span", "visual-toolbar-label", "Compare"),
    metricControl,
    createElement(
      "span",
      "visual-toolbar-note",
      similarityMetric === "specialization"
        ? "Average strength removed · proximity reflects matchup niches"
        : "Closer points have more similar raw matchup results"
    )
  );

  const minimumUnits = specializationMode ? 4 : 3;
  if (shownUnits.length < minimumUnits) {
    const empty = createElement(
      "div",
      "similarity-empty",
      specializationMode
        ? "Add a fourth unit to compare specialization patterns across multiple common opponents."
        : "Add a third unit to compare matchup patterns against common opponents."
    );
    view.append(toolbar, empty);
    resultStage.replaceChildren(view);
    return;
  }

  const width = 1200;
  const height = 520;
  const { positions, distances } = similarityLayout(shownUnits, similarityMetric);
  const differenceLabel = specializationMode ? "specialization-pattern difference" : "matchup difference";
  const fitted = fitSimilarityLayout(positions, width, height);
  const svg = createSvgElement("svg", {
    class: "similarity-map",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": specializationMode
      ? "Specialization map of unit matchup profiles. Average strength is removed, so nearby units favour and struggle against similar opponents."
      : "Similarity map of unit matchup profiles. Units placed closer together have more similar results against the rest of the roster."
  });
  svg.append(createSvgElement("desc", {}, specializationMode
    ? "Each unit's average win rate is removed before comparison. Distances approximate specialization patterns in two dimensions; the axes have no independent meaning."
    : "Distances approximate each unit's complete matchup profile in two dimensions. The horizontal and vertical axes have no independent meaning."));

  const links = createSvgElement("g", { class: "similarity-links", "aria-hidden": "true" });
  const linkedPairs = new Set();
  shownUnits.forEach((_, first) => {
    let nearest = -1;
    let nearestDistance = Infinity;
    shownUnits.forEach((__, second) => {
      if (first !== second && distances[first][second] < nearestDistance) {
        nearest = second;
        nearestDistance = distances[first][second];
      }
    });
    const key = [first, nearest].sort((a, b) => a - b).join("-");
    if (nearest < 0 || linkedPairs.has(key)) return;
    linkedPairs.add(key);
    links.append(createSvgElement("line", {
      x1: fitted[first].x,
      y1: fitted[first].y,
      x2: fitted[nearest].x,
      y2: fitted[nearest].y
    }));
  });
  svg.append(links);

  shownUnits.forEach((unit, index) => {
    const nearest = shownUnits
      .map((other, otherIndex) => ({ other, otherIndex, distance: distances[index][otherIndex] }))
      .filter(entry => entry.otherIndex !== index)
      .sort((a, b) => a.distance - b.distance)[0];
    const point = fitted[index];
    const node = createSvgElement("g", {
      class: "similarity-node",
      transform: `translate(${point.x} ${point.y})`,
      tabindex: "0",
      role: "img",
      "aria-label": `${unit.name}. Closest profile: ${nearest.other.name}, ${formatMetric(nearest.distance * 50)} percentage points of ${differenceLabel}.`
    });
    node.append(createSvgElement("title", {}, `${unit.name}\nClosest profile: ${nearest.other.name}\nRMS ${differenceLabel}: ${formatMetric(nearest.distance * 50)} percentage points`));
    node.append(createSvgElement("circle", { r: 8, fill: unit.color }));
    const placeLabelLeft = point.x > width - 190;
    node.append(createSvgElement("text", {
      x: placeLabelLeft ? -13 : 13,
      y: 4,
      "text-anchor": placeLabelLeft ? "end" : "start"
    }, unit.name));
    svg.append(node);
  });

  const caption = createElement("div", "similarity-caption");
  caption.append(
    createElement("span", "", "Lines connect each unit to its nearest matchup profile."),
    createElement(
      "span",
      "",
      specializationMode
        ? "Each profile is centred on its own average · axes have no meaning"
        : "Axes and orientation have no meaning · distances are a 2D approximation"
    )
  );
  view.append(toolbar, svg, caption);
  resultStage.replaceChildren(view);
}

function renderCounters() {
  const view = createElement("div", "counter-view");
  const toolbar = createElement("div", "visual-toolbar counter-toolbar");
  const thresholdControl = createElement("div", "mini-switcher");
  [60, 65, 70, 75, 80].forEach(value => {
    const button = createElement("button", counterThreshold === value ? "active" : "", `${value}%+`);
    button.type = "button";
    button.title = `Only show matchups where the winner has at least ${value}% win chance`;
    button.addEventListener("click", () => {
      counterThreshold = value;
      localStorage.setItem(COUNTER_THRESHOLD_KEY, String(counterThreshold));
      renderCounters();
    });
    thresholdControl.append(button);
  });
  toolbar.append(
    createElement("span", "visual-toolbar-label", "Show edges at"),
    thresholdControl,
    createElement("span", "visual-toolbar-note", "Arrow: winner → unit it beats")
  );

  const edges = [];
  for (let first = 0; first < shownUnits.length; first += 1) {
    for (let second = first + 1; second < shownUnits.length; second += 1) {
      const a = shownUnits[first];
      const b = shownUnits[second];
      const matchup = getMatchup(a, b);
      if (matchup.shareA >= counterThreshold) {
        edges.push({ winner: a, loser: b, share: matchup.shareA, matchup, first, second });
      } else if (matchup.shareA <= 100 - counterThreshold) {
        edges.push({ winner: b, loser: a, share: 100 - matchup.shareA, matchup, first, second });
      }
    }
  }

  const summary = createElement(
    "div",
    "counter-summary",
    `${edges.length} decisive matchup${edges.length === 1 ? "" : "s"} at ${counterThreshold}%+`
  );
  if (edges.length > 36) summary.append(createElement("span", "", " · Raise the threshold to simplify"));

  const svg = createSvgElement("svg", {
    class: "counter-map",
    viewBox: "0 0 1000 560",
    role: "img",
    tabindex: "0",
    "aria-label": `Counter map showing ${edges.length} matchups at ${counterThreshold} percent or higher. Arrows point from the favoured winner to the unit it beats.`
  });
  svg.append(
    createSvgElement("title", {}, "Decisive counter map"),
    createSvgElement("desc", {}, "Arrows point from the favoured winner to the unit it beats. Thicker arrows indicate more decisive matchups.")
  );

  const definitions = createSvgElement("defs");
  shownUnits.forEach((unit, index) => {
    const marker = createSvgElement("marker", {
      id: `counter-arrow-${index}`,
      viewBox: "0 0 8 8",
      refX: "7",
      refY: "4",
      markerWidth: "7",
      markerHeight: "7",
      orient: "auto-start-reverse"
    });
    marker.append(createSvgElement("path", { d: "M0 0 8 4 0 8Z", fill: unit.color }));
    definitions.append(marker);
  });
  svg.append(definitions);

  const centreX = 500;
  const centreY = 280;
  const radiusX = 390;
  const radiusY = 210;
  const nodeWidth = 112;
  const nodeHeight = 28;
  const positions = new Map(shownUnits.map((unit, index) => {
    const angle = -Math.PI / 2 + Math.PI * 2 * index / shownUnits.length;
    return [unit.id, {
      x: centreX + Math.cos(angle) * radiusX,
      y: centreY + Math.sin(angle) * radiusY,
      index
    }];
  }));

  const edgeLayer = createSvgElement("g", { class: "counter-edge-layer" });
  edges.forEach(edge => {
    const source = positions.get(edge.winner.id);
    const target = positions.get(edge.loser.id);
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy);
    const startScale = Math.min((nodeWidth / 2 + 3) / Math.abs(dx || 1), (nodeHeight / 2 + 3) / Math.abs(dy || 1));
    const endScale = startScale;
    const start = { x: source.x + dx * startScale, y: source.y + dy * startScale };
    const end = { x: target.x - dx * endScale, y: target.y - dy * endScale };
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const bow = Math.min(32, 10 + length * .035) * ((edge.first + edge.second) % 2 ? 1 : -1);
    const control = {
      x: midpoint.x - dy / length * bow,
      y: midpoint.y + dx / length * bow
    };
    const pathData = `M${start.x.toFixed(1)} ${start.y.toFixed(1)} Q${control.x.toFixed(1)} ${control.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    const strength = (edge.share - counterThreshold) / (100 - counterThreshold);
    const group = createSvgElement("g", {
      class: "counter-edge",
      "data-source": edge.winner.id,
      "data-target": edge.loser.id
    });
    const title = `${edge.winner.name} beats ${edge.loser.name}: ${Math.round(edge.share)}%. ${formatMetric(edge.matchup.battleRounds)} expected rounds.`;
    group.append(createSvgElement("title", {}, title));
    group.append(createSvgElement("path", {
      class: "counter-edge-hit",
      d: pathData
    }));
    group.append(createSvgElement("path", {
      class: "counter-edge-line",
      d: pathData,
      stroke: edge.winner.color,
      "stroke-width": (1.25 + strength * 2.75).toFixed(2),
      opacity: (.28 + strength * .52).toFixed(2),
      "marker-end": `url(#counter-arrow-${source.index})`
    }));
    const label = createSvgElement("text", {
      class: "counter-edge-label",
      x: control.x.toFixed(1),
      y: (control.y - 4).toFixed(1),
      "text-anchor": "middle"
    }, `${Math.round(edge.share)}%`);
    group.append(label);
    edgeLayer.append(group);
  });
  svg.append(edgeLayer);

  const detail = createElement("div", "counter-detail", "Hover, focus, or click a unit to isolate its decisive matchups.");
  const nodeLayer = createSvgElement("g", { class: "counter-node-layer" });
  let pinnedUnitId = null;
  const applyFocus = unitId => {
    const connected = new Set(unitId ? [unitId] : []);
    svg.querySelectorAll(".counter-edge").forEach(edgeNode => {
      const related = unitId && (edgeNode.dataset.source === unitId || edgeNode.dataset.target === unitId);
      edgeNode.classList.toggle("highlighted", Boolean(related));
      edgeNode.classList.toggle("dimmed", Boolean(unitId && !related));
      if (related) {
        connected.add(edgeNode.dataset.source);
        connected.add(edgeNode.dataset.target);
      }
    });
    svg.querySelectorAll(".counter-node").forEach(node => {
      node.classList.toggle("dimmed", Boolean(unitId && !connected.has(node.dataset.unitId)));
    });
    if (!unitId) {
      detail.textContent = "Hover, focus, or click a unit to isolate its decisive matchups.";
      return;
    }
    const unit = shownUnits.find(item => item.id === unitId);
    const wins = edges.filter(edge => edge.winner.id === unitId).map(edge => edge.loser.name);
    const losses = edges.filter(edge => edge.loser.id === unitId).map(edge => edge.winner.name);
    detail.textContent = `${unit.name} beats: ${wins.join(", ") || "none"} · Loses to: ${losses.join(", ") || "none"}`;
  };

  shownUnits.forEach(unit => {
    const position = positions.get(unit.id);
    const wins = edges.filter(edge => edge.winner.id === unit.id).length;
    const losses = edges.filter(edge => edge.loser.id === unit.id).length;
    const node = createSvgElement("g", {
      class: "counter-node",
      transform: `translate(${position.x.toFixed(1)} ${position.y.toFixed(1)})`,
      tabindex: "0",
      role: "button",
      "data-unit-id": unit.id,
      "aria-label": `${unit.name}: ${wins} decisive wins and ${losses} decisive losses`
    });
    node.append(
      createSvgElement("rect", {
        x: String(-nodeWidth / 2),
        y: String(-nodeHeight / 2),
        width: String(nodeWidth),
        height: String(nodeHeight),
        rx: "14",
        fill: "#fbfaf6",
        stroke: unit.color,
        "stroke-width": "2"
      }),
      createSvgElement("circle", { cx: "-43", cy: "0", r: "4", fill: unit.color }),
      createSvgElement("text", { x: "-34", y: "3.5" }, unit.name.length > 14 ? `${unit.name.slice(0, 13)}…` : unit.name),
      createSvgElement("title", {}, unit.name)
    );
    node.addEventListener("mouseenter", () => { if (!pinnedUnitId) applyFocus(unit.id); });
    node.addEventListener("mouseleave", () => { if (!pinnedUnitId) applyFocus(null); });
    node.addEventListener("focus", () => applyFocus(unit.id));
    node.addEventListener("blur", () => { if (!pinnedUnitId) applyFocus(null); });
    node.addEventListener("click", event => {
      event.stopPropagation();
      pinnedUnitId = pinnedUnitId === unit.id ? null : unit.id;
      applyFocus(pinnedUnitId);
    });
    nodeLayer.append(node);
  });
  svg.append(nodeLayer);

  if (!edges.length) {
    svg.append(createSvgElement("text", {
      class: "counter-empty",
      x: "500",
      y: "284",
      "text-anchor": "middle"
    }, `No matchups reach ${counterThreshold}% — lower the threshold.`));
  }
  svg.addEventListener("click", () => {
    pinnedUnitId = null;
    applyFocus(null);
  });
  svg.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      pinnedUnitId = null;
      applyFocus(null);
      svg.focus();
    }
  });

  const accessibleList = createElement("ul", "sr-only");
  edges.forEach(edge => {
    accessibleList.append(createElement("li", "", `${edge.winner.name} beats ${edge.loser.name}, ${Math.round(edge.share)} percent`));
  });
  view.append(toolbar, summary, svg, detail, accessibleList);
  resultStage.replaceChildren(view);
}

function initial(value) {
  return value.trim().charAt(0).toUpperCase() || "?";
}

function renderProfile() {
  const ranked = shownUnits
    .map(unit => {
      const comparisons = comparisonsFor(unit);
      return { unit, comparisons, average: averageShare(comparisons) };
    })
    .sort((a, b) => b.average - a.average);

  const view = createElement("div", "profile-view");
  view.style.setProperty("--unit-total", shownUnits.length);

  ranked.forEach((entry, rankIndex) => {
    const row = createElement("div", "profile-row");
    const unitLabel = createElement("div", "profile-unit");
    const dot = createElement("span", "unit-dot");
    dot.style.setProperty("--dot-color", entry.unit.color);
    unitLabel.append(
      createElement("span", "profile-rank", `#${rankIndex + 1}`),
      dot,
      createElement("span", "profile-unit-name", entry.unit.name)
    );

    const track = createElement("div", "profile-track");
    const average = createElement("span", "profile-average");
    average.style.setProperty("--position", `${entry.average}%`);
    average.style.setProperty("--unit-color", entry.unit.color);
    average.title = `Average: ${Math.round(entry.average)}%`;
    track.append(average);

    entry.comparisons.forEach((matchup, index) => {
      const matchupDot = createElement("span", "profile-dot", initial(matchup.b.name));
      const offset = (index - (entry.comparisons.length - 1) / 2) * 5;
      matchupDot.style.setProperty("--position", `${matchup.shareA}%`);
      matchupDot.style.setProperty("--offset", `${offset}px`);
      matchupDot.style.setProperty("--dot-color", matchup.b.color);
      matchupDot.title = `vs ${matchup.b.name}: ${shareLabel(matchup)}. ${matchupTitle(matchup)}`;
      track.append(matchupDot);
    });

    const best = entry.comparisons.reduce((current, item) => item.shareA > current.shareA ? item : current);
    const worst = entry.comparisons.reduce((current, item) => item.shareA < current.shareA ? item : current);
    const summary = createElement("div", "profile-summary");
    const bestItem = createElement("div", "profile-summary-item");
    bestItem.append(createElement("span", "", "Best into"), createElement("strong", "", `${best.b.name} · ${shareLabel(best)}`));
    const worstItem = createElement("div", "profile-summary-item");
    worstItem.append(createElement("span", "", "Toughest"), createElement("strong", "", `${worst.b.name} · ${shareLabel(worst)}`));
    summary.append(bestItem, worstItem);

    row.append(unitLabel, track, summary);
    view.append(row);
  });

  const axis = createElement("div", "profile-axis");
  const scale = createElement("div", "axis-scale");
  scale.append(
    createElement("span", "", "0 · opponent"),
    createElement("span", "", "50 · even"),
    createElement("span", "", "100 · unit")
  );
  axis.append(createElement("span"), scale, createElement("span"));
  view.append(axis);
  resultStage.replaceChildren(view);
}

function renderResults() {
  const matchupCount = shownUnits.length * (shownUnits.length - 1);
  resultsMeta.textContent = `${shownUnits.length} units · ${matchupCount} displayed matchups`;
  outcomeKey.hidden = activeView !== "bars";

  viewButtons.forEach(button => {
    const selected = button.dataset.view === activeView;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });

  if (activeView === "matrix") renderMatrix();
  else if (activeView === "similarity") renderSimilarity();
  else if (activeView === "counters") renderCounters();
  else if (activeView === "profile") renderProfile();
  else renderBars();
}

drillEffectToggle.addEventListener("change", () => {
  drillEffectEnabled = drillEffectToggle.checked;
  saveDrillEffect();
  matchupCache.clear();
  renderResults();
});

speedEffectToggle.addEventListener("change", () => {
  speedEffectEnabled = speedEffectToggle.checked;
  saveSpeedEffect();
  matchupCache.clear();
  renderResults();
});

setsButton.addEventListener("click", () => {
  const willOpen = setMenu.hidden;
  setMenu.hidden = !willOpen;
  setsButton.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    renderUnitSets();
    window.requestAnimationFrame(() => setName.focus());
  }
});

setSaveForm.addEventListener("submit", event => {
  event.preventDefault();
  saveNamedUnitSet(setName.value);
});

setList.addEventListener("click", event => {
  const item = event.target.closest(".set-item");
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!item || !action) return;
  if (action === "load-set") loadNamedUnitSet(item.dataset.setId);
  else if (action === "delete-set") deleteNamedUnitSet(item.dataset.setId);
});

document.addEventListener("click", event => {
  if (!setMenu.hidden && !setManager.contains(event.target)) closeSetMenu();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !setMenu.hidden) {
    closeSetMenu();
    setsButton.focus();
  }
});

unitGrid.addEventListener("input", event => {
  const target = event.target;
  const field = target.dataset.field;
  const card = target.closest(".unit-card");
  if (!field || !card) return;

  const unit = units.find(item => item.id === card.dataset.id);
  if (!unit) return;

  if (field === "ap") unit.ap = target.checked;
  else if (["strike", "drill", "speed", "defense", "hp"].includes(field)) unit[field] = target.value;
  else unit[field] = target.value;

  if (field === "color") card.style.setProperty("--unit-color", target.value);
  saveUnits();
  updateResults();
});

unitGrid.addEventListener("change", event => {
  if (event.target.dataset.field === "ap") {
    const card = event.target.closest(".unit-card");
    const unit = units.find(item => item.id === card?.dataset.id);
    if (unit) {
      unit.ap = event.target.checked;
      saveUnits();
      updateResults();
    }
  }
});

unitGrid.addEventListener("click", event => {
  const removeButton = event.target.closest('[data-action="remove"]');
  if (!removeButton || units.length <= MIN_UNITS) return;
  const card = removeButton.closest(".unit-card");
  const removedId = card.dataset.id;
  units = units.filter(unit => unit.id !== card.dataset.id);
  delete matchupOrders[removedId];
  Object.keys(matchupOrders).forEach(ownerId => {
    if (Array.isArray(matchupOrders[ownerId])) {
      matchupOrders[ownerId] = matchupOrders[ownerId].filter(id => id !== removedId);
    }
  });
  matrixCustomOrder = matrixCustomOrder.filter(id => id !== removedId);
  saveUnits();
  saveMatchupOrders();
  saveMatrixCustomOrder();
  renderEditor();
  updateResults(true);
});

addUnitButton.addEventListener("click", () => {
  if (units.length >= MAX_UNITS) return;
  const usedColours = new Set(units.map(unit => unit.color.toLowerCase()));
  const colour = PALETTE.find(item => !usedColours.has(item.toLowerCase())) || PALETTE[units.length % PALETTE.length];
  units.push({
    id: `unit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `Unit ${units.length + 1}`,
    strike: 5,
    drill: 0,
    speed: 0,
    ap: false,
    defense: 4,
    hp: 7,
    color: colour
  });
  saveUnits();
  renderEditor();
  updateResults(true);
  unitGrid.lastElementChild?.querySelector('[data-field="name"]')?.select();
});

resetButton.addEventListener("click", () => {
  if (!window.confirm("Restore the four example units?")) return;
  units = cloneUnits(DEFAULT_UNITS);
  shownUnits = cloneUnits(DEFAULT_UNITS);
  matchupOrders = {};
  matrixCustomOrder = DEFAULT_UNITS.map(unit => unit.id);
  matchupCache.clear();
  saveUnits();
  saveMatchupOrders();
  saveMatrixCustomOrder();
  renderEditor();
  renderResults();
  setUpdating(false);
});

viewButtons.forEach(button => {
  button.addEventListener("click", () => {
    activeView = button.dataset.view;
    localStorage.setItem(VIEW_KEY, activeView);
    renderResults();
  });
});

makeSortable(unitGrid, ".unit-card", "id");
makeSortable(resultStage, ".matchup-card", "unitId");
enableMatchupRowSorting();

renderEditor();
renderResults();
renderUnitSets();
drillEffectToggle.checked = drillEffectEnabled;
speedEffectToggle.checked = speedEffectEnabled;
setUpdating(false);
if (unitLoadNeedsPersist) saveUnits();
if (unitSetsNeedPersist) saveUnitSets();
window.addEventListener("beforeunload", saveUnits);
