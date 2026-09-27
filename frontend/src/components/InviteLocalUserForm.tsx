import { useState } from 'react';
import { Loader2, Mail, UserPlus, X } from 'lucide-react';
import { authApi, RoleDto } from '../services/authApi';

interface InviteLocalUserFormProps {
  roles: RoleDto[];
  onInvited: () => void;
  onClose: () => void;
}

/**
 * Création d'un compte local (email / mot de passe) par un administrateur : remplace l'inscription
 * libre. L'utilisateur reçoit un lien pour définir son mot de passe (valable 72 h).
 */
export function InviteLocalUserForm({ roles, onInvited, onClose }: InviteLocalUserFormProps) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    const result = await authApi.inviteLocalUser({
      email: email.trim(),
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      roleId: roleId || undefined
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error || 'Erreur lors de la création du compte');
      return;
    }
    setSuccess(
      result.emailSent
        ? `Invitation envoyée à ${email.trim()}.`
        : `Compte créé, mais l’email d’invitation n’a pas pu être envoyé (vérifiez la configuration SMTP).`
    );
    setEmail('');
    setFirstName('');
    setLastName('');
    setRoleId('');
    onInvited();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 p-4 rounded-xl border border-surface-700/50 bg-surface-900/50 space-y-3"
      aria-label="Inviter un compte local"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-300 font-medium flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary-400" />
          Inviter un compte local (hors SSO)
        </p>
        <button type="button" onClick={onClose} className="p-1 hover:bg-surface-700 rounded" aria-label="Fermer">
          <X className="w-4 h-4 text-surface-400" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@entreprise.com"
          className="input"
        />
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Prénom" className="input" />
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nom" className="input" />
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          aria-label="Rôle"
          className="bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-200"
        >
          <option value="">Rôle par défaut (Utilisateur)</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">{success}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={submitting || !email.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Envoyer l’invitation
        </button>
      </div>
    </form>
  );
}
