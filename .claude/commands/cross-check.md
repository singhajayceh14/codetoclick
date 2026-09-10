---
description: Prove the JS rollup engine and the SQL views still compute the same figures
---

The maths exists twice on purpose: `rollup()` in `src/part2_data.js` is what the
app actually uses, and the views `v_project_month`, `v_client_month`,
`v_company_month` in `db/c2c_schema_v1.3.sql` compute the same figures
independently. Two implementations that must agree is the cross-check. **If you
change one, change the other and prove they still match.**

Do this whenever the maths moves — anything touching revenue, employee cost,
allocation, licence share, or the margin bands.

1. Read the JS definition of the figure in `src/part2_data.js` and the SQL
   definition in the matching view. State both, in the column vocabulary from
   `CLAUDE.md` §1 (Contribution after people, People margin, Profit, Margin).
2. Confirm they agree on the rules that are easy to break:
   - a licence share splits equally across everyone **on payroll**, then follows
     each person's allocation; the bench share stays company overhead
   - a non-billable project earns no revenue and no margin — its cost becomes
     company overhead
   - unallocated time (`project_id is null`) is internal, not project cost
   - money is `numeric`, never float
3. For a month with real data, produce both numbers and compare them directly.
   Do not assert they match because the code looks equivalent — run it.

Report any figure where the two disagree, with the month and the amount. A
disagreement is a bug in one of them, not a rounding curiosity.
