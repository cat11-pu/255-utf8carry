// flowrun.js：按字节预算解码，残字节跨块跨轮结转；收尾清账并报截断
import { charLen, isContinuation } from "./bytes.js";

const DEFAULT_CODES = {
  start: "E_BAD_START",
  cont: "E_BAD_CONTINUATION",
  trunc: "E_TRUNCATED",
  block: "E_BAD_BLOCK"
};

function fail(spec, key, field, message) {
  const error = new Error(message);
  error.code = (spec && spec[field]) || DEFAULT_CODES[key];
  throw error;
}

function cloneState(state) {
  state = state || {};
  return {
    out: Array.isArray(state.out) ? state.out.slice() : [],
    carry: Array.isArray(state.carry) ? state.carry.slice() : [],
    pending: Array.isArray(state.pending) ? state.pending.slice() : [],
    offset: Number.isInteger(state.offset) ? state.offset : 0,
    applied: Array.isArray(state.applied) ? state.applied.slice() : []
  };
}

function validateBlocks(blocks, spec) {
  if (!Array.isArray(blocks)) {
    fail(spec, "block", "block_error_code", "块表不是数组");
  }
  blocks.forEach(function (block) {
    if (!block || typeof block !== "object"
        || !Number.isInteger(block.id)
        || !Array.isArray(block.bytes)
        || block.bytes.some(function (b) {
          return !Number.isInteger(b) || b < 0 || b > 255;
        })) {
      fail(spec, "block", "block_error_code", "块字段不合法");
    }
  });
}

// 把账上残块与本批新块按顺序拼成待处理工作清单
function buildWorklist(spec, state) {
  const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
  const byId = new Map();
  blocks.forEach(function (block) { byId.set(block.id, block); });
  const applied = new Set(state.applied);
  const unresolved = state.pending.filter(function (id) { return !byId.has(id); });

  let startIdx = -1;
  if (state.pending.length > 0 && byId.has(state.pending[0])) {
    startIdx = blocks.findIndex(function (block) { return block.id === state.pending[0]; });
  }
  if (startIdx === -1) {
    startIdx = blocks.findIndex(function (block) { return !applied.has(block.id); });
  }

  const entries = [];
  if (startIdx !== -1) {
    for (let i = startIdx; i < blocks.length; i += 1) {
      if (applied.has(blocks[i].id)) continue;
      entries.push({ block: blocks[i], offset: i === startIdx ? state.offset : 0 });
    }
  }
  return { unresolved: unresolved, entries: entries };
}

function decodeCarry(bytes) {
  const first = bytes[0];
  const need = charLen(first);
  let point = first & (need === 2 ? 0x1f : need === 3 ? 0x0f : need === 4 ? 0x07 : 0xff);
  for (let i = 1; i < bytes.length; i += 1) {
    point = (point << 6) | (bytes[i] & 0x3f);
  }
  return point;
}

function feedByte(st, byte, spec) {
  // 返回本轮新完成的字符数；非法情况按残字节状态抛错
  if (st.carry.length > 0) {
    if (!isContinuation(byte)) {
      fail(spec, "cont", "cont_error_code",
           "期望续字节，却拿到 0x" + byte.toString(16));
    }
    st.carry.push(byte);
    if (st.carry.length === charLen(st.carry[0])) {
      st.out.push(decodeCarry(st.carry));
      st.carry = [];
      return 1;
    }
    return 0;
  }
  let need;
  try {
    need = charLen(byte);
  } catch (error) {
    fail(spec, "start", "start_error_code", error.message);
  }
  st.carry = [byte];
  if (need === 1) {
    st.out.push(decodeCarry(st.carry));
    st.carry = [];
    return 1;
  }
  return 0;
}

export function step(spec) {
  spec = spec || {};
  const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
  validateBlocks(blocks, spec);
  const st = cloneState(spec.state);
  const work = buildWorklist(spec, st);

  let remaining = Number(spec.budget);
  if (!Number.isInteger(remaining) || remaining < 0) remaining = 0;
  let consumed = 0;
  let chars = 0;
  let stopEntry = null;
  let stopOffset = 0;

  for (let wi = 0; wi < work.entries.length; wi += 1) {
    const entry = work.entries[wi];
    const block = entry.block;
    let offset = entry.offset;
    let exhaustedHere = false;
    while (offset < block.bytes.length) {
      if (remaining === 0) { exhaustedHere = true; break; }
      const byte = block.bytes[offset];
      offset += 1;
      consumed += 1;
      remaining -= 1;
      chars += feedByte(st, byte, spec);
    }
    if (exhaustedHere) {
      stopEntry = entry;
      stopOffset = offset;
      break;
    }
    st.applied.push(block.id);
  }

  if (stopEntry !== null) {
    const stopIndex = work.entries.indexOf(stopEntry);
    const ids = work.entries.slice(stopIndex).map(function (e) { return e.block.id; });
    st.pending = work.unresolved.concat(ids);
    st.offset = stopOffset;
  } else {
    st.pending = work.unresolved.slice();
    st.offset = 0;
  }

  const totalBytes = Number.isFinite(Number(spec.total_bytes))
    ? Number(spec.total_bytes)
    : blocks.reduce(function (sum, block) { return sum + block.bytes.length; }, 0);

  return { state: st, chars: chars, consumed: consumed, pending: st.pending.slice(),
           carry_before: st.carry.length, judged: consumed, judged_bound: totalBytes };
}

export function close(spec) {
  spec = spec || {};
  const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
  validateBlocks(blocks, spec);
  const st = cloneState(spec.state);
  const work = buildWorklist(spec, st);

  let chars = 0;
  const appliedBefore = new Set(st.applied);

  for (let wi = 0; wi < work.entries.length; wi += 1) {
    const entry = work.entries[wi];
    const block = entry.block;
    let offset = entry.offset;
    while (offset < block.bytes.length) {
      const byte = block.bytes[offset];
      offset += 1;
      chars += feedByte(st, byte, spec);
    }
    st.applied.push(block.id);
  }

  if (st.carry.length > 0) {
    fail(spec, "trunc", "trunc_error_code",
         "收尾时残字节凑不成字符，残 " + st.carry.length + " 字节");
  }

  const catchup = st.applied.filter(function (id) {
    return !appliedBefore.has(id);
  }).length;
  st.pending = work.unresolved.slice();
  st.offset = 0;

  return { state: st, catchup: catchup, chars: chars };
}
