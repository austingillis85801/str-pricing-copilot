export interface DigestAction {
  property: string
  date: string
  action: string
  urgency: 'high' | 'medium'
}

export interface DigestRecommendation {
  recommendation: string
  reasoning: string
}

export interface DigestData {
  subject: string
  weekly_snapshot: string
  top_actions: DigestAction[]
  demand_signals: string
  weather_summary: string
  top_recommendations: DigestRecommendation[]
  special_alert: string | null
}

function urgencyBadge(urgency: 'high' | 'medium'): string {
  return urgency === 'high'
    ? '<span style="display:inline-block;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;">High</span>'
    : '<span style="display:inline-block;background:#fef9c3;color:#854d0e;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;">Medium</span>'
}

function section(title: string, content: string): string {
  return `
    <tr>
      <td style="padding:0 32px 28px;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">${title}</p>
        ${content}
      </td>
    </tr>`
}

export function buildEmailHtml(data: DigestData, appUrl: string): string {
  const isJanuary = new Date().getMonth() === 0
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  // Top actions table rows
  const actionRows = data.top_actions
    .map(
      (a) => `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 12px;font-size:13px;color:#334155;font-weight:500;">${a.property}</td>
        <td style="padding:10px 12px;font-size:13px;color:#334155;">${a.date}</td>
        <td style="padding:10px 12px;font-size:13px;color:#334155;">${a.action}</td>
        <td style="padding:10px 12px;text-align:right;">${urgencyBadge(a.urgency)}</td>
      </tr>`
    )
    .join('')

  const actionsTable = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-align:left;">Property</th>
          <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-align:left;">Date</th>
          <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-align:left;">Action</th>
          <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-align:right;">Urgency</th>
        </tr>
      </thead>
      <tbody>${actionRows || '<tr><td colspan="4" style="padding:16px 12px;font-size:13px;color:#94a3b8;text-align:center;">No urgent actions this week</td></tr>'}</tbody>
    </table>`

  // Recommendations list
  const recsList = data.top_recommendations
    .map(
      (r, i) => `
      <div style="display:flex;gap:12px;margin-bottom:12px;">
        <div style="width:24px;height:24px;min-width:24px;background:#dbeafe;color:#1d4ed8;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;line-height:24px;text-align:center;">${i + 1}</div>
        <div>
          <p style="margin:0 0 3px;font-size:14px;color:#1e293b;font-weight:500;">${r.recommendation}</p>
          <p style="margin:0;font-size:13px;color:#64748b;">${r.reasoning}</p>
        </div>
      </div>`
    )
    .join('')

  // Special alert box (only if present)
  const specialAlertHtml =
    data.special_alert && data.special_alert !== 'null'
      ? section(
          '⚡ Special Alert',
          `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:14px 16px;">
            <p style="margin:0;font-size:14px;color:#92400e;font-weight:500;">${data.special_alert}</p>
          </div>`
        )
      : ''

  // January booking surge banner (only in January)
  const januaryHtml = isJanuary
    ? section(
        '📅 January Booking Reminder',
        `<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;padding:14px 16px;">
          <p style="margin:0 0 6px;font-size:14px;color:#1e40af;font-weight:600;">January Booking Surge Window</p>
          <p style="margin:0;font-size:13px;color:#1e40af;">January is a peak booking month for summer travel. Ensure Bear Lake summer dates (June–August) are priced and available. Check Moab spring event windows are set before Easter Jeep Safari searches peak.</p>
        </div>`
      )
    : ''

  // Weather section (only if non-empty)
  const weatherHtml =
    data.weather_summary && data.weather_summary.trim()
      ? section(
          '🌤️ Weather Notes',
          `<p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">${data.weather_summary}</p>`
        )
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:28px 32px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">STR Pricing Co-Pilot</p>
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Weekly Pricing Digest</p>
              <p style="margin:6px 0 0;font-size:13px;color:#64748b;">${dateLabel}</p>
            </td>
          </tr>

          <!-- Spacer -->
          <tr><td style="height:28px;"></td></tr>

          <!-- Weekly Snapshot -->
          ${section(
            '📊 Weekly Snapshot',
            `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 16px;">
              <p style="margin:0;font-size:14px;color:#334155;line-height:1.65;">${data.weekly_snapshot}</p>
            </div>`
          )}

          <!-- Dates Needing Attention -->
          ${section('⚠️ Dates Needing Attention', actionsTable)}

          <!-- Demand Signals -->
          ${section(
            '📅 Upcoming Demand Signals',
            `<p style="margin:0;font-size:14px;color:#334155;line-height:1.65;">${data.demand_signals}</p>`
          )}

          <!-- Weather (conditional) -->
          ${weatherHtml}

          <!-- Recommendations -->
          ${section('🤖 Top Recommendations', recsList || '<p style="margin:0;font-size:14px;color:#94a3b8;">No specific recommendations this week.</p>')}

          <!-- Special Alert (conditional) -->
          ${specialAlertHtml}

          <!-- January Banner (conditional) -->
          ${januaryHtml}

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:#e2e8f0;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;text-align:center;">
              <a href="${appUrl}/dashboard"
                style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
                Open Full Dashboard →
              </a>
              <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
                STR Pricing Co-Pilot · Moab &amp; Bear Lake, UT
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
