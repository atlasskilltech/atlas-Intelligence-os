import "server-only";
import dns from "node:dns";
import net from "node:net";
import { getInternalAllowedHosts } from "../config/env.js";

/**
 * SSRF guard for every outbound connector request.
 *
 *  - https only; plain http only for hosts listed in INTERNAL_ALLOWED_HOSTS
 *  - no user:password@ in URLs
 *  - private / loopback / link-local / metadata addresses are blocked unless the
 *    hostname is listed in INTERNAL_ALLOWED_HOSTS
 *  - the check runs on the address actually connected to (custom DNS lookup),
 *    so a hostname that re-resolves to an internal IP (DNS rebinding) is still blocked
 *  - redirects are re-checked by the HTTP client with the same rules
 */

export class NetworkBlocked extends Error {
  constructor(message) {
    super(message);
    this.name = "NetworkBlocked";
    this.publicMessage = message;
    this.status = 400;
    this.type = "network_blocked";
  }
}

const v4ToInt = (ip) => ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
const V4_BLOCKED = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata (169.254.169.254)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
].map(([base, bits]) => [v4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

/** True for any address that is not on the public internet. */
export function isPrivateAddress(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(([base, mask]) => (n & mask) >>> 0 === (base & mask) >>> 0);
  }
  if (kind === 6) {
    const a = ip.toLowerCase().split("%")[0];
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) || a.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (a === "::" || a === "::1") return true;
    if (/^::ffff:/.test(a)) return true; // hex-form mapped addresses: refuse rather than parse
    const first = parseInt(a.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (first === 0x2001 && a.startsWith("2001:db8")) return true; // documentation
    return false;
  }
  return true; // not an IP at all → treat as unsafe
}

const normHost = (h) => String(h || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

export function isInternalAllowed(hostname) {
  return getInternalAllowedHosts().includes(normHost(hostname));
}

/**
 * Checks a URL before any request (and before saving a connection).
 * Returns the parsed URL; throws NetworkBlocked with a plain-language reason.
 */
export function checkUrl(input) {
  let url;
  try {
    url = input instanceof URL ? input : new URL(String(input));
  } catch {
    throw new NetworkBlocked("That is not a valid URL.");
  }
  const host = normHost(url.hostname);
  const internal = isInternalAllowed(host);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && internal)) {
    throw new NetworkBlocked(
      internal || url.protocol !== "http:"
        ? "Only https:// URLs are allowed."
        : `Only https:// URLs are allowed. Plain http:// is allowed only for internal hosts listed in INTERNAL_ALLOWED_HOSTS.`,
    );
  }
  if (url.username || url.password) throw new NetworkBlocked("URLs must not contain a username or password. Use the connection's authentication settings.");
  if (!host) throw new NetworkBlocked("The URL has no host name.");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    if (!internal) throw new NetworkBlocked(`"${host}" is an internal host. An administrator must add it to INTERNAL_ALLOWED_HOSTS first.`);
  }
  if (net.isIP(host) && isPrivateAddress(host) && !internal) {
    throw new NetworkBlocked(`${host} is a private network address. An administrator must add it to INTERNAL_ALLOWED_HOSTS first.`);
  }
  return url;
}

/**
 * dns.lookup replacement passed to http(s).request: resolves the host and
 * refuses private addresses unless the host is internal-allowed.
 */
export function guardedLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: net.isIP(addresses) }];
    if (!list.length) return callback(new NetworkBlocked(`Could not resolve ${hostname}.`));
    if (!isInternalAllowed(hostname)) {
      const bad = list.find((a) => isPrivateAddress(a.address));
      if (bad) {
        return callback(
          new NetworkBlocked(`${hostname} resolves to a private network address (${bad.address}). An administrator must add it to INTERNAL_ALLOWED_HOSTS first.`),
        );
      }
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}
