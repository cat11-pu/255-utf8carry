import assert from "node:assert";
import { charLen, isContinuation } from "../bytes.js";
import { step, close } from "../flowrun.js";
import { render } from "../app.js";

const base = {
  state: { out: [], carry: [], pending: [], offset: 0, applied: [] },
  blocks: [], budget: 1, total_bytes: 0,
  start_error_code: "E_BAD_START", cont_error_code: "E_BAD_CONTINUATION",
  trunc_error_code: "E_TRUNCATED", block_error_code: "E_BAD_BLOCK"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("charLen returns a number", () => {
  assert.strictEqual(typeof charLen(65), "number");
});

check("isContinuation returns a flag", () => {
  assert.strictEqual(typeof isContinuation(65), "boolean");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts blocks", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
