'use client'
import React, { useEffect, useMemo, useState } from 'react'

type WhoAmI = {
  ip: string | null
  city?: string | null
  region?: string | null
  country?: string | null
  asn?: string | null
  org?: string | null
  method: 'headers' | 'cf-object' | 'lookup' | 'unknown'
}

function pretty(v: any) { return JSON.stringify(v, null, 2) }

function hashString(s: string) {
  let h = 5381; for (let i=0;i<s.length;i++) h = ((h<<5)+h) + s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

async function getBatteryInfo() {
  try {
    // @ts-ignore
    if (navigator.getBattery) {
      // @ts-ignore
      const b = await navigator.getBattery();
      return { charging: b.charging, level: b.level, chargingTime: b.chargingTime, dischargingTime: b.dischargingTime };
    }
  } catch {}
  return null;
}

function getWebGLInfo() {
  try {
    const canvas = document.createElement('canvas')
    // @ts-ignore
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) return null
    // @ts-ignore
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    // @ts-ignore
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
    // @ts-ignore
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return { vendor, renderer }
  } catch { return null }
}

async function getPermissions() {
  const names: any[] = ['geolocation','notifications','camera','microphone','clipboard-read','clipboard-write','persistent-storage']
  const out: Record<string,string> = {}
  await Promise.all(names.map(async n => {
    try {
      // @ts-ignore
      const st = await navigator.permissions.query({ name: n })
      out[n] = st.state
    } catch { out[n] = 'unknown' }
  }))
  return out
}

async function detectWebRTCIPs(timeoutMs = 2000): Promise<string[]> {
  const RTCPeer: any = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection
  if (!RTCPeer) return []
  const pc = new RTCPeer({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
  const vals: string[] = []
  pc.createDataChannel('x')
  pc.onicecandidate = (e: any) => { if (e?.candidate?.candidate) vals.push(e.candidate.candidate) }
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer)
  await new Promise(r => setTimeout(r, timeoutMs))
  pc.close()
  const ips = new Set<string>()
  vals.forEach(c => { const m = c.match(/candidate:[^ ]+ [^ ]+ [^ ]+ [^ ]+ ([^ ]+) /); if (m?.[1]) ips.add(m[1]) })
  return Array.from(ips)
}

export default function Page() {
  const [serverWho, setServerWho] = useState<WhoAmI | null>(null)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>({})

  const collect = async () => {
    setLoading(true)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const lang = navigator.language
      const langs = navigator.languages
      const ua = navigator.userAgent
      const uaData = (navigator as any).userAgentData?.toJSON?.() || null
      const memory = (navigator as any).deviceMemory ?? null
      const cores = navigator.hardwareConcurrency ?? null
      const cookies = navigator.cookieEnabled
      const dnt = (navigator as any).doNotTrack || (window as any).doNotTrack || (navigator as any).msDoNotTrack || null
      const vendor = navigator.vendor
      const platform = navigator.platform
      const webdriver = (navigator as any).webdriver ?? false

      const screenInfo = { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight, colorDepth: screen.colorDepth, pixelRatio: devicePixelRatio }
      const connection: any = (navigator as any).connection ? { effectiveType: (navigator as any).connection.effectiveType, downlink: (navigator as any).connection.downlink, rtt: (navigator as any).connection.rtt, saveData: (navigator as any).connection.saveData } : null

      const battery = await getBatteryInfo()
      const webgl = getWebGLInfo()
      const permissions = await getPermissions()
      const referrer = document.referrer || null
      const url = new URL(window.location.href)
      const params: Record<string,string> = {}; url.searchParams.forEach((v,k)=>params[k]=v)

      const mediaDevices = await (navigator.mediaDevices?.enumerateDevices?.() || Promise.resolve([])) as any[]
      const deviceCounts = Array.isArray(mediaDevices) ? mediaDevices.reduce((acc: any, d: any) => { acc[d.kind] = (acc[d.kind] || 0) + 1; return acc }, {}) : {}

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      let canvasHash: string | null = null
      if (ctx) { ctx.textBaseline='top'; ctx.font="14px 'Arial'"; ctx.fillText(ua+JSON.stringify(screenInfo),2,2); canvasHash = hashString(canvas.toDataURL()) }

      const rtcIPs = await detectWebRTCIPs()

      setData({ timestamp: new Date().toISOString(), url: url.href, referrer, utmParams: Object.keys(params).length? params : null, timezone: tz, locale: lang, languages: langs, userAgent: ua, userAgentData: uaData, vendor, platform, webdriver, doNotTrack: dnt, cookiesEnabled: cookies, memoryGB: memory, cpuCores: cores, screen: screenInfo, connection, battery, webgl, mediaDeviceCounts: deviceCounts, permissions, canvasFingerprint: canvasHash, webRTCIPs: rtcIPs })
    } finally { setLoading(false) }
  }

  useEffect(() => {
    collect()
    fetch('/api/whoami').then(r => r.json()).then(setServerWho).catch(()=>setServerWho(null))
  }, [])

  const json = useMemo(() => pretty(data), [data])

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: 0 }}>🔎 Privacy Mirror</h1>
          <p style={{ margin: '6px 0', color: '#334155' }}>Everything a site can learn from your browser — plus server‑side IP/ASN via headers.</p>
        </div>
        <div>
          <button onClick={collect} disabled={loading} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}>{loading ? 'Scanning…' : 'Run checks'}</button>
        </div>
      </header>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Server View (IP & Geo)</h3>
          <pre style={{ fontSize: 12, overflow: 'auto' }}>{pretty(serverWho)}</pre>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Locale & Time</h3>
          <div>Timezone: {data.timezone || '-'}</div>
          <div>Locale: {data.locale || '-'}</div>
          <div>Languages: {Array.isArray(data.languages) ? data.languages.join(', ') : '-'}</div>
          <div>Timestamp: {data.timestamp}</div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Device & OS</h3>
          <div>Platform: {data.platform || '-'}</div>
          <div>Vendor: {data.vendor || '-'}</div>
          <div>UA: {data.userAgent || '-'}</div>
          <div>CPU Cores: {data.cpuCores ?? '-'}</div>
          <div>RAM (approx): {data.memoryGB ? `${data.memoryGB} GB` : '-'}</div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Graphics / WebGL</h3>
          <div>Vendor: {data?.webgl?.vendor || '-'}</div>
          <div>Renderer: {data?.webgl?.renderer || '-'}</div>
          <div>Canvas hash: {data.canvasFingerprint || '-'}</div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Network</h3>
          <div>Referrer: {data.referrer || '(none)'} </div>
          <div>UTM: {data.utmParams ? pretty(data.utmParams) : '(none)'}</div>
          <div>WebRTC possible IPs: {data.webRTCIPs?.length ? data.webRTCIPs.join(', ') : '-'}</div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Privacy Flags</h3>
          <div>Cookies Enabled: {String(data.cookiesEnabled)}</div>
          <div>Do Not Track: {String(data.doNotTrack)}</div>
          <div>Permissions: <pre style={{ fontSize: 12 }}>{data.permissions ? pretty(data.permissions) : '-'}</pre></div>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Raw JSON</h3>
        <pre style={{ fontSize: 12, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, overflow: 'auto' }}>{json}</pre>
      </section>

      <footer style={{ marginTop: 16, fontSize: 12, color: '#64748b' }}>
        Built for demos. No data is stored server-side unless you change the code.
      </footer>
    </div>
  )
}
