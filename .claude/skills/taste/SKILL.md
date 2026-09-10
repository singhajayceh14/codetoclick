---
name: taste
description: Judgment for what belongs in this product — naming a figure, adding a metric or chart, writing empty states and insight copy, deciding whether a feature earns its place. Read before adding anything to a screen, or when choosing how to present a number.
---

# Taste in Code to Click

This is a monthly profitability tool used by two people to decide things about a
real services business. It is not a dashboard showcase. Every judgment below
follows from that.

## The vocabulary is fixed

`CLAUDE.md` §1 defines the column names. They are not suggestions and they are
not yours to improve:

> Revenue · Employee cost · **Contribution after people** · **People margin** ·
> Other cost · **Profit** · **Margin**

"Gross profit", "net margin", "burn", "run rate" and "EBITDA" are different
words for things this system either does not compute or already names. Renaming
a column is a bug, not a polish. If a figure genuinely has no name here, that is
a conversation to have before shipping it, not a gap to fill with a synonym.

## Every figure traces to the rollup chain

    employee annual CTC -> monthly cost -> allocation % -> project employee cost
      -> + other cost (booked + licence share) -> project profit / margin
      -> client -> company

A number that cannot be walked back along that chain does not belong on a
screen. Two specific temptations to refuse:

- **Do not invent a metric** because it would look good in the empty space.
  Utilisation, velocity, "health scores" — if it is not derived from the chain,
  it is decoration wearing a number's clothes. (`baseRev` and `health` are
  demo-era fields that round-trip as `0` / `0.5` and mean nothing. They are on
  the removal list, not the extend list.)
- **Do not average a margin.** Margins are ratios; a mean of ratios is not the
  ratio of the sums. Sum the parts, then divide.

## Say the consequence, in money

The app already does this well. The concentration warning in
`src/part15_profitability.js:215` builds its sentence as
`"{client} is {share} of revenue. Losing them would take the period to {revenue}
revenue and {profit} profit."` — which reads, with figures filled in, as:

> **Acme is 38% of revenue.** Losing them would take the period to $412,000
> revenue and $61,000 profit.

(Illustrative values; the template is the real thing.)

That is the standard. A warning that does not tell the reader what it costs them
is noise. "Client concentration is high" is noise. Name the client, state the
share, state what happens.

Insight copy should be specific, quantified, and short enough to read in one
pass. If you cannot say what a reader should do differently, do not write it.

## Restraint

Two users. A small dataset. One HTML file.

- **A number beats a chart** for a single value. A chart earns its place only
  when the shape over time or the comparison across items is the point.
- **Density is correct here.** This is a finance table read by people who want
  to scan twelve months at once. Whitespace that pushes a fourth row below the
  fold is a cost, not a refinement.
- **New screens are expensive.** Ask whether the question belongs on an existing
  screen before adding a route.
- **Do not add a setting** to avoid making a decision. Every toggle is a thing
  the owner has to understand later.

## Never soften a bad number

A loss-making project must read as loss-making. The bands exist to be blunt:
below 0 is "Loss making", below 20% is "Critical", 20–35% is "Watch". Do not
round a −2% margin to "around break-even", do not colour a critical project
amber because red looks alarming, and do not sort the worst performers off the
bottom of a list. The point of the tool is to surface exactly these.

Equally: do not manufacture alarm. A 34.8% margin is "Watch" because the band
says so, not a crisis.

## Empty states explain

An empty table says why it is empty, in plain words, naming the period:

> Every billable project is above the 20% watch line in September 2026.

Not "No data". Not an illustration. The reader needs to know whether they are
looking at good news, an unclosed month, or a mistake.

## Precision, consistently

- Money rounds to whole units. `U.money()` / `U.moneyK()` — nothing else.
- Percentages carry one decimal by default. `U.pct()` — nothing else.
- The minus sign is `−` (U+2212), matching the existing output.
- Money is `numeric` in the database and must never become a float on the way
  through. A cent that appears from nowhere destroys trust in every other
  figure on the page.

Consistency matters more than resolution: the same figure shown two ways on two
screens is worse than both being slightly coarse.

## Working with the owner

From `CLAUDE.md` §11 — the owner is not a full-time developer:

- One small step, then stop and wait.
- **Honest pushback over agreement.** If a request will make the product worse,
  say so in a sentence and say what you would do instead. Then do what he
  decides.
- Verify before asserting. Run it. Flag estimates as estimates.
- Short answers. Do not list every failure mode.
- At a milestone, zoom out briefly: what we did, how it connects to the goal.

## The question to ask before adding anything

**Would a leadership team make a different decision because this is on the
screen?**

If no, it is weight. This product is already dense; the discipline that keeps it
useful is subtraction.
