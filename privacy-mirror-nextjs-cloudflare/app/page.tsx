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
  serverCookieNames?: string[]
  serverCookieCount?: number
}

const pretty = (v: any) => JSON.stringify(v, null, 2)

const maskIP = (ip?: string | null) => {
  if (!ip) return ip
  const parts = ip.split('.')
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.xxx.xxx`
  return ip.replace(/:[0-9a-f]{1,4}$/i, ':xxxx')
}

function hashString(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i)
  return (h >>> 0).toString(36)
}

async function getBatteryInfo() {
  try {
    // @ts-ignore
    if (navigator.getBattery) {
      const b = await (navigator as any).getBattery()
      return { charging: b.charging, level: b.level }
    }
  } catch {}
  return null
}
function getWebGLInfo() {
  try {
    const canvas = document.createElement('canvas')
    const gl: any = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) return null
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return { vendor, renderer }
  } catch { return null }
}
async function getPermissions() {
  const names: any[] = ['geolocation','notifications','camera','microphone','clipboard-read','clipboard-write','persistent-storage']
  const out: Record<string,string> = {}
  await Promise.all(names.map(async n => {
    try { const st = await (navigator as any).permissions.query({ name: n }); out[n] = st.state }
    catch { out[n] = 'unknown' }
  }))
  return out
}
async function detectWebRTCIPs(timeoutMs = 1500): Promise<string[]> {
  const RTCPeer: any = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection
  if (!RTCPeer) return []
  const pc = new RTCPeer({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
  const vals: string[] = []
  pc.createDataChannel('x')
  pc.onicecandidate = (e: any) => { if (e?.candidate?.candidate) vals.push(e.candidate.candidate) }
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer)
  await new Promise(r => setTimeout(r, timeoutMs)); pc.close()
  const ips = new Set<string>()
  vals.forEach(c => { const m = c.match(/candidate:[^ ]+ [^ ]+ [^ ]+ [^ ]+ ([^ ]+) /); if (m?.[1]) ips.add(m[1]) })
  return Array.from(ips)
}
function parseDocumentCookies() {
  const raw = document.cookie || ''
  if (!raw) return { count: 0, cookies: [] as { name: string; valuePreview: string }[] }
  const cookies = raw.split(';').map(s => s.trim()).filter(Boolean).map(pair => {
    const [name, ...rest] = pair.split('=')
    const value = rest.join('=') || ''
    const preview = value.length > 12 ? value.slice(0, 12) + '…' : value
    return { name, valuePreview: preview }
  })
  return { count: cookies.length, cookies }
}
function readStorage(kind: 'local' | 'session') {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage
    const keys = Object.keys(s)
    const items = keys.map(k => {
      const v = s.getItem(k) ?? ''
      const bytes = new Blob([v]).size
      const preview = v.length > 40 ? v.slice(0, 40) + '…' : v
      return { key: k, bytes, preview }
    })
    const totalBytes = items.reduce((n, it) => n + it.bytes, 0)
    return { count: keys.length, totalBytes, items }
  } catch { return { count: 0, totalBytes: 0, items: [] as any[] } }
}

export default function Page() {
  const [serverWho, setServerWho] = useState<WhoAmI | null>(null)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>({})
  const [scary, setScary] = useState<boolean>(() => {
    const qp = new URLSearchParams(window.location.search)
    return !qp.has('safe') // default ON; add ?safe to calm it down
  })

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
      const screenInfo = {
        width: screen.width, height: screen.height,
        availWidth: screen.availWidth, availHeight: screen.availHeight,
        colorDepth: screen.colorDepth, pixelRatio: devicePixelRatio
      }
      const connection: any = (navigator as any).connection
        ? { effectiveType: (navigator as any).connection.effectiveType, downlink: (navigator as any).connection.downlink,
            rtt: (navigator as any).connection.rtt, saveData: (navigator as any).connection.saveData }
        : null
      const battery = await getBatteryInfo()
      const webgl = getWebGLInfo()
      const permissions = await getPermissions()
      const referrer = document.referrer || null
      const url = new URL(window.location.href)
      const params: Record<string,string> = {}; url.searchParams.forEach((v,k)=>params[k]=v)
      const mediaDevices = await (navigator.mediaDevices?.enumerateDevices?.() || Promise.resolve([])) as any[]
      const deviceCounts = Array.isArray(mediaDevices)
        ? mediaDevices.reduce((acc: any, d: any) => { acc[d.kind] = (acc[d.kind] || 0) + 1; return acc }, {})
        : {}
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d'); let canvasHash: string | null = null
      if (ctx) { ctx.textBaseline='top'; ctx.font="14px 'Arial'"; ctx.fillText(ua+JSON.stringify(screenInfo),2,2); canvasHash = hashString(canvas.toDataURL()) }
      const rtcIPs = await detectWebRTCIPs()
      const docCookies = parseDocumentCookies()
      const local = readStorage('local')
      const session = readStorage('session')
      setData({
        timestamp: new Date().toISOString(), url: url.href, referrer, utmParams: Object.keys(params).length? params : null,
        timezone: tz, locale: lang, languages: langs, userAgent: ua, userAgentData: uaData, vendor, platform, webdriver, doNotTrack: dnt,
        cookiesEnabled: cookies, memoryGB: memory, cpuCores: cores, screen: screenInfo, connection, battery, webgl,
        mediaDeviceCounts: deviceCounts, permissions, canvasFingerprint: canvasHash, webRTCIPs: rtcIPs,
        cookiesClient: docCookies, storageLocal: local, storageSession: session
      })
      // Dramatic reveal: scroll to first section
      setTimeout(() => { document.querySelector('h3')?.scrollIntoView({ behavior: 'smooth' }) }, 300)
    } finally { setLoading(false) }
  }

  const copyJSON = async () => {
    try { await navigator.clipboard.writeText(pretty({ server: serverWho, client: data })); alert('Results copied to clipboard ✅') }
    catch { alert('Copy failed — your browser may block clipboard without HTTPS/user gesture') }
  }

  useEffect(() => {
    collect()
    fetch('/api/whoami').then(r => r.json()).then(setServerWho).catch(()=>setServerWho(null))
  }, [])

  const maskedServer = useMemo(() => {
    if (!serverWho || !scary) return serverWho
    return { ...serverWho, ip: maskIP(serverWho.ip || null) }
  }, [serverWho, scary])

  const maskedClient = useMemo(() => {
    if (!scary) return data
    const copy = { ...data }
    if (copy.webRTCIPs?.length) copy.webRTCIPs = copy.webRTCIPs.map((x: string) => maskIP(x))
    return copy
  }, [data, scary])

  const json = useMemo(() => pretty(maskedClient), [maskedClient])

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: 0 }}>🔎 Privacy Mirror</h1>
          <p style={{ margin: '6px 0', color: '#334155' }}>Everything a site can learn from your browser — plus server-side IP/ASN via headers.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setScary(s => !s)}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: scary ? '#fee2e2' : 'white', cursor: 'pointer' }}>
            {scary ? 'Scary mode: ON' : 'Scary mode: OFF'}
          </button>
          <button
            onClick={copyJSON}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}>
            Copy results
          </button>
          <button
            onClick={collect}
            disabled={loading}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}>
            {loading ? 'Scanning…' : 'Run checks'}
          </button>
        </div>
      </header>

      {scary && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 12, padding: 10, marginBottom: 12 }}>
          <strong>Scary mode:</strong> This was captured instantly — no pop-ups, no consent. (IP masked on-screen; server still sees full address.)
        </div>
      )}

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Server View (IP & Geo)</h3>
          <pre style={{ fontSize: 12, overflow: 'auto' }}>{pretty(maskedServer)}</pre>
          {serverWho?.serverCookieCount !== undefined && (
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Server saw {serverWho.serverCookieCount} cookie{serverWho.serverCookieCount === 1 ? '' : 's'}: {serverWho.serverCookieNames?.slice(0,6).join(', ')}
              {serverWho.serverCookieNames && serverWho.serverCookieNames.length > 6 ? ' …' : ''}
            </div>
          )}
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Locale & Time</h3>
          <div>Timezone: {maskedClient.timezone || '-'}</div>
          <div>Locale: {maskedClient.locale || '-'}</div>
          <div>Languages: {Array.isArray(maskedClient.languages) ? maskedClient.languages.join(', ') : '-'}</div>
          <div>Timestamp: {maskedClient.timestamp}</div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Device & OS</h3>
          <div>Platform: {maskedClient.platform || '-'}</div>
          <div>Vendor: {maskedClient.vendor || '-'}</div>
          <div>UA: {maskedClient.userAgent || '-'}</div>
          <div>CPU Cores: {maskedClient.cpuCores ?? '-'}</div>
          <div>RAM (approx): {maskedClient.memoryGB ? `${maskedClient.memoryGB} GB` : '-'}</div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Graphics / WebGL</h3>
          <div>Vendor: {maskedClient?.webgl?.vendor || '-'}</div>
          <div>Renderer: {maskedClient?.webgl?.renderer || '-'}</div>
          <div>Canvas hash: {maskedClient.canvasFingerprint || '-'}</div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Network</h3>
          <div>Referrer: {maskedClient.referrer || '(none)'} </div>
          <div>UTM: {maskedClient.utmParams ? pretty(maskedClient.utmParams) : '(none)'}</div>
          <div>WebRTC possible IPs: {maskedClient.webRTCIPs?.length ? maskedClient.webRTCIPs.join(', ') : '-'}</div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Cookies & Storage</h3>
          <div><strong>Client-visible cookies:</strong> {maskedClient.cookiesClient?.count ?? 0}</div>
          {maskedClient.cookiesClient?.cookies?.length ? (
            <ul style={{ fontSize: 12 }}>
              {maskedClient.cookiesClient.cookies.map((c: any) => (
                <li key={c.name}><code>{c.name}</code> = <code>{c.valuePreview}</code></li>
              ))}
            </ul>
          ) : <div style={{ fontSize: 12, color: '#64748b' }}>(No non-HttpOnly cookies readable by JS yet)</div>}
          <div style={{ marginTop: 8 }}><strong>LocalStorage:</strong> {maskedClient.storageLocal?.count ?? 0} keys ({maskedClient.storageLocal?.totalBytes ?? 0} bytes)</div>
          <div style={{ marginTop: 4 }}><strong>SessionStorage:</strong> {maskedClient.storageSession?.count ?? 0} keys ({maskedClient.storageSession?.totalBytes ?? 0} bytes)</div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Privacy Flags</h3>
          <div>Cookies Enabled: {String(maskedClient.cookiesEnabled)}</div>
          <div>Do Not Track: {String(maskedClient.doNotTrack)}</div>
          <div>Permissions: <pre style={{ fontSize: 12 }}>{maskedClient.permissions ? pretty(maskedClient.permissions) : '-'}</pre></div>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Raw JSON</h3>
        <pre style={{ fontSize: 12, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, overflow: 'auto' }}>{json}</pre>
      </section>

      <footer style={{ marginTop: 16, fontSize: 12, color: '#64748b' }}>
        Built for demos. No data is stored server-side unless you change the code. • Build 0.2.0
      </footer>
    </div>
  )
}
