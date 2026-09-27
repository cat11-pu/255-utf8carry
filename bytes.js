// bytes.js：首字节期望长度与续字节判定
export function charLen(byte) {
  if (byte < 0x80) return 1;
  if (byte >= 0xc2 && byte <= 0xdf) return 2;
  if (byte >= 0xe0 && byte <= 0xef) return 3;
  if (byte >= 0xf0 && byte <= 0xf4) return 4;
  const error = new Error("非法首字节: " + byte);
  error.code = "E_BAD_START";
  throw error;
}

export function isContinuation(byte) {
  return byte >= 0x80 && byte <= 0xbf;
}
