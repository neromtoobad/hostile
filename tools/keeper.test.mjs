// node --test tools/keeper.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { dueAction } from "./keeper.mjs";

const base = { phase: 0, pickDeadline: 1000n, seasonStart: 5000n, weeksSettled: 0n, weekLength: 3600n };

test("nothing is due while a league is filling up or finished", () => {
  assert.equal(dueAction({ ...base, phase: 0 }, 99_999n, 60n), null);
  assert.equal(dueAction({ ...base, phase: 3 }, 99_999n, 60n), null);
});

test("autopick only after the pick clock plus the grace period", () => {
  const d = { ...base, phase: 1 };
  assert.equal(dueAction(d, 1000n, 60n), null);
  assert.equal(dueAction(d, 1060n, 60n), null);
  assert.equal(dueAction(d, 1061n, 60n), "autopick");
});

test("settleWeek exactly when the week ends, and again for each later week", () => {
  const s = { ...base, phase: 2 };
  assert.equal(dueAction(s, 8599n, 60n), null);
  assert.equal(dueAction(s, 8600n, 60n), "settleWeek");
  assert.equal(dueAction({ ...s, weeksSettled: 1n }, 8600n, 60n), null);
  assert.equal(dueAction({ ...s, weeksSettled: 1n }, 12_200n, 60n), "settleWeek");
});
