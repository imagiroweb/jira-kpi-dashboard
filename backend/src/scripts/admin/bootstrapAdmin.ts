import { User } from '../../domain/user/entities/User';
import { Organization } from '../../domain/organization/entities/Organization';
import { parseArgs, runWithMongo } from './cli';

/**
 * Amorçage d'un administrateur, en remplacement de l'email super admin codé en dur.
 * À exécuter sur le serveur (accès à MONGODB_URI) après une première connexion SSO de la personne
 * (le compte doit exister), par exemple sur une base neuve ou une nouvelle organisation.
 *
 * Usage :
 *   yarn admin:bootstrap --email prenom.nom@entreprise.com            # super admin de son organisation
 *   yarn admin:bootstrap --email ... --platform-admin                  # + administrateur de la plateforme
 *   yarn admin:bootstrap --email ... --revoke                          # retire ces droits
 *   (en production : node dist/scripts/admin/bootstrapAdmin.js …)
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
  if (!email) throw new Error('--email requis');

  const user = await User.findOne({ email });
  if (!user) {
    throw new Error(`Aucun compte pour ${email} : la personne doit d'abord se connecter (SSO) ou être invitée.`);
  }

  if (args.revoke === true) {
    await User.updateOne({ _id: user._id }, { $unset: { role: 1 }, $set: { isPlatformAdmin: false } });
    console.log(`Droits d'administration retirés pour ${email} (pensez à lui attribuer un rôle).`);
    return;
  }

  const update: Record<string, unknown> = { role: 'super_admin', roleId: null };
  if (args['platform-admin'] === true) update.isPlatformAdmin = true;
  await User.updateOne({ _id: user._id }, { $set: update });

  const org = user.organizationId ? await Organization.findById(user.organizationId).select('slug').lean() : null;
  console.log(
    `${email} est super admin de l'organisation ${org?.slug ?? '(aucune)'}` +
      (update.isPlatformAdmin ? ' et administrateur de la plateforme.' : '.')
  );
}

void runWithMongo(main);
