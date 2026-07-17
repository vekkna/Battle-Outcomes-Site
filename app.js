const STORAGE_KEY = "matchup-board-units-v1";
const VIEW_KEY = "matchup-board-view-v1";
const MAX_UNITS = 6;
const MIN_UNITS = 2;
const PALETTE = ["#c95f4b", "#597fb3", "#d49a38", "#64865a", "#8b68a5", "#3e9a96"];

const DEFAULT_UNITS = [
  { id: "heavy-infantry", name: "Heavy Infantry", strike: 6, ap: false, defense: 7, hp: 7, color: "#c95f4b" },
  { id: "spearmen", name: "Spearmen", strike: 5, ap: true, defense: 5, hp: 7, color: "#597fb3" },
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
    strike: safeNumber(unit.strike, 1, 0, 99),
    ap: Boolean(unit.ap),
    defense: safeNumber(unit.defense, 0, 0, 99),
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
  saveState.lastChild.textContent = value ? "Changes ready" : "Saved locally";
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

function damagePerStrike(attacker, defender) {
  const blocked = attacker.ap ? 0 : defender.defense;
  return Math.max(1, attacker.strike - blocked);
}

function getMatchup(a, b) {
  const damageA = damagePerStrike(a, b);
  const damageB = damagePerStrike(b, a);
  const turnsA = Math.ceil(b.hp / damageA);
  const turnsB = Math.ceil(a.hp / damageB);

  if (turnsA === turnsB) {
    return {
      a,
      b,
      damageA,
      damageB,
      turnsA,
      turnsB,
      shareA: 50,
      winner: "initiative",
      survivorFraction: 0
    };
  }

  if (turnsA < turnsB) {
    const hpWhenFirst = a.hp - Math.max(0, turnsA - 1) * damageB;
    const hpWhenSecond = a.hp - turnsA * damageB;
    const survivorFraction = Math.max(0, (hpWhenFirst + hpWhenSecond) / 2 / a.hp);
    return {
      a,
      b,
      damageA,
      damageB,
      turnsA,
      turnsB,
      shareA: 50 + survivorFraction * 50,
      winner: "a",
      survivorFraction
    };
  }

  const hpWhenFirst = b.hp - Math.max(0, turnsB - 1) * damageA;
  const hpWhenSecond = b.hp - turnsB * damageA;
  const survivorFraction = Math.max(0, (hpWhenFirst + hpWhenSecond) / 2 / b.hp);
  return {
    a,
    b,
    damageA,
    damageB,
    turnsA,
    turnsB,
    shareA: 50 - survivorFraction * 50,
    winner: "b",
    survivorFraction
  };
}

function matchupTitle(matchup) {
  const initiative = matchup.winner === "initiative"
    ? " Same turns-to-kill: whichever unit strikes first wins."
    : "";
  return `${matchup.a.name}: ${matchup.damageA} damage, ${matchup.turnsA} strike${matchup.turnsA === 1 ? "" : "s"} to kill. ${matchup.b.name}: ${matchup.damageB} damage, ${matchup.turnsB} strike${matchup.turnsB === 1 ? "" : "s"} to kill.${initiative}`;
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
  if (matchup.winner === "initiative") return "1st strike";
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
      const cell = createElement("div", "matrix-cell", matchup.winner === "initiative" ? "1st" : `${Math.round(matchup.shareA)}%`);
      const winnerColour = matchup.shareA >= 50 ? rowUnit.color : opponent.color;
      const intensity = .16 + Math.abs(matchup.shareA - 50) / 50 * .58;
      cell.style.background = matchup.winner === "initiative"
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
    createElement("span", "", "50 · initiative"),
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
