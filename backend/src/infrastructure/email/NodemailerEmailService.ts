import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../../utils/logger';

export class NodemailerEmailService {
  private transporter: Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === 'true'; // true pour port 465

    if (!host || !user || !pass) {
      logger.warn('SMTP non configuré (SMTP_HOST, SMTP_USER, SMTP_PASS manquants) — les emails de réinitialisation ne seront pas envoyés');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        // Accepter les certificats auto-signés en développement
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    });
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendPasswordResetEmail(
    to: { email: string; firstName?: string },
    resetUrl: string
  ): Promise<boolean> {
    if (!this.transporter) {
      if (process.env.NODE_ENV !== 'production') {
        // En développement, afficher le lien dans les logs pour pouvoir tester sans SMTP
        logger.warn('======================================================');
        logger.warn('SMTP non configuré — MODE DÉVELOPPEMENT');
        logger.warn(`Lien de réinitialisation pour ${to.email} :`);
        logger.warn(resetUrl);
        logger.warn('======================================================');
        return true;
      }
      logger.error('SMTP non configuré en production — impossible d\'envoyer l\'email de réinitialisation');
      return false;
    }

    const fromName = process.env.EMAIL_FROM_NAME || 'Jira KPI Dashboard';
    // EMAIL_FROM : adresse expéditeur vérifiée (ex. noreply@domaine). Sur Scaleway TEM, SMTP_USER est souvent l’ID projet, pas une adresse.
    const fromAddress = (process.env.EMAIL_FROM || process.env.SMTP_USER || '').trim();
    const recipientName = to.firstName || 'Utilisateur';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Réinitialisation de votre mot de passe</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
          <tr>
            <td style="background:linear-gradient(135deg,#06b6d4,#6366f1);padding:32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.8);letter-spacing:2px;text-transform:uppercase;">${fromName}</p>
              <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">Réinitialisation du mot de passe</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;color:#94a3b8;font-size:15px;">Bonjour <strong style="color:#e2e8f0;">${recipientName}</strong>,</p>
              <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;">
                Nous avons reçu une demande de réinitialisation du mot de passe de votre compte.<br/>
                Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${resetUrl}" target="_blank"
                      style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#6366f1);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">
                      Réinitialiser mon mot de passe
                    </a>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;border-radius:8px;border:1px solid #334155;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Informations de sécurité</p>
                    <ul style="margin:0;padding:0 0 0 16px;color:#64748b;font-size:13px;line-height:1.8;">
                      <li>Ce lien est valide <strong>1 heure</strong> uniquement.</li>
                      <li>Il ne peut être utilisé <strong>qu'une seule fois</strong>.</li>
                      <li>Si vous n'avez pas fait cette demande, ignorez cet email — votre mot de passe reste inchangé.</li>
                    </ul>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#475569;font-size:12px;line-height:1.5;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
                <a href="${resetUrl}" style="color:#06b6d4;word-break:break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #334155;text-align:center;">
              <p style="margin:0;color:#475569;font-size:12px;">
                Cet email est envoyé automatiquement — merci de ne pas y répondre.<br/>
                Conformément au RGPD, vos données ne sont pas partagées avec des tiers.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Bonjour ${recipientName},

Nous avons reçu une demande de réinitialisation du mot de passe de votre compte ${fromName}.

Pour définir un nouveau mot de passe, rendez-vous sur :
${resetUrl}

Ce lien est valide pendant 1 heure et ne peut être utilisé qu'une seule fois.

Si vous n'avez pas fait cette demande, ignorez cet email — votre mot de passe reste inchangé.

---
${fromName} — email automatique, merci de ne pas répondre.
Conformément au RGPD, vos données ne sont pas partagées avec des tiers.`;

    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: to.email,
        subject: `Réinitialisation de votre mot de passe — ${fromName}`,
        html,
        text
      });
      logger.info(`Email de réinitialisation envoyé à : ${to.email}`);
      return true;
    } catch (error) {
      logger.error('Échec envoi email SMTP:', error);
      return false;
    }
  }

  /** Teste la connexion SMTP au démarrage (optionnel, non bloquant) */
  async verify(): Promise<void> {
    if (!this.transporter) return;
    try {
      await this.transporter.verify();
      logger.info('Connexion SMTP vérifiée avec succès');
    } catch (error) {
      logger.warn('Connexion SMTP échouée — vérifiez SMTP_HOST / SMTP_USER / SMTP_PASS :', error);
    }
  }
}

export const emailService = new NodemailerEmailService();
