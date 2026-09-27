// app.js：渲染结果
import { charLen, isContinuation } from "./bytes.js";
import { step, close } from "./flowrun.js";

export function render(spec) {
  const blocks = spec.blocks || [];
  const half = Math.ceil(blocks.length / 2);
  const first = step(spec);
  const closed = close(Object.assign({}, spec, { state: first.state }));
  const r1 = step(Object.assign({}, spec, { blocks: blocks.slice(0, half) }));
  const r2 = step(Object.assign({}, spec, { state: r1.state, blocks: blocks.slice(half) }));
  const closedTwo = close(Object.assign({}, spec, { state: r2.state }));
  const replay = step(Object.assign({}, spec, { state: closed.state }));
  const wide = step(Object.assign({}, spec, { budget: spec.budget + 2 }));
  const full = step(Object.assign({}, spec, { budget: 100000 }));
  const fullClosed = close(Object.assign({}, spec, { state: full.state }));
  const toText = function (points) {
    return String.fromCodePoint.apply(String, points);
  };
  const fingerprint = function (state) {
    return JSON.stringify({ out: state.out, carry: state.carry, pending: state.pending,
                            offset: state.offset || 0, applied: state.applied.length });
  };
  return { text: toText(closed.state.out), codepoints: closed.state.out,
           carry_before: first.carry_before, pending: first.pending,
           catchup: closed.catchup, chars: first.chars, chars_catch: closed.chars,
           carry_after: closed.state.carry.length, used_first: first.consumed,
           used_wide: wide.consumed, pair_differs: first.consumed !== wide.consumed,
           mid_differs: fingerprint(r2.state) !== fingerprint(first.state),
           closed_equal: fingerprint(closedTwo.state) === fingerprint(closed.state),
           replay_new: replay.chars, judged: first.judged, judged_bound: first.judged_bound,
           full_diff: fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1,
           count: blocks.length, tail: charLen(65) + (isContinuation(128) ? 1 : 0) };
}
