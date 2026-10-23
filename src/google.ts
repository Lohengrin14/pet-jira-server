import { OAuth2Client } from 'google-auth-library'
import { HttpError } from './errors'

// Что нам нужно из ID-токена Google
export type GoogleProfile = { googleId: string; email: string; name: string }
export type GoogleVerifier = (credential: string) => Promise<GoogleProfile>

// Проверяет подпись и срок токена и что он выдан для нашего Client ID
export function createGoogleVerifier(clientId: string): GoogleVerifier {
  const client = new OAuth2Client(clientId)
  return async (credential) => {
    let payload
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
      payload = ticket.getPayload()
    } catch {
      throw new HttpError(401, 'Google не подтвердил вход, попробуйте ещё раз')
    }
    if (!payload?.email || !payload.email_verified) throw new HttpError(401, 'У аккаунта Google нет подтверждённого email')
    return { googleId: payload.sub, email: payload.email.toLowerCase(), name: payload.name ?? payload.email }
  }
}
