import mongoose, { Document, Schema } from 'mongoose';

/**
 * Clé de données (DEK) enveloppée par la clé maître (DATA_ENCRYPTION_KEY) : seule la version
 * chiffrée est stockée. `purpose` : `data` (chiffrement des champs) ou `index` (index aveugle).
 */
export interface IEncryptionKey extends Document {
  keyId: string;
  purpose: 'data' | 'index';
  /** base64url(iv | tag | clé chiffrée) — AES-256-GCM avec la clé maître, AAD = keyId:purpose. */
  wrappedKey: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EncryptionKeySchema = new Schema<IEncryptionKey>(
  {
    keyId: { type: String, required: true },
    purpose: { type: String, enum: ['data', 'index'], required: true },
    wrappedKey: { type: String, required: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

EncryptionKeySchema.index({ keyId: 1 }, { unique: true });

export const EncryptionKey = mongoose.model<IEncryptionKey>('EncryptionKey', EncryptionKeySchema);
