import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateWeeklyDigest } from '@/lib/digest-generator'
import { sendDigestEmail } from '@/lib/send-email'

export const maxDuration = 60

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { subject, html } = await generateWeeklyDigest()
    await sendDigestEmail(process.env.GMAIL_TO_ADDRESS!, subject, html)
    return NextResponse.json({ success: true, subject })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
