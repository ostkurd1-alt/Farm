import nodemailer from 'nodemailer';
import 'dotenv/config';

// إعداد النقل البريدي باستخدام متغيرات البيئة
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// التحقق من الاتصال
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP connection error:', error.message);
  } else {
    console.log('SMTP server ready');
  }
});

/**
 * إرسال بريد إلكتروني
 */
async function send(to, subject, text, html) {
  if (!to || !subject) {
    throw new Error('Email recipient and subject are required');
  }

  const mailOptions = {
    from: `"World of Farmcraft" <${process.env.SMTP_USER}>`,
    to: to,
    subject: subject,
    text: text,
    html: html
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
}

/**
 * إرسال بريد استعادة كلمة المرور
 */
async function passwordLost(email, token) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:1337';
  const resetUrl = `${baseUrl}/resetPassword?token=${token}`;

  const text = `Hello,

If you've recently lost your password, you can reset it by visiting:
${resetUrl}

If you did not request this, please ignore this email.

Best regards,
World of Farmcraft Team`;

  const html = `
    <p>Hello,</p>
    <p>If you've recently lost your password, you can <a href="${resetUrl}">reset it here</a>.</p>
    <p>If you did not request this, please ignore this email.</p>
    <br>
    <p>Best regards,<br>World of Farmcraft Team</p>
  `;

  await send(email, 'Password Recovery', text, html);
}

export { send, passwordLost };
export default { send, passwordLost };
