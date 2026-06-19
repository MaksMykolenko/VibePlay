import { OAuth2Client } from 'google-auth-library';
import type { ApiEnv } from '@vibeplay/config';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface GoogleOAuthService {
  authorizationUrl(state: string): string;
  authenticate(code: string): Promise<GoogleIdentity>;
}

export function createGoogleOAuthService(env: ApiEnv): GoogleOAuthService {
  const client = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );

  return {
    authorizationUrl(state) {
      return client.generateAuthUrl({
        state,
        scope: ['openid', 'email', 'profile'],
      });
    },

    async authenticate(code) {
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) throw new Error('Google token response did not include an ID token');

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email)
        throw new Error('Google ID token is missing identity claims');

      return {
        sub: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified === true,
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.picture ? { picture: payload.picture } : {}),
      };
    },
  };
}
