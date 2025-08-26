import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'
export async function GET(req: NextRequest) {
  try {
    const ipHeader = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || ''
    const ipFromHeader = ipHeader.split(',')[0]?.trim() || null
    const vCountry = req.headers.get('x-vercel-ip-country')
    const vCity = req.headers.get('x-vercel-ip-city')
    const vRegion = req.headers.get('x-vercel-ip-country-region')
    const vAsn = req.headers.get('x-vercel-ip-asn')
    const vOrg = req.headers.get('x-vercel-ip-as-org')
    const cf: any = (req as any).cf
    const cookieHeader = req.headers.get('cookie') || ''
    const serverCookieNames = cookieHeader.split(';').map(s => s.trim()).filter(Boolean).map(pair => pair.split('=')[0]).filter(Boolean)
    const payload = {
      ip: ipFromHeader,
      city: vCity || cf?.city || null,
      region: vRegion || cf?.region || cf?.regionCode || null,
      country: vCountry || cf?.country || null,
      asn: vAsn || (cf?.asn ? String(cf.asn) : null),
      org: vOrg || cf?.asOrganization || null,
      method: (vCountry || vCity || vAsn) ? ('headers' as const) : ('cf-object' as const),
      serverCookieNames,
      serverCookieCount: serverCookieNames.length,
    }
    const res = NextResponse.json(payload)
    // demo cookie so client can read at least one
    res.cookies.set('pm_demo', '1', { path: '/', sameSite: 'Lax', secure: true, maxAge: 60 * 60 * 24 * 365, httpOnly: false })
    return res
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
