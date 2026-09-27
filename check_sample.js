import fs from "node:fs";
import { charLen, isContinuation } from "./bytes.js";
import { step, close } from "./flowrun.js";

// 验收断言：上面每条值收进 emit，最后与期望值逐项比对，不符就非零退出。
const __lines = [];
function emit(label, value) { __lines.push([String(label).replace(/ =$/, ""), value]); }


const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/chunks.json", "utf8"));
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
const fingerprint = function (state) {
  return JSON.stringify({ out: state.out, carry: state.carry, pending: state.pending,
                          offset: state.offset || 0, applied: state.applied.length });
};

emit("收尾后码点序列 =", JSON.stringify(closed.state.out));
emit("首轮消费字节 =", first.consumed);
emit("二档消费字节 =", wide.consumed);
emit("两个预算档消费不同 =", first.consumed !== wide.consumed);
emit("首轮解出字符数 =", first.chars);
emit("收尾前残字节 =", first.carry_before);
emit("收尾前待处理块 =", JSON.stringify(first.pending));
emit("收尾补齐块数 =", closed.catchup);
emit("收尾解出字符数 =", closed.chars);
emit("收尾后残字节 =", closed.state.carry.length);
emit("拆两轮中间态不同 =", fingerprint(r2.state) !== fingerprint(first.state));
emit("拆两轮收尾态一致 =", fingerprint(closedTwo.state) === fingerprint(closed.state));
emit("重放新增字符 =", replay.chars);
emit("工作计数未超上界 =", first.judged <= first.judged_bound);
emit("与全量对照差异 =", fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1);


// ---- 异常路径探针：真调用实现，看它报出什么码（不是从样例里抄）----
try {
  step(Object.assign({}, { state: { out: [], carry: [], pending: [], offset: 0, applied: [] },
    blocks: [{ id: 1, bytes: [128, 65] }], budget: 8 }));
  emit("非法首字节报码", "没有报错");
} catch (error) {
  emit("非法首字节报码", error && error.code ? error.code : String(error.message));
}
try {
  step(Object.assign({}, { state: { out: [], carry: [], pending: [], offset: 0, applied: [] },
    blocks: [{ id: 1, bytes: [228] }, { id: 2, bytes: [65] }], budget: 8 }));
  emit("非法续字节报码", "没有报错");
} catch (error) {
  emit("非法续字节报码", error && error.code ? error.code : String(error.message));
}
try {
  close(Object.assign({}, { state: { out: [], carry: [228], pending: [], offset: 0, applied: [] },
    blocks: [], budget: 8 }));
  emit("截断报码", "没有报错");
} catch (error) {
  emit("截断报码", error && error.code ? error.code : String(error.message));
}
try {
  step(Object.assign({}, { state: { out: [], carry: [], pending: [], offset: 0, applied: [] },
    blocks: [{ id: 1, bytes: [65, 999] }], budget: 8 }));
  emit("块不合法报码", "没有报错");
} catch (error) {
  emit("块不合法报码", error && error.code ? error.code : String(error.message));
}


// ---- 期望值（参考模型算出，与题面给的验收数值一致）----
const EXPECTED = {
  "收尾后码点序列": [
    20320,
    22909,
    19990,
    30028
  ],
  "首轮消费字节": 5,
  "二档消费字节": 7,
  "两个预算档消费不同": true,
  "首轮解出字符数": 1,
  "收尾前残字节": 2,
  "收尾前待处理块": [
    3,
    4
  ],
  "收尾补齐块数": 2,
  "收尾解出字符数": 3,
  "收尾后残字节": 0,
  "拆两轮中间态不同": true,
  "拆两轮收尾态一致": true,
  "重放新增字符": 0,
  "工作计数未超上界": true,
  "与全量对照差异": 0,
  "非法首字节报码": "E_BAD_START",
  "非法续字节报码": "E_BAD_CONTINUATION",
  "截断报码": "E_TRUNCATED",
  "块不合法报码": "E_BAD_BLOCK"
};
// 有的值在收进来之前已经 stringify 过，比较前先试着解析回来，避免类型错配把正确实现判成不过。
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { /* 不是 JSON 就按原文比 */ }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  const got = found[1];
  if (__same(got, want)) { console.log("一致 " + label + " = " + JSON.stringify(got)); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(got)); }
}
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
process.exit(__bad === 0 ? 0 : 1);
