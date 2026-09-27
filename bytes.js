// bytes.js：首字节期望长度与续字节判定（基线：一律按一字节）
export function charLen(byte) {
  return 1;
}

export function isContinuation(byte) {
  return true;
}
