import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  try {
    // Try common headers first
    const ipHeader = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || ''
    const ipFromHeader = ipHeader.split(',')[0]?.trim() || null

    // Vercel geo headers (if on Vercel)
    const vCountry = req.headers.get('x-vercel-ip-country')
    const vCity = req.headers.get('x-vercel-ip-city')
    const vRegion = req.headers.get('x-vercel-ip-country-region')
    const vAsn = req.headers.get('x-vercel-ip-asn')
    const vOrg = req.headers.get('x-vercel-ip-as-org')

    if (vCountry || vCity || vAsn) {
      return NextResponse.json({ ip: ipFromHeader, city: vCity, region: vRegion, country: vCountry, asn: vAsn, org: vOrg, method: 'headers' as const })
    }

    // Cloudflare Pages/Workers provide request.cf (not just headers)
    const cf: any = (req as any).cf
    if (cf && (cf.country || cf.asOrganization || cf.asn)) {
      return NextResponse.json({
        ip: ipFromHeader,
        city: cf.city || null,
        region: cf.region || cf.regionCode || null,
        country: cf.country || null,
        asn: String(cf.asn || ''),
        org: cf.asOrganization || null,
        method: 'cf-object' as const
      })
    }

    // Fallback: minimal
    return NextResponse.json({ ip: ipFromHeader, method: 'unknown' as const })
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
