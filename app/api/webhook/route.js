import { createLead } from '@/lib/odoo';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_MAP = JSON.parse(process.env.TELEGRAM_USER_MAP ?? '{}');

const TEMPLATE_KEYWORDS = ['müştəri', 'əlaqə nömrəsi', 'maraqlanır'];

function looksLikeLead(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return TEMPLATE_KEYWORDS.some(k => lower.includes(k));
}

function parseLeadMessage(text) {
  if (!text) return null;

  const nameMatch = text.match(/Müştəri(?:nin)? adı:\s*(.+)/i);
  const phoneMatch = text.match(/Əlaqə nömrəsi:\s*(.+)/i);
  const interestMatch = text.match(/Nə ilə maraqlanır:\s*(.+)/i);
  const sourceMatch = text.match(/✅\s+(.+?)\s+vasitəsilə/i);

  if (!nameMatch || !phoneMatch || !interestMatch) return null;

  return {
    name: nameMatch[1].trim(),
    phone: phoneMatch[1].trim(),
    interest: interestMatch[1].trim(),
    source: sourceMatch ? sourceMatch[1].trim() : null,
  };
}

async function sendMessage(chatId, text, replyToMessageId) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_to_message_id: replyToMessageId,
    }),
  });
}

export async function POST(request) {
  const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
  if (secretHeader !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const message = body?.message;
  if (!message) {
    return new Response('OK', { status: 200 });
  }

  const chatId = String(message.chat?.id);
  if (chatId !== String(ALLOWED_CHAT_ID).trim()) {
    return new Response('Forbidden', { status: 403 });
  }

  console.log(`Göndərən: ${message.from?.first_name ?? ''} ${message.from?.last_name ?? ''} | Telegram ID: ${message.from?.id} | Mesaj: ${message.text}`);

  const lead = parseLeadMessage(message.text);

  if (!lead) {
    if (looksLikeLead(message.text)) {
      await sendMessage(
        chatId,
        '⚠️ Şablon düzgün doldurulmayıb. Zəhmət olmasa aşağıdakı formatda göndərin:\n\nMüştərinin adı: ...\nƏlaqə nömrəsi: ...\nNə ilə maraqlanır: ...\n✅ ... vasitəsilə olunan müraciət',
        message.message_id
      );
    }
    return new Response('OK', { status: 200 });
  }

  console.log('Yeni lead:', lead);

  const odooUserId = TELEGRAM_USER_MAP[String(message.from?.id)] ?? null;

  try {
    const leadId = await createLead(lead, odooUserId);
    console.log('Odoo lead ID:', leadId);
  } catch (err) {
    console.error('Odoo xətası:', err.message);
  }

  return new Response('OK', { status: 200 });
}
