// bytes.js：UTF-8 首字节期望长度与续字节判定
export function charLen(byte) {
  if (Number.isInteger(byte) && byte >= 0x00 && byte <= 0x7f) return 1;
  if (byte >= 0xc2 && byte <= 0xdf) return 2;
  if (byte >= 0xe0 && byte <= 0xef) return 3;
  if (byte >= 0xf0 && byte <= 0xf4) return 4;
  const error = new Error("invalid utf-8 start byte: " + byte);
  error.code = "E_BAD_START";
  throw error;
}

export function isContinuation(byte) {
  return Number.isInteger(byte) && byte >= 0x80 && byte <= 0xbf;
}
