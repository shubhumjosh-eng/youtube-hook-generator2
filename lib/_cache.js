const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

function cacheKey(endpoint, body) {
  const hash = JSON.stringify(body);
  let h = 0;
  for (let i = 0; i < hash.length; i++) {
    h = ((h << 5) - h) + hash.charCodeAt(i);
    h |= 0;
  }
  return `${endpoint}:${Math.abs(h).toString(36)}`;
}

function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function set(key, data, ttl = CACHE_TTL) {
  cache.set(key, { data, expiry: Date.now() + ttl });
}

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiry) cache.delete(key);
  }
}

setInterval(cleanup, 60 * 1000);

export { cacheKey, get, set };
