import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../config.js';
import { escapeHtml } from './security.js';

export interface Mailer {
  /** false si no hay SMTP configurado: los enlaces solo se registran en el log. */
  enabled: boolean;
  sendResetEmail(to: string, link: string): Promise<void>;
  sendPartnerEmail(to: string, link: string, inviter: string): Promise<void>;
}

const button = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:#0FA968;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">${label}</a>`;

export function createMailer(smtp: SmtpConfig | null): Mailer {
  const transport = smtp
    ? nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      })
    : null;
  const from = smtp?.from || 'Core <no-reply@localhost>';

  return {
    enabled: !!transport,
    async sendResetEmail(to, link) {
      if (!transport) {
        console.warn('[core-cloud] SMTP no configurado. Enlace de recuperación (envíalo manualmente):', link);
        return;
      }
      const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2 style="color:#0FA968">Core</h2><p>Recibimos una solicitud para restablecer tu contraseña.</p><p>${button(link, 'Restablecer contraseña')}</p><p style="color:#667">Este enlace caduca en 30 minutos. Si no lo pediste, ignora este correo.</p></div>`;
      await transport.sendMail({ from, to, subject: 'Restablece tu contraseña de Core', text: `Restablece tu contraseña: ${link} (caduca en 30 min)`, html });
    },
    async sendPartnerEmail(to, link, inviter) {
      if (!transport) {
        console.warn('[core-cloud] SMTP no configurado. Enlace de invitación (envíalo manualmente):', link);
        return;
      }
      const who = escapeHtml(inviter || 'Alguien');
      const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2 style="color:#0FA968">Core</h2><p><b>${who}</b> te invita a mejorar hábitos juntos en Core.</p><p>${button(link, 'Aceptar invitación')}</p><p style="color:#667">Abre el enlace, entra con tu cuenta y quedarán vinculados automáticamente.</p></div>`;
      await transport.sendMail({ from, to, subject: `${inviter || 'Alguien'} te invitó a Core`, text: `${inviter || 'Alguien'} te invita a Core. Acepta: ${link}`, html });
    },
  };
}
