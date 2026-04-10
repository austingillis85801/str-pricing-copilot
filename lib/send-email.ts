import { sendViaGmail } from './gmail'
import { sendViaResend } from './resend-email'
import { createServerSupabaseClient } from './supabase-server'

export async function sendDigestEmail(to: string, subject: string, htmlBody: string): Promise<void> {
  let senderUsed = 'gmail'
  let errorMessage: string | null = null

  try {
    await sendViaGmail(to, subject, htmlBody)
  } catch (gmailError) {
    console.warn('Gmail API failed, falling back to Resend:', gmailError)
    senderUsed = 'resend'
    errorMessage = String(gmailError)
    try {
      await sendViaResend(to, subject, htmlBody)
    } catch (resendError) {
      const supabase = createServerSupabaseClient()
      await supabase.from('email_log').insert({
        subject,
        recipient: to,
        status: 'failed',
        sender_used: 'both_failed',
        error_message: String(resendError),
      })
      throw resendError
    }
  }

  const supabase = createServerSupabaseClient()
  await supabase.from('email_log').insert({
    subject,
    recipient: to,
    status: senderUsed === 'resend' ? 'fallback_used' : 'sent',
    sender_used: senderUsed,
    error_message: errorMessage,
  })
}
