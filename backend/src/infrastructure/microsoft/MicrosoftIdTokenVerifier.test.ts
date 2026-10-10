/**
 * TU — Validation des id_token Microsoft (signature, audience, émetteur, tenant, nonce, expiration)
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { MicrosoftIdTokenVerifier, MicrosoftTokenError } from './MicrosoftIdTokenVerifier';

const CLIENT_ID = 'app-client-id';
const TENANT = '8f2c1d3e-1234-4abc-9def-0123456789ab';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as { n: string; e: string; kty: string }), kid: 'k1' };

function sign(payload: Record<string, unknown>, opts: { kid?: string; key?: crypto.KeyObject; expiresIn?: number } = {}) {
  return jwt.sign(
    {
      aud: CLIENT_ID,
      iss: `https://login.microsoftonline.com/${TENANT}/v2.0`,
      tid: TENANT,
      oid: 'oid-123',
      nonce: 'nonce-1',
      preferred_username: 'Jean.Dupont@Adoria.com',
      name: 'Jean Dupont',
      ...payload
    },
    opts.key ?? privateKey,
    { algorithm: 'RS256', keyid: opts.kid ?? 'k1', expiresIn: opts.expiresIn ?? 600 }
  );
}

function makeVerifier(keys = [jwk]) {
  const fetchJwks = jest.fn().mockResolvedValue(keys);
  return { verifier: new MicrosoftIdTokenVerifier(fetchJwks), fetchJwks };
}

describe('MicrosoftIdTokenVerifier', () => {
  it('accepte un jeton valide et extrait l’identité', async () => {
    const { verifier } = makeVerifier();

    const identity = await verifier.verify(sign({}), { clientId: CLIENT_ID, nonce: 'nonce-1' });

    expect(identity).toEqual({
      tenantId: TENANT,
      objectId: 'oid-123',
      email: 'jean.dupont@adoria.com',
      firstName: 'Jean',
      lastName: 'Dupont'
    });
  });

  it('préfère le claim email et given_name/family_name quand ils existent', async () => {
    const { verifier } = makeVerifier();
    const token = sign({ email: 'jd@adoria.com', given_name: 'J', family_name: 'D' });

    const identity = await verifier.verify(token, { clientId: CLIENT_ID, nonce: 'nonce-1' });

    expect(identity).toEqual(expect.objectContaining({ email: 'jd@adoria.com', firstName: 'J', lastName: 'D' }));
  });

  it('rejette un jeton émis pour une autre application (audience)', async () => {
    const { verifier } = makeVerifier();
    await expect(verifier.verify(sign({ aud: 'autre-app' }), { clientId: CLIENT_ID, nonce: 'nonce-1' })).rejects.toThrow(
      MicrosoftTokenError
    );
  });

  it('rejette un émetteur incohérent avec le tenant', async () => {
    const { verifier } = makeVerifier();
    const token = sign({ iss: 'https://login.microsoftonline.com/00000000-0000-4000-8000-000000000000/v2.0' });
    await expect(verifier.verify(token, { clientId: CLIENT_ID, nonce: 'nonce-1' })).rejects.toThrow(/Émetteur/);
  });

  it('rejette un tenant absent ou non GUID', async () => {
    const { verifier } = makeVerifier();
    const token = sign({ tid: 'common', iss: 'https://login.microsoftonline.com/common/v2.0' });
    await expect(verifier.verify(token, { clientId: CLIENT_ID, nonce: 'nonce-1' })).rejects.toThrow(/Tenant/);
  });

  it('rejette un nonce différent (rejeu)', async () => {
    const { verifier } = makeVerifier();
    await expect(verifier.verify(sign({}), { clientId: CLIENT_ID, nonce: 'autre' })).rejects.toThrow(/Nonce/);
  });

  it('rejette un jeton expiré', async () => {
    const { verifier } = makeVerifier();
    const token = sign({}, { expiresIn: -3600 });
    await expect(verifier.verify(token, { clientId: CLIENT_ID, nonce: 'nonce-1' })).rejects.toThrow(/expired/);
  });

  it('rejette un jeton signé par une autre clé', async () => {
    const { verifier } = makeVerifier();
    const token = sign({}, { key: otherKeys.privateKey });
    await expect(verifier.verify(token, { clientId: CLIENT_ID, nonce: 'nonce-1' })).rejects.toThrow(/invalide/);
  });

  it('rejette un jeton non RS256 (ex. HS256 signé avec la clé publique)', async () => {
    const { verifier } = makeVerifier();
    const token = jwt.sign({ aud: CLIENT_ID, tid: TENANT, oid: 'x' }, 'secret', { algorithm: 'HS256', keyid: 'k1' });
    await expect(verifier.verify(token, { clientId: CLIENT_ID, nonce: 'nonce-1' })).rejects.toThrow(/Algorithme/);
  });

  it('rejette un jeton illisible', async () => {
    const { verifier } = makeVerifier();
    await expect(verifier.verify('pas.un.jwt', { clientId: CLIENT_ID })).rejects.toThrow(MicrosoftTokenError);
  });

  it('exige un Client ID configuré', async () => {
    const { verifier } = makeVerifier();
    await expect(verifier.verify(sign({}), { clientId: '' })).rejects.toThrow(/MICROSOFT_CLIENT_ID/);
  });

  it('rejette un jeton sans oid', async () => {
    const { verifier } = makeVerifier();
    await expect(verifier.verify(sign({ oid: undefined }), { clientId: CLIENT_ID, nonce: 'nonce-1' })).rejects.toThrow(/oid/);
  });

  it('met en cache les clés et recharge une seule fois sur un kid inconnu', async () => {
    const { verifier, fetchJwks } = makeVerifier();
    await verifier.verify(sign({}), { clientId: CLIENT_ID, nonce: 'nonce-1' });
    await verifier.verify(sign({}), { clientId: CLIENT_ID, nonce: 'nonce-1' });
    expect(fetchJwks).toHaveBeenCalledTimes(1);

    await expect(verifier.verify(sign({}, { kid: 'inconnu' }), { clientId: CLIENT_ID, nonce: 'nonce-1' })).rejects.toThrow(
      /Clé de signature/
    );
    // Rechargement forcé limité (1 par minute) : pas d'appel supplémentaire juste après le premier chargement
    expect(fetchJwks).toHaveBeenCalledTimes(1);
  });

  it('recharge les clés quand Microsoft effectue une rotation', async () => {
    let now = 1_000_000;
    const newKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const newJwk = { ...(newKeys.publicKey.export({ format: 'jwk' }) as { n: string; e: string; kty: string }), kid: 'k2' };
    const fetchJwks = jest.fn().mockResolvedValueOnce([jwk]).mockResolvedValueOnce([jwk, newJwk]);
    const verifier = new MicrosoftIdTokenVerifier(fetchJwks, () => now);

    await verifier.verify(sign({}), { clientId: CLIENT_ID, nonce: 'nonce-1' });
    now += 5 * 60 * 1000;
    const token = jwt.sign(
      { aud: CLIENT_ID, iss: `https://login.microsoftonline.com/${TENANT}/v2.0`, tid: TENANT, oid: 'o', nonce: 'nonce-1', exp: Math.floor(now / 1000) + 600 },
      newKeys.privateKey,
      { algorithm: 'RS256', keyid: 'k2' }
    );

    await expect(verifier.verify(token, { clientId: CLIENT_ID, nonce: 'nonce-1' })).resolves.toEqual(
      expect.objectContaining({ objectId: 'o' })
    );
    expect(fetchJwks).toHaveBeenCalledTimes(2);
  });
});
