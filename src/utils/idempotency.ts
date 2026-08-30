/**
 * Generate a request idempotency key in HTTPS, HTTP development environments,
 * and older browsers. Crypto.randomUUID is only exposed in secure contexts by
 * some browsers, while getRandomValues has wider support.
 */
export function newIdempotencyKey(): string {
  const browserCrypto = globalThis.crypto
  if (typeof browserCrypto?.randomUUID === 'function') {
    return browserCrypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof browserCrypto?.getRandomValues === 'function') {
    browserCrypto.getRandomValues(bytes)
  } else {
    // Idempotency keys are uniqueness tokens rather than credentials. This
    // fallback keeps old browsers usable when Web Crypto is unavailable.
    const seed = `${Date.now()}-${globalThis.performance?.now?.() ?? 0}-${Math.random()}`
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = (seed.charCodeAt(i % seed.length) + Math.floor(Math.random() * 256)) & 0xff
    }
  }

  // RFC 4122 version 4 / variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
