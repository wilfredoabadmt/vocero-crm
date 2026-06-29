import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'agent';
  theme: 'light' | 'dark' | 'system';
  is_trial: boolean;
  trial_expired: boolean;
  trial_expires_at: string | null;
};

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

import { isSubscriptionActive } from '../integrations/stripe.js';

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      theme: users.theme,
      isActive: users.isActive,
      isTrial: users.isTrial,
      trialExpiresAt: users.trialExpiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  const row = rows[0];
  if (!row || !row.isActive) return null;

  // Si la suscripción de Stripe está activa, consideramos que el trial vencido ya no bloquea
  const subscriptionActive = await isSubscriptionActive();
  const trialExpired = row.isTrial && !subscriptionActive && row.trialExpiresAt 
    ? new Date(row.trialExpiresAt).getTime() < Date.now() 
    : false;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    theme: row.theme,
    is_trial: row.isTrial,
    trial_expired: trialExpired,
    trial_expires_at: row.trialExpiresAt ? new Date(row.trialExpiresAt).toISOString() : null,
  };
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function destroyUserSessions(userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
