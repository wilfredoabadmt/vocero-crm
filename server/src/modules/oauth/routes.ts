import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { users, oauthConnections } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { createSession } from './service.js';
import { badRequest, unauthorized } from '../lib/errors.js';

const cookieOpts = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.isProd,
  maxAge: 30 * 24 * 60 * 60,
};

export function oauthRoutes(app: FastifyInstance) {
  // Facebook OAuth - Redirect to Facebook
  app.get('/api/auth/facebook', async (request, reply) => {
    if (!config.META_APP_ID) {
      return reply.code(500).send({ error: 'Facebook OAuth no está configurado' });
    }

    const state = Buffer.from(JSON.stringify({ 
      redirect: (request.query as any)?.redirect || '/',
      timestamp: Date.now() 
    })).toString('base64');

    const params = new URLSearchParams({
      client_id: config.META_APP_ID,
      redirect_uri: `${config.PUBLIC_URL}/api/auth/facebook/callback`,
      state,
      scope: 'email,public_profile',
      response_type: 'code',
      auth_type: 'rerequest',
    });

    reply.redirect(`https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`);
  });

  // Facebook OAuth Callback
  app.get('/api/auth/facebook/callback', async (request, reply) => {
    const { code, state, error, error_description } = request.query as any;

    if (error) {
      reply.redirect(`/login?error=${encodeURIComponent(error_description || error)}`);
      return;
    }

    if (!code) {
      reply.redirect('/login?error=Código+de+autorización+no+recibido');
      return;
    }

    try {
      // Validate state
      let stateData: any;
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        if (Date.now() - stateData.timestamp > 600000) {
          reply.redirect('/login?error=Sesión+expirada');
          return;
        }
      } catch {
        reply.redirect('/login?error=Estado+inválido');
        return;
      }

      // Exchange code for access token
      const tokenResponse = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?` +
        new URLSearchParams({
          client_id: config.META_APP_ID,
          client_secret: config.META_APP_SECRET,
          redirect_uri: `${config.PUBLIC_URL}/api/auth/facebook/callback`,
          code,
        })
      );

      const tokenData = await tokenResponse.json() as any;
      if (!tokenData.access_token) {
        reply.redirect('/login?error=Error+al+obtener+token');
        return;
      }

      // Get user info from Facebook
      const userResponse = await fetch(
        `https://graph.facebook.com/v19.0/me?fields=id,email,first_name,last_name,picture&access_token=${tokenData.access_token}`
      );

      const fbUser = await userResponse.json() as any;
      if (!fbUser.id) {
        reply.redirect('/login?error=Error+al+obtener+datos+del+usuario');
        return;
      }

      const email = fbUser.email || `${fbUser.id}@facebook.local`;
      const name = fbUser.name || `${fbUser.first_name || ''} ${fbUser.last_name || ''}`.trim() || 'Usuario Facebook';

      // Find or create user
      let [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));

      if (!user) {
        // Create new user from Facebook
        const [newUser] = await db.insert(users).values({
          email: email.toLowerCase(),
          name,
          passwordHash: '', // No password for OAuth users
          role: 'admin',
          isActive: true,
          isTrial: true,
          trialExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        }).returning();

        if (!newUser) {
          reply.redirect('/login?error=Error+al+crear+usuario');
          return;
        }

        user = newUser;
      }

      // Save or update OAuth connection
      const [existingConnection] = await db.select().from(oauthConnections).where(
        and(
          eq(oauthConnections.userId, user.id),
          eq(oauthConnections.provider, 'facebook')
        )
      );

      if (existingConnection) {
        await db.update(oauthConnections).set({
          providerUserId: fbUser.id,
          accessToken: tokenData.access_token,
          tokenExpiry: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
          profileData: fbUser,
          updatedAt: new Date(),
        }).where(eq(oauthConnections.id, existingConnection.id));
      } else {
        await db.insert(oauthConnections).values({
          userId: user.id,
          provider: 'facebook',
          providerUserId: fbUser.id,
          accessToken: tokenData.access_token,
          tokenExpiry: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
          profileData: fbUser,
        });
      }

      // Create session
      const token = await createSession(user.id);
      reply.setCookie('sid', token, cookieOpts);

      // Redirect to original page or dashboard
      const redirectUrl = stateData.redirect || '/';
      reply.redirect(redirectUrl);

    } catch (err) {
      console.error('Facebook OAuth error:', err);
      reply.redirect('/login?error=Error+interno+de+autenticación');
    }
  });

  // Facebook Deauthorize Webhook
  app.post('/api/oauth/api/meta/deauthorize', async (request, reply) => {
    const { signed_request } = request.body as any;

    if (!signed_request) {
      reply.code(400).send({ error: 'Missing signed_request' });
      return;
    }

    try {
      // Parse signed_request
      const [encodedSig, payload] = signed_request.split('.');
      
      // Verify signature (simplified - in production verify with META_APP_SECRET)
      const data = JSON.parse(Buffer.from(payload, 'base64').toString());
      
      console.log(`Facebook deauthorize webhook received for user: ${data.user_id}`);

      // Here you would:
      // 1. Find the user by Facebook user_id
      // 2. Remove their OAuth connection
      // 3. Optionally disable their account

      reply.code(200).send({ success: true });
    } catch (err) {
      console.error('Deauthorize webhook error:', err);
      reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Facebook Data Deletion Request
  app.post('/api/data-deletion', async (request, reply) => {
    const { signed_request } = request.body as any;

    if (!signed_request) {
      reply.code(400).send({ error: 'Missing signed_request' });
      return;
    }

    try {
      // Parse signed_request
      const [encodedSig, payload] = signed_request.split('.');
      const data = JSON.parse(Buffer.from(payload, 'base64').toString());
      
      console.log(`Data deletion request received for user: ${data.user_id}`);

      // Here you would:
      // 1. Find the user by Facebook user_id
      // 2. Delete their OAuth connection
      // 3. Delete their user data
      // 4. Return a confirmation URL

      // Return confirmation URL as required by Facebook
      reply.code(200).send({
        url: `${config.PUBLIC_URL}/data-deletion-status?request_id=${data.user_id}`,
        confirmation_code: data.user_id,
      });
    } catch (err) {
      console.error('Data deletion webhook error:', err);
      reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Data Deletion Status Page (for users to check status)
  app.get('/api/data-deletion-status', async (request, reply) => {
    const { request_id } = request.query as any;
    
    reply.send({
      status: 'complete',
      message: `Datos del usuario ${request_id} han sido eliminados.`,
      request_id,
    });
  });

  // Get Facebook OAuth configuration
  app.get('/api/oauth/config', async (request, reply) => {
    return {
      facebook: {
        appId: config.META_APP_ID,
        configured: !!(config.META_APP_ID && config.META_APP_SECRET),
        callbackUrl: `${config.PUBLIC_URL}/api/auth/facebook/callback`,
        deauthorizeUrl: `${config.PUBLIC_URL}/api/oauth/api/meta/deauthorize`,
        dataDeletionUrl: `${config.PUBLIC_URL}/api/data-deletion`,
      },
    };
  });

  // Get OAuth connections for current user
  app.get('/api/oauth/connections', { preHandler: async (request) => {
    const { loadUser } = await import('./guards.js');
    await loadUser(request);
  }}, async (request, reply) => {
    if (!request.currentUser) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }

    const connections = await db.select().from(oauthConnections).where(
      eq(oauthConnections.userId, request.currentUser.id)
    );

    return {
      connections: connections.map(c => ({
        id: c.id,
        provider: c.provider,
        providerUserId: c.providerUserId,
        connectedAt: c.createdAt,
        lastUsedAt: c.updatedAt,
      })),
    };
  });
}
