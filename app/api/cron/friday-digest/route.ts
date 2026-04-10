import { generateWeeklyDigest } from '@/lib/digest-generator'
import { sendDigestEmail } from '@/lib/send-email'

// Claude + rules engine + email can take 30–60s.
// If consistently timing out on Vercel Hobby tier (max 60s), upgrade to Pro (max 300s) or use Upstash QStash.
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { subject, html } = await generateWeeklyDigest()
    await sendDigestEmail(process.env.GMAIL_TO_ADDRESS!, subject, html)
    return Response.json({ success: true, subject })
  } catch (error) {
    console.error('Friday digest failed:', error)
    return Response.json({ success: false, error: String(error) }, { status: 500 })
  }
}
