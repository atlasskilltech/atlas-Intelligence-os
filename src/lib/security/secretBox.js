import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getEncryptionKey } from "../config/env.js";

/**
 * Encrypts secrets entered in the UI (AES-256-GCM). The master key comes from
 * CONNECTOR_ENCRYPTION_KEY; without it nothing can be saved. Stored format:
 * "v1:<iv>:<tag>:<ciphertext>" (base64). Tampered data fails to decrypt.
 */

export class SecretBoxError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.publicMessage = message;
    this.status = status;
    this.type = "encryption";
  }
}

function masterKey() {
  const k = getEncryptionKey();
  if (!k || k.length < 16) {
    throw new SecretBoxError(
      "The server can't store keys yet: set CONNECTOR_ENCRYPTION_KEY (at least 16 characters, e.g. from `openssl rand -base64 32`) and restart the app.",
    );
  }
  return createHash("sha256").update(k).digest();
}

export function encryptSecret(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(box) {
  const [v, iv, tag, data] = String(box || "").split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new SecretBoxError("A stored key is damaged. Replace the key.", 500);
  try {
    const d = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch (err) {
    if (err instanceof SecretBoxError) throw err;
    throw new SecretBoxError("A stored key can't be decrypted — was CONNECTOR_ENCRYPTION_KEY changed? Replace the key.", 500);
  }
}
