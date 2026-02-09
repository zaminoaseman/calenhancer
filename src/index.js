/**
 * Cloudflare Worker: Secure iCal Proxy (Stealth Edition)
 * Features: Base64URL Encryption, Path-Based Routing, Glassmorphic UI, and One-Click Subscribe.
 * V4.3: SRH Branding & Calendar Naming.
 */

import { ICalLineUnfolder, ICalLineEnhancer } from './ical-parser.js';

// Configuration
const CONFIG = {
    ALLOWED_HOST: 'srh-community.campusweb.cloud',
    MAX_BODY_SIZE: 10 * 1024 * 1024, // 10 MB limit
};

// --- Cryptography & Encoding Utilities --- //

function base64UrlEncode(uint8Array) {
    let base64 = btoa(String.fromCharCode(...uint8Array));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const binaryStr = atob(str);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
}

async function getCryptoKey(secret) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret.padEnd(32, '0').substring(0, 32));
    return await crypto.subtle.importKey(
        'raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
    );
}

async function encrypt(text, secret) {
    const key = await getCryptoKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    // Combine IV + Ciphertext
    const buffer = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    buffer.set(iv, 0);
    buffer.set(new Uint8Array(ciphertext), iv.byteLength);

    return base64UrlEncode(buffer);
}

async function decrypt(token, secret) {
    try {
        const buffer = base64UrlDecode(token);
        const iv = buffer.slice(0, 12);
        const ciphertext = buffer.slice(12);
        const key = await getCryptoKey(secret);

        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        throw new Error('Decryption failed');
    }
}

function validateRequestUrl(urlStr) {
    let url;
    try {
        url = new URL(urlStr);
    } catch (e) {
        throw new Error('Malformed URL');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Protocol forbidden');
    }

    if (url.hostname !== CONFIG.ALLOWED_HOST) {
        throw new Error('Domain not authorized');
    }

    return url;
}

// --- HTML Content (UI) --- //
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Calendar Subscription Enhancer</title>
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>📅 Calendar Subscription Enhancer</h1>
            <p class="subtitle">Cleaner Calendar - Privacy - Map Friendly</p>
        </header>
        <main>
            <div class="card">
                <h2>Generate Secure Link</h2>
                <form id="enhanceForm">
                    <div class="form-group">
                        <label for="calendarUrl">Paste your SRH iCal URL</label>
                        <input type="url" id="calendarUrl" name="calendarUrl" placeholder="https://srh-community.campusweb.cloud/..." required>
                    </div>
                    <button type="submit" class="btn-primary">🔒 Encrypt & Enhance</button>
                </form>
            </div>
            
            <div id="result" class="card result-card" style="display: none;">
                <h2>🎉 Your Stealth Link</h2>
                <p class="instruction">Subscribe to this URL in your calendar app:</p>
                
                <div class="url-container">
                    <input type="text" id="enhancedUrl" readonly>
                    <div class="button-group">
                        <button id="copyBtn" class="btn-copy">📋 Copy</button>
                        <button id="googleCalBtn" class="btn-google">📅 Google Calendar</button>
                        <button id="addToCalBtn" class="btn-action">📅 Other Apps</button>
                    </div>
                </div>

                <div class="improvements">
                    <h3>✨ Active Enhancements:</h3>
                    <ul>
                        <li><strong>Stealth Routing:</strong> URL looks like a static file (Privacy+)</li>
                        <li><strong>Geo-Location:</strong> Exact GPS for navigation</li>
                        <li><strong>Clean Data:</strong> Emojis stripped, formatting fixed</li>
                    </ul>
                </div>
            </div>

            <div class="card faq-card">
                <h2>💬 Q&A</h2>
                <details>
                    <summary>What's the benefit of Calendar Subscription Enhancer?</summary>
                    <p>Calendar Subscription Enhancer transforms your basic SRH calendar into a premium experience: <strong>GPS coordinates</strong> for one-tap navigation to campus locations, <strong>clean formatting</strong> by removing unnecessary redundant information, <strong>privacy protection</strong> by stripping personal information, and <strong>zero-knowledge encryption</strong> so your calendar URL stays private. All while maintaining full compatibility with your favorite calendar apps.</p>
                </details>
                <details>
                    <summary>How secure is my calendar data?</summary>
                    <p>Your calendar URL is protected with <strong>AES-GCM 256-bit encryption</strong>. It's encrypted into the link itself and only decrypted temporarily in memory when fetching your calendar. We operate a strict <strong>zero-log policy</strong>—nothing is stored on our servers.</p>
                </details>
                <details>
                    <summary>What's that long encrypted string in my link?</summary>
                    <p>That's your <strong>Stealth Token</strong>—a URL-safe encrypted package containing your calendar information. To network observers, it appears as a regular file request, adding an extra layer of privacy protection.</p>
                </details>
                <details>
                    <summary>Which calendar apps are supported?</summary>
                    <p>All major platforms! We output standard <strong>iCal 2.0 format</strong>, which works seamlessly with Apple Calendar, Google Calendar, Microsoft Outlook, Notion, and any other RFC 5545-compliant calendar application.</p>
                </details>
            </div>

            <div id="error" class="card error-card" style="display: none;">
                <h2>❌ Error</h2>
                <p id="errorMessage"></p>
            </div>
        </main>
        <footer>
            <p>Made with ❤️ for SRH Students | <small>Zero-Knowledge Encryption</small></p>
        </footer>
    </div>
    <script src="/app.js"></script>
</body>
</html>`;

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        // CRITICAL: Ensure SECRET_KEY is set in production via `wrangler secret put`.
        // The fallback below is for LOCAL DEVELOPMENT ONLY.
        const SECRET = env.SECRET_KEY || 'dev-secret-do-not-use-in-prod-change-me';

        // 1. Static Assets
        if (url.pathname === '/' || url.pathname === '/index.html') {
            return new Response(HTML_CONTENT, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        if (url.pathname === '/styles.css') return handleStyles();
        if (url.pathname === '/app.js') return handleAppJS();

        // 2. API: Generate
        if (url.pathname === '/api/generate') {
            const target = url.searchParams.get('url');
            if (!target) return jsonResponse({ error: 'Missing URL' }, 400);
            try {
                validateRequestUrl(target);
                const token = await encrypt(target, SECRET);
                return jsonResponse({ enhancedUrl: `${url.origin}/view/${token}/calendar.ics` });
            } catch (e) {
                return jsonResponse({ error: e.message }, 400);
            }
        }

        // 3. API: View/Subscribe
        const pathParts = url.pathname.split('/');
        if (pathParts[1] === 'view' && pathParts[2]) {
            const token = pathParts[2];
            try {
                const targetUrlStr = await decrypt(token, SECRET);
                return await handleSubscribe(request, targetUrlStr);
            } catch (e) {
                return new Response('Not Found', { status: 404 });
            }
        }

        // 4. Legacy Support
        if (url.pathname === '/subscribe') {
            const target = url.searchParams.get('url');
            if (target) return await handleSubscribe(request, target);
        }

        return new Response('Not Found', { status: 404 });
    }
};

async function handleSubscribe(request, targetUrlStr) {
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });

    try {
        const validUrl = validateRequestUrl(targetUrlStr);

        const upstream = await fetch(validUrl.toString(), {
            headers: { 'User-Agent': 'Secure-SRH-Cal-Proxy/3.0', 'Accept': 'text/calendar' },
            redirect: 'manual'
        });

        if (upstream.status !== 200) return new Response('Upstream Error', { status: 502 });

        const cType = upstream.headers.get('content-type') || '';
        if (!cType.toLowerCase().includes('text/calendar') && !cType.toLowerCase().includes('text/plain')) {
            return new Response('Invalid Content-Type', { status: 415 });
        }

        const cLen = upstream.headers.get('content-length');
        if (cLen && parseInt(cLen) > CONFIG.MAX_BODY_SIZE) return new Response('File too large', { status: 413 });

        const unfolder = new ICalLineUnfolder();
        const enhancer = new ICalLineEnhancer();

        const { readable, writable } = new TransformStream({
            async transform(chunk, controller) {
                await unfolder.processChunk(chunk, controller, enhancer);
            },
            flush(controller) {
                unfolder.flush(controller, enhancer);
            }
        });

        upstream.body.pipeTo(writable).catch(e => console.error(`Stream error: ${e.message}`));

        const headers = new Headers();
        headers.set('Content-Type', 'text/calendar; charset=utf-8');
        headers.set('Content-Disposition', 'attachment; filename="srh-enhanced.ics"');
        headers.set('X-WR-CALNAME', 'My Schedule+'); // User Request: "My Schedule" + "+"
        headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
        headers.set('Referrer-Policy', 'no-referrer');

        return new Response(readable, { status: 200, headers });

    } catch (e) {
        console.error(`Proxy Error: ${e.message}`);
        return new Response('Internal Server Error', { status: 500 });
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function handleStyles() {
    const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    :root {
        --glass-bg: rgba(30, 41, 59, 0.7);
        --glass-border: rgba(255, 255, 255, 0.1);
        --primary: #D44407; /* SRH Grenadier Orange */
        --primary-dark: #B7410E; /* SRH Rust-Red */
        --secondary: #10b981;
        --text: #f1f5f9;
        --text-muted: #94a3b8;
    }

    body {
        font-family: 'Inter', sans-serif;
        background: radial-gradient(circle at top left, #2a1b15, #0f172a); /* Warm undertone */
        background-attachment: fixed;
        color: var(--text);
        min-height: 100vh;
        display: flex;
        justify-content: center;
        margin: 0;
        padding: 2rem;
    }

    .container { max-width: 600px; width: 100%; z-index: 1; }

    h1 {
        font-weight: 700;
        background: linear-gradient(135deg, #D44407 0%, #F28C3E 100%); /* SRH Orange Gradient */
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-align: center;
        margin-bottom: 0.5rem;
    }

    .subtitle { text-align: center; color: var(--text-muted); margin-bottom: 3rem; }

    .card {
        background: var(--glass-bg);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid var(--glass-border);
        border-radius: 1.5rem;
        padding: 2rem;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        margin-bottom: 2rem;
        transition: transform 0.2s;
    }
    .card:hover { transform: translateY(-2px); }

    label { display: block; font-size: 0.875rem; font-weight: 500; color: #cbd5e1; margin-bottom: 0.5rem; }

    input {
        width: 100%;
        box-sizing: border-box;
        padding: 1rem;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid var(--glass-border);
        border-radius: 0.75rem;
        color: white;
        font-size: 1rem;
        margin-bottom: 1.5rem;
        transition: all 0.2s;
    }
    input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(212, 68, 7, 0.2); }

    .btn-primary {
        width: 100%;
        padding: 1rem;
        background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
        color: white;
        border: none;
        border-radius: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s;
    }
    .btn-primary:hover { transform: translateY(-1px); }

    /* URL Container & Action Buttons */
    .url-container {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        background: rgba(0,0,0,0.2);
        padding: 1rem;
        border-radius: 0.75rem;
        border: 1px solid var(--glass-border);
    }
    .url-container input { margin-bottom: 0; background: transparent; border: none; font-family: monospace; font-size: 0.85rem; padding: 0.5rem; width: 100%; color: #a5b4fc; }
    
    .button-group {
        display: flex;
        gap: 0.5rem;
    }
    
    .btn-copy, .btn-action, .btn-google {
        flex: 1;
        padding: 0.75rem;
        border: 1px solid var(--glass-border);
        border-radius: 0.5rem;
        cursor: pointer;
        font-weight: 500;
        font-size: 0.9rem;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }

    .btn-copy { background: rgba(255,255,255,0.05); color: white; }
    .btn-copy:hover { background: rgba(255,255,255,0.15); }

    .btn-action { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border-color: rgba(16, 185, 129, 0.3); }
    .btn-action:hover { background: rgba(16, 185, 129, 0.3); transform: translateY(-1px); }

    .btn-google { background: rgba(66, 133, 244, 0.2); color: #93c5fd; border-color: rgba(66, 133, 244, 0.3); }
    .btn-google:hover { background: rgba(66, 133, 244, 0.3); transform: translateY(-1px); }

    .improvements h3 { font-size: 0.9rem; color: #818cf8; margin-top: 1.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .improvements ul { list-style: none; padding: 0; }
    .improvements li { font-size: 0.9rem; color: var(--text-muted); margin: 0.5rem 0; padding-left: 1.5rem; position: relative; }
    .improvements li::before { content: "✦"; position: absolute; left: 0; color: var(--primary); }
    
    .instruction { font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem; }

    /* FAQ Styles - Dimmed for less prominence */
    .faq-card { 
        opacity: 0.6; 
        transition: opacity 0.3s;
    }
    .faq-card:hover { 
        opacity: 0.85; 
    }
    .faq-card details { margin-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 1rem; }
    .faq-card details:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .faq-card summary { font-weight: 500; cursor: pointer; color: #94a3b8; outline: none; list-style: none; }
    .faq-card summary::-webkit-details-marker { display: none; }
    .faq-card p { font-size: 0.85rem; color: #64748b; margin-top: 0.5rem; line-height: 1.5; }

    footer { text-align: center; margin-top: 4rem; font-size: 0.875rem; color: #64748b; }
    `;
    return new Response(css, { headers: { 'Content-Type': 'text/css' } });
}

function handleAppJS() {
    const js = `
    document.getElementById('enhanceForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const err = document.getElementById('errorMessage');
        const res = document.getElementById('result');
        const input = document.getElementById('calendarUrl');
        
        btn.disabled = true; btn.textContent = 'Encrypting...';
        err.parentElement.style.display = 'none'; res.style.display = 'none';
        
        try {
            const req = await fetch('/api/generate?url=' + encodeURIComponent(input.value));
            const data = await req.json();
            if(!req.ok) throw new Error(data.error);
            
            document.getElementById('enhancedUrl').value = data.enhancedUrl;
            res.style.display = 'block';
        } catch(e) {
            err.textContent = e.message;
            err.parentElement.style.display = 'block';
        } finally {
            btn.disabled = false; btn.textContent = '🔒 Encrypt & Enhance';
        }
    });

    document.getElementById('copyBtn').addEventListener('click', () => {
        const el = document.getElementById('enhancedUrl');
        el.select();
        navigator.clipboard.writeText(el.value);
        const btn = document.getElementById('copyBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copied';
        setTimeout(() => btn.innerHTML = originalText, 1500);
    });

    // Dynamic 'Add to Calendar' Handler (Generic)
    document.getElementById('addToCalBtn').addEventListener('click', () => {
        const rawUrl = document.getElementById('enhancedUrl').value;
        if (!rawUrl) return;
        
        // Replace https:// with webcal:// to force OS calendar app
        const webcalUrl = rawUrl.replace(/^https?:\\/\\//, 'webcal://');
        window.location.href = webcalUrl;
    });

    // Google Calendar Specific Handler
    document.getElementById('googleCalBtn').addEventListener('click', () => {
        const rawUrl = document.getElementById('enhancedUrl').value;
        if (!rawUrl) return;

        // Google Calendar often prefers 'webcal://' in the cid parameter for subscription
        const webcalUrl = rawUrl.replace(/^https?:\\/\\//, 'webcal://');
        const googleUrl = 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(webcalUrl);
        window.open(googleUrl, '_blank');
    });
    `;
    return new Response(js, { headers: { 'Content-Type': 'application/javascript' } });
}
