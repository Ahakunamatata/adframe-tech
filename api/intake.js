const crypto = require('crypto');

const ALLOWED_PLATFORMS = new Set(['TikTok', 'Meta', 'YouTube Shorts', 'Other']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function cleanString(value, maxLength = 1000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function validate(body) {
  const intake = {
    url: cleanString(body.url, 2048),
    platform: cleanString(body.platform, 80),
    language: cleanString(body.language, 160),
    email: cleanString(body.email, 254),
    scenario: cleanString(body.scenario, 1400),
    page_url: cleanString(body.page_url, 2048),
    referrer: cleanString(body.referrer, 2048),
    honeypot: cleanString(body.honeypot || body.company || body.website, 250)
  };

  if (intake.honeypot) {
    return { ok: true, spam: true, intake };
  }

  const missing = ['url', 'platform', 'language', 'email'].filter((field) => !intake[field]);
  if (missing.length > 0) {
    return { ok: false, status: 400, error: `Missing required fields: ${missing.join(', ')}` };
  }

  if (!isHttpUrl(intake.url)) {
    return { ok: false, status: 400, error: 'Product / app URL must be a valid http or https URL.' };
  }

  if (!EMAIL_RE.test(intake.email)) {
    return { ok: false, status: 400, error: 'Work email is invalid.' };
  }

  if (!ALLOWED_PLATFORMS.has(intake.platform)) {
    return { ok: false, status: 400, error: 'Target platform is invalid.' };
  }

  return { ok: true, intake };
}

function buildNotificationText(intake) {
  const scenario = intake.scenario || 'Not provided';
  const pageUrl = intake.page_url || 'Not provided';
  const referrer = intake.referrer || 'Not provided';

  return [
    'New $1 founding pilot request',
    '',
    `Product / app URL: ${intake.url}`,
    `Target platform: ${intake.platform}`,
    `Creative language: ${intake.language}`,
    `Scenario expectation: ${scenario}`,
    `Work email: ${intake.email}`,
    `Submitted at: ${intake.submitted_at}`,
    `Page URL: ${pageUrl}`,
    `Referrer: ${referrer}`,
    `User agent: ${intake.user_agent || 'Not provided'}`
  ].join('\n');
}

function buildFeishuPayload(text) {
  const payload = {
    msg_type: 'text',
    content: {
      text
    }
  };

  if (process.env.FEISHU_WEBHOOK_SECRET) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sign = crypto
      .createHmac('sha256', process.env.FEISHU_WEBHOOK_SECRET)
      .update(`${timestamp}\n${process.env.FEISHU_WEBHOOK_SECRET}`)
      .digest('base64');

    payload.timestamp = timestamp;
    payload.sign = sign;
  }

  return payload;
}

async function sendFeishu(text) {
  if (!process.env.FEISHU_WEBHOOK_URL) {
    return { configured: false, ok: false };
  }

  const response = await fetch(process.env.FEISHU_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildFeishuPayload(text))
  });

  if (!response.ok) {
    throw new Error(`Feishu webhook failed with status ${response.status}`);
  }

  const result = await response.json().catch(() => ({}));
  if (result.StatusCode && result.StatusCode !== 0) {
    throw new Error('Feishu webhook returned a non-zero StatusCode');
  }
  if (result.code && result.code !== 0) {
    throw new Error('Feishu webhook returned a non-zero code');
  }

  return { configured: true, ok: true };
}

function emailConfig() {
  const to = cleanString(process.env.NOTIFY_EMAIL_TO || '', 500);
  const from = cleanString(process.env.FROM_EMAIL || '', 320);
  const apiKey = cleanString(process.env.RESEND_API_KEY || '', 500);
  return { configured: Boolean(to && from && apiKey), to, from, apiKey };
}

async function sendEmail(text) {
  const config = emailConfig();
  if (!config.configured) {
    return { configured: false, ok: false };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: config.from,
      to: config.to.split(',').map((email) => email.trim()).filter(Boolean),
      subject: 'New $1 founding pilot request',
      text
    })
  });

  if (!response.ok) {
    throw new Error(`Email notification failed with status ${response.status}`);
  }

  return { configured: true, ok: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: 'Invalid JSON body.' });
  }

  const validation = validate(body);
  if (!validation.ok) {
    return json(res, validation.status, { ok: false, error: validation.error });
  }

  if (validation.spam) {
    return json(res, 200, { ok: true });
  }

  const intake = {
    ...validation.intake,
    submitted_at: new Date().toISOString(),
    user_agent: cleanString(req.headers['user-agent'] || '', 500)
  };
  const text = buildNotificationText(intake);
  const attempts = [];

  try {
    attempts.push(await sendFeishu(text));
  } catch (error) {
    console.error('Feishu notification failed.');
    attempts.push({ configured: true, ok: false });
  }

  try {
    attempts.push(await sendEmail(text));
  } catch (error) {
    console.error('Email notification failed.');
    attempts.push({ configured: true, ok: false });
  }

  const configuredAttempts = attempts.filter((attempt) => attempt.configured);
  if (configuredAttempts.length === 0) {
    console.error('No intake notification channel is configured.');
    return json(res, 500, { ok: false, error: 'notification_not_configured' });
  }

  if (!configuredAttempts.some((attempt) => attempt.ok)) {
    return json(res, 502, { ok: false, error: 'notification_failed' });
  }

  return json(res, 200, { ok: true });
};
