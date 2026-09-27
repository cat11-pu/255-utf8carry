// flowrun.js：按字节预算分块解码 UTF-8，残字节跨块跨轮结转，收尾清账
import { charLen, isContinuation } from "./bytes.js";

function errorWith(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateBlocks(blocks, code) {
  if (!Array.isArray(blocks)) throw errorWith(code, "blocks must be an array");
  const seen = new Set();
  for (const block of blocks) {
    if (block === null || typeof block !== "object" || !Array.isArray(block.bytes)
        || typeof block.id !== "number" || !Number.isFinite(block.id)) {
      throw errorWith(code, "block must have numeric id and bytes array");
    }
    if (seen.has(block.id)) throw errorWith(code, "duplicate block id: " + block.id);
    seen.add(block.id);
    for (const byte of block.bytes) {
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
        throw errorWith(code, "byte out of range in block " + block.id);
      }
    }
  }
  return seen;
}

function cloneState(state) {
  return {
    out: Array.isArray(state.out) ? state.out.slice() : [],
    carry: Array.isArray(state.carry) ? state.carry.slice() : [],
    pending: Array.isArray(state.pending) ? state.pending.slice() : [],
    offset: Number.isInteger(state.offset) ? state.offset : 0,
    applied: Array.isArray(state.applied) ? state.applied.slice() : []
  };
}

function buildQueue(spec, known) {
  const state = spec.state;
  const byId = new Map(spec.blocks.map((block) => [block.id, block]));
  const queue = [];
  for (const id of state.pending) {
    const block = byId.get(id);
    if (!block) throw errorWith(spec.block_error_code || "E_BAD_BLOCK", "missing pending block: " + id);
    queue.push(block);
  }
  const queued = new Set(state.pending);
  for (const block of spec.blocks) {
    if (queued.has(block.id) || state.applied.indexOf(block.id) !== -1) continue;
    queue.push(block);
    queued.add(block.id);
  }
  return queue;
}

function decodePoint(carry, startCode) {
  const lead = carry[0];
  let length;
  try {
    length = charLen(lead);
  } catch (error) {
    if (error.code === "E_BAD_START") {
      throw errorWith(startCode, error.message);
    }
    throw error;
  }
  let point = 0;
  if (length === 1) {
    point = lead;
  } else {
    point = lead & (length === 2 ? 0x1f : length === 3 ? 0x0f : 0x07);
    for (let index = 1; index < length; index += 1) {
      point = (point << 6) | (carry[index] & 0x3f);
    }
  }
  return point;
}

function run(spec, unlimited) {
  const startCode = spec.start_error_code || "E_BAD_START";
  const contCode = spec.cont_error_code || "E_BAD_CONTINUATION";
  const blockCode = spec.block_error_code || "E_BAD_BLOCK";
  const truncCode = spec.trunc_error_code || "E_TRUNCATED";

  const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
  validateBlocks(blocks, blockCode);
  const state = cloneState(spec.state);
  const appliedBefore = state.applied.length;
  const queue = buildQueue(Object.assign({}, spec, { blocks, state }), 0);

  let cursor = 0;
  if (queue.length > 0 && state.pending.length > 0 && state.carry.length > 0 && state.offset > 0) {
    cursor = Math.min(state.offset, queue[0].bytes.length);
  }
  const budget = Number.isFinite(spec.budget) ? Math.max(0, Math.floor(spec.budget)) : 0;
  let consumed = 0;
  let chars = 0;
  let exhausted = false;
  let current = null;

  const advance = function () {
    if (current && cursor >= current.bytes.length) {
      state.applied.push(current.id);
      queue.shift();
      cursor = 0;
    }
  };

  const feed = function (byte) {
    if (state.carry.length === 0) {
      try {
        charLen(byte);
      } catch (error) {
        if (error.code === "E_BAD_START") throw errorWith(startCode, error.message);
        throw error;
      }
      state.carry.push(byte);
    } else if (isContinuation(byte)) {
      state.carry.push(byte);
    } else {
      throw errorWith(contCode, "expected continuation byte, got: " + byte);
    }
    let length;
    try {
      length = charLen(state.carry[0]);
    } catch (error) {
      if (error.code === "E_BAD_START") throw errorWith(startCode, error.message);
      throw error;
    }
    if (state.carry.length >= length) {
      state.out.push(decodePoint(state.carry, startCode));
      chars += 1;
      state.carry = [];
    }
  };

  while (queue.length > 0) {
    current = queue[0];
    const bytes = current.bytes;
    while (cursor < bytes.length) {
      if (!unlimited && consumed >= budget) { exhausted = true; break; }
      feed(bytes[cursor]);
      cursor += 1;
      consumed += 1;
    }
    if (exhausted) break;
    advance();
  }

  let pending = [];
  let offset = 0;
  if (exhausted) {
    if (current && cursor < current.bytes.length) {
      pending = [current.id].concat(queue.slice(1).map((block) => block.id));
      offset = cursor;
    } else {
      advance();
      pending = queue.map((block) => block.id);
      offset = 0;
    }
  }
  state.pending = pending;
  state.offset = offset;

  const total = Number.isFinite(spec.total_bytes)
    ? Math.max(0, Math.floor(spec.total_bytes))
    : blocks.reduce((sum, block) => sum + block.bytes.length, 0);

  const carryBefore = state.carry.length;
  return {
    state,
    chars,
    consumed,
    pending,
    carry_before: carryBefore,
    judged: consumed,
    judged_bound: total,
    catchup: state.applied.length - appliedBefore,
    _codes: { trunc: truncCode, block: blockCode }
  };
}

export function step(spec) {
  const result = run(spec, false);
  delete result._codes;
  return result;
}

export function close(spec) {
  const result = run(Object.assign({}, spec, { budget: Infinity }), true);
  if (result.state.carry.length > 0) {
    throw errorWith(result._codes.trunc, "truncated utf-8 sequence at close");
  }
  const state = result.state;
  delete result._codes;
  return { state, catchup: result.catchup, chars: result.chars };
}
