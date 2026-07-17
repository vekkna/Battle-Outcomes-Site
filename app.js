const STORAGE_KEY = "matchup-board-units-v1";
const VIEW_KEY = "matchup-board-view-v1";
const MATCHUP_ORDER_KEY = "matchup-board-matchup-orders-v1";
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
const unitCardTemplate = document.querySelector("#unitCardTemplate");
const viewButtons = [...document.querySelectorAll(".view-button")];

let units = loadUnits();
let shownUnits = cloneUnits(units);
let activeView = loadView();
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
  return ["bars", "matrix", "profile"].includes(saved) ? saved : "bars";
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

function binomialDistribution(dice, chance) {
  const distribution = new Float64Array(dice + 1);

  if (chance === 1) {
    distribution[dice] = 1;
    return distribution;
  }

  const missChance = 1 - chance;
  distribution[0] = missChance ** dice;
  for (let hits = 1; hits <= dice; hits += 1) {
    distribution[hits] = distribution[hits - 1]
      * ((dice - hits + 1) / hits)
      * (chance / missChance);
  }
  return distribution;
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
  const hitsA = binomialDistribution(a.strike, chanceA);
  const hitsB = binomialDistribution(b.strike, chanceB);
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

  for (let hpA = 1; hpA <= a.hp; hpA += 1) {
    for (let hpB = 1; hpB <= b.hp; hpB += 1) {
      let aPositiveResult = 0;
      let aTurnsAfterAHit = 0;
      let aHpAfterAHit = 0;
      let bTurnsAfterAHit = 0;
      let bHpAfterAHit = 0;
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
        }
      }

      let bPositiveResult = 0;
      let aTurnsAfterBHit = 0;
      let aHpAfterBHit = 0;
      let bTurnsAfterBHit = 0;
      let bHpAfterBHit = 0;
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
    }
  }

  const chanceAWhenFirst = aFirst[a.hp][b.hp];
  const chanceAWhenSecond = bFirst[a.hp][b.hp];
  const chanceAOverall = Math.min(1, Math.max(0, (chanceAWhenFirst + chanceAWhenSecond) / 2));
  const chanceBOverall = 1 - chanceAOverall;
  const shareA = chanceAOverall * 100;
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
    expectedHitsA: a.strike * chanceA,
    expectedHitsB: b.strike * chanceB,
    chanceAWhenFirst,
    chanceAWhenSecond,
    shareA,
    victoryTurnsA,
    victoryTurnsB,
    victoryHpA,
    victoryHpB,
    winner: shareA > 50.000001 ? "a" : shareA < 49.999999 ? "b" : "even"
  };

  const reverse = {
    a: b,
    b: a,
    hitChanceA: chanceB,
    hitChanceB: chanceA,
    expectedHitsA: b.strike * chanceB,
    expectedHitsB: a.strike * chanceA,
    chanceAWhenFirst: 1 - chanceAWhenSecond,
    chanceAWhenSecond: 1 - chanceAWhenFirst,
    shareA: 100 - shareA,
    victoryTurnsA: victoryTurnsB,
    victoryTurnsB: victoryTurnsA,
    victoryHpA: victoryHpB,
    victoryHpB: victoryHpA,
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
  return `${matchup.a.name}: ${matchup.a.strike} dice hitting on ${hitTarget(matchup.a, matchup.b)}, ${matchup.expectedHitsA.toFixed(2)} expected hits per strike. When it wins: ${formatMetric(matchup.victoryTurnsA)} attack turns and ${formatMetric(matchup.victoryHpA)} HP remaining. ${matchup.b.name}: ${matchup.b.strike} dice hitting on ${hitTarget(matchup.b, matchup.a)}, ${matchup.expectedHitsB.toFixed(2)} expected hits per strike. When it wins: ${formatMetric(matchup.victoryTurnsB)} attack turns and ${formatMetric(matchup.victoryHpB)} HP remaining. All values average both possible starting orders.`;
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
    turns: useA ? matchup.victoryTurnsA : matchup.victoryTurnsB,
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
      turns.title = `Expected attack turns for ${victory.unit.name} to win`;
      turns.append(
        createElement("i", "turn-icon", "◷"),
        createElement("b", "", `${formatMetric(victory.turns)} turns`)
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

function renderMatrix() {
  const view = createElement("div", "matrix-view");
  const grid = createElement("div", "matrix-grid");
  grid.style.setProperty("--unit-total", shownUnits.length);
  grid.append(createElement("div", "matrix-corner", "Row unit's result"));

  shownUnits.forEach(unit => {
    const column = createElement("div", "matrix-column", unit.name);
    column.title = unit.name;
    grid.append(column);
  });

  shownUnits.forEach(rowUnit => {
    const rowHead = createElement("div", "matrix-row");
    rowHead.append(...createUnitHeading(rowUnit).childNodes);
    grid.append(rowHead);

    shownUnits.forEach(opponent => {
      if (rowUnit.id === opponent.id) {
        grid.append(createElement("div", "matrix-cell diagonal", "—"));
        return;
      }

      const matchup = getMatchup(rowUnit, opponent);
      const cell = createElement("div", "matrix-cell", `${Math.round(matchup.shareA)}%`);
      const winnerColour = matchup.shareA >= 50 ? rowUnit.color : opponent.color;
      const intensity = .16 + Math.abs(matchup.shareA - 50) / 50 * .58;
      cell.style.background = matchup.winner === "even"
        ? "#e7e6df"
        : mixColours("#f2f1eb", winnerColour, intensity);
      cell.style.setProperty("--row-color", rowUnit.color);
      cell.style.setProperty("--opponent-color", opponent.color);
      cell.style.setProperty("--share", `${matchup.shareA}%`);
      cell.title = matchupTitle(matchup);
      grid.append(cell);
    });
  });

  const legend = createElement("div", "matrix-legend");
  legend.append(
    createElement("span", "", "Opponent favoured"),
    createElement("span", "legend-gradient"),
    createElement("span", "", "Row unit favoured")
  );
  view.append(grid, legend);
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

  viewButtons.forEach(button => {
    const selected = button.dataset.view === activeView;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });

  if (activeView === "matrix") renderMatrix();
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
