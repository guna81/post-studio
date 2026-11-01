// Local accounts: scrypt password hashes, signed session cookies. No dependencies.
import { scrypt, randomBytes, randomUUID, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { readUsers, writeUsers, secret } from './store.mjs';

const scryptP = promisify(scrypt);
const COOKIE = 'ps_session';
const TTL = 14 * 24 * 3600; // seconds
const hashPw = async (pw, salt) => (await scryptP(pw, salt, 64)).toString('hex');
const sign = (v) => createHmac('sha256', secret()).update(v).digest('base64url');
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const DUMMY_SALT = randomBytes(16).toString('hex');

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });
const normEmail = (e) => String(e ?? '').trim().toLowerCase();

export async function signup({ email, name, password }) {
  email = normEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) throw new Error('Enter a valid email address');
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw new Error('Password must be 8 to 200 characters');
  const users = readUsers();
  if (process.env.POST_STUDIO_SIGNUP === 'off' && users.length > 0) throw new Error('Signup is closed on this server');
  if (users.some((u) => u.email === email)) throw new Error('An account with that email already exists');
  const salt = randomBytes(16).toString('hex');
  const u = { id: randomUUID(), email, name: String(name || email.split('@')[0]).trim().slice(0, 60), salt, hash: await hashPw(password, salt), createdAt: new Date().toISOString() };
  users.push(u);
  writeUsers(users);
  return u;
}

export async function login({ email, password }) {
  const u = readUsers().find((x) => x.email === normEmail(email));
  const given = await hashPw(String(password ?? ''), u?.salt || DUMMY_SALT); // same work whether or not the user exists
  if (!u || !same(given, u.hash)) throw new Error('Wrong email or password');
  return u;
}

// Profile edits. Changing email or password needs the current password; a password change
// invalidates other sessions because the cookie signature covers part of the password hash.
export async function updateProfile(user, { name, email, currentPassword, newPassword }) {
  const users = readUsers();
  const u = users.find((x) => x.id === user.id);
  if (!u) throw new Error('Account not found');
  const newName = String(name ?? u.name).trim();
  if (!newName || newName.length > 60) throw new Error('Name must be 1 to 60 characters');
  const newEmail = email === undefined ? u.email : normEmail(email);
  const emailChanged = newEmail !== u.email, pwChanged = Boolean(newPassword);
  if (emailChanged || pwChanged) {
    const given = await hashPw(String(currentPassword ?? ''), u.salt);
    if (!same(given, u.hash)) throw Object.assign(new Error('Current password is wrong'), { status: 401 });
  }
  if (emailChanged) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail) || newEmail.length > 120) throw new Error('Enter a valid email address');
    if (users.some((x) => x.email === newEmail)) throw new Error('An account with that email already exists');
    u.email = newEmail;
  }
  if (pwChanged) {
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) throw new Error('New password must be 8 to 200 characters');
    u.salt = randomBytes(16).toString('hex');
    u.hash = await hashPw(newPassword, u.salt);
  }
  u.name = newName;
  writeUsers(users);
  return u;
}

export function sessionCookie(user) {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const v = `${user.id}.${exp}`;
  return `${COOKIE}=${v}.${sign(v + '.' + user.hash.slice(0, 8))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL}`;
}
export const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;

// Returns the user for a request, or null.
export function userFrom(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const parts = raw.slice(COOKIE.length + 1).split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  if (Number(exp) < Date.now() / 1000) return null;
  const u = readUsers().find((x) => x.id === id);
  return u && same(sig, sign(`${id}.${exp}.${u.hash.slice(0, 8)}`)) ? u : null;
}

// Tiny in-memory limiter for login/signup: max N attempts per minute per address.
const hits = new Map();
export function rateLimited(key, max = 10) {
  const now = Date.now(), list = (hits.get(key) || []).filter((t) => now - t < 60000);
  list.push(now); hits.set(key, list);
  return list.length > max;
}
