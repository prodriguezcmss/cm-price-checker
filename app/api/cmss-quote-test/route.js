import { createHmac, timingSafeEqual } from 'node:crypto';
import payload from './payload.json';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const START = Date.parse('2026-09-15T21:45:00Z');
const END = Date.parse('2026-09-16T17:45:00Z');
const RUN = 'cmss-quote-email-20260915-sample-001';
const headers = {'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
function enabled() { return process.env.VERCEL_ENV==='preview' && process.env.VERCEL_GIT_COMMIT_REF==='cmss-quote-email-preview' && process.env.CMSS_QUOTE_RESEND_API_KEY && /^[^\s<>@,;]+@cmschoolsupply\.com$/.test(process.env.CMSS_QUOTE_TEST_RECIPIENT||'') && Date.now()>=START && Date.now()<END; }
function nonce() { return createHmac('sha256',process.env.CMSS_QUOTE_RESEND_API_KEY).update(RUN).digest('hex'); }
function reply(text,status=200) { return new Response(text,{status,headers}); }
export async function GET() {
 if(!enabled()) return reply('Quote email test is closed.',404);
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CMSS quote delivery test</title><main><h1>CMSS quote delivery test</h1><p>Send the sample quote PDF from shop@cmschoolsupply.com to the configured CMSS test inbox.</p><p>This sample does not place an order or request payment. Repeating this test reuses the same email delivery.</p><form method="post"><input type="hidden" name="nonce" value="${nonce()}"><button type="submit">Send sample quote</button></form></main></html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
export async function POST(request) {
 if(!enabled()) return reply('Quote email test is closed.',404);
 const origins=[process.env.VERCEL_URL,process.env.VERCEL_BRANCH_URL].filter(Boolean).map(host=>`https://${host}`);
 if(!origins.includes(request.headers.get('origin'))) return reply('Open the test from its protected preview page.',403);
 if(Number(request.headers.get('content-length')||0)>1024) return reply('Invalid test request.',413);
 const raw=await request.text();
 if(Buffer.byteLength(raw)>1024) return reply('Invalid test request.',413);
 const actual=Buffer.from(new URLSearchParams(raw).get('nonce')||'');
 const expected=Buffer.from(nonce());
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected)) return reply('Reload the preview before sending.',403);
 try {
  const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.CMSS_QUOTE_RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':RUN},body:JSON.stringify({...payload,to:[process.env.CMSS_QUOTE_TEST_RECIPIENT]}),signal:AbortSignal.timeout(20000)});
  const data=await result.json().catch(()=>({}));
  if(!result.ok||!data.id) return reply('The provider did not accept the test. Check the Resend logs before retrying.',502);
  return reply(`Resend accepted the sample quote for the configured CMSS test inbox. Message ID: ${data.id}. Check delivery status and the PDF in the inbox. Customer automation is not active.`);
 } catch { return reply('Delivery status is uncertain. Check Resend first. A retry within this test window uses the same delivery key.',502); }
}
