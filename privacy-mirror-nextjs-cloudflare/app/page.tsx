'use client';

export const runtime = 'edge';                // run on the edge
export const dynamic = 'force-dynamic';       // never prerender
export const fetchCache = 'force-no-store';   // no fetch caching
export const revalidate = false;              // explicitly not ISR

type ServerPayload = {
  ip?: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  asn?: string | null;
  org?: string | null;
  method?: 'headers' | 'cf-object' | null;
  serverCookieNames?: string[];
  serverCookieCount?: number;
};

type WhoAmIResponse = ServerPayload & {
  error?: string;
};

type ClientPayload = {
  timestamp: string;
  url: string;
  timezone: string | null;
  locale: string | null;
  languages: string[];
  userAgent: string;
  platform: string | null;
  deviceMemory?: number | null;
  hardwareConcurrency?: number | null;
  screen?: { w: number; h: number } | null;
  cookiesEnabled: boolean;
  cookieNames: string[];
  cookieCount: number;
  webrtc: boolean;
  referrer: string | null;
  permissions: Record<string, 'granted' | 'denied' | 'prompt' | 'unknown'>;
  webgl: {
    vendor?: string;
    renderer?: string;
    canvasHash?: string;
  };
  network?: {
    downlink?: number;
    effectiveType?: string;
    rtt?: number;
  };
};

const section: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
  background: 'white',
};

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 16,
};

const mono: React.CSSProperties = {
  fontFamily:
    'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontSize: 12.5,
  lineHeight: 1.45,
};

function safeGetCookieNames(): string[] {
  if (typeof document === 'undefined') return [];
  const raw = document.cookie || '';
  if (!raw.trim()) return [];
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => pair.split('=')[0])
    .filter(Boolean);
}

async function queryPermission(name: PermissionName): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    // Safari doesn’t fully support navigator.permissions
    // @ts-ignore
    if (!navigator.permissions?.query) return 'unknown';
    // @ts-ignore
    const status = await navigator.permissions.query({ name });
    // Some browsers return 'prompt', others undefined → coerce
    return (status?.state as any) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function getWebGLInfo(): { vendor?: string; renderer?: string; canvasHash?: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') ||
      // @ts-ignore
      canvas.getContext('experimental-webgl');
    if (!gl) return {};
    // @ts-ignore
    const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
    // @ts-ignore
    const vendor = dbgInfo && gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL);
    // @ts-ignore
    const renderer = dbgInfo && gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL);

    // quick canvas hash
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 100, 20);
      ctx.fillStyle = '#069';
      ctx.fillText(navigator.userAgent, 2, 2);
    }
    const canvasHash = canvas.toDataURL().slice(-12); // short, non-sensitive display
    return { vendor, renderer, canvasHash };
  } catch {
    return {};
  }
}

function pretty(obj: any) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export default function Page() {
  const [server, setServer] = useState<ServerPayload | null>(null);
  const [client, setClient] = useState<ClientPayload | null>(null);
  const [scary, setScary] = useState(true); // default ON per your request
  const [copyOk, setCopyOk] = useState<'idle' | 'ok' | 'fail'>('idle');

  // 1) Fetch server-side facts (IP/geo/ASN + server cookies)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/whoami', { cache: 'no-store' });
        const data: WhoAmIResponse = await res.json();
        if (!mounted) return;
        setServer(data);
      } catch (e) {
        if (!mounted) return;
        setServer({ method: null });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 2) Gather client-side signals
  useEffect(() => {
    const hasWindow = typeof window !== 'undefined';

    (async () => {
      const permissions: ClientPayload['permissions'] = {
        'clipboard-read': await queryPermission('clipboard-read' as PermissionName),
        'clipboard-write': await queryPermission('clipboard-write' as PermissionName),
        geolocation: await queryPermission('geolocation'),
        notifications: await queryPermission('notifications'),
        microphone: await queryPermission('microphone' as PermissionName),
        camera: await queryPermission('camera' as PermissionName),
        'persistent-storage': await queryPermission('persistent-storage' as PermissionName),
      };

      const cookieNames = safeGetCookieNames();
      const nav = hasWindow ? navigator as any : undefined;
      const mem = (nav?.deviceMemory ?? null) as number | null;
      const cores = (nav?.hardwareConcurrency ?? null) as number | null;

      const net = (() => {
        const c = hasWindow ? (navigator as any).connection : undefined;
        if (!c) return undefined;
        return {
          downlink: typeof c.downlink === 'number' ? c.downlink : undefined,
          effectiveType: c.effectiveType || undefined,
          rtt: typeof c.rtt === 'number' ? c.rtt : undefined,
        };
      })();

      const webgl = hasWindow ? getWebGLInfo() : {};

      const payload: ClientPayload = {
        timestamp: new Date().toISOString(),
        url: hasWindow ? window.location.href : '',
        timezone: hasWindow ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? null : null,
        locale: hasWindow ? navigator.language ?? null : null,
        languages: hasWindow ? (navigator.languages ?? []).slice(0, 8) : [],
        userAgent: hasWindow ? navigator.userAgent : '',
        platform: hasWindow ? (navigator as any).platform ?? null : null,
        deviceMemory: mem,
        hardwareConcurrency: cores,
        screen: hasWindow ? { w: window.screen.width, h: window.screen.height } : null,
        cookiesEnabled: hasWindow ? navigator.cookieEnabled : false,
        cookieNames,
        cookieCount: cookieNames.length,
        webrtc: !!(hasWindow && (navigator as any).mediaDevices),
        referrer: hasWindow ? (document.referrer || null) : null,
        permissions,
        webgl,
        network: net,
      };

      setClient(payload);
    })();
  }, []);

  const maskedClient = useMemo(() => {
    if (!client) return null;
    // return exactly what we measured on the client (no masking).
    return client;
  }, [client]);

  const combined = useMemo(() => {
    return {
      server: server ?? {},
      client: maskedClient ?? {},
    };
  }, [server, maskedClient]);

  async function copyJson() {
    try {
      const text = pretty(combined);
      // Safari secure-context requirement: this runs on https
      await navigator.clipboard.writeText(text);
      setCopyOk('ok');
      setTimeout(() => setCopyOk('idle'), 1500);
    } catch {
      // fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = pretty(combined);
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopyOk('ok');
        setTimeout(() => setCopyOk('idle'), 1500);
      } catch {
        setCopyOk('fail');
        setTimeout(() => setCopyOk('idle'), 2000);
      }
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: '0 16px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: 0 }}>🔎 Privacy Mirror</h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0' }}>
            Everything a site can learn from your browser — plus server-side IP/ASN/geo via headers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={scary}
              onChange={(e) => setScary(e.target.checked)}
            />
            <span>😈 Scary mode</span>
          </label>
          <button
            onClick={copyJson}
            style={{
              border: '1px solid #d1d5db',
              padding: '8px 12px',
              borderRadius: 8,
              background: 'white',
              cursor: 'pointer',
            }}
            title="Copy all data as JSON"
          >
            {copyOk === 'ok' ? '✓ Copied' : copyOk === 'fail' ? '✗ Failed' : 'Copy JSON'}
          </button>
        </div>
      </header>

      {/* GRID */}
      <div style={grid}>
        <div style={section}>
          <b>Server View (IP &amp; Geo)</b>
          <pre style={mono}>{pretty(server ?? {})}</pre>
        </div>

        <div style={section}>
          <b>Locale &amp; Time</b>
          <pre style={mono}>
{pretty({
  timezone: client?.timezone ?? null,
  locale: client?.locale ?? null,
  languages: client?.languages ?? [],
  timestamp: client?.timestamp ?? null,
})}
          </pre>
        </div>

        <div style={section}>
          <b>Device &amp; OS</b>
          <pre style={mono}>
{pretty({
  platform: client?.platform ?? null,
  ua: client?.userAgent ?? '',
  CPU_cores: client?.hardwareConcurrency ?? null,
  RAM_gb_estimate: client?.deviceMemory ?? null,
  screen: client?.screen ?? null,
})}
          </pre>
        </div>

        <div style={section}>
          <b>Graphics / WebGL</b>
          <pre style={mono}>
{pretty({
  vendor: client?.webgl.vendor ?? undefined,
  renderer: client?.webgl.renderer ?? undefined,
  canvasHash: client?.webgl.canvasHash ?? undefined,
})}
          </pre>
        </div>

        <div style={section}>
          <b>Network</b>
          <pre style={mono}>
{pretty({
  referrer: client?.referrer ?? null,
  webrtcAvailable: client?.webrtc ?? false,
  connection: client?.network ?? undefined,
})}
          </pre>
        </div>

        <div style={section}>
          <b>Privacy Flags</b>
          <pre style={mono}>
{pretty({
  cookiesEnabled: client?.cookiesEnabled ?? false,
  doNotTrack: (typeof navigator !== 'undefined' && (navigator as any).doNotTrack) || null,
  permissions: client?.permissions ?? {},
})}
          </pre>
        </div>

        <div style={section}>
          <b>Cookies (client-side)</b>
          <pre style={mono}>
{pretty({
  count: client?.cookieCount ?? 0,
  names: client?.cookieNames ?? [],
})}
          </pre>
          {scary && (
            <div style={{ color: '#b91c1c', marginTop: 8 }}>
              ⚠ If any of these belong to analytics/ads, this visit can be linked to activity on other sites.
            </div>
          )}
        </div>

        <div style={section}>
          <b>Server cookies seen</b>
          <pre style={mono}>
{pretty({
  count: server?.serverCookieCount ?? 0,
  names: server?.serverCookieNames ?? [],
})}
          </pre>
          <div style={{ color: '#6b7280' }}>
            (Server can only see cookies scoped to this domain/path; third-party cookies may be blocked.)
          </div>
        </div>
      </div>

      {/* SCARY CALLOUTS */}
      {scary && (
        <div style={{ ...section, marginTop: 16, borderColor: '#fecaca', background: '#fff7ed' }}>
          <b>😈 Scary Mode — what could be inferred</b>
          <ul style={{ margin: '8px 0 0 18px' }}>
            <li>Your IP ({server?.ip ?? 'unknown'}) reveals country/region and ASN ({server?.asn ?? 'unknown'}).</li>
            <li>
              Combining User-Agent, languages, time zone, screen size, and WebGL renderer (
              {client?.webgl.renderer ?? 'unknown'}) makes your browser more unique.
            </li>
            <li>
              Cookies ({client?.cookieCount ?? 0}) can re-identify returning visits even if your IP changes.
            </li>
          </ul>
        </div>
      )}

      {/* RAW JSON */}
      <div style={{ ...section, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b>Raw JSON</b>
          <button
            onClick={copyJson}
            style={{
              border: '1px solid #d1d5db',
              padding: '6px 10px',
              borderRadius: 8,
              background: 'white',
              cursor: 'pointer',
            }}
            title="Copy all data as JSON"
          >
            {copyOk === 'ok' ? '✓ Copied' : copyOk === 'fail' ? '✗ Failed' : 'Copy JSON'}
          </button>
        </div>
        <pre style={{ ...mono, marginTop: 8 }}>{pretty(combined)}</pre>
      </div>

      <footer style={{ color: '#6b7280', fontSize: 12, marginTop: 16, textAlign: 'center' }}>
        Built for education. Nothing here is legal or security advice.
      </footer>
    </div>
  );
}
