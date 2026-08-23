import {
  battlefieldSettingsKey,
  normaliseBattlefieldSettings,
  resolveBattlefieldMatchup,
  resolveRulesMatchup
} from "./combat-engine.js";
import { generatorRosterMetrics as calculateGeneratorMetrics } from "./generator-engine.js";

const STORAGE_KEY = "matchup-board-units-v1";
const STORAGE_COOKIE = "matchup-board-units-v1";
const RECOVERY_KEY = "matchup-board-roster-recovered-2026-07-18";
const VIEW_KEY = "matchup-board-view-v2";
const MATCHUP_ORDER_KEY = "matchup-board-matchup-orders-v1";
const MATRIX_SORT_KEY = "matchup-board-matrix-sort-v1";
const MATRIX_SCENARIO_KEY = "matchup-board-matrix-scenario-v1";
const MATRIX_CUSTOM_ORDER_KEY = "matchup-board-matrix-custom-order-v1";
const MATRIX_ATTACK_BONUS_KEY = "matchup-board-matrix-attack-bonus-v1";
const COMBAT_RULE_SET_KEY = "matchup-board-combat-rule-set-v1";
const EXPLODING_SIXES_KEY = "matchup-board-exploding-sixes-v1";
const CRITICAL_FAIL_KEY = "matchup-board-critical-fail-v1";
const BATTLEFIELD_SETTINGS_KEY = "matchup-board-battlefield-settings-v1";
const COUNTER_THRESHOLD_KEY = "matchup-board-counter-threshold-v1";
const UNIT_SETS_KEY = "matchup-board-unit-sets-v1";
const UNIT_SET_COOKIE_PREFIX = "matchup-board-unit-set-v1-";
const SIMILARITY_METRIC_KEY = "matchup-board-similarity-metric-v1";
const GENERATOR_CONFIG_KEY = "matchup-board-generator-config-v2";
const GENERATOR_UNIT_COOKIE_PREFIX = "matchup-board-generator-unit-v2-";
const MAX_UNITS = 16;
const MIN_UNITS = 2;
const MAX_MATRIX_ATTACK_BONUS = 4;
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

const GENERATOR_OBJECTIVES = [
  { id: "diversity", name: "Unit diversity", description: "Spread out centred specialization profiles and create varied strengths and weaknesses." },
  { id: "advantageImpact", name: "+1 advantage impact", description: "Make one extra attack die move units meaningfully up the Strength ranking." },
  { id: "engagementLength", name: "Engagement length", description: "Keep the roster's average engagement close to your target number of rounds." },
  { id: "mobilityTax", name: "Speed and Drill tax", description: "Make high-mobility, high-drill units weaker in the base combat ranking." },
  { id: "apTax", name: "AP attack-die tax", description: "Give AP units fewer attack dice than otherwise similar non-AP units." }
];

const GENERATOR_STATS = [
  { id: "speed", label: "SPD", name: "Speed", min: 0, max: 99 },
  { id: "drill", label: "DRL", name: "Drill", min: 0, max: 99 },
  { id: "strike", label: "STR", name: "Strength", min: 1, max: 99 },
  { id: "defense", label: "DEF", name: "Defence", min: 1, max: 6 }
];

const COMBAT_SCENARIOS = [
  { id: "neutral", label: "Neutral", shortLabel: "N", modifier: 0, description: "No positional STR modifier" },
  { id: "one-advantage", label: "1 advantage", shortLabel: "1A", modifier: 1, description: "Row +1 STR · column −1 STR" },
  { id: "two-advantages", label: "2 advantages", shortLabel: "2A", modifier: 2, description: "Row +2 STR · column −2 STR" }
];

const unitGrid = document.querySelector("#unitGrid");
const unitCount = document.querySelector("#unitCount");
const addUnitButton = document.querySelector("#addUnitButton");
const resetButton = document.querySelector("#resetButton");
const generatorButton = document.querySelector("#generatorButton");
const setManager = document.querySelector("#setManager");
const setsButton = document.querySelector("#setsButton");
const setsCount = document.querySelector("#setsCount");
const setMenu = document.querySelector("#setMenu");
const setSaveForm = document.querySelector("#setSaveForm");
const setName = document.querySelector("#setName");
const setList = document.querySelector("#setList");
const setEmpty = document.querySelector("#setEmpty");
const saveState = document.querySelector("#saveState");
const resultStage = document.querySelector("#resultStage");
const resultsPanel = document.querySelector(".results-panel");
const resultsTitle = document.querySelector("#resultsTitle");
const resultsMeta = document.querySelector("#resultsMeta");
const outcomeKey = document.querySelector(".outcome-key");
const explodingSixesToggle = document.querySelector("#explodingSixesToggle");
const criticalFailToggle = document.querySelector("#criticalFailToggle");
const unitCardTemplate = document.querySelector("#unitCardTemplate");
const viewButtons = [...document.querySelectorAll(".view-button")];

let unitLoadNeedsPersist = false;
let units = loadUnits();
let shownUnits = cloneUnits(units);
let activeView = loadView();
let matrixSort = loadMatrixSort();
let matrixScenario = loadMatrixScenario();
let matrixCustomOrder = loadMatrixCustomOrder();
let matrixMode = "combat";
let matrixAttackBonuses = loadMatrixAttackBonuses();
let combatRuleSet = loadCombatRuleSet();
let explodingSixes = loadExplodingSixes();
let criticalFail = loadCriticalFail();
let battlefieldSettings = loadBattlefieldSettings();
let counterThreshold = loadCounterThreshold();
let similarityMetric = loadSimilarityMetric();
let matchupCache = new Map();
let updateTimer = null;
let draggedUnitId = null;
let draggedMatchup = null;
let draggedMatrixUnitId = null;
let matchupOrders = loadMatchupOrders();
let unitSetsNeedPersist = false;
let unitSets = loadUnitSets();
let generatorConfig = loadGeneratorConfig();
let generatorCandidates = [];
let generatorRunToken = 0;

function cloneUnits(value) {
  return value.map(unit => ({ ...unit }));
}

function safeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function safeDecimal(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
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
    hp: 7,
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
  } catch {
    return null;
  }
}

function writeCookieValue(name, value) {
  try {
    const encoded = encodeURIComponent(value);
    if (encoded.length <= 3800) {
      document.cookie = `${name}=${encoded}; Max-Age=157680000; Path=/; SameSite=Lax`;
    }
  } catch {
    // Cookies may be unavailable for file URLs; origin-local storage still works there.
  }
}

function loadCookieUnits() {
  try {
    const saved = JSON.parse(readCookieValue(STORAGE_COOKIE));
    return validSavedUnits(saved) ? saved : null;
  } catch {
    return null;
  }
}

function deleteCookieValue(name) {
  try {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
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
  } catch {
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
        } catch {
          // Fall back to the origin-local copy if this individual cookie is unavailable.
        }
        return cookieSet || localById.get(id) || null;
      }).filter(Boolean);
    }
  } catch {
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
  } catch {
    // Cookie copies can still preserve the sets for localhost previews.
  }

  const index = unitSets.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
  writeCookieValue(UNIT_SETS_KEY, JSON.stringify(index));
  unitSets.forEach(set => {
    writeCookieValue(`${UNIT_SET_COOKIE_PREFIX}${set.id}`, JSON.stringify(packSetUnits(set.units)));
  });
}

function defaultGeneratorUnitConstraint(unit = {}) {
  const current = {
    speed: safeNumber(unit.speed, 0, 0, 99),
    drill: safeNumber(unit.drill, 0, 0, 99),
    strike: safeNumber(unit.strike, 5, 1, 99),
    defense: safeNumber(unit.defense, 4, 1, 6)
  };
  const radius = { speed: 2, drill: 2, strike: 3, defense: 1 };
  return {
    tags: "",
    goodAgainst: "",
    weakAgainst: "",
    ap: "locked",
    stats: Object.fromEntries(GENERATOR_STATS.map(stat => [stat.id, {
      min: Math.max(stat.min, current[stat.id] - radius[stat.id]),
      max: Math.min(stat.max, current[stat.id] + radius[stat.id]),
      locked: stat.id === "speed" || stat.id === "drill"
    }]))
  };
}

function normaliseGeneratorUnitConstraint(value, unit) {
  const fallback = defaultGeneratorUnitConstraint(unit);
  const saved = value && typeof value === "object" ? value : {};
  const stats = {};
  GENERATOR_STATS.forEach(stat => {
    const range = saved.stats?.[stat.id] || {};
    stats[stat.id] = {
      min: safeNumber(range.min, fallback.stats[stat.id].min, stat.min, stat.max),
      max: safeNumber(range.max, fallback.stats[stat.id].max, stat.min, stat.max),
      locked: range.locked === undefined ? fallback.stats[stat.id].locked : Boolean(range.locked)
    };
  });
  return {
    ...fallback,
    tags: String(saved.tags || "").slice(0, 120),
    goodAgainst: String(saved.goodAgainst || "").slice(0, 120),
    weakAgainst: String(saved.weakAgainst || "").slice(0, 120),
    ap: ["any", "on", "off", "locked"].includes(saved.ap) ? saved.ap : fallback.ap,
    stats
  };
}

function normaliseGeneratorConfig(value) {
  const saved = value && typeof value === "object" ? value : {};
  const objectives = {};
  GENERATOR_OBJECTIVES.forEach(objective => {
    const fallback = objective.id === "mobilityTax" || objective.id === "apTax" ? 2 : 3;
    objectives[objective.id] = safeNumber(saved.objectives?.[objective.id], fallback, 0, 3);
  });
  const unitConstraints = {};
  units.forEach(unit => {
    unitConstraints[unit.id] = normaliseGeneratorUnitConstraint(saved.units?.[unit.id], unit);
  });
  return {
    objectives,
    settings: {
      diversityTarget: safeDecimal(saved.settings?.diversityTarget, 10, 2, 30),
      advantageRankTarget: safeDecimal(saved.settings?.advantageRankTarget, 1.5, .25, 5),
      engagementTarget: safeDecimal(saved.settings?.engagementTarget, 3.75, 1.5, 8),
      engagementTolerance: safeDecimal(saved.settings?.engagementTolerance, .5, .1, 2),
      mobilityTaxTarget: safeDecimal(saved.settings?.mobilityTaxTarget, 1, .1, 5),
      apDiceGapTarget: safeDecimal(saved.settings?.apDiceGapTarget, 2, .5, 6),
      candidateCount: safeNumber(saved.settings?.candidateCount, 5, 3, 12)
    },
    units: unitConstraints
  };
}

function loadGeneratorConfig() {
  let local = null;
  try {
    local = JSON.parse(localStorage.getItem(GENERATOR_CONFIG_KEY));
  } catch {
    // Try the cross-port cookie copies below.
  }

  try {
    const header = JSON.parse(readCookieValue(GENERATOR_CONFIG_KEY));
    if (header && typeof header === "object") {
      const cookieUnits = {};
      const unitIds = Array.isArray(header.unitIds) ? header.unitIds : [];
      unitIds.forEach(id => {
        try {
          const savedUnit = JSON.parse(readCookieValue(`${GENERATOR_UNIT_COOKIE_PREFIX}${id}`));
          if (savedUnit) cookieUnits[id] = savedUnit;
        } catch {
          if (local?.units?.[id]) cookieUnits[id] = local.units[id];
        }
      });
      return normaliseGeneratorConfig({ ...header, units: { ...(local?.units || {}), ...cookieUnits } });
    }
  } catch {
    // Fall back to origin-local configuration.
  }
  return normaliseGeneratorConfig(local);
}

function saveGeneratorConfig() {
  try {
    localStorage.setItem(GENERATOR_CONFIG_KEY, JSON.stringify(generatorConfig));
  } catch {
    // Cross-port cookie copies may still be available.
  }
  const header = {
    objectives: generatorConfig.objectives,
    settings: generatorConfig.settings,
    unitIds: Object.keys(generatorConfig.units)
  };
  writeCookieValue(GENERATOR_CONFIG_KEY, JSON.stringify(header));
  Object.entries(generatorConfig.units).forEach(([id, constraint]) => {
    writeCookieValue(`${GENERATOR_UNIT_COOKIE_PREFIX}${id}`, JSON.stringify(constraint));
  });
}

function generatorConstraintFor(unit) {
  if (!generatorConfig.units[unit.id]) {
    generatorConfig.units[unit.id] = defaultGeneratorUnitConstraint(unit);
  }
  return generatorConfig.units[unit.id];
}

function syncGeneratorConfigToUnits() {
  const previousIds = Object.keys(generatorConfig.units);
  generatorConfig = normaliseGeneratorConfig(generatorConfig);
  const activeIds = new Set(units.map(unit => unit.id));
  previousIds.filter(id => !activeIds.has(id)).forEach(id => {
    deleteCookieValue(`${GENERATOR_UNIT_COOKIE_PREFIX}${id}`);
  });
  saveGeneratorConfig();
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
  } catch {
    // Use the examples when stored data is unavailable or malformed.
  }
  return cloneUnits(DEFAULT_UNITS);
}

function loadView() {
  const saved = localStorage.getItem(VIEW_KEY);
  return ["matrix", "similarity", "generator"].includes(saved) ? saved : "matrix";
}

function loadSimilarityMetric() {
  try {
    const saved = readCookieValue(SIMILARITY_METRIC_KEY) ?? localStorage.getItem(SIMILARITY_METRIC_KEY);
    return ["overall", "specialization"].includes(saved) ? saved : "overall";
  } catch {
    return "overall";
  }
}

function saveSimilarityMetric() {
  try {
    localStorage.setItem(SIMILARITY_METRIC_KEY, similarityMetric);
  } catch {
    // The selected metric still works for the current session.
  }
  writeCookieValue(SIMILARITY_METRIC_KEY, similarityMetric);
}

function loadExplodingSixes() {
  try {
    const saved = readCookieValue(EXPLODING_SIXES_KEY) ?? localStorage.getItem(EXPLODING_SIXES_KEY);
    return saved === null ? true : saved !== "false";
  } catch {
    return true;
  }
}

function loadCombatRuleSet() {
  try {
    const saved = readCookieValue(COMBAT_RULE_SET_KEY) ?? localStorage.getItem(COMBAT_RULE_SET_KEY);
    return saved === "penalties" ? "penalties" : "disruption";
  } catch {
    return "disruption";
  }
}

function saveCombatRuleSet() {
  try {
    localStorage.setItem(COMBAT_RULE_SET_KEY, combatRuleSet);
  } catch {
    // The selected ruleset still works for the current session.
  }
  writeCookieValue(COMBAT_RULE_SET_KEY, combatRuleSet);
}

function saveExplodingSixes() {
  const saved = String(explodingSixes);
  try {
    localStorage.setItem(EXPLODING_SIXES_KEY, saved);
  } catch {
    // The selected rule still works for the current session.
  }
  writeCookieValue(EXPLODING_SIXES_KEY, saved);
}

function loadCriticalFail() {
  try {
    const saved = readCookieValue(CRITICAL_FAIL_KEY) ?? localStorage.getItem(CRITICAL_FAIL_KEY);
    return saved === "true";
  } catch {
    return false;
  }
}

function saveCriticalFail() {
  const saved = String(criticalFail);
  try {
    localStorage.setItem(CRITICAL_FAIL_KEY, saved);
  } catch {
    // The selected rule still works for the current session.
  }
  writeCookieValue(CRITICAL_FAIL_KEY, saved);
}

function loadMatrixSort() {
  const saved = readCookieValue(MATRIX_SORT_KEY) || localStorage.getItem(MATRIX_SORT_KEY);
  return ["strength", "custom"].includes(saved) ? saved : "strength";
}

function saveMatrixSort() {
  try {
    localStorage.setItem(MATRIX_SORT_KEY, matrixSort);
  } catch {
    // The selected order still works for the current session.
  }
  writeCookieValue(MATRIX_SORT_KEY, matrixSort);
}

function loadMatrixScenario() {
  try {
    const saved = readCookieValue(MATRIX_SCENARIO_KEY) ?? localStorage.getItem(MATRIX_SCENARIO_KEY);
    return ["compare", ...COMBAT_SCENARIOS.map(scenario => scenario.id)].includes(saved) ? saved : "compare";
  } catch {
    return "compare";
  }
}

function loadMatrixCustomOrder() {
  try {
    const saved = JSON.parse(readCookieValue(MATRIX_CUSTOM_ORDER_KEY) || localStorage.getItem(MATRIX_CUSTOM_ORDER_KEY));
    return Array.isArray(saved) ? saved.map(String) : [];
  } catch {
    return [];
  }
}

function saveMatrixCustomOrder() {
  const value = JSON.stringify(matrixCustomOrder);
  try {
    localStorage.setItem(MATRIX_CUSTOM_ORDER_KEY, value);
  } catch {
    // Custom ordering still works for the current session.
  }
  writeCookieValue(MATRIX_CUSTOM_ORDER_KEY, value);
}

function loadMatrixAttackBonuses() {
  try {
    const saved = JSON.parse(
      readCookieValue(MATRIX_ATTACK_BONUS_KEY)
      || localStorage.getItem(MATRIX_ATTACK_BONUS_KEY)
      || "[]"
    );
    if (Array.isArray(saved)) {
      return new Map(saved.map(id => [String(id), 1]));
    }
    return new Map(Object.entries(saved || {}).map(([id, value]) => [
      String(id),
      Math.min(MAX_MATRIX_ATTACK_BONUS, Math.max(0, Math.round(Number(value) || 0)))
    ]).filter(([, value]) => value > 0));
  } catch {
    return new Map();
  }
}

function saveMatrixAttackBonuses() {
  const value = JSON.stringify(Object.fromEntries(matrixAttackBonuses));
  try {
    localStorage.setItem(MATRIX_ATTACK_BONUS_KEY, value);
  } catch {
    // Attack bonuses still work for the current session.
  }
  writeCookieValue(MATRIX_ATTACK_BONUS_KEY, value);
}

function pruneMatrixAttackBonusIds() {
  const activeIds = new Set(units.map(unit => unit.id));
  const next = new Map([...matrixAttackBonuses].filter(([id]) => activeIds.has(id)));
  if (next.size === matrixAttackBonuses.size) return;
  matrixAttackBonuses = next;
  saveMatrixAttackBonuses();
}

function loadCounterThreshold() {
  const saved = Number(localStorage.getItem(COUNTER_THRESHOLD_KEY));
  return [60, 65, 70, 75, 80].includes(saved) ? saved : 80;
}

function loadBattlefieldSettings() {
  let saved = null;
  try {
    saved = JSON.parse(
      readCookieValue(BATTLEFIELD_SETTINGS_KEY)
      ?? localStorage.getItem(BATTLEFIELD_SETTINGS_KEY)
      ?? "null"
    );
  } catch {
    // Use the provisional defaults when stored settings are unavailable.
  }
  return normaliseBattlefieldSettings(saved);
}

function saveUnits() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(units));
    localStorage.setItem(RECOVERY_KEY, "1");
  } catch {
    // The app remains fully usable when local storage is blocked.
  }

  writeCookieValue(STORAGE_COOKIE, JSON.stringify(sanitiseUnits(units)));
}

function loadMatchupOrders() {
  try {
    const saved = JSON.parse(localStorage.getItem(MATCHUP_ORDER_KEY));
    if (saved && typeof saved === "object" && !Array.isArray(saved)) return saved;
  } catch {
    // Fall back to the unit order when custom matchup ordering is unavailable.
  }
  return {};
}

function saveMatchupOrders() {
  try {
    localStorage.setItem(MATCHUP_ORDER_KEY, JSON.stringify(matchupOrders));
  } catch {
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
    const apInput = card.querySelector('[data-field="ap"]');
    const removeButton = card.querySelector('[data-action="remove"]');

    nameInput.value = unit.name;
    colorInput.value = unit.color;
    strikeInput.value = unit.strike;
    drillInput.value = unit.drill;
    speedInput.value = unit.speed;
    defenseInput.value = unit.defense;
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

function matchupKey(
  a,
  b,
  combatModifier = 0,
  mode = "combat",
  attackBonusA = 0,
  attackBonusB = 0
) {
  const unitKey = unit => [
    unit.id,
    unit.strike,
    unit.drill,
    unit.speed,
    unit.ap ? 1 : 0,
    unit.defense,
    unit.hp
  ].join(":");
  const settingsPart = mode === "battlefield"
    ? battlefieldSettingsKey(battlefieldSettings)
    : `charge-${combatRuleSet}-v7:exploding-${explodingSixes ? "on" : "off"}:critical-${criticalFail ? "on" : "off"}`;
  const effectiveModifier = mode === "battlefield" ? combatModifier : 0;
  const bonusPart = mode === "combat" ? `${attackBonusA}:${attackBonusB}` : "0:0";
  return `${mode}:${settingsPart}:${effectiveModifier}:${bonusPart}|${unitKey(a)}|${unitKey(b)}`;
}

function reverseCombatMatchup(matchup) {
  const reverseShare = 100 - matchup.shareA;
  const reverseScenario = scenario => ({
    ...scenario,
    id: scenario.id === "a-charges" ? "b-charges" : "a-charges",
    charger: scenario.charger === "a" ? "b" : "a",
    shareA: 100 - scenario.shareA
  });
  return {
    ...matchup,
    a: matchup.b,
    b: matchup.a,
    effectiveStrikeA: matchup.effectiveStrikeB,
    effectiveStrikeB: matchup.effectiveStrikeA,
    strikeAdjustmentA: matchup.strikeAdjustmentB,
    strikeAdjustmentB: matchup.strikeAdjustmentA,
    drillAdjustmentA: matchup.drillAdjustmentB,
    drillAdjustmentB: matchup.drillAdjustmentA,
    combatAdjustmentA: matchup.combatAdjustmentB,
    combatAdjustmentB: matchup.combatAdjustmentA,
    hitChanceA: matchup.hitChanceB,
    hitChanceB: matchup.hitChanceA,
    expectedHitsA: matchup.expectedHitsB,
    expectedHitsB: matchup.expectedHitsA,
    expectedChargeHitsA: matchup.expectedChargeHitsB,
    expectedChargeHitsB: matchup.expectedChargeHitsA,
    criticalFail: matchup.criticalFail,
    attackBonusA: matchup.attackBonusB,
    attackBonusB: matchup.attackBonusA,
    modifierAdjustmentA: matchup.modifierAdjustmentB,
    modifierAdjustmentB: matchup.modifierAdjustmentA,
    chargeProbabilityA: matchup.chargeProbabilityB,
    chargeProbabilityB: matchup.chargeProbabilityA,
    chanceAWhenFirst: 1 - matchup.chanceAWhenSecond,
    chanceAWhenSecond: 1 - matchup.chanceAWhenFirst,
    chanceAWhenACharges: 1 - matchup.chanceAWhenBCharges,
    chanceAWhenBCharges: 1 - matchup.chanceAWhenACharges,
    regularRoundChanceA: 1 - matchup.regularRoundChanceA,
    shareA: reverseShare,
    victoryTurnsA: matchup.victoryTurnsB,
    victoryTurnsB: matchup.victoryTurnsA,
    victoryHpA: matchup.victoryHpB,
    victoryHpB: matchup.victoryHpA,
    aActivations: matchup.bActivations,
    bActivations: matchup.aActivations,
    averageDisruptionA: matchup.averageDisruptionB,
    averageDisruptionB: matchup.averageDisruptionA,
    soloTurnsA: matchup.soloTurnsB,
    soloTurnsB: matchup.soloTurnsA,
    winner: reverseShare > 50.000001 ? "a" : reverseShare < 49.999999 ? "b" : "even",
    chargeScenarios: [...matchup.chargeScenarios].reverse().map(reverseScenario)
  };
}

function getMatchup(
  a,
  b,
  combatModifier = 0,
  mode = "combat",
  attackBonusA = 0,
  attackBonusB = 0
) {
  const key = matchupKey(a, b, combatModifier, mode, attackBonusA, attackBonusB);
  const cached = matchupCache.get(key);
  if (cached) return cached;
  if (mode === "combat") {
    const reverseKey = matchupKey(b, a, 0, mode, attackBonusB, attackBonusA);
    const cachedReverse = matchupCache.get(reverseKey);
    if (cachedReverse) {
      const reversed = reverseCombatMatchup(cachedReverse);
      matchupCache.set(key, reversed);
      return reversed;
    }
  }
  const matchup = mode === "battlefield"
    ? resolveBattlefieldMatchup(a, b, combatModifier, battlefieldSettings)
    : resolveRulesMatchup(a, b, {
      attackBonusA,
      attackBonusB,
      ruleSet: combatRuleSet,
      explodingSixes,
      criticalFail
    });
  matchupCache.set(key, matchup);
  return matchup;
}

function getMatrixMatchup(a, b, combatModifier = 0) {
  const attackBonusA = matrixMode === "combat" ? matrixAttackBonuses.get(a.id) || 0 : 0;
  const attackBonusB = matrixMode === "combat" ? matrixAttackBonuses.get(b.id) || 0 : 0;
  return getMatchup(
    a,
    b,
    combatModifier,
    matrixMode,
    attackBonusA,
    attackBonusB
  );
}

function hitTarget(attacker, defender) {
  return attacker.ap ? "3+ (AP)" : `${defender.defense}+`;
}

function signedModifier(value) {
  if (!value) return "0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}

function matchupStrikeText(unit, effectiveStrike, drillAdjustment, combatAdjustment, modifierAdjustment = 0) {
  const changes = [];
  if (drillAdjustment) changes.push(`Drill ${signedModifier(drillAdjustment)}`);
  if (combatAdjustment) changes.push(`position ${signedModifier(combatAdjustment)}`);
  if (modifierAdjustment) changes.push(`matrix modifier ${signedModifier(modifierAdjustment)}`);
  if (!changes.length) return `${effectiveStrike} dice`;
  return `${effectiveStrike} dice (base STR ${unit.strike}, ${changes.join(", ")})`;
}

function matchupInitiativeText(matchup) {
  if (matchup.mode === "battlefield") {
    return "Battlefield estimate weights neutral, frontal-charge and flank-charge openings; Speed affects charge control and Drill affects flank conversion.";
  }
  const sixes = matchup.explodingSixes
    ? "Every natural 6 scores a hit and rolls another die against the same target number; additional 6s repeat the process."
    : "Natural 6s do not generate additional dice.";
  const failures = matchup.criticalFail
    ? "Every natural 1 lets the living defender immediately retaliate with one die per 1, using its normal target number; these retaliation dice can explode but do not cause further Critical Fail reactions."
    : "Critical Fail is disabled.";
  const roundRule = matchup.ruleSet === "penalties"
    ? "Wounds suffered earlier in the round do not reduce the second strike. Each selected modifier die adds one die to that unit and removes one die from its opponent, with a minimum attack pool of one."
    : "Wounds suffered earlier in the round remove that many dice from the second strike, to a minimum of one die.";
  return `Both possible chargers are weighted equally. Charging adds no dice; it only determines who strikes first. In later rounds either unit is equally likely to strike first. ${roundRule} ${sixes} ${failures}`;
}

function matchupTitle(matchup) {
  const positionalText = matchup.mode === "battlefield" && matchup.combatModifier
    ? ` Positional modifier: ${matchup.a.name} ${signedModifier(matchup.combatAdjustmentA)} STR, ${matchup.b.name} ${signedModifier(matchup.combatAdjustmentB)} STR.`
    : "";
  const chargeText = matchup.mode === "combat"
    ? ` Opening outcomes: ${matchup.a.name} charging ${Math.round(matchup.chanceAWhenACharges * 100)}%; ${matchup.b.name} charging ${Math.round(matchup.chanceAWhenBCharges * 100)}% for ${matchup.a.name}.`
    : "";
  const hitRule = matchup.explodingSixes ? " with exploding 6s" : "";
  return `Expected combat duration: ${formatMetric(matchup.battleRounds)} rounds.${positionalText}${chargeText} ${matchup.a.name}: ${matchupStrikeText(matchup.a, matchup.effectiveStrikeA, matchup.drillAdjustmentA, matchup.combatAdjustmentA, matchup.modifierAdjustmentA ?? matchup.attackBonusA)} hitting on ${hitTarget(matchup.a, matchup.b)}, ${matchup.expectedHitsA.toFixed(2)} expected hits per attack${hitRule} and ${formatMetric(matchup.soloTurnsA)} uninterrupted rounds to kill. When it wins: ${formatMetric(matchup.victoryHpA)} HP remaining. ${matchup.b.name}: ${matchupStrikeText(matchup.b, matchup.effectiveStrikeB, matchup.drillAdjustmentB, matchup.combatAdjustmentB, matchup.modifierAdjustmentB ?? matchup.attackBonusB)} hitting on ${hitTarget(matchup.b, matchup.a)}, ${matchup.expectedHitsB.toFixed(2)} expected hits per attack${hitRule} and ${formatMetric(matchup.soloTurnsB)} uninterrupted rounds to kill. When it wins: ${formatMetric(matchup.victoryHpB)} HP remaining. ${matchupInitiativeText(matchup)}`;
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
  pruneMatrixAttackBonusIds();
  matchupOrders = {};
  matrixCustomOrder = units.map(unit => unit.id);
  matchupCache.clear();
  saveUnits();
  saveMatchupOrders();
  saveMatrixCustomOrder();
  syncGeneratorConfigToUnits();
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

function strengthEntries(resolveMatchup = getMatchup) {
  return shownUnits.map((unit, index) => {
    const matchups = shownUnits
      .filter(opponent => opponent.id !== unit.id)
      .map(opponent => resolveMatchup(unit, opponent));
    return {
      unit,
      index,
      average: averageShare(matchups),
      wins: matchups.filter(matchup => matchup.shareA > 50).length
    };
  });
}

function sortedStrengthEntries(entries) {
  return [...entries].sort((a, b) =>
    b.average - a.average || b.wins - a.wins || a.index - b.index
  );
}

function matchupPatternDistance(a, b, centreProfiles = false, resolveMatchup = getMatchup) {
  const commonOpponents = shownUnits
    .filter(unit => unit.id !== a.id && unit.id !== b.id)
    .sort((first, second) => first.id < second.id ? -1 : first.id > second.id ? 1 : 0);
  if (!commonOpponents.length) return 0;
  const profileA = commonOpponents.map(opponent => resolveMatchup(a, opponent).shareA);
  const profileB = commonOpponents.map(opponent => resolveMatchup(b, opponent).shareA);
  const averageA = centreProfiles ? profileA.reduce((sum, value) => sum + value, 0) / profileA.length : 0;
  const averageB = centreProfiles ? profileB.reduce((sum, value) => sum + value, 0) / profileB.length : 0;
  const squaredDifference = commonOpponents.reduce((total, _, index) => {
    const difference = ((profileA[index] - averageA) - (profileB[index] - averageB)) / 50;
    return total + difference * difference;
  }, 0);
  return Math.sqrt(squaredDifference / commonOpponents.length);
}

function matrixUnitOrder(entries = strengthEntries(getMatrixMatchup)) {
  if (matrixSort === "custom") {
    const unitsById = new Map(shownUnits.map(unit => [unit.id, unit]));
    const ordered = matrixCustomOrder
      .map(id => unitsById.get(id))
      .filter(Boolean);
    const orderedIds = new Set(ordered.map(unit => unit.id));
    return [...ordered, ...shownUnits.filter(unit => !orderedIds.has(unit.id))];
  }
  return sortedStrengthEntries(entries).map(entry => entry.unit);
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

function toggleMatrixAttackBonus(unitId) {
  const nextBonus = ((matrixAttackBonuses.get(unitId) || 0) + 1) % (MAX_MATRIX_ATTACK_BONUS + 1);
  if (nextBonus) matrixAttackBonuses.set(unitId, nextBonus);
  else matrixAttackBonuses.delete(unitId);
  saveMatrixAttackBonuses();
  renderMatrix();
}

function matrixScenarioById(id) {
  return COMBAT_SCENARIOS.find(scenario => scenario.id === id) || COMBAT_SCENARIOS[0];
}

function matrixScenarioMatchups(rowUnit, opponent) {
  return COMBAT_SCENARIOS.map(scenario => ({
    scenario,
    matchup: getMatrixMatchup(rowUnit, opponent, scenario.modifier)
  }));
}

function outcomeChanged(neutral, modified) {
  return neutral.winner !== modified.winner;
}

function formatPercentagePointDelta(value, digits = 0) {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return digits ? (0).toFixed(digits) : "0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}`;
}

function matrixEngagementLength(matrixUnits, combatModifier = 0) {
  const rounds = [];
  matrixUnits.forEach(rowUnit => {
    matrixUnits.forEach(opponent => {
      const value = getMatrixMatchup(rowUnit, opponent, combatModifier).battleRounds;
      if (Number.isFinite(value)) rounds.push(value);
    });
  });
  rounds.sort((a, b) => a - b);
  const middle = Math.floor(rounds.length / 2);
  const median = rounds.length % 2
    ? rounds[middle]
    : (rounds[middle - 1] + rounds[middle]) / 2;
  return {
    average: rounds.reduce((total, value) => total + value, 0) / rounds.length,
    median,
    minimum: rounds[0],
    maximum: rounds.at(-1),
    count: rounds.length
  };
}

function battlefieldBreakdownText(matchup) {
  if (matchup.mode !== "battlefield" || !Array.isArray(matchup.openingStates)) return "";
  const lines = matchup.openingStates.map(state => {
    const probability = (state.probability * 100).toFixed(1);
    const conditional = state.shareA === null ? "unavailable" : `${state.shareA.toFixed(1)}% row win`;
    return `${state.label}: ${probability}% of openings · ${conditional}`;
  });
  return `\nWeighted opening breakdown:\n${lines.join("\n")}`;
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
  const controls = createElement("div", "matrix-controls");
  const ruleToolbar = createElement("div", "visual-toolbar matrix-toolbar ruleset-toolbar");
  const ruleSetControl = createElement("div", "mini-switcher ruleset-switcher");
  [
    ["disruption", "Disruption"],
    ["penalties", "Penalties"]
  ].forEach(([value, label]) => {
    const button = createElement("button", combatRuleSet === value ? "active" : "", label);
    button.type = "button";
    button.setAttribute("aria-pressed", String(combatRuleSet === value));
    button.title = value === "disruption"
      ? "Wounds caused earlier in a round remove dice from the second strike"
      : "Wounds do not remove reply dice; each modifier die gives one unit +1 and its opponent -1";
    button.addEventListener("click", () => {
      if (combatRuleSet === value) return;
      combatRuleSet = value;
      saveCombatRuleSet();
      renderResults();
    });
    ruleSetControl.append(button);
  });
  ruleToolbar.append(
    createElement("span", "visual-toolbar-label", "Combat rules"),
    ruleSetControl,
    createElement(
      "span",
      "visual-toolbar-note",
      combatRuleSet === "penalties"
        ? "No wound penalty · selected modifier is +N/−N"
        : "Earlier wounds reduce the reply · selected modifier is +N"
    )
  );
  const toolbar = createElement("div", "visual-toolbar matrix-toolbar");
  const sortControl = createElement("div", "mini-switcher");
  [
    ["strength", "Strength"],
    ["custom", "Custom"]
  ].forEach(([value, label]) => {
    const button = createElement("button", matrixSort === value ? "active" : "", label);
    button.type = "button";
    button.title = value === "strength"
      ? "Order by average win chance against the current roster"
      : "Drag matrix rows into your preferred order";
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
      matrixSort === "custom"
        ? "Drag row handles to reorder"
        : "Cell: overall win % · expected rounds"
    )
  );
  controls.append(ruleToolbar, toolbar);

  const currentStrengthEntries = strengthEntries(getMatrixMatchup);
  const matrixUnits = matrixUnitOrder(currentStrengthEntries);
  const usesPositionScenarios = matrixMode === "battlefield";
  const comparesPositionScenarios = usesPositionScenarios && matrixScenario === "compare";
  const activeScenario = comparesPositionScenarios ? COMBAT_SCENARIOS[0] : matrixScenarioById(matrixScenario);
  const activeModifier = usesPositionScenarios ? activeScenario.modifier : 0;
  const strengths = new Map(currentStrengthEntries.map(entry => [entry.unit.id, entry.average]));
  const currentRanks = new Map(sortedStrengthEntries(currentStrengthEntries)
    .map((entry, index) => [entry.unit.id, index + 1]));
  const baselineStrengthEntries = matrixAttackBonuses.size
    ? strengthEntries((unit, opponent) => getMatchup(unit, opponent, 0, matrixMode, 0, 0))
    : currentStrengthEntries;
  const baselineRanks = new Map(sortedStrengthEntries(baselineStrengthEntries)
    .map((entry, index) => [entry.unit.id, index + 1]));
  const rankChanges = matrixUnits.map(unit => ({
    unit,
    movement: baselineRanks.get(unit.id) - currentRanks.get(unit.id)
  })).filter(entry => entry.movement !== 0)
    .sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement));

  const impact = createElement("div", "matrix-impact");
  const length = matrixEngagementLength(matrixUnits, activeModifier);
  const lengthItem = createElement("div", "matrix-impact-item");
  lengthItem.title = `Uniform average across all ${length.count} row/column pairings, including mirror matches. The median and range compare each pairing's own expected duration.`;
  lengthItem.append(
    createElement("span", "matrix-impact-name", "Engagement length"),
    createElement("strong", "", `${formatMetric(length.average)} rounds avg`),
    createElement(
      "span",
      "matrix-impact-detail",
      `Median pairing ${formatMetric(length.median)} · pairing means ${formatMetric(length.minimum)}–${formatMetric(length.maximum)} rounds`
    )
  );
  impact.append(lengthItem);
  const rankItem = createElement("div", "matrix-impact-item");
  const rankDetail = matrixAttackBonuses.size
    ? rankChanges.length
      ? rankChanges.map(({ unit, movement }) =>
        `${unit.name} ${movement > 0 ? "↑" : "↓"}${Math.abs(movement)}`
      ).join(" · ")
      : "Selected modifiers change matchup scores, but not the current rank order."
    : "Set +1 to +4 beside a unit to compare its modified rank with the neutral ranking.";
  rankItem.title = rankDetail;
  rankItem.append(
    createElement("span", "matrix-impact-name", "Modifier ranking"),
    createElement(
      "strong",
      "",
      matrixAttackBonuses.size
        ? rankChanges.length
          ? `${rankChanges.length} moved`
          : "Order unchanged"
        : "No modifiers"
    ),
    createElement("span", "matrix-impact-detail", rankDetail)
  );
  impact.append(rankItem);
  impact.classList.toggle("single", impact.children.length === 1);
  impact.classList.toggle("double", impact.children.length === 2);

  const grid = createElement("div", "matrix-grid");
  grid.style.setProperty("--unit-total", matrixUnits.length);
  grid.classList.toggle("dense", matrixUnits.length > 8);
  grid.classList.toggle("comparison", comparesPositionScenarios);
  grid.classList.toggle("combat", matrixMode === "combat");
  grid.append(createElement("div", "matrix-corner", "Rank · avg win %"));

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
    rowHead.append(createUnitHeading(rowUnit));
    if (matrixMode === "combat") {
      const attackBonus = matrixAttackBonuses.get(rowUnit.id) || 0;
      const nextBonus = (attackBonus + 1) % (MAX_MATRIX_ATTACK_BONUS + 1);
      const bonus = createElement(
        "button",
        `matrix-row-bonus${attackBonus ? " active" : ""}`,
        attackBonus ? `+${attackBonus}` : "+0"
      );
      bonus.type = "button";
      bonus.dataset.bonus = String(attackBonus);
      bonus.setAttribute(
        "aria-label",
        `${rowUnit.name} currently has ${attackBonus ? `+${attackBonus}` : "no"} modifier dice; click to set ${nextBonus ? `+${nextBonus}` : "no modifier"}`
      );
      const ruleEffect = combatRuleSet === "penalties"
        ? `Its attack pool gains ${attackBonus} and each opponent's loses ${attackBonus}.`
        : `Its attack pool gains ${attackBonus}.`;
      bonus.title = `${rowUnit.name}: ${attackBonus ? `+${attackBonus}` : "no"} modifier dice. ${attackBonus ? ruleEffect : ""} Click for ${nextBonus ? `+${nextBonus}` : "no modifier"}.`;
      bonus.addEventListener("click", () => toggleMatrixAttackBonus(rowUnit.id));
      rowHead.append(bonus);
    }
    const rank = currentRanks.get(rowUnit.id);
    const baselineRank = baselineRanks.get(rowUnit.id);
    const movement = baselineRank - rank;
    const score = createElement(
      "span",
      `matrix-row-score${movement ? " changed" : ""}`,
      `#${rank} · ${Math.round(strengths.get(rowUnit.id))}`
    );
    score.title = `Strength rank ${rank}; ${Math.round(strengths.get(rowUnit.id))}% average win chance${movement ? `; ${Math.abs(movement)} place${Math.abs(movement) === 1 ? "" : "s"} ${movement > 0 ? "higher" : "lower"} than neutral` : ""}.`;
    rowHead.append(score);
    grid.append(rowHead);

    matrixUnits.forEach(opponent => {
      const neutral = getMatrixMatchup(rowUnit, opponent);
      const matchup = getMatrixMatchup(rowUnit, opponent, activeModifier);
      const cell = createElement("div", "matrix-cell");
      cell.dataset.matrixRowId = rowUnit.id;
      if (comparesPositionScenarios) {
        const comparisonGrid = createElement("div", "matrix-cell-comparison");
        matrixScenarioMatchups(rowUnit, opponent).forEach(({ scenario, matchup: scenarioMatchup }) => {
          const scenarioResult = createElement("span", "matrix-scenario-result");
          const delta = scenarioMatchup.shareA - neutral.shareA;
          const flip = outcomeChanged(neutral, scenarioMatchup);
          if (flip) scenarioResult.classList.add("outcome-flip");
          scenarioResult.title = `${scenario.label}: ${Math.round(scenarioMatchup.shareA)}% row win chance${scenario.modifier ? ` (${formatPercentagePointDelta(delta)} pp vs Neutral)` : ""}`;
          scenarioResult.append(
            createElement("i", "", scenario.shortLabel),
            createElement("strong", "", `${Math.round(scenarioMatchup.shareA)}%`),
            scenario.modifier
              ? createElement("em", "", formatPercentagePointDelta(delta))
              : createElement("em", "neutral-marker", "base")
          );
          comparisonGrid.append(scenarioResult);
        });
        cell.append(comparisonGrid);
      } else {
        const delta = matchup.shareA - neutral.shareA;
        const flip = outcomeChanged(neutral, matchup);
        cell.classList.toggle("outcome-flip", flip);
        const readout = [
          createElement("strong", "matrix-cell-chance", `${Math.round(matchup.shareA)}%`),
          createElement("span", "matrix-cell-rounds", `◷ ${formatMetric(matchup.battleRounds)}r`)
        ];
        if (matrixMode !== "combat") {
          readout.push(createElement(
            "span",
            `matrix-cell-delta${flip ? " winner-flip" : ""}`,
            activeModifier
              ? `${formatPercentagePointDelta(delta)} pp${flip ? " · flip" : ""}`
              : "baseline"
          ));
        }
        cell.append(...readout);
      }
      const colour = semanticMatrixColour(comparesPositionScenarios ? neutral.shareA : matchup.shareA);
      cell.style.background = colour.background;
      cell.style.color = colour.foreground;
      cell.title = comparesPositionScenarios
        ? matrixScenarioMatchups(rowUnit, opponent)
          .map(({ scenario, matchup: scenarioMatchup }) => `${scenario.label}: ${Math.round(scenarioMatchup.shareA)}% row win chance. ${matchupTitle(scenarioMatchup)}${battlefieldBreakdownText(scenarioMatchup)}`)
          .join("\n")
        : `${matrixMode === "combat" ? "Overall" : activeScenario.label}: ${Math.round(matchup.shareA)}% row win chance${activeModifier ? ` (${formatPercentagePointDelta(matchup.shareA - neutral.shareA)} percentage points vs Neutral)` : ""}. ${matchupTitle(matchup)}${battlefieldBreakdownText(matchup)}`;
      cell.setAttribute("role", "img");
      cell.setAttribute(
        "aria-label",
        comparesPositionScenarios
          ? `${rowUnit.name} versus ${opponent.name}. ${matrixScenarioMatchups(rowUnit, opponent)
            .map(({ scenario, matchup: scenarioMatchup }) => `${scenario.label}: ${Math.round(scenarioMatchup.shareA)} percent`)
            .join(". ")}`
          : `${matrixMode === "combat" ? "Overall" : activeScenario.label}: ${rowUnit.name} has a ${Math.round(matchup.shareA)} percent chance to beat ${opponent.name}`
      );
      grid.append(cell);
    });
  });

  const legend = createElement("div", "matrix-legend");
  legend.append(
    createElement("span", "", "Column favoured · 0%"),
    createElement("span", "legend-gradient"),
    createElement("span", "", "100% · Row favoured")
  );
  view.append(controls, impact, grid, legend);
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

function similarityLayout(inputUnits, metric) {
  const units = [...inputUnits]
    .sort((first, second) => first.id < second.id ? -1 : first.id > second.id ? 1 : 0);
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

  return { units, positions, distances };
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
  const { units: similarityUnits, positions, distances } = similarityLayout(shownUnits, similarityMetric);
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
  similarityUnits.forEach((_, first) => {
    let nearest = -1;
    let nearestDistance = Infinity;
    similarityUnits.forEach((__, second) => {
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

  similarityUnits.forEach((unit, index) => {
    const nearest = similarityUnits
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

function matchupPairsAtMode(mode) {
  const pairs = [];
  for (let first = 0; first < shownUnits.length; first += 1) {
    for (let second = first + 1; second < shownUnits.length; second += 1) {
      pairs.push({
        a: shownUnits[first],
        b: shownUnits[second],
        shareA: getMatchup(shownUnits[first], shownUnits[second], 0, mode).shareA
      });
    }
  }
  return pairs;
}

function ruleSensitivity(offPairs, onPairs) {
  if (!offPairs.length) return { average: 0, maximum: 0, pair: null };
  let total = 0;
  let maximum = -1;
  let maximumPair = null;
  offPairs.forEach((pair, index) => {
    const difference = Math.abs(pair.shareA - onPairs[index].shareA);
    total += difference;
    if (difference > maximum) {
      maximum = difference;
      maximumPair = pair;
    }
  });
  return {
    average: total / offPairs.length,
    maximum,
    pair: maximumPair
  };
}

function createHealthMetric(label, value, description, tone = "neutral") {
  const card = createElement("div", `health-metric ${tone}`);
  card.append(
    createElement("span", "health-metric-label", label),
    createElement("strong", "health-metric-value", value),
    createElement("span", "health-metric-description", description)
  );
  return card;
}

function renderHealth() {
  const view = createElement("div", "health-view");
  const toolbar = createElement("div", "visual-toolbar health-toolbar");
  toolbar.append(
    createElement("span", "visual-toolbar-label", "Roster health"),
    createElement("span", "visual-toolbar-note", "Balance · distinct roles · counterplay · model stability")
  );

  const entries = strengthEntries();
  const sortedByStrength = [...entries].sort((a, b) => b.average - a.average || a.index - b.index);
  const balanceError = Math.sqrt(
    entries.reduce((total, entry) => total + (entry.average - 50) ** 2, 0) / entries.length
  );
  const balanceTone = balanceError <= 5 ? "good" : balanceError <= 10 ? "warning" : "risk";
  const activePairs = [];
  for (let first = 0; first < shownUnits.length; first += 1) {
    for (let second = first + 1; second < shownUnits.length; second += 1) {
      activePairs.push({
        a: shownUnits[first],
        b: shownUnits[second],
        shareA: getMatchup(shownUnits[first], shownUnits[second]).shareA
      });
    }
  }
  const extremePairs = activePairs.filter(pair => pair.shareA >= 80 || pair.shareA <= 20);

  const coverageThreshold = 60;
  const coverage = entries.map(entry => {
    const shares = shownUnits
      .filter(opponent => opponent.id !== entry.unit.id)
      .map(opponent => getMatchup(entry.unit, opponent).shareA);
    return {
      unit: entry.unit,
      hasFavourable: shares.some(share => share >= coverageThreshold),
      hasUnfavourable: shares.some(share => share <= 100 - coverageThreshold)
    };
  });
  const coveredUnits = coverage.filter(entry => entry.hasFavourable && entry.hasUnfavourable).length;
  const coverageRatio = coveredUnits / coverage.length;
  const coverageTone = coverageRatio >= .8 ? "good" : coverageRatio >= .5 ? "warning" : "risk";

  const specializationPairs = [];
  const nearestDistances = new Map(shownUnits.map(unit => [unit.id, Infinity]));
  if (shownUnits.length >= 4) {
    for (let first = 0; first < shownUnits.length; first += 1) {
      for (let second = first + 1; second < shownUnits.length; second += 1) {
        const distance = matchupPatternDistance(shownUnits[first], shownUnits[second], true) * 50;
        specializationPairs.push({ a: shownUnits[first], b: shownUnits[second], distance });
        nearestDistances.set(shownUnits[first].id, Math.min(nearestDistances.get(shownUnits[first].id), distance));
        nearestDistances.set(shownUnits[second].id, Math.min(nearestDistances.get(shownUnits[second].id), distance));
      }
    }
  }
  specializationPairs.sort((a, b) => a.distance - b.distance);
  const closestPair = specializationPairs[0] || null;
  const finiteNearestDistances = [...nearestDistances.values()].filter(Number.isFinite);
  const averageNearestDistance = finiteNearestDistances.length
    ? finiteNearestDistances.reduce((sum, value) => sum + value, 0) / finiteNearestDistances.length
    : null;
  const diversityTone = averageNearestDistance === null
    ? "neutral"
    : averageNearestDistance > 18
      ? "warning"
      : averageNearestDistance >= 6
        ? "good"
        : "risk";

  const battlefieldSensitivity = ruleSensitivity(
    matchupPairsAtMode("combat"),
    matchupPairsAtMode("battlefield")
  );

  const metrics = createElement("div", "health-metrics");
  metrics.append(
    createHealthMetric(
      "Balance error",
      `${formatMetric(balanceError)} pts`,
      "RMS deviation of unit-average win rates from 50%",
      balanceTone
    ),
    createHealthMetric(
      "Role separation",
      averageNearestDistance === null ? "Need 4 units" : `${formatMetric(averageNearestDistance)} pts`,
      "Mean distance to each unit's nearest centred profile",
      diversityTone
    ),
    createHealthMetric(
      "Counter coverage",
      `${coveredUnits} / ${coverage.length}`,
      `Units with both a ${coverageThreshold}%+ and a ${100 - coverageThreshold}%- matchup`,
      coverageTone
    )
  );

  const panels = createElement("div", "health-panels");
  const powerPanel = createElement("section", "health-panel health-power-panel");
  const powerHeading = createElement("div", "health-panel-heading");
  powerHeading.append(
    createElement("strong", "", "Power balance"),
    createElement("span", "", `${sortedByStrength[0].unit.name} strongest · ${sortedByStrength.at(-1).unit.name} weakest`)
  );
  const powerList = createElement("div", "health-power-list");
  sortedByStrength.forEach(entry => {
    const row = createElement("div", "health-power-row");
    const label = createUnitHeading(entry.unit);
    const track = createElement("div", "health-power-track");
    const marker = createElement("span", "health-power-marker");
    marker.style.setProperty("--position", `${entry.average}%`);
    marker.style.setProperty("--unit-color", entry.unit.color);
    track.append(marker);
    row.append(label, track, createElement("strong", "health-power-value", `${Math.round(entry.average)}%`));
    powerList.append(row);
  });
  powerPanel.append(powerHeading, powerList);

  const diagnosisPanel = createElement("section", "health-panel health-diagnosis-panel");
  const diagnosisHeading = createElement("div", "health-panel-heading");
  diagnosisHeading.append(
    createElement("strong", "", "Diversity and counterplay"),
    createElement("span", "", "Specialization uses centred matchup profiles")
  );
  const diagnosisList = createElement("div", "health-diagnosis-list");
  const redundancy = createElement("div", "health-diagnosis-item");
  redundancy.append(createElement("span", "", "Most redundant pair"));
  redundancy.append(createElement(
    "strong",
    "",
    closestPair
      ? `${closestPair.a.name} + ${closestPair.b.name} · ${formatMetric(closestPair.distance)} pts`
      : "Need at least 4 units"
  ));
  diagnosisList.append(redundancy);

  const polarity = createElement(
    "div",
    `health-diagnosis-item${extremePairs.length ? "" : " health-diagnosis-good"}`
  );
  polarity.append(
    createElement("span", "", "Extreme matchups"),
    createElement(
      "strong",
      "",
      extremePairs.length
        ? `${extremePairs.length} at 80/20 or wider`
        : "None at 80/20 or wider"
    )
  );
  diagnosisList.append(polarity);

  const coverageIssues = coverage.filter(entry => !entry.hasFavourable || !entry.hasUnfavourable);
  if (!coverageIssues.length) {
    const complete = createElement("div", "health-diagnosis-item health-diagnosis-good");
    complete.append(
      createElement("span", "", "Counter structure"),
      createElement("strong", "", "Every unit has a clear strength and weakness")
    );
    diagnosisList.append(complete);
  } else {
    coverageIssues.forEach(entry => {
      const missing = [
        !entry.hasFavourable ? "no 60%+ matchup" : null,
        !entry.hasUnfavourable ? "no 40%- matchup" : null
      ].filter(Boolean).join(" · ");
      const issue = createElement("div", "health-diagnosis-item");
      issue.append(createElement("span", "", entry.unit.name), createElement("strong", "", missing));
      diagnosisList.append(issue);
    });
  }
  diagnosisPanel.append(diagnosisHeading, diagnosisList);

  const sensitivityPanel = createElement("section", "health-panel health-sensitivity-panel");
  const sensitivityHeading = createElement("div", "health-panel-heading");
  sensitivityHeading.append(
    createElement("strong", "", "Model sensitivity"),
    createElement("span", "", "Charge-and-disruption outcomes compared with the current battlefield assumptions")
  );
  const sensitivityList = createElement("div", "health-sensitivity-list");
  [
    ["Battlefield estimate", battlefieldSensitivity]
  ].forEach(([label, sensitivity]) => {
    const row = createElement("div", "health-sensitivity-row");
    const details = createElement("div", "health-sensitivity-details");
    details.append(
      createElement("strong", "", `${label} · ${formatMetric(sensitivity.average)} pts average`),
      createElement(
        "span",
        "",
        sensitivity.pair
          ? `Largest: ${sensitivity.pair.a.name} vs ${sensitivity.pair.b.name} · ${formatMetric(sensitivity.maximum)} pts`
          : "No matchups"
      )
    );
    const gauge = createElement("div", "health-sensitivity-gauge");
    const fill = createElement("span");
    fill.style.setProperty("--sensitivity", `${Math.min(100, sensitivity.average * 8)}%`);
    gauge.append(fill);
    row.append(details, gauge);
    sensitivityList.append(row);
  });
  sensitivityPanel.append(sensitivityHeading, sensitivityList);

  panels.append(powerPanel, diagnosisPanel, sensitivityPanel);
  view.append(toolbar, metrics, panels);
  resultStage.replaceChildren(view);
}

function generatorUnitStatus(unit, constraint) {
  const lockedStats = GENERATOR_STATS.filter(stat => constraint.stats[stat.id].locked).length;
  const rangedStats = GENERATOR_STATS.filter(stat => {
    const range = constraint.stats[stat.id];
    return !range.locked && (range.min !== stat.min || range.max !== stat.max);
  }).length;
  const parts = [];
  if (lockedStats) parts.push(`${lockedStats} fixed`);
  if (rangedStats) parts.push(`${rangedStats} ranged`);
  if (constraint.ap !== "any") parts.push("AP constrained");
  return parts.join(" · ") || "Open constraints";
}

function generatorValidation() {
  let constrainedUnits = 0;
  let lockedStats = 0;
  let invalidRanges = 0;
  units.forEach(unit => {
    const constraint = generatorConstraintFor(unit);
    let constrained = constraint.ap !== "any";
    GENERATOR_STATS.forEach(stat => {
      const range = constraint.stats[stat.id];
      if (range.locked) {
        lockedStats += 1;
        constrained = true;
      } else {
        if (range.min !== stat.min || range.max !== stat.max) constrained = true;
        if (range.min > range.max) invalidRanges += 1;
      }
    });
    if (constrained) constrainedUnits += 1;
  });

  const activeObjectives = GENERATOR_OBJECTIVES.filter(objective => generatorConfig.objectives[objective.id] > 0).length;
  return { activeObjectives, constrainedUnits, lockedStats, invalidRanges };
}

function updateGeneratorView(view) {
  view.querySelectorAll(".generator-objective").forEach(card => {
    const priority = generatorConfig.objectives[card.dataset.objectiveId];
    card.dataset.priority = String(priority);
  });

  view.querySelectorAll(".generator-unit").forEach(card => {
    const unit = units.find(item => item.id === card.dataset.unitId);
    if (!unit) return;
    const constraint = generatorConstraintFor(unit);
    const status = card.querySelector("[data-generator-unit-status]");
    if (status) status.textContent = generatorUnitStatus(unit, constraint);
  });

  view.querySelectorAll(".generator-stat-row").forEach(row => {
    const unit = units.find(item => item.id === row.dataset.unitId);
    const stat = GENERATOR_STATS.find(item => item.id === row.dataset.statId);
    if (!unit || !stat) return;
    const range = generatorConstraintFor(unit).stats[stat.id];
    const minInput = row.querySelector('[data-generator-part="min"]');
    const maxInput = row.querySelector('[data-generator-part="max"]');
    const lockedInput = row.querySelector('[data-generator-part="locked"]');
    row.classList.toggle("locked", range.locked);
    row.classList.toggle("invalid", !range.locked && range.min > range.max);
    minInput.disabled = range.locked;
    maxInput.disabled = range.locked;
    minInput.value = range.locked ? unit[stat.id] : range.min;
    maxInput.value = range.locked ? unit[stat.id] : range.max;
    lockedInput.checked = range.locked;
  });

  const status = generatorValidation();
  const summary = view.querySelector("[data-generator-summary]");
  const summaryTitle = view.querySelector("[data-generator-summary-title]");
  const summaryText = view.querySelector("[data-generator-summary-text]");
  const summaryMark = view.querySelector(".generator-summary-mark");
  const issues = status.invalidRanges;
  summary.classList.toggle("warning", Boolean(issues || !status.activeObjectives));
  summaryMark.textContent = issues || !status.activeObjectives ? "!" : "✓";
  const generateButton = view.querySelector("[data-action=generate-rosters]");
  if (generateButton && generateButton.dataset.running !== "true") {
    generateButton.disabled = Boolean(issues || !status.activeObjectives);
    generateButton.title = generateButton.disabled ? "Resolve the configuration warning before generating" : "Search for roster candidates";
  }
  if (status.invalidRanges) {
    summaryTitle.textContent = "Fix the highlighted stat ranges";
    summaryText.textContent = `${status.invalidRanges} minimum value${status.invalidRanges === 1 ? " is" : "s are"} above its maximum.`;
  } else if (!status.activeObjectives) {
    summaryTitle.textContent = "Choose at least one objective";
    summaryText.textContent = "Every optimization priority is currently switched off.";
  } else {
    summaryTitle.textContent = "Configuration ready";
    summaryText.textContent = `${status.activeObjectives} goals active · ${status.constrainedUnits} of ${units.length} units constrained · ${status.lockedStats} stats fixed.`;
  }
}

function appendSelectOptions(select, options, selectedValue) {
  options.forEach(([value, label]) => {
    const option = createElement("option", "", label);
    option.value = value;
    option.selected = String(value) === String(selectedValue);
    select.append(option);
  });
}

function generatorRosterMetrics(roster) {
  const metrics = calculateGeneratorMetrics(
    roster,
    generatorConfig.settings,
    generatorConfig.objectives,
    { explodingSixes, criticalFail }
  );
  let changeTotal = 0;
  let changeParts = 0;
  roster.forEach((unit, index) => {
    const original = units[index];
    GENERATOR_STATS.forEach(stat => {
      const range = generatorConstraintFor(original).stats[stat.id];
      const scale = Math.max(1, Math.min(12, range.max - range.min));
      changeTotal += Math.min(1, Math.abs(unit[stat.id] - original[stat.id]) / scale);
      changeParts += 1;
    });
    changeTotal += unit.ap === original.ap ? 0 : 1;
    changeParts += 1;
  });
  const changeDistance = changeTotal / Math.max(1, changeParts);
  return {
    ...metrics,
    changeDistance,
    score: Math.max(0, metrics.score - changeDistance * 3)
  };
}

function constrainedGeneratorSeed() {
  return units.map(unit => {
    const constraint = generatorConstraintFor(unit);
    const candidate = { ...unit };
    GENERATOR_STATS.forEach(stat => {
      const range = constraint.stats[stat.id];
      candidate[stat.id] = range.locked
        ? unit[stat.id]
        : Math.min(range.max, Math.max(range.min, unit[stat.id]));
    });
    if (constraint.ap === "on") candidate.ap = true;
    else if (constraint.ap === "off") candidate.ap = false;
    else if (constraint.ap === "locked") candidate.ap = unit.ap;
    return candidate;
  });
}

function generatorMutableFields() {
  const fields = [];
  units.forEach((unit, unitIndex) => {
    const constraint = generatorConstraintFor(unit);
    GENERATOR_STATS.forEach(stat => {
      const range = constraint.stats[stat.id];
      if (!range.locked && range.min < range.max) fields.push({ unitIndex, stat, range });
    });
    if (constraint.ap === "any") fields.push({ unitIndex, stat: { id: "ap" }, range: null });
  });
  return fields;
}

function mutateGeneratorRoster(source, mutableFields, mutationCount = 1) {
  const roster = cloneUnits(source);
  for (let mutation = 0; mutation < mutationCount; mutation += 1) {
    const field = mutableFields[Math.floor(Math.random() * mutableFields.length)];
    if (!field) break;
    const unit = roster[field.unitIndex];
    if (field.stat.id === "ap") {
      unit.ap = !unit.ap;
      continue;
    }
    const { min, max } = field.range;
    const width = max - min;
    let next;
    if (Math.random() < .82) {
      const step = Math.max(1, Math.ceil(Math.min(6, width) * Math.random()));
      next = unit[field.stat.id] + (Math.random() < .5 ? -step : step);
    } else {
      next = min + Math.floor(Math.random() * (width + 1));
    }
    unit[field.stat.id] = Math.min(max, Math.max(min, next));
  }
  return roster;
}

function generatorRosterKey(roster) {
  return roster.map(unit => `${unit.speed},${unit.drill},${unit.strike},${unit.defense},${unit.hp},${unit.ap ? 1 : 0}`).join("|");
}

async function generateRosterCandidates(onProgress, token) {
  const seed = constrainedGeneratorSeed();
  const mutableFields = generatorMutableFields();
  const requested = generatorConfig.settings.candidateCount;
  const poolSize = Math.max(24, requested * 7);
  const iterations = Math.min(6000, 1400 + units.length * 260);
  const seen = new Set();
  const pool = [];
  const consider = roster => {
    const key = generatorRosterKey(roster);
    if (seen.has(key)) return;
    seen.add(key);
    pool.push({ units: roster, metrics: generatorRosterMetrics(roster) });
    pool.sort((a, b) => b.metrics.score - a.metrics.score);
    if (pool.length > poolSize) pool.length = poolSize;
  };
  consider(seed);
  if (!mutableFields.length) return pool.slice(0, 1);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (token !== generatorRunToken) return [];
    const base = Math.random() < .12
      ? seed
      : pool[Math.floor(Math.random() ** 2 * pool.length)].units;
    const mutationCount = Math.random() < .7 ? 1 : 2 + Math.floor(Math.random() * Math.min(4, mutableFields.length));
    consider(mutateGeneratorRoster(base, mutableFields, mutationCount));
    if (iteration % 120 === 119) {
      onProgress((iteration + 1) / iterations);
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
  }
  onProgress(1);

  const distinct = [];
  pool.forEach(candidate => {
    const tooSimilar = distinct.some(existing => {
      let differences = 0;
      candidate.units.forEach((unit, index) => {
        GENERATOR_STATS.forEach(stat => {
          if (unit[stat.id] !== existing.units[index][stat.id]) differences += 1;
        });
        if (unit.ap !== existing.units[index].ap) differences += 1;
      });
      return differences < Math.max(1, Math.floor(units.length / 3));
    });
    if (!tooSimilar && distinct.length < requested) distinct.push(candidate);
  });
  pool.forEach(candidate => {
    if (distinct.length < requested && !distinct.includes(candidate)) distinct.push(candidate);
  });
  return distinct.slice(0, requested);
}

function generatorCandidateChanges(roster) {
  return roster.map((unit, index) => {
    const original = units[index];
    const changes = [];
    GENERATOR_STATS.forEach(stat => {
      if (unit[stat.id] !== original[stat.id]) changes.push(`${stat.label} ${original[stat.id]}→${unit[stat.id]}`);
    });
    if (unit.ap !== original.ap) changes.push(`AP ${unit.ap ? "on" : "off"}`);
    return changes.length ? `${unit.name}: ${changes.join(" · ")}` : null;
  }).filter(Boolean);
}

function renderGeneratorCandidates(view) {
  const results = view.querySelector("[data-generator-results]");
  results.replaceChildren();
  results.hidden = !generatorCandidates.length;
  if (!generatorCandidates.length) return;
  const heading = createElement("div", "generator-results-heading");
  const copy = createElement("div");
  copy.append(
    createElement("strong", "", "Generated candidates"),
    createElement("span", "", "Scores estimate the five selected goals; apply a roster to calculate its exact outcome matrix.")
  );
  heading.append(copy, createElement("span", "generator-step", `04 · ${generatorCandidates.length} results`));
  const list = createElement("div", "generator-candidate-list");
  generatorCandidates.forEach((candidate, index) => {
    const card = createElement("article", "generator-candidate");
    const cardHeading = createElement("div", "generator-candidate-heading");
    const rank = createElement("div", "generator-candidate-rank");
    rank.append(
      createElement("span", "", `#${index + 1}`),
      createElement("strong", "", `${Math.round(candidate.metrics.score)} score`)
    );
    const applyButton = createElement("button", "generator-apply-button", "Apply roster");
    applyButton.type = "button";
    applyButton.dataset.action = "apply-generator-candidate";
    applyButton.dataset.candidateIndex = String(index);
    cardHeading.append(rank, applyButton);
    const metrics = createElement("div", "generator-candidate-metrics");
    [
      ["Specialization", `${formatMetric(candidate.metrics.roleSeparation)} pts`],
      ["+1 rank gain", `${formatMetric(candidate.metrics.advantageRankGain)} places`],
      ["Est. engagement", `${formatMetric(candidate.metrics.engagementRounds)} rounds`],
      ["Mobility slope", `${formatMetric(candidate.metrics.mobilitySlope)} pp/stat`],
      ["AP dice gap", candidate.metrics.apDiceGap === null ? "N/A" : `${formatMetric(candidate.metrics.apDiceGap)} dice`]
    ].forEach(([label, value]) => {
      const metric = createElement("div");
      metric.append(createElement("span", "", label), createElement("strong", "", value));
      metrics.append(metric);
    });
    const changes = generatorCandidateChanges(candidate.units);
    const changeList = createElement("div", "generator-candidate-changes");
    if (changes.length) changes.forEach(change => changeList.append(createElement("span", "", change)));
    else changeList.append(createElement("span", "", "No stat changes required."));
    card.append(cardHeading, metrics, changeList);
    list.append(card);
  });
  results.append(heading, list);
}

function renderGenerator() {
  const view = createElement("div", "generator-view");
  const toolbar = createElement("div", "visual-toolbar generator-toolbar");
  const toolbarActions = createElement("div", "generator-toolbar-actions");
  const generateButton = createElement("button", "generator-generate-button", "Generate candidates");
  generateButton.type = "button";
  generateButton.dataset.action = "generate-rosters";
  toolbarActions.append(
    createElement("span", "visual-toolbar-note", "Constraints save automatically"),
    generateButton
  );
  toolbar.append(
    createElement("span", "visual-toolbar-label", "Roster generator setup"),
    toolbarActions
  );
  const runStatus = createElement("div", "generator-run-status");
  runStatus.hidden = true;
  const runStatusText = createElement("span", "", "Searching candidate rosters…");
  const runProgress = createElement("div", "generator-run-progress");
  runProgress.append(createElement("span"));
  runStatus.append(runStatusText, runProgress);

  const objectivesSection = createElement("section", "generator-section");
  const objectivesHeading = createElement("div", "generator-section-heading");
  const objectivesCopy = createElement("div");
  objectivesCopy.append(
    createElement("strong", "", "Choose the balancing priorities"),
    createElement("span", "", "Every goal can be turned off or weighted Low, Medium, or High.")
  );
  objectivesHeading.append(objectivesCopy, createElement("span", "generator-step", "01 · objectives"));
  const objectiveGrid = createElement("div", "generator-objectives");
  GENERATOR_OBJECTIVES.forEach(objective => {
    const card = createElement("label", "generator-objective");
    card.dataset.objectiveId = objective.id;
    card.dataset.priority = String(generatorConfig.objectives[objective.id]);
    const copy = createElement("span", "generator-objective-copy");
    copy.append(createElement("strong", "", objective.name), createElement("span", "", objective.description));
    const select = createElement("select", "generator-priority");
    select.dataset.generatorObjective = objective.id;
    select.setAttribute("aria-label", `${objective.name} priority`);
    appendSelectOptions(select, [[0, "Off"], [1, "Low"], [2, "Medium"], [3, "High"]], generatorConfig.objectives[objective.id]);
    card.append(copy, select);
    objectiveGrid.append(card);
  });
  objectivesSection.append(objectivesHeading, objectiveGrid);

  const targetsSection = createElement("section", "generator-section");
  const targetsHeading = createElement("div", "generator-section-heading");
  const targetsCopy = createElement("div");
  targetsCopy.append(
    createElement("strong", "", "Set the desired strength of each effect"),
    createElement("span", "", "These targets define what a good candidate means; the priorities above control their importance.")
  );
  targetsHeading.append(targetsCopy, createElement("span", "generator-step", "02 · targets"));
  const targets = createElement("div", "generator-targets");
  [
    ["diversityTarget", "Specialization separation", "Target nearest-neighbour distance on centred matchup profiles.", 2, 30, .5, "pts"],
    ["advantageRankTarget", "+1 target rank gain", "Average places gained by non-leading units after receiving +1 attack die.", .25, 5, .25, "places"],
    ["engagementTarget", "Average engagement", "Desired average length across all pairings, including mirrors.", 1.5, 8, .25, "rounds"],
    ["engagementTolerance", "Length tolerance", "How far engagement length may drift before its score falls sharply.", .1, 2, .1, "± rounds"],
    ["mobilityTaxTarget", "Speed/Drill power tax", "Desired base win-rate decline per combined Speed or Drill point.", .1, 5, .1, "pp/stat"],
    ["apDiceGapTarget", "AP attack-die gap", "How many fewer attack dice an AP unit should have than its closest non-AP peer.", .5, 6, .5, "dice"],
    ["candidateCount", "Candidate rosters", "How many of the best alternatives to keep.", 3, 12, 1, ""]
  ].forEach(([id, label, description, min, max, step, suffix]) => {
    const card = createElement("label", "generator-target");
    const copy = createElement("span", "generator-target-copy");
    copy.append(createElement("strong", "", label), createElement("span", "", description));
    const control = createElement("span", "generator-number-control");
    const input = createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(generatorConfig.settings[id]);
    input.dataset.generatorSetting = id;
    input.setAttribute("aria-label", label);
    control.append(input);
    if (suffix) control.append(createElement("span", "", suffix));
    card.append(copy, control);
    targets.append(card);
  });
  targetsSection.append(targetsHeading, targets);

  const unitsSection = createElement("section", "generator-section generator-unit-section");
  const unitsHeading = createElement("div", "generator-section-heading");
  const unitsCopy = createElement("div");
  unitsCopy.append(
    createElement("strong", "", "Constrain individual units"),
    createElement("span", "", "Limit which stats and AP values the search may change, or lock important unit identities in place.")
  );
  unitsHeading.append(unitsCopy, createElement("span", "generator-step", "03 · units"));
  const unitList = createElement("div", "generator-units");

  units.forEach((unit, unitIndex) => {
    const constraint = generatorConstraintFor(unit);
    const details = createElement("details", "generator-unit");
    details.dataset.unitId = unit.id;
    details.open = unitIndex === 0;
    const heading = createElement("summary", "generator-unit-heading");
    const identity = createElement("span", "generator-unit-identity");
    const dot = createElement("span", "unit-dot");
    dot.style.setProperty("--dot-color", unit.color);
    identity.append(dot, createElement("strong", "", unit.name));
    const unitStatus = createElement("span", "generator-unit-status", generatorUnitStatus(unit, constraint));
    unitStatus.dataset.generatorUnitStatus = "";
    heading.append(identity, unitStatus, createElement("span", "generator-disclosure", "+"));

    const body = createElement("div", "generator-unit-body");
    const roleGrid = createElement("div", "generator-role-grid");
    const apControl = createElement("label", "generator-text-control generator-ap-control");
    apControl.append(createElement("span", "", "Armour piercing"));
    const apSelect = createElement("select");
    apSelect.dataset.generatorUnit = unit.id;
    apSelect.dataset.generatorField = "ap";
    appendSelectOptions(apSelect, [
      ["any", "Any value"],
      ["on", "Must have AP"],
      ["off", "Must not have AP"],
      ["locked", `Keep current (${unit.ap ? "on" : "off"})`]
    ], constraint.ap);
    apControl.append(apSelect, createElement("small", "", "Allow, require, forbid, or preserve AP"));
    roleGrid.append(apControl);

    const statBlock = createElement("div", "generator-stat-block");
    const statHeader = createElement("div", "generator-stat-header");
    statHeader.append(
      createElement("span", "", "Stat"),
      createElement("span", "", "Minimum"),
      createElement("span", "", "Maximum"),
      createElement("span", "", "Keep current")
    );
    statBlock.append(statHeader);
    GENERATOR_STATS.forEach(stat => {
      const range = constraint.stats[stat.id];
      const row = createElement("div", "generator-stat-row");
      row.dataset.unitId = unit.id;
      row.dataset.statId = stat.id;
      const statName = createElement("span", "generator-stat-name");
      statName.append(
        createElement("strong", "", stat.label),
        createElement("span", "", `${stat.name} · current ${unit[stat.id]}`)
      );
      const makeRangeInput = part => {
        const input = createElement("input", "generator-range-input");
        input.type = "number";
        input.min = String(stat.min);
        input.max = String(stat.max);
        input.step = "1";
        input.value = String(range[part]);
        input.dataset.generatorUnit = unit.id;
        input.dataset.generatorStat = stat.id;
        input.dataset.generatorPart = part;
        input.setAttribute("aria-label", `${unit.name} ${stat.name} ${part}`);
        return input;
      };
      const lockLabel = createElement("label", "generator-lock-control");
      const lockInput = createElement("input");
      lockInput.type = "checkbox";
      lockInput.checked = range.locked;
      lockInput.dataset.generatorUnit = unit.id;
      lockInput.dataset.generatorStat = stat.id;
      lockInput.dataset.generatorPart = "locked";
      lockInput.setAttribute("aria-label", `Keep ${unit.name} ${stat.name} at ${unit[stat.id]}`);
      lockLabel.append(lockInput, createElement("span", "", "Lock"));
      row.append(statName, makeRangeInput("min"), makeRangeInput("max"), lockLabel);
      statBlock.append(row);
    });
    const statNote = createElement("p", "generator-stat-note", "Ranges are inclusive whole numbers. Locking a stat keeps its current value.");
    body.append(roleGrid, statBlock, statNote);
    details.append(heading, body);
    unitList.append(details);
  });
  unitsSection.append(unitsHeading, unitList);

  const summary = createElement("div", "generator-summary");
  summary.dataset.generatorSummary = "";
  const summaryMark = createElement("span", "generator-summary-mark", "✓");
  const summaryCopy = createElement("div");
  const summaryTitle = createElement("strong");
  summaryTitle.dataset.generatorSummaryTitle = "";
  const summaryText = createElement("span");
  summaryText.dataset.generatorSummaryText = "";
  summaryCopy.append(summaryTitle, summaryText);
  summary.append(summaryMark, summaryCopy);

  const generatedResults = createElement("section", "generator-section generator-results");
  generatedResults.dataset.generatorResults = "";
  generatedResults.hidden = true;

  view.append(toolbar, runStatus, objectivesSection, targetsSection, unitsSection, summary, generatedResults);
  resultStage.replaceChildren(view);

  const handleControl = target => {
    if (target.dataset.generatorObjective) {
      generatorConfig.objectives[target.dataset.generatorObjective] = safeNumber(target.value, 0, 0, 3);
    } else if (target.dataset.generatorSetting) {
      const limits = {
        diversityTarget: [2, 30],
        advantageRankTarget: [.25, 5],
        engagementTarget: [1.5, 8],
        engagementTolerance: [.1, 2],
        mobilityTaxTarget: [.1, 5],
        apDiceGapTarget: [.5, 6],
        candidateCount: [3, 12]
      };
      const id = target.dataset.generatorSetting;
      const [min, max] = limits[id];
      generatorConfig.settings[id] = id === "candidateCount"
        ? safeNumber(target.value, generatorConfig.settings[id], min, max)
        : safeDecimal(target.value, generatorConfig.settings[id], min, max);
      target.value = String(generatorConfig.settings[id]);
    } else if (target.dataset.generatorField) {
      const unit = units.find(item => item.id === target.dataset.generatorUnit);
      if (!unit) return;
      const constraint = generatorConstraintFor(unit);
      constraint[target.dataset.generatorField] = target.value.slice(0, 120);
    } else if (target.dataset.generatorStat) {
      const unit = units.find(item => item.id === target.dataset.generatorUnit);
      const stat = GENERATOR_STATS.find(item => item.id === target.dataset.generatorStat);
      if (!unit || !stat) return;
      const range = generatorConstraintFor(unit).stats[stat.id];
      if (target.dataset.generatorPart === "locked") {
        range.locked = target.checked;
      } else {
        const part = target.dataset.generatorPart;
        range[part] = safeNumber(target.value, range[part], stat.min, stat.max);
        target.value = String(range[part]);
      }
    } else {
      return;
    }
    generatorRunToken += 1;
    generatorCandidates = [];
    runStatus.hidden = true;
    generateButton.dataset.running = "false";
    generateButton.textContent = "Generate candidates";
    renderGeneratorCandidates(view);
    saveGeneratorConfig();
    updateGeneratorView(view);
  };

  view.addEventListener("input", event => {
    if (event.target.dataset.generatorField && event.target.tagName === "INPUT") handleControl(event.target);
  });
  view.addEventListener("change", event => handleControl(event.target));
  view.addEventListener("click", async event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "generate-rosters") {
      const validation = generatorValidation();
      const blocked = validation.invalidRanges
        || !validation.activeObjectives;
      if (blocked || generateButton.dataset.running === "true") return;
      const token = ++generatorRunToken;
      generatorCandidates = [];
      renderGeneratorCandidates(view);
      generateButton.dataset.running = "true";
      generateButton.disabled = true;
      generateButton.textContent = "Generating…";
      runStatus.hidden = false;
      runStatusText.textContent = "Searching candidate rosters…";
      runProgress.firstElementChild.style.width = "0%";
      try {
        const candidates = await generateRosterCandidates(progress => {
          if (token !== generatorRunToken || !view.isConnected) return;
          runProgress.firstElementChild.style.width = `${Math.round(progress * 100)}%`;
          runStatusText.textContent = `Searching candidate rosters… ${Math.round(progress * 100)}%`;
        }, token);
        if (token !== generatorRunToken || !view.isConnected) return;
        generatorCandidates = candidates;
        renderGeneratorCandidates(view);
        runStatusText.textContent = candidates.length
          ? `Finished · ${candidates.length} candidate roster${candidates.length === 1 ? "" : "s"}`
          : "No candidate roster could be generated from these constraints.";
      } catch (error) {
        if (token === generatorRunToken && view.isConnected) {
          runStatusText.textContent = "Generation stopped unexpectedly. Your roster was not changed.";
          console.error(error);
        }
      } finally {
        if (token === generatorRunToken && view.isConnected) {
          generateButton.dataset.running = "false";
          generateButton.disabled = false;
          generateButton.textContent = "Generate again";
          updateGeneratorView(view);
        }
      }
    } else if (action === "apply-generator-candidate") {
      const candidateIndex = Number(event.target.closest("[data-candidate-index]")?.dataset.candidateIndex);
      const candidate = generatorCandidates[candidateIndex];
      if (!candidate) return;
      generatorRunToken += 1;
      units = sanitiseUnits(candidate.units);
      shownUnits = cloneUnits(units);
      matchupCache.clear();
      saveUnits();
      generatorCandidates = [];
      activeView = "matrix";
      localStorage.setItem(VIEW_KEY, activeView);
      renderEditor();
      renderResults();
      setUpdating(false);
    }
  });
  renderGeneratorCandidates(view);
  updateGeneratorView(view);
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
  const matrixMatchupCount = shownUnits.length * shownUnits.length;
  resultsPanel.classList.toggle("matrix-layout", activeView === "matrix");
  resultsTitle.textContent = activeView === "generator" ? "Balance generator" : "Outcomes";
  generatorButton.classList.toggle("active", activeView === "generator");
  resultsMeta.textContent = activeView === "generator"
    ? `${units.length} units · constraints and objectives`
    : activeView === "matrix"
      ? `${shownUnits.length} units · ${matrixMatchupCount} matchups · ${combatRuleSet === "penalties" ? "Penalties" : "Disruption"} rules`
      : `${shownUnits.length} units · ${matchupCount} displayed matchups`;
  outcomeKey.hidden = activeView !== "bars";

  viewButtons.forEach(button => {
    const selected = button.dataset.view === activeView;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });

  if (activeView === "matrix") renderMatrix();
  else if (activeView === "similarity") renderSimilarity();
  else if (activeView === "health") renderHealth();
  else if (activeView === "generator") renderGenerator();
  else if (activeView === "counters") renderCounters();
  else if (activeView === "profile") renderProfile();
  else renderBars();
}

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
  else if (["strike", "drill", "speed", "defense"].includes(field)) unit[field] = target.value;
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
  matrixAttackBonuses.delete(removedId);
  delete generatorConfig.units[removedId];
  deleteCookieValue(`${GENERATOR_UNIT_COOKIE_PREFIX}${removedId}`);
  saveUnits();
  saveMatchupOrders();
  saveMatrixCustomOrder();
  saveMatrixAttackBonuses();
  saveGeneratorConfig();
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
  syncGeneratorConfigToUnits();
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
  matrixAttackBonuses = new Map();
  matchupCache.clear();
  saveUnits();
  saveMatchupOrders();
  saveMatrixCustomOrder();
  saveMatrixAttackBonuses();
  syncGeneratorConfigToUnits();
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

generatorButton.addEventListener("click", () => {
  activeView = "generator";
  localStorage.setItem(VIEW_KEY, activeView);
  renderResults();
});

explodingSixesToggle.checked = explodingSixes;
explodingSixesToggle.addEventListener("change", () => {
  explodingSixes = explodingSixesToggle.checked;
  saveExplodingSixes();
  matchupCache.clear();
  renderResults();
});

criticalFailToggle.checked = criticalFail;
criticalFailToggle.addEventListener("change", () => {
  criticalFail = criticalFailToggle.checked;
  saveCriticalFail();
  matchupCache.clear();
  renderResults();
});

makeSortable(unitGrid, ".unit-card", "id");
makeSortable(resultStage, ".matchup-card", "unitId");
enableMatchupRowSorting();

renderEditor();
renderResults();
renderUnitSets();
setUpdating(false);
if (unitLoadNeedsPersist) saveUnits();
if (unitSetsNeedPersist) saveUnitSets();
window.addEventListener("beforeunload", saveUnits);
