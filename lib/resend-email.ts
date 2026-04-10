import { Resend } from 'resend'

export async function sendViaResend(to: string, subject: string, htmlBody: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: 'STR Pricing Co-Pilot <onboarding@resend.dev>',
    to,
    subject,
    html: htmlBody,
  })
}
