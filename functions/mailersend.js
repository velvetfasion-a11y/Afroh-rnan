async function sendTemplateEmail({
  apiKey,
  templateId,
  toEmail,
  toName,
  fromEmail,
  fromName,
  data,
}) {
  if (!apiKey) throw new Error('MailerSend API key is missing');
  if (!templateId) throw new Error('MailerSend template ID is missing');
  if (!toEmail) throw new Error('Recipient email is missing');

  const response = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      from: {
        email: fromEmail,
        name: fromName || fromEmail,
      },
      to: [{ email: toEmail, name: toName || toEmail }],
      template_id: templateId,
      personalization: [
        {
          email: toEmail,
          data: data || {},
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MailerSend API error ${response.status}: ${body}`);
  }
}

async function sendHtmlEmail({
  apiKey,
  toEmail,
  toName,
  fromEmail,
  fromName,
  subject,
  html,
  text,
}) {
  if (!apiKey) throw new Error('MailerSend API key is missing');
  if (!toEmail) throw new Error('Recipient email is missing');

  const response = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      from: {
        email: fromEmail,
        name: fromName || fromEmail,
      },
      to: [{ email: toEmail, name: toName || toEmail }],
      subject,
      html,
      text: text || undefined,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MailerSend API error ${response.status}: ${body}`);
  }
}

function parseFromAddress(from) {
  const value = String(from || '').trim();
  const match = value.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  if (value.includes('@')) {
    return { name: 'Afrohörnan', email: value };
  }
  return { name: 'Afrohörnan', email: 'info@afrohornan.com' };
}

module.exports = {
  sendTemplateEmail,
  sendHtmlEmail,
  parseFromAddress,
};
