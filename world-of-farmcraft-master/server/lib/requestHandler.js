import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import validator from 'validator';
import { query } from './db.js';
import mail from './mail.js';
import settings from './settings.js';
import map from './map.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SALT_ROUNDS = 12;
const RECOVERY_TOKEN_BYTES = 32;

// حماية من Brute Force - تتبع محاولات تسجيل الدخول
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 دقيقة

function isLockedOut(email) {
  const attempts = loginAttempts.get(email);
  if (!attempts) return false;

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    const timePassed = Date.now() - attempts.lastAttempt;
    if (timePassed < LOCKOUT_TIME) {
      return true;
    }
    loginAttempts.delete(email);
  }
  return false;
}

function recordAttempt(email) {
  const attempts = loginAttempts.get(email) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  loginAttempts.set(email, attempts);
}

function clearAttempts(email) {
  loginAttempts.delete(email);
}

/**
 * التحقق من صحة البريد الإلكتروني
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return validator.isEmail(email) && email.length <= 100;
}

/**
 * التحقق من قوة كلمة المرور
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 6 && password.length <= 100;
}

/**
 * التحقق من صحة التوكن
 */
function validateToken(token) {
  if (!token || typeof token !== 'string') return false;
  return /^[a-f0-9]{64}$/.test(token);
}

/**
 * تشفير كلمة المرور باستخدام bcrypt
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * التحقق من كلمة المرور
 */
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * توليد توكن آمن
 */
function generateToken() {
  return crypto.randomBytes(RECOVERY_TOKEN_BYTES).toString('hex');
}

/**
 * تسجيل الدخول
 */
async function start(req, res, postData) {
  try {
    // التحقق من الجلسة الحالية
    if (req.session?.user?.id && validateEmail(req.session.user.email)) {
      return res.redirect('/play');
    }

    const email = postData?.email?.trim().toLowerCase();
    const password = postData?.password;

    // التحقق من المدخلات
    if (!validateEmail(email) || !password) {
      return removePrivileges(req, res);
    }

    // التحقق من الحظر
    if (isLockedOut(email)) {
      console.log(`Account temporarily locked: ${email}`);
      return removePrivileges(req, res);
    }

    // البحث عن المستخدم
    const rows = await query(
      'SELECT id_user, email, password FROM wof_user WHERE email = ? LIMIT 1',
      [email]
    );

    if (rows.length === 0) {
      recordAttempt(email);
      return removePrivileges(req, res);
    }

    const user = rows[0];

    // التحقق من كلمة المرور
    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      recordAttempt(email);
      return removePrivileges(req, res);
    }

    // تسجيل الدخول الناجح
    clearAttempts(email);

    req.session.user = {
      id: user.id_user,
      email: user.email
    };

    console.log(`Login successful: ${email}`);
    return res.redirect('/play');

  } catch (error) {
    console.error('Login error:', error);
    return removePrivileges(req, res);
  }
}

/**
 * التحقق من وجود المستخدم
 */
async function userExists(req, res, postData) {
  try {
    const email = postData?.email?.trim().toLowerCase();

    if (!validateEmail(email)) {
      return res.send('false');
    }

    const rows = await query(
      'SELECT id_user FROM wof_user WHERE email = ? LIMIT 1',
      [email]
    );

    res.send(rows.length > 0 ? 'true' : 'false');

  } catch (error) {
    console.error('userExists error:', error);
    res.send('false');
  }
}

/**
 * التحقق من صحة بيانات الاعتماد
 */
async function userCredentials(req, res, postData) {
  try {
    const email = postData?.email?.trim().toLowerCase();
    const password = postData?.password;

    if (!validateEmail(email) || !password) {
      return res.send('false');
    }

    if (isLockedOut(email)) {
      return res.send('false');
    }

    const rows = await query(
      'SELECT id_user, password FROM wof_user WHERE email = ? LIMIT 1',
      [email]
    );

    if (rows.length === 0) {
      return res.send('false');
    }

    const isValid = await verifyPassword(password, rows[0].password);

    if (!isValid) {
      recordAttempt(email);
      return res.send('false');
    }

    res.send('true');

  } catch (error) {
    console.error('userCredentials error:', error);
    res.send('false');
  }
}

/**
 * تسجيل مستخدم جديد
 */
async function register(req, res, postData) {
  try {
    const email = postData?.email?.trim().toLowerCase();
    const password = postData?.password;
    const confirmationPassword = postData?.confirmationPassword;
    const difficulty = postData?.difficulty;

    // التحقق من المدخلات
    if (!validateEmail(email) || !validatePassword(password)) {
      return removePrivileges(req, res);
    }

    if (password !== confirmationPassword) {
      return removePrivileges(req, res);
    }

    const validDifficulties = ['easy', 'medium', 'hard'];
    if (!validDifficulties.includes(difficulty)) {
      return removePrivileges(req, res);
    }

    // التحقق من عدم وجود المستخدم مسبقاً
    const existingUsers = await query(
      'SELECT id_user FROM wof_user WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingUsers.length > 0) {
      console.log(`Registration failed: ${email} already exists`);
      return removePrivileges(req, res);
    }

    // تشفير كلمة المرور وإنشاء المستخدم
    const hashedPassword = await hashPassword(password);
    const initialLife = settings.getInitialLife();
    const initialMoney = settings.getInitialMoneyByDifficulty(difficulty);

    const result = await query(
      'INSERT INTO wof_user (email, password, difficulty, life, money) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, difficulty, initialLife, initialMoney]
    );

    const userId = result.insertId;

    // إنشاء الجلسة
    req.session.user = {
      id: userId,
      email: email
    };

    console.log(`Registration successful: ${email}`);

    // تخصيص أرض للمستخدم
    await map.allocateTerritory(userId, res);

  } catch (error) {
    console.error('Registration error:', error);
    return removePrivileges(req, res);
  }
}

/**
 * طلب استعادة كلمة المرور
 */
async function passwordLost(req, res, postData) {
  try {
    const email = postData?.email?.trim().toLowerCase();

    if (!validateEmail(email)) {
      return renderView(res, 'passwordLost');
    }

    // توليد توكن آمن
    const token = generateToken();
    const tokenExpiry = new Date(Date.now() + 3600000); // ساعة واحدة

    // حفظ التوكن
    await query(
      'UPDATE wof_user SET recovery = ?, recovery_expires = ? WHERE email = ?',
      [token, tokenExpiry, email]
    );

    // إرسال البريد
    await mail.passwordLost(email, token);

    console.log(`Password recovery requested: ${email}`);
    renderView(res, 'passwordLostSent');

  } catch (error) {
    console.error('passwordLost error:', error);
    renderView(res, 'passwordLost');
  }
}

/**
 * إعادة تعيين كلمة المرور
 */
async function resetPassword(req, res, postData) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!validateToken(token)) {
      console.log('Invalid reset token');
      return res.redirect('/passwordLost');
    }

    // البحث عن المستخدم بالتوكن الصحيح
    const rows = await query(
      'SELECT id_user, email, recovery_expires FROM wof_user WHERE recovery = ? LIMIT 1',
      [token]
    );

    if (rows.length === 0) {
      console.log('Token not found');
      return res.redirect('/passwordLost');
    }

    const user = rows[0];

    // التحقق من انتهاء صلاحية التوكن
    if (user.recovery_expires && new Date(user.recovery_expires) < new Date()) {
      console.log('Token expired');
      return res.redirect('/passwordLost');
    }

    const password = postData?.password;
    const confirmationPassword = postData?.confirmationPassword;

    // إذا تم إرسال كلمة مرور جديدة
    if (password && confirmationPassword && password === confirmationPassword && validatePassword(password)) {
      const hashedPassword = await hashPassword(password);

      await query(
        'UPDATE wof_user SET password = ?, recovery = NULL, recovery_expires = NULL WHERE id_user = ?',
        [hashedPassword, user.id_user]
      );

      // إنشاء جلسة
      req.session.user = {
        id: user.id_user,
        email: user.email
      };

      console.log(`Password reset successful: ${user.email}`);
      return res.redirect('/play');
    }

    // عرض نموذج إعادة التعيين
    renderView(res, 'resetPassword');

  } catch (error) {
    console.error('resetPassword error:', error);
    return res.redirect('/passwordLost');
  }
}

/**
 * صفحة اللعب
 */
function play(req, res, postData) {
  if (!req.session?.user?.id || !validateEmail(req.session.user.email)) {
    return res.redirect('/');
  }

  renderView(res, 'play');
}

/**
 * تسجيل الخروج
 */
function logout(req, res, postData) {
  const email = req.session?.user?.email;

  req.session.destroy((err) => {
    if (err) console.error('Session destruction error:', err);
  });

  console.log(`Logout: ${email}`);
  res.redirect('/');
}

/**
 * إزالة الصلاحيات
 */
function removePrivileges(req, res, doNotRender) {
  if (req.session) {
    req.session.user = null;
  }

  if (!doNotRender) {
    renderView(res, 'sign');
  }
}

/**
 * عرض صفحة HTML
 */
function renderView(res, file) {
  const viewDir = path.join(__dirname, '..', 'view');
  const filename = path.join(viewDir, file + '.html');

  fs.access(filename, fs.constants.R_OK, (err) => {
    if (err) {
      console.log('View not found:', filename);
      res.status(404).send('Page not found');
      return;
    }

    res.sendFile(filename);
  });
}

export {
  start,
  register,
  passwordLost,
  resetPassword,
  play,
  userExists,
  userCredentials,
  logout,
  validateEmail,
  validatePassword,
  hashPassword,
  verifyPassword
};
