/**
 * TU — Intégration Mongoose : écriture chiffrée, lecture déchiffrée, résultats lean, réponses JSON
 */
import mongoose, { Schema } from 'mongoose';
import express from 'express';
import request from 'supertest';
import { decryptingJsonReplacer, decryptLeanResults, encryptedJson, encryptedString } from './mongooseEncryption';
import { encryptString, isEncryptedValue } from './fieldEncryption';

interface INote {
  text?: string | null;
}
interface ITest {
  title?: string;
  secret?: string | null;
  rates?: unknown;
  notes: INote[];
}
const NoteSchema = new Schema<INote>({ text: encryptedString({ trim: true }) }, { _id: false });
const TestSchema = new Schema<ITest>({
  title: String,
  secret: encryptedString({ trim: true, lowercase: true }),
  rates: encryptedJson(),
  notes: { type: [NoteSchema], default: [] }
});
decryptLeanResults(TestSchema);
const TestModel = mongoose.model<ITest>('EncryptionTestModel', TestSchema);

describe('mongooseEncryption', () => {
  it('stocke chiffré et relit en clair (texte, JSON, sous-documents)', () => {
    const doc = new TestModel({ title: 'T', secret: '  Jean@Adoria.COM ', rates: [{ rate: 42 }], notes: [{ text: ' note ' }] });
    const raw = doc.toObject({ getters: false });

    expect(isEncryptedValue(raw.secret)).toBe(true);
    expect(isEncryptedValue(raw.rates)).toBe(true);
    expect(isEncryptedValue(raw.notes[0].text)).toBe(true);
    expect(raw.title).toBe('T');

    expect(doc.secret).toBe('jean@adoria.com');
    expect(doc.rates).toEqual([{ rate: 42 }]);
    expect(doc.notes[0].text).toBe('note');
  });

  it('chiffre aussi les valeurs d’une mise à jour ($set)', () => {
    const q = TestModel.updateOne({}, { $set: { secret: 'x@y.fr', 'notes.0.text': 'maj' } });
    const cast = (q as unknown as { _castUpdate: (u: unknown) => Record<string, Record<string, unknown>> })._castUpdate(q.getUpdate());
    expect(isEncryptedValue(cast.$set.secret)).toBe(true);
    expect(isEncryptedValue(cast.$set['notes.0.text'])).toBe(true);
  });

  it('ne rechiffre pas une valeur déjà chiffrée, garde vide et null', () => {
    const enc = encryptString('déjà');
    const doc = new TestModel({ secret: enc, notes: [{ text: '' }] });
    expect(doc.toObject({ getters: false }).secret).toBe(enc);
    expect(doc.toObject({ getters: false }).notes[0].text).toBe('');
    expect(new TestModel({ secret: null }).toObject({ getters: false }).secret).toBeNull();
  });

  it('déchiffre les résultats lean via le hook post-find', () => {
    const hook = (TestSchema as unknown as { s: { hooks: { _posts: Map<string, Array<{ fn: (this: unknown, r: unknown) => void }>> } } })
      .s.hooks._posts.get('find')!;
    const result = [{ secret: encryptString('lean@adoria.com'), notes: [{ text: encryptString('n') }] }];
    hook.forEach((h) => h.fn.call({ mongooseOptions: () => ({ lean: true }) }, result));
    expect(result).toEqual([{ secret: 'lean@adoria.com', notes: [{ text: 'n' }] }]);
  });

  it('aucune valeur chiffrée ne sort dans une réponse HTTP (json replacer)', async () => {
    const app = express();
    app.set('json replacer', decryptingJsonReplacer);
    app.get('/x', (_req, res) => res.json({ doc: new TestModel({ secret: 'a@b.fr', rates: [{ rate: 1 }] }).toObject({ getters: false }) }));

    const res = await request(app).get('/x');

    expect(res.body.doc.secret).toBe('a@b.fr');
    expect(res.body.doc.rates).toEqual([{ rate: 1 }]);
    expect(res.text).not.toContain('enc:v1');
  });
});
