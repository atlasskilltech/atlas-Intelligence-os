import "server-only";
import http from "node:http";
import https from "node:https";
import { NetworkBlocked, checkUrl, guardedLookup } from "../../security/netGuard.js";

/**
 * Outbound HTTP for connectors, with the SSRF guard on every hop.
 * Uses node:http(s) directly so the guarded DNS lookup decides which address
 * is connected to. Redirects are followed manually and re-checked; credentials
 * are dropped when a redirect leaves the original origin.
 *
 * Returns { status, headers, contentType, body (string), truncated, finalUrl, durationMs, redirects }.
 */

export const DEFAULTS = { timeoutMs: 20_000, maxBytes: 1_000_000, maxRedirects: 3 };
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export async function safeFetch(urlInput, { method = "GET", headers = {}, body, timeoutMs, maxBytes, maxRedirects, sensitiveHeaders = [] } = {}) {
  const opts = { timeoutMs: timeoutMs ?? DEFAULTS.timeoutMs, maxBytes: maxBytes ?? DEFAULTS.maxBytes };
  const limitRedirects = maxRedirects ?? DEFAULTS.maxRedirects;
  const started = Date.now();
  const deadline = started + opts.timeoutMs;
  const origin = checkUrl(urlInput).origin;

  let url = checkUrl(urlInput);
  let reqMethod = method.toUpperCase();
  let reqBody = body;
  let reqHeaders = { ...headers };
  let redirects = 0;

  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Timed out after ${Math.round(opts.timeoutMs / 1000)}s`);
    const res = await once(url, { method: reqMethod, headers: reqHeaders, body: reqBody, timeoutMs: remaining, maxBytes: opts.maxBytes });

    if (REDIRECTS.has(res.status) && res.headers.location) {
      if (redirects >= limitRedirects) throw new Error(`Too many redirects (more than ${limitRedirects}).`);
      redirects += 1;
      let next;
      try {
        next = checkUrl(new URL(res.headers.location, url));
      } catch (err) {
        if (err instanceof NetworkBlocked) throw new NetworkBlocked(`Blocked a redirect: ${err.message}`);
        throw err;
      }
      if (next.origin !== origin) {
        // Never send credentials to a different site.
        for (const h of Object.keys(reqHeaders)) {
          if (h.toLowerCase() === "authorization" || sensitiveHeaders.map((s) => s.toLowerCase()).includes(h.toLowerCase())) delete reqHeaders[h];
        }
      }
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && reqMethod === "POST")) {
        reqMethod = "GET";
        reqBody = undefined;
        delete reqHeaders["Content-Type"];
      }
      url = next;
      continue;
    }
    return { ...res, finalUrl: url.toString(), redirects, durationMs: Date.now() - started };
  }
}

function once(url, { method, headers, body, timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const payload = body == null ? null : Buffer.from(body);
    const req = lib.request(
      url,
      {
        method,
        headers: { ...headers, ...(payload ? { "Content-Length": payload.length } : {}) },
        lookup: guardedLookup,
        agent: false, // no connection reuse across checks
      },
      (res) => {
        const chunks = [];
        let size = 0;
        let truncated = false;
        res.on("data", (c) => {
          if (truncated) return;
          size += c.length;
          if (size > maxBytes) {
            chunks.push(c.subarray(0, c.length - (size - maxBytes)));
            truncated = true;
            res.destroy();
            done();
            return;
          }
          chunks.push(c);
        });
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            contentType: String(res.headers["content-type"] || ""),
            body: Buffer.concat(chunks).toString("utf8"),
            truncated,
          });
        };
        res.on("end", done);
        res.on("error", (err) => (truncated ? done() : fail(err)));
      },
    );
    let failed = false;
    const fail = (err) => {
      if (failed) return;
      failed = true;
      clearTimeout(timer);
      reject(friendly(err, url, timeoutMs));
    };
    const timer = setTimeout(() => {
      req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT_ATLAS" }));
    }, timeoutMs);
    req.on("error", fail);
    if (payload) req.write(payload);
    req.end();
  });
}

function friendly(err, url, timeoutMs) {
  if (err instanceof NetworkBlocked) return err;
  const host = url.hostname;
  const map = {
    ETIMEDOUT_ATLAS: `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${host}.`,
    ENOTFOUND: `Could not find the server ${host} (DNS lookup failed).`,
    ECONNREFUSED: `${host} refused the connection.`,
    ECONNRESET: `The connection to ${host} was reset.`,
    EHOSTUNREACH: `${host} is unreachable from this server.`,
    CERT_HAS_EXPIRED: `${host} has an expired TLS certificate.`,
    DEPTH_ZERO_SELF_SIGNED_CERT: `${host} uses a self-signed TLS certificate, which is not trusted.`,
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: `${host}'s TLS certificate could not be verified.`,
  };
  return new Error(map[err?.code] || `Request to ${host} failed: ${err?.message || "unknown error"}`);
}
