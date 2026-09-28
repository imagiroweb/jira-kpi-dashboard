import type { Schema, SchemaTypeOptions } from 'mongoose';
import { decryptDeepInPlace, encryptJson, encryptString, isEncryptedValue, safeDecrypt } from './fieldEncryption';

/**
 * Intégration Mongoose du chiffrement de champs :
 *  - `encryptedString()` : chemin texte chiffré à l'écriture (affectation, create, $set) et
 *    déchiffré à la lecture d'un document (`doc.champ`) ;
 *  - `encryptedJson()` : même principe pour une valeur structurée (tableau, objet) ;
 *  - `decryptLeanResults` : déchiffre les résultats `.lean()` des requêtes du modèle ;
 *  - côté réponses HTTP, le « json replacer » d'Express déchiffre ce qui resterait chiffré.
 * Une valeur historique non chiffrée est lue telle quelle (migration progressive).
 */
export function encryptedString(options: { trim?: boolean; lowercase?: boolean } = {}): SchemaTypeOptions<string> {
  return {
    type: String,
    set(value: unknown) {
      if (value === null || value === undefined) return value;
      if (isEncryptedValue(value)) return value;
      let text = String(value);
      if (options.trim) text = text.trim();
      if (options.lowercase) text = text.toLowerCase();
      return text === '' ? '' : encryptString(text);
    },
    get(value: unknown) {
      return value === null || value === undefined ? value : safeDecrypt(value, '');
    }
  } as SchemaTypeOptions<string>;
}

export function encryptedJson<T>(): SchemaTypeOptions<unknown> {
  return {
    type: String,
    set(value: unknown) {
      if (value === null || value === undefined) return value;
      return encryptJson(value as T);
    },
    get(value: unknown) {
      return value === null || value === undefined ? value : safeDecrypt(value, null);
    }
  } as SchemaTypeOptions<unknown>;
}

const QUERY_HOOKS = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete'] as const;

/** Déchiffre les résultats `.lean()` (objets simples, sans getters Mongoose). */
export function decryptLeanResults(schema: Schema): void {
  for (const hook of QUERY_HOOKS) {
    schema.post(hook, function (this: { mongooseOptions?: () => { lean?: unknown } }, result: unknown) {
      const lean = this.mongooseOptions?.().lean;
      if (lean && result) decryptDeepInPlace(result);
    });
  }
}

/** Express `json replacer` : aucune valeur chiffrée ne sort telle quelle dans une réponse. */
export function decryptingJsonReplacer(_key: string, value: unknown): unknown {
  return isEncryptedValue(value) ? safeDecrypt(value, null) : value;
}
