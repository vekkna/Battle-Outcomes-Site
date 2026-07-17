const STORAGE_KEY = "matchup-board-units-v1";
const VIEW_KEY = "matchup-board-view-v2";
const MATCHUP_ORDER_KEY = "matchup-board-matchup-orders-v1";
const MATRIX_SORT_KEY = "matchup-board-matrix-sort-v1";
const COUNTER_THRESHOLD_KEY = "matchup-board-counter-threshold-v1";
const MAX_UNITS = 16;
const MIN_UNITS = 2;
const PALETTE = ["#c95f4b", "#597fb3", "#d49a38", "#64865a", "#8b68a5", "#3e9a96"];

const DEFAULT_UNITS = [
  { id: "heavy-infantry", name: "Heavy Infantry", strike: 6, ap: false, defense: 5, hp: 7, color: "#c95f4b" },
  { id: "spearmen", name: "Spearmen", strike: 5, ap: false, defense: 5, hp: 7, color: "#597fb3" },
  { id: "skirmishers", name: "Skirmishers", strike: 4, ap: false, defense: 3, hp: 7, color: "#d49a38" },
  { id: "cavalry", name: "Cavalry", strike: 7, ap: false, defense: 4, hp: 7, color: "#64865a" }
];

const unitGrid = document.querySelector("#unitGrid");
const unitCount = document.querySelector("#unitCount");
const addUnitButton = document.querySelector("#addUnitButton");
const resetButton = document.querySelector("#resetButton");
const saveState = document.querySelector("#saveState");
const resultStage = document.querySelector("#resultStage");
const resultsMeta = document.querySelector("#resultsMeta");
const outcomeKey = document.querySelector(".outcome-key");
const unitCardTemplate = document.querySelector("#unitCardTemplate");
const viewButtons = [...document.querySelectorAll(".view-button")];

let units = loadUnits();
let shownUnits = cloneUnits(units);
let activeView = loadView();
let matrixSort = loadMatrixSort();
let counterThreshold = loadCounterThreshold();
let matchupCache = new Map();
let updateTimer = null;
let draggedUnitId = null;
let draggedMatchup = null;
let matchupOrders = loadMatchupOrders();

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
    ap: Boolean(unit.ap),
    defense: safeNumber(unit.defense, 4, 1, 6),
    hp: safeNumber(unit.hp, 7, 1, 99),
    color: /^#[0-9a-f]{6}$/i.test(unit.color) ? unit.color : PALETTE[index % PALETTE.length]
  }));
}

function loadUnits() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length >= MIN_UNITS) return sanitiseUnits(saved);
  } catch (_) {
    // Use the examples when stored data is unavailable or malformed.
  }
  return cloneUnits(DEFAULT_UNITS);
}

function loadView() {
  const saved = localStorage.getItem(VIEW_KEY);
  return ["bars", "matrix", "counters", "profile"].includes(saved) ? saved : "matrix";
}

function loadMatrixSort() {
  const saved = localStorage.getItem(MATRIX_SORT_KEY);
  return ["roster", "strength", "similar"].includes(saved) ? saved : "roster";
}

function loadCounterThreshold() {
  const saved = Number(localStorage.getItem(COUNTER_THRESHOLD_KEY));
  return [60, 65, 70, 75, 80].includes(saved) ? saved : 80;
}

function saveUnits() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(units));
  } catch (_) {
    // The app remains fully usable when local storage is blocked.
  }
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
    const defenseInput = card.querySelector('[data-field="defense"]');
    const hpInput = card.querySelector('[data-field="hp"]');
    const apInput = card.querySelector('[data-field="ap"]');
    const removeButton = card.querySelector('[data-action="remove"]');

    nameInput.value = unit.name;
    colorInput.value = unit.color;
    strikeInput.value = unit.strike;
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

function matchupKey(a, b) {
  const unitKey = unit => [unit.id, unit.strike, unit.ap ? 1 : 0, unit.defense, unit.hp].join(":");
  return `${unitKey(a)}|${unitKey(b)}`;
}

function getMatchup(a, b) {
  const key = matchupKey(a, b);
  const cached = matchupCache.get(key);
  if (cached) return cached;

  const chanceA = hitChance(a, b);
  const chanceB = hitChance(b, a);
  const hitsA = explodingHitDistribution(a.strike, chanceA, b.hp);
  const hitsB = explodingHitDistribution(b.strike, chanceB, a.hp);
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
  const chanceAOverall = Math.min(1, Math.max(0, (chanceAWhenFirst + chanceAWhenSecond) / 2));
  const chanceBOverall = 1 - chanceAOverall;
  const shareA = chanceAOverall * 100;
  const battleTurns = (battleTurnsFromA[a.hp][b.hp] + battleTurnsFromB[a.hp][b.hp]) / 2;
  const battleRounds = (aActivationsFromA[a.hp][b.hp] + bActivationsFromB[a.hp][b.hp]) / 2;
  const soloTurnsA = expectedAttackTurnsToKill(hitsA, b.hp);
  const soloTurnsB = expectedAttackTurnsToKill(hitsB, a.hp);
  const weightedTurnsA = (
    aVictoryTurnsFromA[a.hp][b.hp] + aVictoryTurnsFromB[a.hp][b.hp]
  ) / 2;
  const weightedHpA = (
    aVictoryHpFromA[a.hp][b.hp] + aVictoryHpFromB[a.hp][b.hp]
  ) / 2;
  const weightedTurnsB = (
    bVictoryTurnsFromA[a.hp][b.hp] + bVictoryTurnsFromB[a.hp][b.hp]
  ) / 2;
  const weightedHpB = (
    bVictoryHpFromA[a.hp][b.hp] + bVictoryHpFromB[a.hp][b.hp]
  ) / 2;
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
    hitChanceA: chanceA,
    hitChanceB: chanceB,
    expectedHitsA: a.strike * chanceA / (1 - 1 / 6),
    expectedHitsB: b.strike * chanceB / (1 - 1 / 6),
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
    hitChanceA: chanceB,
    hitChanceB: chanceA,
    expectedHitsA: b.strike * chanceB / (1 - 1 / 6),
    expectedHitsB: a.strike * chanceA / (1 - 1 / 6),
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

function matchupTitle(matchup) {
  return `Expected combat duration: ${formatMetric(matchup.battleRounds)} rounds. ${matchup.a.name}: ${matchup.a.strike} dice hitting on ${hitTarget(matchup.a, matchup.b)}, ${matchup.expectedHitsA.toFixed(2)} expected hits per attack with exploding 6s and ${formatMetric(matchup.soloTurnsA)} uninterrupted rounds to kill. When it wins: ${formatMetric(matchup.victoryHpA)} HP remaining. ${matchup.b.name}: ${matchup.b.strike} dice hitting on ${hitTarget(matchup.b, matchup.a)}, ${matchup.expectedHitsB.toFixed(2)} expected hits per attack with exploding 6s and ${formatMetric(matchup.soloTurnsB)} uninterrupted rounds to kill. When it wins: ${formatMetric(matchup.victoryHpB)} HP remaining. Battle values average both possible attack orders.`;
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

function matrixUnitOrder() {
  if (matrixSort === "roster" || shownUnits.length < 3) return [...shownUnits];
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
    const common = shownUnits.filter(unit => unit.id !== a.id && unit.id !== b.id);
    if (!common.length) return 0;
    const sum = common.reduce((total, opponent) => {
      const difference = (getMatchup(a, opponent).shareA - getMatchup(b, opponent).shareA) / 50;
      return total + difference * difference;
    }, 0);
    const value = Math.sqrt(sum / common.length);
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

function renderMatrix() {
  const view = createElement("div", "matrix-view");
  const toolbar = createElement("div", "visual-toolbar matrix-toolbar");
  const sortControl = createElement("div", "mini-switcher");
  [
    ["roster", "Roster"],
    ["strength", "Strength"],
    ["similar", "Similar matchups"]
  ].forEach(([value, label]) => {
    const button = createElement("button", matrixSort === value ? "active" : "", label);
    button.type = "button";
    button.title = value === "strength"
      ? "Order by average win chance against the current roster"
      : value === "similar"
        ? "Place units with similar matchup patterns together"
        : "Use your manually arranged roster order";
    button.addEventListener("click", () => {
      matrixSort = value;
      localStorage.setItem(MATRIX_SORT_KEY, matrixSort);
      renderMatrix();
    });
    sortControl.append(button);
  });
  toolbar.append(
    createElement("span", "visual-toolbar-label", "Order"),
    sortControl,
    createElement("span", "visual-toolbar-note", "Cell: row win chance · expected rounds")
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
    rowHead.append(
      createUnitHeading(rowUnit),
      createElement("span", "matrix-row-score", `${Math.round(strengths.get(rowUnit.id))}`)
    );
    grid.append(rowHead);

    matrixUnits.forEach(opponent => {
      if (rowUnit.id === opponent.id) {
        grid.append(createElement("div", "matrix-cell diagonal", "—"));
        return;
      }

      const matchup = getMatchup(rowUnit, opponent);
      const cell = createElement("div", "matrix-cell");
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
}

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(tag, attributes = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
  if (text !== undefined) node.textContent = text;
  return node;
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
  else if (activeView === "counters") renderCounters();
  else if (activeView === "profile") renderProfile();
  else renderBars();
}

unitGrid.addEventListener("input", event => {
  const target = event.target;
  const field = target.dataset.field;
  const card = target.closest(".unit-card");
  if (!field || !card) return;

  const unit = units.find(item => item.id === card.dataset.id);
  if (!unit) return;

  if (field === "ap") unit.ap = target.checked;
  else if (["strike", "defense", "hp"].includes(field)) unit[field] = target.value;
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
  saveUnits();
  saveMatchupOrders();
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
  matchupCache.clear();
  saveUnits();
  saveMatchupOrders();
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
setUpdating(false);
saveUnits();
window.addEventListener("beforeunload", saveUnits);
