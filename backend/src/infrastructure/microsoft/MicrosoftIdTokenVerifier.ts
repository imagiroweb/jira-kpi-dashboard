import crypto from 'crypto';
import jwt, { JwtHeader, JwtPayload } from 'jsonwebtoken';
import { isTenantId } from '../../domain/organization/entities/Organization';

/**
 * Validation d'un id_token Microsoft Entra ID (OpenID Connect, endpoint v2.0).
 *
 * Remplace l'ancien contrôle « le jeton passe graph.microsoft.com/me », qui acceptait
 * n'importe quel compte Microsoft (compte perso, autre entreprise) et même un jeton émis
 * pour une autre application. Ici on vérifie :
 *  - la signature (clés publiques Microsoft, JWKS mis en cache) et l'algorithme RS256 ;
 *  - l'audience = notre Client ID ;
 *  - l'émetteur = https://login.microsoftonline.com/{tid}/v2.0, avec `tid` un GUID ;
 *  - l'expiration, et le `nonce` fourni par le navigateur (anti-rejeu).
 * Le choix des tenants autorisés (liste blanche) se fait ensuite via les organisations.
 */

export const MICROSOFT_JWKS_URL = 'https://login.microsoftonline.com/common/discovery/v2.0/keys';
/** Tenant des comptes Microsoft personnels (outlook.com, hotmail…) — jamais une organisation. */
export const MICROSOFT_CONSUMER_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';

export interface MicrosoftIdentity {
  tenantId: string;
  /** Identifiant immuable de l'utilisateur dans son tenant (claim `oid`). */
  objectId: string;
  email: string | null;
  firstName?: string;
  lastName?: string;
}

export class MicrosoftTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MicrosoftTokenError';
  }
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  use?: string;
}

type FetchJwks = () => Promise<Jwk[]>;

const JWKS_CACHE_MS = 12 * 60 * 60 * 1000;
/** Délai minimal entre deux rechargements forcés (kid inconnu) — évite d'amplifier des requêtes. */
const JWKS_MIN_REFRESH_MS = 60 * 1000;

const defaultFetchJwks: FetchJwks = async () => {
  const res = await fetch(MICROSOFT_JWKS_URL);
  if (!res.ok) throw new Error(`JWKS Microsoft indisponible (${res.status})`);
  const body = (await res.json()) as { keys?: Jwk[] };
  return body.keys ?? [];
};

function splitName(name: unknown): { firstName?: string; lastName?: string } {
  if (typeof name !== 'string' || !name.trim()) return {};
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export class MicrosoftIdTokenVerifier {
  private keys = new Map<string, crypto.KeyObject>();
  private fetchedAt = 0;

  constructor(
    private readonly fetchJwks: FetchJwks = defaultFetchJwks,
    private readonly now: () => number = Date.now
  ) {}

  private async loadKeys(force: boolean): Promise<void> {
    const age = this.now() - this.fetchedAt;
    if (!force && this.keys.size > 0 && age < JWKS_CACHE_MS) return;
    if (force && this.fetchedAt > 0 && age < JWKS_MIN_REFRESH_MS) return;
    const jwks = await this.fetchJwks();
    const next = new Map<string, crypto.KeyObject>();
    for (const jwk of jwks) {
      if (jwk.kty !== 'RSA' || !jwk.kid) continue;
      next.set(jwk.kid, crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' }));
    }
    this.keys = next;
    this.fetchedAt = this.now();
  }

  private async getKey(kid: string): Promise<crypto.KeyObject> {
    await this.loadKeys(false);
    let key = this.keys.get(kid);
    if (!key) {
      await this.loadKeys(true);
      key = this.keys.get(kid);
    }
    if (!key) throw new MicrosoftTokenError('Clé de signature Microsoft inconnue');
    return key;
  }

  async verify(idToken: string, options: { clientId: string; nonce?: string }): Promise<MicrosoftIdentity> {
    if (!options.clientId) throw new MicrosoftTokenError('MICROSOFT_CLIENT_ID non configuré');

    const decoded = jwt.decode(idToken, { complete: true }) as { header: JwtHeader; payload: JwtPayload } | null;
    if (!decoded || typeof decoded.payload !== 'object') throw new MicrosoftTokenError('Jeton Microsoft illisible');
    if (decoded.header.alg !== 'RS256' || !decoded.header.kid) {
      throw new MicrosoftTokenError('Algorithme de signature non accepté');
    }

    const key = await this.getKey(decoded.header.kid);
    let claims: JwtPayload;
    try {
      claims = jwt.verify(idToken, key, {
        algorithms: ['RS256'],
        audience: options.clientId,
        clockTolerance: 60,
        clockTimestamp: Math.floor(this.now() / 1000)
      }) as JwtPayload;
    } catch (error) {
      throw new MicrosoftTokenError(`Jeton Microsoft invalide : ${(error as Error).message}`);
    }

    const tenantId = str(claims.tid)?.toLowerCase();
    if (!tenantId || !isTenantId(tenantId)) throw new MicrosoftTokenError('Tenant Microsoft absent ou invalide');
    if (claims.iss !== `https://login.microsoftonline.com/${tenantId}/v2.0`) {
      throw new MicrosoftTokenError('Émetteur du jeton Microsoft invalide');
    }
    if (options.nonce !== undefined && claims.nonce !== options.nonce) {
      throw new MicrosoftTokenError('Nonce invalide (rejeu possible)');
    }
    const objectId = str(claims.oid);
    if (!objectId) throw new MicrosoftTokenError('Identifiant utilisateur (oid) absent');

    const email = (str(claims.email) ?? str(claims.preferred_username))?.toLowerCase() ?? null;
    const fromName = splitName(claims.name);
    return {
      tenantId,
      objectId,
      email: email && email.includes('@') ? email : null,
      firstName: str(claims.given_name) ?? fromName.firstName,
      lastName: str(claims.family_name) ?? fromName.lastName
    };
  }
}

export const microsoftIdTokenVerifier = new MicrosoftIdTokenVerifier();
