const STORAGE_KEY = "matchup-board-units-v1";
const VIEW_KEY = "matchup-board-view-v1";
const MAX_UNITS = 6;
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
const showButton = document.querySelector("#showButton");
const resetButton = document.querySelector("#resetButton");
const saveState = document.querySelector("#saveState");
const resultStage = document.querySelector("#resultStage");
const resultsMeta = document.querySelector("#resultsMeta");
const unitCardTemplate = document.querySelector("#unitCardTemplate");
const viewButtons = [...document.querySelectorAll(".view-button")];

let units = loadUnits();
let shownUnits = cloneUnits(units);
let activeView = loadView();
let isDirty = false;
let matchupCache = new Map();

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

function setDirty(value) {
  isDirty = value;
  showButton.classList.toggle("pending", value);
  saveState.classList.toggle("pending", value);
  saveState.lastChild.textContent = value ? "Saved · click Show" : "Saved locally";
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
  const aFirst = Array.from({ length: a.hp + 1 }, () => new Float64Array(b.hp + 1));
  const bFirst = Array.from({ length: a.hp + 1 }, () => new Float64Array(b.hp + 1));

  for (let hpA = 1; hpA <= a.hp; hpA += 1) {
    for (let hpB = 1; hpB <= b.hp; hpB += 1) {
      let aPositiveResult = 0;
      for (let hits = 1; hits < hitsA.length; hits += 1) {
        if (hits >= hpB) aPositiveResult += hitsA[hits];
        else aPositiveResult += hitsA[hits] * bFirst[hpA][hpB - hits];
      }

      let bPositiveResult = 0;
      for (let hits = 1; hits < hitsB.length && hits < hpA; hits += 1) {
        bPositiveResult += hitsB[hits] * aFirst[hpA - hits][hpB];
      }

      const denominator = 1 - hitsA[0] * hitsB[0];
      aFirst[hpA][hpB] = (aPositiveResult + hitsA[0] * bPositiveResult) / denominator;
      bFirst[hpA][hpB] = bPositiveResult + hitsB[0] * aFirst[hpA][hpB];
    }
  }

  const chanceAWhenFirst = aFirst[a.hp][b.hp];
  const chanceAWhenSecond = bFirst[a.hp][b.hp];
  const shareA = (chanceAWhenFirst + chanceAWhenSecond) * 50;
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
  return `${matchup.a.name}: ${matchup.a.strike} dice hitting on ${hitTarget(matchup.a, matchup.b)}, ${matchup.expectedHitsA.toFixed(2)} expected hits per strike. ${matchup.b.name}: ${matchup.b.strike} dice hitting on ${hitTarget(matchup.b, matchup.a)}, ${matchup.expectedHitsB.toFixed(2)} expected hits per strike. Win chance averages both possible starting orders.`;
}

function comparisonsFor(unit) {
  return shownUnits
    .filter(opponent => opponent.id !== unit.id)
    .map(opponent => getMatchup(unit, opponent));
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

function renderBars() {
  const groups = createElement("div", "matchup-groups");
  groups.dataset.count = String(shownUnits.length);

  shownUnits.forEach(unit => {
    const comparisons = comparisonsFor(unit);
    const card = createElement("article", "matchup-card");
    const head = createElement("div", "matchup-card-head");
    const average = createElement("span", "average-badge", `AVG ${Math.round(averageShare(comparisons))}`);
    head.append(createUnitHeading(unit), average);

    const list = createElement("div", "matchup-list");
    list.style.setProperty("--rows", comparisons.length);

    comparisons.forEach(matchup => {
      const row = createElement("div", "matchup-row");
      const labels = createElement("div", "matchup-labels");
      labels.append(
        createElement("span", "", `vs ${matchup.b.name}`),
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
      row.append(labels, bar);
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
  setDirty(true);
});

unitGrid.addEventListener("change", event => {
  if (event.target.dataset.field === "ap") {
    const card = event.target.closest(".unit-card");
    const unit = units.find(item => item.id === card?.dataset.id);
    if (unit) {
      unit.ap = event.target.checked;
      saveUnits();
      setDirty(true);
    }
  }
});

unitGrid.addEventListener("click", event => {
  const removeButton = event.target.closest('[data-action="remove"]');
  if (!removeButton || units.length <= MIN_UNITS) return;
  const card = removeButton.closest(".unit-card");
  units = units.filter(unit => unit.id !== card.dataset.id);
  saveUnits();
  renderEditor();
  setDirty(true);
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
  setDirty(true);
  unitGrid.lastElementChild?.querySelector('[data-field="name"]')?.select();
});

showButton.addEventListener("click", () => {
  units = sanitiseUnits(units);
  shownUnits = cloneUnits(units);
  matchupCache.clear();
  saveUnits();
  renderEditor();
  renderResults();
  setDirty(false);
  showButton.classList.remove("pulse");
  void showButton.offsetWidth;
  showButton.classList.add("pulse");
});

resetButton.addEventListener("click", () => {
  if (!window.confirm("Restore the four example units?")) return;
  units = cloneUnits(DEFAULT_UNITS);
  shownUnits = cloneUnits(DEFAULT_UNITS);
  matchupCache.clear();
  saveUnits();
  renderEditor();
  renderResults();
  setDirty(false);
});

viewButtons.forEach(button => {
  button.addEventListener("click", () => {
    activeView = button.dataset.view;
    localStorage.setItem(VIEW_KEY, activeView);
    renderResults();
  });
});

renderEditor();
renderResults();
setDirty(false);
saveUnits();
window.addEventListener("beforeunload", saveUnits);
