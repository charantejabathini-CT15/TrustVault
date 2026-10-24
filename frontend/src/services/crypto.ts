/**
 * TrustVault Client-Side Web Crypto API Implementation.
 * 
 * Cryptographic Specifications:
 * - File Encryption: AES-256-GCM with 96-bit (12-byte) unique random IV.
 * - Key Wrapping: RSA-OAEP with SHA-256, 2048-bit modulus.
 * - Passphrase Key Derivation: PBKDF2 with SHA-256, 600,000 iterations.
 * - Integrity: SHA-256 computed over raw ciphertext bytes.
 * - Zero Knowledge: Vault passphrase & decrypted private keys NEVER leave the browser memory.
 */

// Helper conversions
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
  }
  return window.btoa(binary);
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 1. Compute SHA-256 hash of bytes
export async function computeSha256(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

// 2. Generate RSA Key Pair for user (RSA-OAEP, 2048-bit, SHA-256)
export async function generateRsaKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable
    ['wrapKey', 'unwrapKey']
  );
}

// Export Public Key to Base64 SPKI
export async function exportPublicKeySpki(publicKey: CryptoKey): Promise<string> {
  const spki = await window.crypto.subtle.exportKey('spki', publicKey);
  return bufferToBase64(spki);
}

// Import Public Key from Base64 SPKI
export async function importPublicKeySpki(base64Spki: string): Promise<CryptoKey> {
  const buffer = base64ToBuffer(base64Spki);
  return window.crypto.subtle.importKey(
    'spki',
    buffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['wrapKey']
  );
}

// 3. PBKDF2: Derive AES-GCM vault-key from passphrase
export async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = 600000
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passphraseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: iterations,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// 4. Encrypt user's RSA private key using PBKDF2-derived vault key
export async function protectPrivateKey(
  privateKey: CryptoKey,
  passphrase: string,
  iterations = 600000
): Promise<{ encryptedKeyBase64: string; saltBase64: string }> {
  // Export private key to PKCS#8
  const pkcs8 = await window.crypto.subtle.exportKey('pkcs8', privateKey);

  // Generate random 16-byte salt
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const vaultKey = await deriveVaultKey(passphrase, salt, iterations);

  // Random 12-byte IV for AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    vaultKey,
    pkcs8
  );

  // Pack IV + ciphertext together
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return {
    encryptedKeyBase64: bufferToBase64(combined),
    saltBase64: bufferToBase64(salt),
  };
}

// 5. Unlock user's RSA private key using passphrase
export async function unlockPrivateKey(
  encryptedKeyBase64: string,
  saltBase64: string,
  passphrase: string,
  iterations = 600000
): Promise<CryptoKey> {
  const salt = new Uint8Array(base64ToBuffer(saltBase64));
  const vaultKey = await deriveVaultKey(passphrase, salt, iterations);

  const combined = new Uint8Array(base64ToBuffer(encryptedKeyBase64));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decryptedPkcs8 = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    vaultKey,
    ciphertext
  );

  return window.crypto.subtle.importKey(
    'pkcs8',
    decryptedPkcs8,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['unwrapKey']
  );
}

// 6. Generate random AES-256-GCM document encryption key
export async function generateDocumentAesKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable for RSA wrapping
    ['encrypt', 'decrypt']
  );
}

// 7. Encrypt file content with AES-256-GCM
export async function encryptFileBytes(
  fileBytes: ArrayBuffer,
  aesKey: CryptoKey
): Promise<{
  ciphertextWithIv: ArrayBuffer;
  hash: string;
}> {
  // 12-byte random IV
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    fileBytes
  );

  // Prepend IV to ciphertext (12 bytes IV + encrypted ciphertext with 16 bytes GCM tag)
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);

  const hash = await computeSha256(result.buffer);
  return {
    ciphertextWithIv: result.buffer,
    hash,
  };
}

// 8. Decrypt file content with AES-256-GCM
export async function decryptFileBytes(
  ciphertextWithIv: ArrayBuffer,
  aesKey: CryptoKey
): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(ciphertextWithIv);
  if (bytes.length < 28) {
    throw new Error('Ciphertext is too short to contain valid IV and tag');
  }

  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);

  return window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  );
}

// 9. Wrap AES document key using recipient's RSA-OAEP public key
export async function wrapDocumentKey(
  aesKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<string> {
  const wrapped = await window.crypto.subtle.wrapKey(
    'raw',
    aesKey,
    recipientPublicKey,
    { name: 'RSA-OAEP' }
  );
  return bufferToBase64(wrapped);
}

// 10. Unwrap AES document key using user's unlocked RSA-OAEP private key
export async function unwrapDocumentKey(
  wrappedKeyBase64: string,
  userPrivateKey: CryptoKey
): Promise<CryptoKey> {
  const wrappedBuffer = base64ToBuffer(wrappedKeyBase64);
  return window.crypto.subtle.unwrapKey(
    'raw',
    wrappedBuffer,
    userPrivateKey,
    { name: 'RSA-OAEP' },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}
