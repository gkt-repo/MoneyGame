import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../../config';

export class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    if (config.smtpHost && config.smtpUser && config.smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
      });
    }
  }

  /**
   * Send a 6-digit OTP to the user's recovery email
   */
  async sendPasswordResetOtp(toEmail: string, otp: string, username: string): Promise<boolean> {
    const subject = `Your MoneyGame Password Reset OTP: ${otp}`;
    const text = `Hello ${username},\n\nYour 6-digit password reset OTP is: ${otp}\n\nThis OTP is valid for 10 minutes. Do not share this code with anyone.\n\nMoneyGame Team`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #4f46e5; text-align: center; margin-bottom: 8px;">MoneyGame</h2>
        <h3 style="color: #1e293b; text-align: center; margin-top: 0;">Password Reset Request</h3>
        <p style="color: #475569; font-size: 15px;">Hello <strong>${username.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))}</strong>,</p>
        <p style="color: #475569; font-size: 15px;">We received a request to reset your MoneyGame account password. Use the verification code below to proceed:</p>
        <div style="text-align: center; margin: 28px 0;">
          <span style="display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #4f46e5; background: #f1f5f9; padding: 12px 28px; border-radius: 8px; border: 1px dashed #cbd5e1;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 13px;">This OTP will expire in <strong>10 minutes</strong>. If you did not request a password reset, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} MoneyGame. All rights reserved.</p>
      </div>
    `;

    if (!this.transporter) throw new Error('Password reset email is unavailable. Please contact support.');

    try {
      await this.transporter.sendMail({
        from: config.smtpFrom,
        to: toEmail,
        subject,
        text,
        html,
      });
      console.log(`✅ [EmailService] Password reset email sent successfully to ${toEmail}`);
      return true;
    } catch (err: any) {
      console.error(`❌ [EmailService] Error sending email to ${toEmail}:`, err.message);
      throw new Error('Unable to deliver the password reset email. Please try again later.');
    }
  }
}

export const emailService = new EmailService();
