import { createSign } from 'crypto';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

function createJWT() {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(PRIVATE_KEY, 'base64url');

  return `${header}.${payload}.${signature}`;
}

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createJWT(),
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Google auth xətası: ' + JSON.stringify(data));
  return data.access_token;
}

export async function appendLeadToSheet(lead, senderName) {
  const token = await getAccessToken();
  const date = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A:F:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[date, lead.name, lead.phone, lead.interest, lead.source ?? '', senderName ?? '']],
      }),
    }
  );

  if (!res.ok) throw new Error('Sheets API xətası: ' + await res.text());
}
