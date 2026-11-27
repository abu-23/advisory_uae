import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Field-level envelope encryption for personal data (quote request contact details).
 *
 * Each value gets its own random 256-bit data key. The value is encrypted with
 * AES-256-GCM under that data key, and the data key is wrapped by a KeyProvider
 * (a local key in dev/test, AWS KMS in the UAE region in production).
 *
 * The "context" (for example "quote_request:<id>:contact_value") is bound in as
 * additional authenticated data, so a ciphertext copied to another row or field
 * fails to decrypt.
 *
 * Blob layout: version(1) | wrappedKeyLength(2) | wrappedKey | iv(12) | tag(16) | ciphertext
 */

export interface KeyProvider {
  readonly keyId: string;
  wrapKey(dataKey: Buffer, context: string): Promise<Buffer>;
  unwrapKey(wrapped: Buffer, context: string): Promise<Buffer>;
}

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function gcmEncrypt(key: Buffer, plaintext: Buffer, aad: string) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

function gcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer, aad: string): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Dev/test key provider: wraps data keys with a 32-byte master key from the environment. */
export class LocalKeyProvider implements KeyProvider {
  readonly keyId: string;
  readonly #masterKey: Buffer;

  constructor(masterKeyBase64: string, keyId = "local-v1") {
    const key = Buffer.from(masterKeyBase64, "base64");
    if (key.length !== KEY_LEN) throw new Error("Master key must be 32 bytes");
    this.#masterKey = key;
    this.keyId = keyId;
  }

  async wrapKey(dataKey: Buffer, context: string): Promise<Buffer> {
    const { iv, tag, ciphertext } = gcmEncrypt(this.#masterKey, dataKey, `wrap:${context}`);
    return Buffer.concat([iv, tag, ciphertext]);
  }

  async unwrapKey(wrapped: Buffer, context: string): Promise<Buffer> {
    const iv = wrapped.subarray(0, IV_LEN);
    const tag = wrapped.subarray(IV_LEN, IV_LEN + TAG_LEN);
    return gcmDecrypt(this.#masterKey, iv, tag, wrapped.subarray(IV_LEN + TAG_LEN), `wrap:${context}`);
  }
}

export async function encryptField(provider: KeyProvider, plaintext: string, context: string): Promise<Buffer> {
  const dataKey = randomBytes(KEY_LEN);
  try {
    const wrapped = await provider.wrapKey(dataKey, context);
    const { iv, tag, ciphertext } = gcmEncrypt(dataKey, Buffer.from(plaintext, "utf8"), context);
    const header = Buffer.alloc(3);
    header.writeUInt8(VERSION, 0);
    header.writeUInt16BE(wrapped.length, 1);
    return Buffer.concat([header, wrapped, iv, tag, ciphertext]);
  } finally {
    dataKey.fill(0);
  }
}

export async function decryptField(provider: KeyProvider, blob: Buffer, context: string): Promise<string> {
  if (blob.length < 3 || blob.readUInt8(0) !== VERSION) throw new Error("Unsupported ciphertext");
  const wrappedLen = blob.readUInt16BE(1);
  let offset = 3;
  const wrapped = blob.subarray(offset, (offset += wrappedLen));
  const iv = blob.subarray(offset, (offset += IV_LEN));
  const tag = blob.subarray(offset, (offset += TAG_LEN));
  const ciphertext = blob.subarray(offset);
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) throw new Error("Corrupt ciphertext");

  const dataKey = await provider.unwrapKey(wrapped, context);
  try {
    return gcmDecrypt(dataKey, iv, tag, ciphertext, context).toString("utf8");
  } finally {
    dataKey.fill(0);
  }
}

/** Context strings, one per encrypted column, bound to the row id. */
export const contactContext = {
  name: (quoteRequestId: string) => `quote_request:${quoteRequestId}:contact_name`,
  value: (quoteRequestId: string) => `quote_request:${quoteRequestId}:contact_value`,
};

let provider: KeyProvider | undefined;

/** The app's key provider. Production will use AWS KMS (added before deployment). */
export function keyProvider(): KeyProvider {
  if (!provider) {
    // APP_ENV is the deployment (development, test, staging, production);
    // NODE_ENV is "production" for every optimised build, including CI.
    if (process.env.APP_ENV === "production") {
      throw new Error("Production must use the KMS key provider, which is not configured yet");
    }
    const key = process.env.FIELD_ENCRYPTION_KEY;
    if (!key) throw new Error("FIELD_ENCRYPTION_KEY is not set");
    provider = new LocalKeyProvider(key);
  }
  return provider;
}
