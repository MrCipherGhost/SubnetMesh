import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export type ChannelPublic = { name: string; locked: boolean };

type Channel = {
  name: string;
  /** scrypt hash as salt:hex — empty string means open channel */
  passwordHash: string;
};

const NAME_RE = /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$|^[a-z0-9]{2}$/;
const MAX_CHANNELS = 40;

const channels = new Map<string, Channel>([
  ['general', { name: 'general', passwordHash: '' }],
  ['engineering', { name: 'engineering', passwordHash: '' }],
  ['random', { name: 'random', passwordHash: '' }],
]);

function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 32).toString('hex');
  try {
    return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function listChannels(): ChannelPublic[] {
  return [...channels.values()].map(c => ({ name: c.name, locked: Boolean(c.passwordHash) }));
}

export function hasChannel(name: string): boolean {
  return channels.has(name);
}

export function normalizeChannelName(raw: string): string | null {
  const name = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (!NAME_RE.test(name)) return null;
  return name;
}

export function createChannel(rawName: string, password?: string): { channel?: ChannelPublic; error?: string } {
  if (channels.size >= MAX_CHANNELS) return { error: `Channel limit reached (${MAX_CHANNELS}).` };
  const name = normalizeChannelName(rawName);
  if (!name) return { error: 'Use 2–24 letters, numbers, or hyphens.' };
  if (channels.has(name)) return { error: 'That channel already exists.' };
  const trimmed = typeof password === 'string' ? password.trim() : '';
  if (trimmed && (trimmed.length < 3 || trimmed.length > 64)) {
    return { error: 'Password must be 3–64 characters, or leave blank.' };
  }
  channels.set(name, {
    name,
    passwordHash: trimmed ? hashPassword(trimmed) : '',
  });
  return { channel: { name, locked: Boolean(trimmed) } };
}

export function canJoinChannel(name: string, password?: string): { ok: true } | { ok: false; error: string } {
  const channel = channels.get(name);
  if (!channel) return { ok: false, error: 'Channel not found.' };
  if (!channel.passwordHash) return { ok: true };
  const attempt = typeof password === 'string' ? password : '';
  if (!attempt || !verifyPassword(attempt, channel.passwordHash)) {
    return { ok: false, error: 'Incorrect channel password.' };
  }
  return { ok: true };
}
