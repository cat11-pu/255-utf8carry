// flowrun.js：按字节预算解码并留账（基线：一律给空表）
import { charLen, isContinuation } from "./bytes.js";

export function step(spec) {
  return { state: spec.state, chars: 0, consumed: 0, pending: [], carry_before: 0,
           judged: 0, judged_bound: 0 };
}

export function close(spec) {
  return { state: spec.state, catchup: 0, chars: 0 };
}
