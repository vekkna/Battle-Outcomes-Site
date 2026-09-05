# Matchup Board

A local strike-balancing workbench for *Seize the Day*. `Rules.docx` is the
rules source. Open the site through a local HTTP server, for example:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then visit http://127.0.0.1:8000. Rosters, named sets, intended card order and the
comparison reference are saved in your browser. The site has no server database.

## Balancing workflow

1. Drag the stat cards into intended strength order: strongest first, reading
   left to right then top to bottom. Open **Balance** and save the stats as a reference.
2. Edit Melee, Defence or AP. Compare average win chance and rank movement
   against that reference. Earlier cards should have higher average win chances;
   a roster-wide target of 50% for every unit is not assumed.
3. Inspect an engagement's mean, median, 90th percentile and round-by-round
   ending probabilities. Try either unit always activating first, and different
   positional situations, to see how robust the result is.
4. Review the closest role profiles. Raw RMS difference includes strength;
   centred RMS difference removes the mean gap over the same common opponents.
   Two units with a large raw gap and a tiny centred gap can be stronger/weaker
   versions of essentially the same combat role.
5. Use Matrix for the full matchup grid and Similarity for a spatial overview.
   The latter is an approximation with rescaled axes, so use the numeric pair
   table to judge whether profiles became more or less similar after an edit.

## Rules and assumptions

Implemented strike rules (the defaults from `Rules.docx`):

- Start with Melee dice; higher/lower applies +1/−1, outflanking applies +2/−2.
- Initiative adds one die when striking an enemy without a command marker.
- Apply **all** modifiers before clamping the final pool to at least one die.
- Hit on Defence or higher; AP uses the lower of Defence and 3.
- Every natural 6 generates another attack die, which can itself generate more.
- Rout immediately upon reaching seven strain, preventing a reply.

The engine solves exact probabilities for a specified pairwise strike policy,
including arbitrarily many misses and exploding critical dice. Baseline units
start unstrained, in contact on level ground, without outflanking. Both attempt
one strike per round, with independently equal chances of being first each
round. The inspector can instead fix which unit acts first. That choice also
applies in the opening round. Positional modifiers remain fixed.

This is **not a simulation of Master Tactician bidding or entire battles**.
Command scarcity, rallying, disengaging, allies, terrain movement, shooting,
evasion, leaders and camps are not simulated. Mobility remains editable for
roster design and the optional generator tax; it never directly changes strike
outcomes. Old Drill and shooting values are retained in saved data for
compatibility but do not participate in the strike model.

Rankings weight every other unit equally and exclude mirror matches. Equal
scores share a rank. Reference deltas are disabled when roster membership
changes, so results are not compared against a different opponent cohort.
Duration summary means also exclude mirrors; the matrix still displays mirror
cells for inspection. Histogram probability beyond round 12 is kept explicitly
in the 13+ tail. Its median and 90th percentile are probabilities over engagement
outcomes, not medians or percentiles of different pairings' means.

Role comparisons require four units so each pair has at least two common
opponents. A default 5 percentage-point threshold flags similar roles; it is an
adjustable design heuristic, not a game rule. Opposing counters are common
opponents where one unit wins at least 60% and the other at most 40%.

The generator uses fast approximations to search for candidates. Its centred
profiles use the same common-opponent definition as the exact views, but its
scores and duration estimates are not exact probabilities. It does not enforce
the intended card order; check those in Balance after applying a candidate.

## Adjustable modifier values

The **Modifier values** controls below the unit cards set Height (±),
Outflanking (±), and Initiative (+), using integer dice values from 0 to 99.
Defaults are 1, 2, and 1 respectively. For example, set Outflanking to 1 to test
+1 for the flanker and −1 for the outflanked unit. Zero disables a modifier's
dice effect. Initiative zero does not remove the timing advantage of acting
first. **Restore rule defaults** resets only these three values.

Values persist in browser storage and apply across the site: Balance, Matrix,
Similarity, the duration inspector, modifier experiments, and the generator.
Neutral combat still has no height or flank advantage, but uses the selected
Initiative value. The generator's neutral estimates also use that Initiative
value; its separate +1 attack-die objective continues to test one extra Melee die.
Changing values invalidates cached matchups and generated candidates. Saved stat
sets and the stat reference are preserved; both sides of a stat-reference
comparison are recalculated under the currently selected rules. `Rules.docx`
itself is unchanged.

## Testing modifier significance

Open **Modifiers** to assign each unit a relative height, flank situation and
activation priority. Comparisons hold stats and opponents fixed. The table
shows neutral and modified ranks and average win chances, and the summary
reports mean absolute odds changes, favourite reversals and duration changes.
Every affected opponent is re-ranked too. Mean absolute change is used because
the roster-wide signed average is always zero for complementary pairwise wins.

Situations are relative and apply once per pairing. The numbers below describe
the defaults; custom values replace those magnitudes everywhere:

- High beats Level or Low for height, giving +1/−1; High versus Low never
  becomes +2/−2. Equal heights are neutral.
- Outflanking beats Neutral or Outflanked for the flank comparison, giving
  +2/−2; selecting complementary settings on both units never doubles it.
  Matching flank settings give zero net modifier.
- Early precedes Normal or Late, and Normal precedes Late, every round.
  Matching priorities use the usual independent 50/50 order. This measures
  earlier attacks **and** Initiative, not the Initiative die in isolation.

These are fixed pairwise situations, not a geometric battlefield simulation.
Situations persist separately in browser storage, associated with unit IDs;
loading a stat set keeps situations for matching IDs. **Clear all modifiers**
returns to neutral. Balance, Similarity and the generator remain neutral;
Matrix retains its separately selected row-position scenario.

For the design goal of decisive positioning across large strength gaps, use
**Test each advantage on its own**. Start with an intended weak unit. The initial
criteria are a neutral win chance of at most 30%, improved to at least 60% after
a positional advantage; both thresholds are editable. The table counts which
large gaps each advantage overcomes and shows the actual pairwise win chances.
These independent tests ignore the custom situations above; **Apply test**
replaces those situations with only the selected test. Threshold choices last
for the current session.

Use this success criterion and individual odds changes as the main evidence.
Rank movement is supporting information: it depends on the roster's other units
and can remain unchanged despite a large change in win probability. Test height,
outflanking and acting first individually before combining advantages. The
conditions remain in place throughout combat, so the results describe what the
advantage can achieve when maintained, not how often players can obtain it.

## Validation

```sh
npm ci
npm test
npm run lint
```

Tests cover AP, critical chains, positional modifiers, the final-pool minimum,
activation-policy symmetry, exact duration/tail probabilities, shared ranks,
reference cohorts, role differences and intended-order conflicts. The exact
engine is also checked against an independently implemented, seeded 30,000-fight
dice simulation. No runtime packages are required by the site.
