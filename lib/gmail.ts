import { google } from 'googleapis'

export async function sendViaGmail(to: string, subject: string, htmlBody: string): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const message = [
    `To: ${to}`,
    `From: STR Pricing Co-Pilot <${process.env.GMAIL_FROM_ADDRESS}>`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ].join('\n')
  const encodedMessage = Buffer.from(message).toString('base64url')
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  })
}
