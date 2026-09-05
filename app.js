import { DEFAULT_MODIFIERS, normaliseModifiers } from "./combat-rules.js";
import {
  attackTargetNumber,
  resolveRulesMatchup
} from "./combat-engine.js";
import { rankRoster, compareProfiles, targetInversions, sameRoster } from "./balance-engine.js";
import { normaliseSituation, pairingSituation, modifierImpact } from "./modifier-engine.js";
import { generatorRosterMetrics as calculateGeneratorMetrics } from "./generator-engine.js";

const STORAGE_KEY = "matchup-board-units-v1";
const AUTO_RANK_KEY = "matchup-board-auto-rank-v1";
const STORAGE_COOKIE = "matchup-board-units-v1";
const RECOVERY_KEY = "matchup-board-roster-recovered-2026-07-18";
const VIEW_KEY = "matchup-board-view-v2";
const MATCHUP_ORDER_KEY = "matchup-board-matchup-orders-v1";
const MATRIX_SORT_KEY = "matchup-board-matrix-sort-v1";
const MATRIX_SCENARIO_KEY = "matchup-board-matrix-scenario-v1";
const MATRIX_CUSTOM_ORDER_KEY = "matchup-board-matrix-custom-order-v1";
const COUNTER_THRESHOLD_KEY = "matchup-board-counter-threshold-v1";
const UNIT_SETS_KEY = "matchup-board-unit-sets-v1";
const UNIT_SET_COOKIE_PREFIX = "matchup-board-unit-set-v1-";
const SIMILARITY_METRIC_KEY = "matchup-board-similarity-metric-v1";
const GENERATOR_CONFIG_KEY = "matchup-board-generator-config-v2";
const GENERATOR_UNIT_COOKIE_PREFIX = "matchup-board-generator-unit-v2-";
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

const GENERATOR_OBJECTIVES = [
  { id: "diversity", name: "Unit diversity", description: "Spread out centred specialization profiles and create varied strengths and weaknesses." },
  { id: "advantageImpact", name: "+1 advantage impact", description: "Make one extra attack die move units meaningfully up the Strength ranking." },
  { id: "engagementLength", name: "Engagement length", description: "Keep the roster's average engagement close to your target number of rounds." },
  { id: "mobilityTax", name: "Mobility tax", description: "Make high-mobility units weaker in the base combat ranking." },
  { id: "apTax", name: "AP attack-die tax", description: "Give AP units fewer attack dice than otherwise similar non-AP units." }
];

const GENERATOR_STATS = [
  { id: "speed", label: "MOB", name: "Mobility", min: 0, max: 99 },
  { id: "strike", label: "MEL", name: "Melee", min: 1, max: 99 },
  { id: "defense", label: "DEF", name: "Defence", min: 1, max: 6 }
];

const COMBAT_SCENARIOS = [
  { id: "neutral", label: "Neutral", shortLabel: "N", heightAdvantage: 0, outflanker: null, description: "No height or outflanking modifier" },
  { id: "higher", label: "Row higher", shortLabel: "H", heightAdvantage: 1, outflanker: null, get description() { return `Row attacker +${modifierRules.height}; column attacker −${modifierRules.height}`; } },
  { id: "outflanking", label: "Column outflanked", shortLabel: "O", heightAdvantage: 0, outflanker: "a", get description() { return `Column target is outflanked: row +${modifierRules.outflanking}, column −${modifierRules.outflanking}; applies once regardless of flankers`; } },
  { id: "combined", label: "Higher + outflanked", shortLabel: "H+O", heightAdvantage: 1, outflanker: "a", description: "Row is higher and column is outflanked; the modifiers stack" }
];

const unitGrid = document.querySelector("#unitGrid");
const autoRankCards = document.querySelector("#autoRankCards");
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
const unitCardTemplate = document.querySelector("#unitCardTemplate");
const viewButtons = [...document.querySelectorAll(".view-button")];

let unitLoadNeedsPersist = false;
let units = loadUnits();
let autoRankEnabled = false;
try { autoRankEnabled = localStorage.getItem(AUTO_RANK_KEY) === "true"; } catch { /* Use the default when storage is unavailable. */ }
autoRankCards.checked = autoRankEnabled;
let shownUnits = cloneUnits(units);
let activeView = loadView();
let matrixSort = loadMatrixSort();
let matrixScenario = loadMatrixScenario();
let matrixCustomOrder = loadMatrixCustomOrder();
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

const BASELINE_KEY = "matchup-board-strike-baseline-v1";
let baselineNotice = "";
let balanceBaseline = loadBalanceBaseline();
let inspectedA = units[0]?.id;
let inspectedB = units[1]?.id;
let inspectedOrder = .5;
let inspectedScenario = "neutral";
let similarityThreshold = 5;
const UNIT_SITUATIONS_KEY = "matchup-board-unit-situations-v1";
let unitSituations = loadUnitSituations();
let modifierTestUnit = units.at(-1)?.id;
let modifierThresholds = { underdog: 30, decisive: 60 };
let modifierStorageNotice = "";
const MODIFIER_RULES_KEY = "matchup-board-modifier-values-v1";
let modifierRules = loadModifierRules();
let modifierRulesNotice = "";


function loadBalanceBaseline() {
  try {
    const stored = JSON.parse(localStorage.getItem(BASELINE_KEY));
    if (stored && validSavedUnits(stored.units)) return { ...stored, units: sanitiseUnits(stored.units) };
  } catch { /* A fresh reference is safe when no stored reference can be read. */ }
  return captureBalanceBaseline();
}

function captureBalanceBaseline() {
  const baseline = { units: sanitiseUnits(units), savedAt: new Date().toISOString() };
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify(baseline)); }
  catch { baselineNotice = "Reference available for this session only; browser storage is unavailable."; }
  return baseline;
}

function balanceTable(headings) {
  const wrapper = createElement("div", "balance-table-scroll");
  const table = createElement("table", "balance-table");
  const head = createElement("thead");
  const row = createElement("tr");
  headings.forEach(heading => {
    const th = createElement("th", "", heading);
    th.scope = "col";
    row.append(th);
  });
  head.append(row);
  const body = createElement("tbody");
  table.append(head, body);
  wrapper.append(table);
  return { wrapper, body };
}

function balanceSection(title, description) {
  const section = createElement("section", "balance-section");
  section.append(createElement("h2", "", title), createElement("p", "balance-description", description));
  return section;
}

function renderBalance() {
  const view = createElement("div", "balance-view");
  const entries = rankRoster(shownUnits, getMatchup);
  const comparable = sameRoster(shownUnits, balanceBaseline.units);
  const reference = comparable ? new Map(rankRoster(balanceBaseline.units, getMatchup).map(entry => [entry.unit.id, entry])) : new Map();
  const inversions = targetInversions(entries, shownUnits);
  const intendedRanks = new Map(shownUnits.map((unit, index) => [unit.id, index + 1]));
  const metrics = createElement("div", "balance-metrics");
  metrics.append(
    createHealthMetric("Highest strike score", `${entries[0].average.toFixed(1)}%`, `${entries[0].unit.name} · equally weighted opponents`),
    createHealthMetric("Mean engagement", `${formatMetric(entries.reduce((sum, entry) => sum + entry.rounds, 0) / entries.length)} rounds`, "Distinct pairs only · both units try to strike each round"),
    createHealthMetric("Intended order", `${inversions.length} conflicts`, "Card order: first strongest, last weakest", inversions.length ? "warning" : "neutral")
  );
  view.append(metrics);

  const ranking = balanceSection("Strength as you tune", "Average chance to win against every other unit, weighted equally. Ties share a rank. Drag the stat cards above into your intended order: strongest to weakest, left to right then top to bottom. Equal scores are flagged when they do not establish the intended order.");
  const referenceBar = createElement("div", "balance-controls");
  const save = createElement("button", "button button-quiet", "Use current stats as reference");
  save.type = "button";
  save.addEventListener("click", () => {
    balanceBaseline = captureBalanceBaseline();
    renderBalance();
  });
  referenceBar.append(save, createElement("span", "balance-description", baselineNotice || (comparable
    ? "Changes compare with your saved reference, recalculated using the current strike rules."
    : "Roster membership changed. Save a new reference to compare the same opponents.")));
  ranking.append(referenceBar);
  const table = balanceTable(["Rank", "Unit", "Avg win", "Change", "Rank change", "Intended rank"]);
  entries.forEach(entry => {
    const old = reference.get(entry.unit.id);
    const row = createElement("tr");
    const name = createElement("td");
    name.append(createUnitHeading(entry.unit));
    const movement = old ? old.rank - entry.rank : 0;
    row.append(createElement("td", "", `#${entry.rank}`), name,
      createElement("td", "score-number", `${entry.average.toFixed(1)}%`),
      createElement("td", "", old ? `${formatPercentagePointDelta(entry.average - old.average, 1)} pp` : "—"),
      createElement("td", "", old ? (movement ? `${movement > 0 ? "↑" : "↓"}${Math.abs(movement)}` : "—") : "—"), createElement("td", "", `#${intendedRanks.get(entry.unit.id)}`));
    table.body.append(row);
  });
  ranking.append(table.wrapper);
  if (inversions.length) {
    const list = createElement("ul", "balance-conflicts");
    inversions.forEach(({ stronger, weaker }) => list.append(createElement("li", "", `${stronger.unit.name} (intended #${intendedRanks.get(stronger.unit.id)}) should rank above ${weaker.unit.name} (intended #${intendedRanks.get(weaker.unit.id)}), but scores ${stronger.average.toFixed(1)}% versus ${weaker.average.toFixed(1)}%.`)));
    ranking.append(list);
  }
  view.append(ranking, renderDurationInspector(), renderProfileDiagnostics());

  const assumptions = createElement("details", "balance-assumptions");
  assumptions.append(createElement("summary", "", "What these results measure"));
  const list = createElement("ul");
  [
    "Rules.docx: Melee dice, Defence target, AP uses the lower of Defence and 3, exploding critical 6s, and immediate rout at 7 strain. All modifiers are added before enforcing the one-die minimum.",
    `Baseline: two fresh units already in contact on level ground, neither outflanked. Each surviving unit strikes once per round. The first striker gains +${modifierRules.initiative} Initiative because its target has no command marker. Current experimental values: height ±${modifierRules.height}, outflanking ±${modifierRules.outflanking}.`,
    "Activation order is independently 50/50 each round for roster rankings. This is a modelling assumption: bidding and Master Tactician decisions are not random in the game. The inspector can test either unit always going first.",
    "The duration chart is the exact probability of ending in each round for the selected pair. The last bar retains all probability beyond the displayed horizon; it is not a draw. A round here is a round with both units committed to striking, not a prediction of elapsed tabletop rounds.",
    "Shooting, evasion, movement, rallying, allies, command scarcity, disengagement and camp/leader objectives are outside this strike benchmark. Mobility does not directly add strike dice. A lower strike rank can still be appropriate for a tactically valuable unit.",
    "Roster composition affects ranks and similarity. The stat cards express your intended order; a 50% score for every unit is not a balancing requirement. The generator searches with approximate scores; check candidates here before adopting them."
  ].forEach(text => list.append(createElement("li", "", text)));
  assumptions.append(list);
  view.append(assumptions);
  resultStage.replaceChildren(view);
}

function renderDurationInspector() {
  const section = balanceSection("How long does an engagement last?", "Inspect the spread of possible endings, including long fights. Positional modifiers are held constant throughout this engagement.");
  if (!shownUnits.some(unit => unit.id === inspectedA)) inspectedA = shownUnits[0].id;
  if (!shownUnits.some(unit => unit.id === inspectedB) || inspectedB === inspectedA) inspectedB = shownUnits.find(unit => unit.id !== inspectedA).id;
  const controls = createElement("div", "balance-controls");
  const addSelect = (labelText, options, value, onChange) => {
    const label = createElement("label", "balance-select", labelText);
    const select = createElement("select");
    options.forEach(([id, text]) => {
      const option = createElement("option", "", text);
      option.value = String(id);
      option.selected = String(value) === String(id);
      select.append(option);
    });
    select.addEventListener("change", () => { onChange(select.value); renderBalance(); });
    label.append(select);
    controls.append(label);
  };
  addSelect("Unit A", shownUnits.map(unit => [unit.id, unit.name]), inspectedA, value => { inspectedA = value; });
  addSelect("Unit B", shownUnits.filter(unit => unit.id !== inspectedA).map(unit => [unit.id, unit.name]), inspectedB, value => { inspectedB = value; });
  addSelect("Each round starts with", [[.5, "Either unit · 50/50"], [1, "Unit A always"], [0, "Unit B always"]], inspectedOrder, value => { inspectedOrder = Number(value); });
  addSelect("Unit A's position", [["neutral", "Neutral"], ["higher", "Higher"], ["outflanking", "Outflanking"], ["combined", "Higher + outflanking"]], inspectedScenario, value => { inspectedScenario = value; });
  const a = shownUnits.find(unit => unit.id === inspectedA);
  const b = shownUnits.find(unit => unit.id === inspectedB);
  const key = `duration:${inspectedOrder}:${matchupKey(a, b, matrixScenarioById(inspectedScenario))}`;
  if (!matchupCache.has(key)) matchupCache.set(key, resolveRulesMatchup({ ...a, shooting: false }, { ...b, shooting: false }, {
    ...matrixScenarioById(inspectedScenario), modifiers: modifierRules, firstProbabilityA: inspectedOrder, durationRounds: 12
  }));
  const result = matchupCache.get(key);
  const duration = result.duration;
  const summary = createElement("p", "duration-summary", `${a.name} wins ${result.shareA.toFixed(1)}% · Mean ${formatMetric(result.battleRounds)} rounds · Median ${duration.median ?? ">12"} · 90th percentile ${duration.p90 ?? ">12"} rounds`);
  const chart = createElement("div", "duration-chart");
  chart.setAttribute("role", "list");
  chart.setAttribute("aria-label", "Probability that the selected engagement ends in each round");
  const values = [...duration.probabilities, duration.tail];
  const largest = Math.max(...values, .01);
  values.forEach((probability, index) => {
    const column = createElement("div", "duration-column");
    const label = index === 12 ? "13+" : String(index + 1);
    const percent = probability * 100;
    const formatted = percent > 0 && percent < .1 ? "<0.1%" : `${percent.toFixed(1)}%`;
    column.title = `Ends in round ${label}: ${formatted}`;
    column.setAttribute("role", "listitem");
    column.setAttribute("aria-label", column.title);
    const bar = createElement("div", "duration-bar");
    bar.style.height = `${Math.max(0, probability / largest * 120)}px`;
    column.append(createElement("span", "duration-probability", formatted), bar, createElement("span", "duration-round", label));
    chart.append(column);
  });
  section.append(controls, summary, chart, createElement("p", "balance-description", "Round in which either unit routs · 13+ includes every longer engagement"));
  return section;
}

function renderProfileDiagnostics() {
  const section = balanceSection("Are any units filling the same role?", "Compare win chances against common opponents, excluding the two units themselves. Raw difference includes strength; role difference removes their average strength gap. Smaller differences mean more similar matchups.");
  const control = createElement("label", "balance-select", "Flag role differences below (percentage points)");
  const threshold = createElement("input");
  threshold.type = "number";
  threshold.min = "0";
  threshold.max = "100";
  threshold.step = "1";
  threshold.value = String(similarityThreshold);
  threshold.addEventListener("change", () => { similarityThreshold = safeNumber(threshold.value, 5, 0, 100); renderBalance(); });
  control.append(threshold);
  section.append(control);
  if (shownUnits.length < 4) {
    section.append(createElement("p", "balance-description", "Add at least four units to distinguish role patterns across two or more common opponents."));
    return section;
  }
  const pairs = [];
  shownUnits.forEach((a, index) => shownUnits.slice(index + 1).forEach(b => pairs.push(compareProfiles(a, b, shownUnits, getMatchup))));
  pairs.sort((a, b) => a.centred - b.centred || a.raw - b.raw);
  const flagged = pairs.filter(pair => pair.centred < similarityThreshold || pair.centred < 1e-7);
  section.append(createElement("p", "profile-warning", `${flagged.length} of ${pairs.length} pairs have similar roles at this threshold. Showing the ${Math.min(10, pairs.length)} closest pairs. This is a design prompt, not a requirement that every role be unique.`));
  const table = balanceTable(["Pair", "Raw difference", "Role difference", "Opposing counters"]);
  pairs.slice(0, 10).forEach(pair => {
    const row = createElement("tr", pair.centred < similarityThreshold || pair.centred < 1e-7 ? "similar-pair" : "");
    row.append(createElement("td", "", `${pair.a.name} / ${pair.b.name}`),
      createElement("td", "", `${pair.raw.toFixed(1)} pp`), createElement("td", "", `${pair.centred.toFixed(1)} pp`),
      createElement("td", "", `${pair.differentCounters} / ${pair.rows.length}`));
    table.body.append(row);
  });
  section.append(table.wrapper, createElement("p", "balance-description", "Differences are RMS percentage points. Opposing counters count common opponents where one unit wins at least 60% and the other at most 40%. More common opponents make role comparisons more informative."));
  return section;
}

function loadModifierRules() {
  try { return normaliseModifiers(JSON.parse(localStorage.getItem(MODIFIER_RULES_KEY))); }
  catch { return { ...DEFAULT_MODIFIERS }; }
}

function changeModifierRules(values) {
  modifierRules = normaliseModifiers(values);
  try {
    localStorage.setItem(MODIFIER_RULES_KEY, JSON.stringify(modifierRules));
    modifierRulesNotice = "";
  } catch {
    modifierRulesNotice = "Values are available for this session only; browser storage is unavailable.";
  }
  // Candidate scores and every cached matchup depend on these rule values.
  generatorRunToken += 1;
  generatorCandidates = [];
  renderModifierRules();
  updateResults(true);
}

function renderModifierRules() {
  const controls = document.querySelector("#modifierRules");
  controls.replaceChildren();
  controls.append(createElement("strong", "modifier-rule-heading", "Modifier values"));
  [
    ["height", "Height ±", "Dice added to the higher unit and removed from the lower unit"],
    ["outflanking", "Outflanking ±", "Dice added to the outflanking unit and removed from the outflanked unit"],
    ["initiative", "Initiative +", "Extra dice for striking a target without a command marker"]
  ].forEach(([field, text, description]) => {
    const label = createElement("label", "modifier-rule-label", text);
    label.title = description;
    const input = createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "99";
    input.step = "1";
    input.value = String(modifierRules[field]);
    input.dataset.modifierValue = field;
    input.setAttribute("aria-label", `${field} modifier in dice`);
    input.addEventListener("change", () => {
      changeModifierRules({ ...modifierRules, [field]: input.value });
      controls.querySelector(`[data-modifier-value="${field}"]`).focus();
    });
    label.append(input);
    controls.append(label);
  });
  const defaults = Object.keys(DEFAULT_MODIFIERS).every(field => modifierRules[field] === DEFAULT_MODIFIERS[field]);
  const reset = createElement("button", "button button-quiet", "Restore rule defaults");
  reset.type = "button";
  reset.disabled = defaults;
  reset.addEventListener("click", () => changeModifierRules(DEFAULT_MODIFIERS));
  controls.append(reset, createElement("span", "modifier-rule-status", defaults ? "Rules.docx defaults" : "Custom modifier values"));
  controls.append(createElement("p", "modifier-rule-note", modifierRulesNotice || "Applies across the site. Set 0 to disable a modifier. Test height and outflanking in Modifiers or Matrix. Initiative 0 removes its bonus dice; acting first still resolves the attack first."));
}

function loadUnitSituations() {
  try {
    const saved = JSON.parse(localStorage.getItem(UNIT_SITUATIONS_KEY));
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).map(([id, value]) => [id, normaliseSituation(value)]));
  } catch { return {}; }
}

function saveUnitSituations() {
  try {
    localStorage.setItem(UNIT_SITUATIONS_KEY, JSON.stringify(unitSituations));
    modifierStorageNotice = "";
  } catch {
    modifierStorageNotice = "These situations are available for this session only; browser storage is unavailable.";
  }
}

function getUnitModifiedMatchup(a, b, situations = unitSituations) {
  const scenario = pairingSituation(a, b, situations);
  if (!scenario.heightAdvantage && !scenario.outflanker && scenario.firstProbabilityA === .5) return getMatchup(a, b);
  return getMatchup(a, b, scenario);
}

function renderModifiers() {
  const view = createElement("div", "balance-view modifiers-view");
  const impact = modifierImpact(shownUnits, getMatchup, getUnitModifiedMatchup);
  const activeCount = shownUnits.filter(unit => Object.values(normaliseSituation(unitSituations[unit.id])).some(Boolean)).length;
  const heading = balanceSection("Can positioning overcome strength?", "Compare the same stats and opponents with and without your chosen situations. These experiments apply in this view; Balance, Similarity and the generator use neutral combat. Conditions stay fixed throughout each engagement.");
  const controls = createElement("div", "balance-controls");
  const clear = createElement("button", "button button-quiet", "Clear all modifiers");
  clear.type = "button";
  clear.disabled = !activeCount;
  clear.addEventListener("click", () => { unitSituations = {}; saveUnitSituations(); renderModifiers(); });
  controls.append(clear, createElement("span", "balance-description", modifierStorageNotice || `${activeCount} units with situations · ${impact.affected} / ${impact.pairs.length} pairings affected`));
  heading.append(controls);
  const metrics = createElement("div", "balance-metrics");
  metrics.append(
    createHealthMetric("Mean odds shift", `${impact.meanAbsoluteDelta.toFixed(1)} pp`, "Mean absolute win-chance change across all distinct pairings"),
    createHealthMetric("Favourites reversed", `${impact.reversals} / ${impact.pairs.length}`, `${impact.tiesBroken} neutral ties broken · reversals cross from below to above 50%`),
    createHealthMetric("Engagement change", `${formatPercentagePointDelta(impact.meanRoundsDelta, 2)} rounds`, "Mean change across all distinct pairings; negative is faster")
  );
  heading.append(metrics);
  view.append(heading);

  const settings = balanceSection("Apply situations to individual units", `Rows follow your intended card order. Higher and lower give +${modifierRules.height}/−${modifierRules.height} dice; flank advantages give +${modifierRules.outflanking}/−${modifierRules.outflanking}. The opponent receives the opposing modifier automatically. Matching settings cancel, and opposite settings never double the bonus. Earlier activation gives that unit the first strike and Initiative each round; matching priorities remain 50/50.`);
  const table = balanceTable(["Unit", "Height", "Flank", "Activation", "Neutral rank", "With modifiers", "Rank change", "Win chance", "Odds change"]);
  const entries = new Map(impact.entries.map(entry => [entry.unit.id, entry]));
  shownUnits.forEach(unit => {
    const entry = entries.get(unit.id);
    const situation = normaliseSituation(unitSituations[unit.id]);
    const row = createElement("tr");
    const name = createElement("td");
    name.append(createUnitHeading(unit));
    row.append(name);
    [
      ["height", [[-1, "Low"], [0, "Level"], [1, "High"]]],
      ["flank", [[-1, "Outflanked"], [0, "Neutral"], [1, "Outflanking"]]],
      ["order", [[-1, "Late"], [0, "Normal"], [1, "Early"]]]
    ].forEach(([field, options]) => {
      const cell = createElement("td");
      const select = createElement("select");
      select.dataset.modifierUnit = unit.id;
      select.dataset.modifierField = field;
      select.setAttribute("aria-label", `${unit.name}: ${field === "order" ? "activation priority" : field}`);
      options.forEach(([value, label]) => {
        const option = createElement("option", "", label);
        option.value = String(value);
        option.selected = situation[field] === value;
        select.append(option);
      });
      select.addEventListener("change", () => {
        unitSituations[unit.id] = { ...situation, [field]: Number(select.value) };
        saveUnitSituations();
        renderModifiers();
        [...resultStage.querySelectorAll("[data-modifier-field]")].find(control => control.dataset.modifierUnit === unit.id && control.dataset.modifierField === field)?.focus();
      });
      cell.append(select);
      row.append(cell);
    });
    row.append(createElement("td", "", `#${entry.before.rank}`), createElement("td", "score-number", `#${entry.rank}`),
      createElement("td", "", entry.rankDelta ? `${entry.rankDelta > 0 ? "↑" : "↓"}${Math.abs(entry.rankDelta)}` : "—"),
      createElement("td", "", `${entry.before.average.toFixed(1)}% → ${entry.average.toFixed(1)}%`),
      createElement("td", "score-number", `${formatPercentagePointDelta(entry.winDelta, 1)} pp`));
    table.body.append(row);
  });
  settings.append(table.wrapper, createElement("p", "balance-description", "All units are re-ranked together, including the opponents whose odds change. Base stats and your saved stat reference are untouched. A rank can stay the same even when odds change substantially."));
  view.append(settings, renderModifierTests());

  const changed = [...impact.pairs].filter(pair => Math.abs(pair.delta) > 1e-7 || Math.abs(pair.roundsDelta) > 1e-7)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const matchups = balanceSection("Most affected matchups", "First named unit's win chance. Reversed means the favourite changed; breaking a neutral tie is reported separately. Showing up to 12 pairings with the largest odds changes.");
  const detailTable = balanceTable(["Pairing", "Neutral", "Modified", "Change", "Mean rounds", "Outcome"]);
  changed.slice(0, 12).forEach(pair => {
    const row = createElement("tr");
    row.append(createElement("td", "", `${pair.a.name} / ${pair.b.name}`),
      createElement("td", "", `${pair.before.shareA.toFixed(1)}%`), createElement("td", "", `${pair.after.shareA.toFixed(1)}%`),
      createElement("td", "", `${formatPercentagePointDelta(pair.delta, 1)} pp`),
      createElement("td", "", `${formatMetric(pair.before.battleRounds)} → ${formatMetric(pair.after.battleRounds)}`),
      createElement("td", "", pair.reversed ? "Favourite reversed" : pair.tieBroken ? "Tie broken" : "Favourite unchanged"));
    detailTable.body.append(row);
  });
  matchups.append(changed.length ? detailTable.wrapper : createElement("p", "balance-description", "Choose a situation above to see which matchups change."));
  view.append(matchups);
  resultStage.replaceChildren(view);
}

function renderModifierTests() {
  const section = balanceSection("Test each advantage on its own", "Your goal: positioning should be decisive even across large strength gaps. Each test below gives only the selected unit an advantage; every opponent is neutral. These tests are independent of the situations above.");
  if (!shownUnits.some(unit => unit.id === modifierTestUnit)) modifierTestUnit = shownUnits.at(-1).id;
  const target = shownUnits.find(unit => unit.id === modifierTestUnit);
  const controls = createElement("div", "balance-controls");
  const label = createElement("label", "balance-select", "Test unit");
  const select = createElement("select");
  select.dataset.modifierTestUnit = "";
  shownUnits.forEach(unit => {
    const option = createElement("option", "", unit.name);
    option.value = unit.id;
    option.selected = unit.id === modifierTestUnit;
    select.append(option);
  });
  select.addEventListener("change", () => { modifierTestUnit = select.value; renderModifiers(); resultStage.querySelector("[data-modifier-test-unit]").focus(); });
  label.append(select);
  controls.append(label);
  [["Large gap: neutral win chance at most", "underdog", 0, 49], ["Decisive: modified win chance at least", "decisive", 51, 100]].forEach(([text, field, min, max]) => {
    const control = createElement("label", "balance-select", `${text} (%)`);
    const input = createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.value = String(modifierThresholds[field]);
    input.dataset.modifierThreshold = field;
    input.addEventListener("change", () => {
      modifierThresholds[field] = safeNumber(input.value, modifierThresholds[field], min, max);
      renderModifiers();
      resultStage.querySelector(`[data-modifier-threshold="${field}"]`).focus();
    });
    control.append(input);
    controls.append(control);
  });
  section.append(controls);
  const presets = [
    { label: "Higher", situation: { height: 1 }, note: `+${modifierRules.height} dice for this unit, −${modifierRules.height} for its opponent` },
    { label: "Outflanking", situation: { flank: 1 }, note: `+${modifierRules.outflanking} dice for this unit, −${modifierRules.outflanking} for its opponent` },
    { label: "Acts first every round", situation: { order: 1 }, note: `Includes both earlier damage and +${modifierRules.initiative} Initiative dice` },
    { label: "Higher + outflanking", situation: { height: 1, flank: 1 }, note: `Combined positional advantage: +${modifierRules.height + modifierRules.outflanking}/−${modifierRules.height + modifierRules.outflanking} dice, before the final-pool minimum` }
  ];
  const opponents = shownUnits.filter(unit => unit.id !== target.id);
  const underdogs = opponents.filter(opponent => getMatchup(target, opponent).shareA <= modifierThresholds.underdog + 1e-7);
  const runs = presets.map(preset => {
    const situations = { [target.id]: normaliseSituation(preset.situation) };
    const resolve = (a, b) => getUnitModifiedMatchup(a, b, situations);
    const entry = modifierImpact(shownUnits, getMatchup, resolve).entries.find(entry => entry.unit.id === target.id);
    return { ...preset, situations, resolve, entry, successes: underdogs.filter(opponent => resolve(target, opponent).shareA >= modifierThresholds.decisive - 1e-7) };
  });
  const table = balanceTable(["Advantage", "Rank", "Odds change", "Rounds change", "Large gaps overcome", ""]);
  runs.forEach(run => {
    const row = createElement("tr");
    const name = createElement("td", "", run.label);
    name.title = run.note;
    const applyCell = createElement("td");
    const apply = createElement("button", "button button-quiet", "Apply test");
    apply.type = "button";
    apply.title = `Set only ${target.name}'s situation to this test and clear other units' situations`;
    apply.addEventListener("click", () => { unitSituations = run.situations; saveUnitSituations(); renderModifiers(); });
    applyCell.append(apply);
    row.append(name, createElement("td", "", `#${run.entry.before.rank} → #${run.entry.rank}`),
      createElement("td", "", `${formatPercentagePointDelta(run.entry.winDelta, 1)} pp`),
      createElement("td", "", `${formatPercentagePointDelta(run.entry.roundsDelta, 2)}`),
      createElement("td", "score-number", underdogs.length ? `${run.successes.length} / ${underdogs.length}` : "No large gaps"), applyCell);
    table.body.append(row);
  });
  section.append(table.wrapper, createElement("p", "balance-description", `Large gaps overcome counts opponents where ${target.name} improves from ≤${modifierThresholds.underdog}% to ≥${modifierThresholds.decisive}% win chance. These editable thresholds express a design goal, not a rule. Acting first measures timing plus Initiative together. “Apply test” clears other situations.`));
  if (underdogs.length) {
    const pairs = balanceTable([`${target.name} against`, "Neutral", ...runs.map(run => run.label)]);
    underdogs.forEach(opponent => {
      const row = createElement("tr");
      row.append(createElement("td", "", opponent.name), createElement("td", "", `${getMatchup(target, opponent).shareA.toFixed(1)}%`));
      runs.forEach(run => {
        const share = run.resolve(target, opponent).shareA;
        const passed = share >= modifierThresholds.decisive - 1e-7;
        row.append(createElement("td", passed ? "modifier-goal-met" : "", `${share.toFixed(1)}%${passed ? " ✓" : ""}`));
      });
      pairs.body.append(row);
    });
    section.append(pairs.wrapper);
  } else {
    section.append(createElement("p", "balance-description", "This unit has no neutral matchups within your large-gap threshold. Choose a weaker unit or change the threshold to test this goal."));
  }
  return section;
}

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
    pace: safeNumber(unit.pace, 0, 0, 99),
    strike: safeNumber(unit.strike, 1, 1, 99),
    drill: safeNumber(unit.drill, 0, 0, 99),
    speed: safeNumber(unit.speed, 0, 0, 99),
    shooting: Boolean(unit.shooting), // Retained for compatibility; the strike benchmark ignores this legacy flag.
    targetTier: safeNumber(unit.targetTier, 0, 0, 5), // Legacy saved field; intended rank now comes only from card order.
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
  const comparable = unitsToCompare => sanitiseUnits(unitsToCompare).map(({ id, name, pace, strike, drill, speed, shooting, ap, defense, hp, color }) => (
    { id, name, pace, strike, drill, speed, shooting, ap, defense, hp, color }
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
    unit.speed,
    unit.shooting ? 1 : 0,
    unit.targetTier,
    unit.pace
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
    speed: unit[8],
    shooting: unit[9] === 1,
    targetTier: unit[10],
    pace: unit[11]
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
    strike: safeNumber(unit.strike, 5, 1, 99),
    defense: safeNumber(unit.defense, 4, 1, 6)
  };
  const radius = { speed: 2, strike: 3, defense: 1 };
  return {
    tags: "",
    goodAgainst: "",
    weakAgainst: "",
    ap: "locked",
    stats: Object.fromEntries(GENERATOR_STATS.map(stat => [stat.id, {
      min: Math.max(stat.min, current[stat.id] - radius[stat.id]),
      max: Math.min(stat.max, current[stat.id] + radius[stat.id]),
      locked: stat.id === "speed"
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
  return sanitiseUnits(DEFAULT_UNITS);
}

function loadView() {
  const saved = localStorage.getItem(VIEW_KEY);
  return ["balance", "modifiers", "matrix", "similarity", "generator"].includes(saved) ? saved : "balance";
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

function saveMatrixScenario() {
  try {
    localStorage.setItem(MATRIX_SCENARIO_KEY, matrixScenario);
  } catch {
    // The selected situation still works for the current session.
  }
  writeCookieValue(MATRIX_SCENARIO_KEY, matrixScenario);
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

function loadCounterThreshold() {
  const saved = Number(localStorage.getItem(COUNTER_THRESHOLD_KEY));
  return [60, 65, 70, 75, 80].includes(saved) ? saved : 80;
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

function sortEditorByRank(entries) {
  if (!autoRankEnabled) return;
  const ranks = new Map(entries.map(entry => [entry.unit.id, entry.rank]));
  const sorted = [...units].sort((a, b) => ranks.get(a.id) - ranks.get(b.id));
  if (sorted.every((unit, index) => unit.id === units[index].id)) return;
  units = sorted;
  shownUnits = sanitiseUnits(units);
  // Move existing cards so editing state survives a change in rank.
  const focused = document.activeElement;
  const cards = new Map([...unitGrid.children].map(card => [card.dataset.id, card]));
  units.forEach((unit, index) => {
    const card = cards.get(unit.id);
    if (!card) return;
    if (unitGrid.children[index] !== card) unitGrid.insertBefore(card, unitGrid.children[index] || null);
    const handle = card.querySelector('[data-action="drag"]');
    handle.title = `Intended rank #${index + 1}. Drag to change the intended strength order.`;
    handle.setAttribute("aria-label", `${unit.name}: intended rank ${index + 1}. Drag to reorder.`);
  });
  if (focused && unitGrid.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
  saveUnits();
}

function updateCardScores(entries) {
  const byId = new Map(entries.map(entry => [entry.unit.id, entry]));
  for (const card of unitGrid.children) {
    const entry = byId.get(card.dataset.id);
    if (!entry) continue;
    // Map the probability linearly onto the requested 1–100 scale.
    const score = Math.round((1 + .99 * entry.average) * 10) / 10;
    card.querySelector('[data-strength-rank]').textContent = `#${entry.rank}`;
    card.querySelector('[data-strength-score]').textContent = `${score.toFixed(1)} / 100`;
  }
}

function renderEditor() {
  unitGrid.replaceChildren();

  units.forEach((unit, index) => {
    const card = unitCardTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.id = unit.id;
    card.style.setProperty("--unit-color", unit.color);

    const nameInput = card.querySelector('[data-field="name"]');
    const colorInput = card.querySelector('[data-field="color"]');
    const paceInput = card.querySelector('[data-field="pace"]');
    const strikeInput = card.querySelector('[data-field="strike"]');
    const speedInput = card.querySelector('[data-field="speed"]');
    const defenseInput = card.querySelector('[data-field="defense"]');
    const apInput = card.querySelector('[data-field="ap"]');
    const removeButton = card.querySelector('[data-action="remove"]');

    const dragHandle = card.querySelector('[data-action="drag"]');
    dragHandle.title = `Intended rank #${index + 1}. Drag to change the intended strength order.`;
    dragHandle.setAttribute("aria-label", `${unit.name}: intended rank ${index + 1}. Drag to reorder.`);
    nameInput.value = unit.name;
    colorInput.value = unit.color;
    paceInput.value = unit.pace;
    strikeInput.value = unit.strike;
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

function matchupKey(a, b, scenario = COMBAT_SCENARIOS[0]) {
  const unitKey = unit => [
    unit.id,
    unit.strike,
    unit.drill,
    unit.speed,
    unit.shooting ? 1 : 0,
    unit.ap ? 1 : 0,
    unit.defense,
    unit.hp
  ].join(":");
  return `current-v10:${modifierRules.height}:${modifierRules.outflanking}:${modifierRules.initiative}:${scenario.id}:${scenario.heightAdvantage || 0}:${scenario.outflanker || "-"}:${scenario.firstProbabilityA ?? .5}|${unitKey(a)}|${unitKey(b)}`;
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
    initiativePoolA: matchup.initiativePoolB,
    initiativePoolB: matchup.initiativePoolA,
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
    modifierAdjustmentA: matchup.modifierAdjustmentB,
    modifierAdjustmentB: matchup.modifierAdjustmentA,
    heightAdjustmentA: matchup.heightAdjustmentB,
    heightAdjustmentB: matchup.heightAdjustmentA,
    outflankAdjustmentA: matchup.outflankAdjustmentB,
    outflankAdjustmentB: matchup.outflankAdjustmentA,
    evasionAdjustmentA: matchup.evasionAdjustmentB,
    evasionAdjustmentB: matchup.evasionAdjustmentA,
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
    soloTurnsA: matchup.soloTurnsB,
    soloTurnsB: matchup.soloTurnsA,
    winner: reverseShare > 50.000001 ? "a" : reverseShare < 49.999999 ? "b" : "even",
    chargeScenarios: [...matchup.chargeScenarios].reverse().map(reverseScenario)
  };
}

function getMatchup(a, b, scenario = COMBAT_SCENARIOS[0]) {
  const key = matchupKey(a, b, scenario);
  const cached = matchupCache.get(key);
  if (cached) return cached;
  if (scenario.id === "neutral") {
    const reverseKey = matchupKey(b, a, scenario);
    const cachedReverse = matchupCache.get(reverseKey);
    if (cachedReverse) {
      const reversed = reverseCombatMatchup(cachedReverse);
      matchupCache.set(key, reversed);
      return reversed;
    }
  }
  const matchup = resolveRulesMatchup({ ...a, shooting: false }, { ...b, shooting: false }, {
    modifiers: modifierRules,
    heightAdvantage: scenario.heightAdvantage,
    outflanker: scenario.outflanker,
    scenarioId: scenario.id,
    firstProbabilityA: scenario.firstProbabilityA
  });
  matchupCache.set(key, matchup);
  return matchup;
}

function getMatrixMatchup(a, b, scenario = COMBAT_SCENARIOS[0]) {
  return getMatchup(a, b, scenario);
}

function hitTarget(attacker, defender) {
  const target = attackTargetNumber(attacker, defender);
  return attacker.ap ? `${target}+ (AP)` : `${target}+`;
}

function signedModifier(value) {
  if (!value) return "0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}

function matchupStrikeText(unit, effectiveStrike, heightAdjustment, outflankAdjustment, evasionAdjustment) {
  const changes = [];
  if (heightAdjustment) changes.push(`height ${signedModifier(heightAdjustment)}`);
  if (outflankAdjustment) changes.push(`outflanking ${signedModifier(outflankAdjustment)}`);
  if (evasionAdjustment) changes.push(`evasion ${signedModifier(evasionAdjustment)}`);
  if (!changes.length) return `${effectiveStrike} dice`;
  return `${effectiveStrike} dice (base Melee ${unit.strike}, ${changes.join(", ")})`;
}

function matchupInitiativeText() {
  return `Both possible first activations are weighted equally. The first striker attacks a target that has not activated and gains +${modifierRules.initiative} dice; the reply does not. Every natural 6 adds another die against the same target number, and additional 6s repeat the process.`;
}

function matchupTitle(matchup) {
  const openingText = ` Opening outcomes: ${matchup.a.name} first ${Math.round(matchup.chanceAWhenFirst * 100)}%; ${matchup.b.name} first ${Math.round(matchup.chanceAWhenSecond * 100)}% for ${matchup.a.name}.`;
  const attackText = (side, opponent, suffix) => `${side.name}: ${matchupStrikeText(side, matchup[`effectiveStrike${suffix}`], matchup[`heightAdjustment${suffix}`], matchup[`outflankAdjustment${suffix}`], matchup[`evasionAdjustment${suffix}`])}, or ${matchup[`initiativePool${suffix}`]} dice with Initiative, hitting on ${hitTarget(side, opponent)}, ${matchup[`expectedHits${suffix}`].toFixed(2)} expected strain per ordinary attack with Critical Hits and ${formatMetric(matchup[`soloTurns${suffix}`])} unanswered strikes to rout the target (without Initiative). When it wins: ${formatMetric(side.hp - matchup[`victoryHp${suffix}`])} strain.`;
  return `Expected combat duration: ${formatMetric(matchup.battleRounds)} rounds.${openingText} ${attackText(matchup.a, matchup.b, "A")} ${attackText(matchup.b, matchup.a, "B")} ${matchupInitiativeText()}`;
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
      hp.title = `Expected strain when ${victory.unit.name} wins`;
      hp.append(
        createElement("i", "heart-icon", "♥"),
        createElement("b", "", `${formatMetric(victory.unit.hp - victory.hp)} strain`)
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
  const sorted = [...entries].sort((a, b) => b.average - a.average || a.index - b.index);
  return sorted.map((entry, index) => ({
    ...entry,
    rank: sorted.findIndex(other => Math.abs(other.average - entry.average) < 1e-7) + 1 || index + 1
  }));
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

function matrixScenarioById(id) {
  return COMBAT_SCENARIOS.find(scenario => scenario.id === id) || COMBAT_SCENARIOS[0];
}

function matrixScenarioMatchups(rowUnit, opponent) {
  return COMBAT_SCENARIOS.map(scenario => ({
    scenario,
    matchup: getMatrixMatchup(rowUnit, opponent, scenario)
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

function matrixEngagementLength(matrixUnits, scenario = COMBAT_SCENARIOS[0]) {
  const rounds = [];
  matrixUnits.forEach(rowUnit => {
    matrixUnits.forEach(opponent => {
      if (rowUnit.id === opponent.id) return;
      const value = getMatrixMatchup(rowUnit, opponent, scenario).battleRounds;
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
  const situationToolbar = createElement("div", "visual-toolbar matrix-toolbar situation-toolbar");
  const situationControl = createElement("div", "mini-switcher situation-switcher");
  [{ id: "compare", label: "Compare", description: "Show all four situations in every cell" }, ...COMBAT_SCENARIOS]
    .forEach(scenario => {
    const button = createElement("button", matrixScenario === scenario.id ? "active" : "", scenario.label);
    button.type = "button";
    button.setAttribute("aria-pressed", String(matrixScenario === scenario.id));
    button.title = scenario.description;
    button.addEventListener("click", () => {
      if (matrixScenario === scenario.id) return;
      matrixScenario = scenario.id;
      saveMatrixScenario();
      renderMatrix();
    });
    situationControl.append(button);
  });
  situationToolbar.append(
    createElement("span", "visual-toolbar-label", "Situation"),
    situationControl,
    createElement(
      "span",
      "visual-toolbar-note",
      matrixScenario === "compare"
        ? "Row perspective · height and outflanking each apply once"
        : matrixScenarioById(matrixScenario).description
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
  controls.append(situationToolbar, toolbar);

  const comparesPositionScenarios = matrixScenario === "compare";
  const activeScenario = comparesPositionScenarios
    ? COMBAT_SCENARIOS[0]
    : matrixScenarioById(matrixScenario);
  const scenarioResolver = (unit, opponent) => getMatrixMatchup(unit, opponent, activeScenario);
  const currentStrengthEntries = strengthEntries(scenarioResolver);
  const matrixUnits = matrixUnitOrder(currentStrengthEntries);
  const strengths = new Map(currentStrengthEntries.map(entry => [entry.unit.id, entry.average]));
  const currentRanks = new Map(sortedStrengthEntries(currentStrengthEntries)
    .map(entry => [entry.unit.id, entry.rank]));
  const baselineStrengthEntries = activeScenario.id === "neutral"
    ? currentStrengthEntries
    : strengthEntries((unit, opponent) => getMatrixMatchup(unit, opponent, COMBAT_SCENARIOS[0]));
  const baselineRanks = new Map(sortedStrengthEntries(baselineStrengthEntries)
    .map(entry => [entry.unit.id, entry.rank]));
  const rankChanges = matrixUnits.map(unit => ({
    unit,
    movement: baselineRanks.get(unit.id) - currentRanks.get(unit.id)
  })).filter(entry => entry.movement !== 0)
    .sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement));

  const impact = createElement("div", "matrix-impact");
  const length = matrixEngagementLength(matrixUnits, activeScenario);
  const lengthItem = createElement("div", "matrix-impact-item");
  lengthItem.title = `Uniform average across all ${length.count} row/column pairings, excluding mirror matches. The median and range compare each pairing's own expected duration.`;
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
  const rankDetail = activeScenario.id !== "neutral"
    ? rankChanges.length
      ? rankChanges.map(({ unit, movement }) =>
        `${unit.name} ${movement > 0 ? "↑" : "↓"}${Math.abs(movement)}`
      ).join(" · ")
      : `${activeScenario.label} changes matchup scores, but not the rank order.`
    : "Select a positional situation to compare its ranking with Neutral.";
  rankItem.title = rankDetail;
  rankItem.append(
    createElement("span", "matrix-impact-name", "Situation ranking"),
    createElement(
      "strong",
      "",
      activeScenario.id !== "neutral"
        ? rankChanges.length
          ? `${rankChanges.length} moved`
          : "Order unchanged"
        : "Neutral baseline"
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
  grid.classList.toggle("combat", !comparesPositionScenarios);
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
      const neutral = getMatrixMatchup(rowUnit, opponent, COMBAT_SCENARIOS[0]);
      const matchup = getMatrixMatchup(rowUnit, opponent, activeScenario);
      const cell = createElement("div", "matrix-cell");
      cell.dataset.matrixRowId = rowUnit.id;
      if (comparesPositionScenarios) {
        const comparisonGrid = createElement("div", "matrix-cell-comparison");
        matrixScenarioMatchups(rowUnit, opponent).forEach(({ scenario, matchup: scenarioMatchup }) => {
          const scenarioResult = createElement("span", "matrix-scenario-result");
          const delta = scenarioMatchup.shareA - neutral.shareA;
          const flip = outcomeChanged(neutral, scenarioMatchup);
          if (flip) scenarioResult.classList.add("outcome-flip");
          scenarioResult.title = `${scenario.label}: ${Math.round(scenarioMatchup.shareA)}% row win chance${scenario.id !== "neutral" ? ` (${formatPercentagePointDelta(delta)} pp vs Neutral)` : ""}`;
          scenarioResult.append(
            createElement("i", "", scenario.shortLabel),
            createElement("strong", "", `${Math.round(scenarioMatchup.shareA)}%`),
            scenario.id !== "neutral"
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
        if (activeScenario.id !== "neutral") {
          readout.push(createElement(
            "span",
            `matrix-cell-delta${flip ? " winner-flip" : ""}`,
            `${formatPercentagePointDelta(delta)} pp${flip ? " · flip" : ""}`
          ));
        }
        cell.append(...readout);
      }
      const colour = semanticMatrixColour(comparesPositionScenarios ? neutral.shareA : matchup.shareA);
      cell.style.background = colour.background;
      cell.style.color = colour.foreground;
      cell.title = comparesPositionScenarios
        ? matrixScenarioMatchups(rowUnit, opponent)
          .map(({ scenario, matchup: scenarioMatchup }) => `${scenario.label}: ${Math.round(scenarioMatchup.shareA)}% row win chance. ${matchupTitle(scenarioMatchup)}`)
          .join("\n")
        : `${activeScenario.label}: ${Math.round(matchup.shareA)}% row win chance${activeScenario.id !== "neutral" ? ` (${formatPercentagePointDelta(matchup.shareA - neutral.shareA)} percentage points vs Neutral)` : ""}. ${matchupTitle(matchup)}`;
      cell.setAttribute("role", "img");
      cell.setAttribute(
        "aria-label",
        comparesPositionScenarios
          ? `${rowUnit.name} versus ${opponent.name}. ${matrixScenarioMatchups(rowUnit, opponent)
            .map(({ scenario, matchup: scenarioMatchup }) => `${scenario.label}: ${Math.round(scenarioMatchup.shareA)} percent`)
            .join(". ")}`
          : `${activeScenario.label}: ${rowUnit.name} has a ${Math.round(matchup.shareA)} percent chance to beat ${opponent.name}`
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

function matchupPairsForScenario(scenario) {
  const pairs = [];
  for (let first = 0; first < shownUnits.length; first += 1) {
    for (let second = first + 1; second < shownUnits.length; second += 1) {
      pairs.push({
        a: shownUnits[first],
        b: shownUnits[second],
        shareA: getMatchup(shownUnits[first], shownUnits[second], scenario).shareA
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
  const balanceTone = "neutral";
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

  const positionalSensitivity = ruleSensitivity(
    matchupPairsForScenario(COMBAT_SCENARIOS[0]),
    matchupPairsForScenario(COMBAT_SCENARIOS.at(-1))
  );

  const metrics = createElement("div", "health-metrics");
  metrics.append(
    createHealthMetric(
      "Strength spread",
      `${formatMetric(balanceError)} pts`,
      "Strength spread around 50%; unequal strength can be intentional",
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
    createElement("span", "", "Neutral outcomes compared with the row higher + outflanking situation")
  );
  const sensitivityList = createElement("div", "health-sensitivity-list");
  [
    ["Position impact", positionalSensitivity]
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
    modifierRules
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
    createElement("span", "", "Scores estimate the five selected goals. Intended card order is checked in Balance after applying; the generator does not enforce them.")
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
    ["mobilityTaxTarget", "Mobility power tax", "Desired base win-rate decline per Mobility point.", .1, 5, .1, "pp/stat"],
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
  const cardRanks = rankRoster(shownUnits, getMatchup);
  sortEditorByRank(cardRanks);
  updateCardScores(cardRanks);
  const matchupCount = shownUnits.length * (shownUnits.length - 1) / 2;
  const matrixMatchupCount = shownUnits.length * shownUnits.length;
  resultsPanel.classList.toggle("matrix-layout", activeView === "matrix");
  resultsTitle.textContent = activeView === "generator" ? "Balance generator" : activeView === "modifiers" ? "Modifier impact" : "Strike outcomes";
  generatorButton.classList.toggle("active", activeView === "generator");
  resultsMeta.textContent = activeView === "generator"
    ? `${units.length} units · constraints and objectives`
    : activeView === "matrix"
      ? `${shownUnits.length} units · ${matrixMatchupCount} matchups · Initiative + Critical Hits`
      : `${shownUnits.length} units · ${matchupCount} distinct pairings`;
  outcomeKey.hidden = activeView !== "bars";
  resultStage.setAttribute("role", "tabpanel");
  if (activeView === "generator") resultStage.setAttribute("aria-labelledby", "generatorButton");

  viewButtons.forEach(button => {
    const selected = button.dataset.view === activeView;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.id = `view-${button.dataset.view}`;
    button.setAttribute("aria-controls", "resultStage");
    button.tabIndex = selected ? 0 : -1;
    if (selected) resultStage.setAttribute("aria-labelledby", button.id);
  });

  if (activeView === "balance") renderBalance();
  else if (activeView === "modifiers") renderModifiers();
  else if (activeView === "matrix") renderMatrix();
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

autoRankCards.addEventListener("change", () => {
  autoRankEnabled = autoRankCards.checked;
  try { localStorage.setItem(AUTO_RANK_KEY, String(autoRankEnabled)); } catch { /* Keep working for this session. */ }
  updateResults(true);
});

unitGrid.addEventListener("input", event => {
  const target = event.target;
  const field = target.dataset.field;
  const card = target.closest(".unit-card");
  if (!field || !card) return;

  const unit = units.find(item => item.id === card.dataset.id);
  if (!unit) return;

  if (["ap", "shooting"].includes(field)) unit[field] = target.checked;
  else if (["strike", "drill", "speed", "defense"].includes(field)) unit[field] = target.value;
  else unit[field] = target.value;

  if (field === "color") card.style.setProperty("--unit-color", target.value);
  saveUnits();
  updateResults();
});

unitGrid.addEventListener("change", event => {
  if (["ap", "shooting"].includes(event.target.dataset.field)) {
    const card = event.target.closest(".unit-card");
    const unit = units.find(item => item.id === card?.dataset.id);
    if (unit) {
      unit[event.target.dataset.field] = event.target.checked;
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
  delete generatorConfig.units[removedId];
  deleteCookieValue(`${GENERATOR_UNIT_COOKIE_PREFIX}${removedId}`);
  saveUnits();
  saveMatchupOrders();
  saveMatrixCustomOrder();
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
    pace: 0,
    strike: 5,
    drill: 0,
    speed: 0,
    shooting: false,
    targetTier: 0,
    ap: false,
    defense: 4,
    hp: 7,
    color: colour
  });
  saveUnits();
  syncGeneratorConfigToUnits();
  const addedUnitId = units.at(-1).id;
  renderEditor();
  updateResults(true);
  [...unitGrid.children].find(card => card.dataset.id === addedUnitId)?.querySelector('[data-field="name"]')?.select();
});

resetButton.addEventListener("click", () => {
  if (!window.confirm("Restore the four example units?")) return;
  units = sanitiseUnits(DEFAULT_UNITS);
  shownUnits = cloneUnits(units);
  matchupOrders = {};
  matrixCustomOrder = DEFAULT_UNITS.map(unit => unit.id);
  matchupCache.clear();
  saveUnits();
  saveMatchupOrders();
  saveMatrixCustomOrder();
  syncGeneratorConfigToUnits();
  renderEditor();
  renderResults();
  setUpdating(false);
});

viewButtons.forEach((button, index) => {
  button.addEventListener("keydown", event => {
    const next = event.key === "ArrowRight" ? (index + 1) % viewButtons.length
      : event.key === "ArrowLeft" ? (index - 1 + viewButtons.length) % viewButtons.length
        : event.key === "Home" ? 0 : event.key === "End" ? viewButtons.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    viewButtons[next].focus();
    viewButtons[next].click();
  });
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

makeSortable(unitGrid, ".unit-card", "id");
makeSortable(resultStage, ".matchup-card", "unitId");
enableMatchupRowSorting();

renderModifierRules();
renderEditor();
renderResults();
renderUnitSets();
setUpdating(false);
if (unitLoadNeedsPersist) saveUnits();
if (unitSetsNeedPersist) saveUnitSets();
window.addEventListener("beforeunload", saveUnits);
