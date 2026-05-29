import * as bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

/**
 * Generate a secure random string for JWT secrets
 * @returns Base64 encoded 256-bit secret
 */
export function generateJWTSecret(): string {
  const buffer = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...buffer));
}

/**
 * Generate a secure session token
 * @returns Random session token
 */
export function generateSessionToken(): string {
  return nanoid(64);
}

/**
 * Generate a secure refresh token
 * @returns Random refresh token
 */
export function generateRefreshToken(): string {
  return nanoid(64);
}

/**
 * Hash a password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against a hash
 * @param password - Plain text password
 * @param hash - Bcrypt hash
 * @returns True if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hash a token for storage (using SHA-256)
 * @param token - Token to hash
 * @returns Hex encoded hash
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Simple encryption for OAuth secrets (AES-GCM)
 * Note: In production, use Cloudflare's encryption API or KV with encryption
 * @param text - Text to encrypt
 * @param key - Encryption key
 * @returns Encrypted text (base64)
 */
export async function encrypt(text: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  // Derive key from string
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key.padEnd(32, '0').substring(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    data
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt encrypted text
 * @param encryptedText - Encrypted text (base64)
 * @param key - Encryption key
 * @returns Decrypted text
 */
export async function decrypt(encryptedText: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Decode base64
  const combined = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));

  // Extract IV and encrypted data
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  // Derive key from string
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key.padEnd(32, '0').substring(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    data
  );

  return decoder.decode(decrypted);
}

/**
 * Generate a unique ID using nanoid
 * @returns Unique ID
 */
export function generateId(): string {
  return nanoid();
}