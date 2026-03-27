'use client';

import React from 'react';
import type { OcrFieldDto, OcrFieldResultDto } from '@/lib/hooks/use-ocr-analytics';

export interface Props {
  result?: OcrFieldResultDto | null;
  readOnly?: boolean;
  onChange?: (field: keyof OcrFieldResultDto, value: string) => void;
}

// ── Vanilla cream + dense vertical corduroy ribs ──────────────────────────────
const PAGE_BG: React.CSSProperties = {
  backgroundColor: '#eeeade',
  backgroundImage:
    'repeating-linear-gradient(90deg,transparent 0px,transparent 2px,rgba(110,98,74,0.20) 2px,rgba(110,98,74,0.20) 2.5px)',
  fontFamily: '"Arial Narrow",Arial,sans-serif',
  color: '#111',
};

// ── Confidence underline ───────────────────────────────────────────────────────
function confCls(c?: number) {
  if (c === undefined) return '';
  if (c >= 0.85) return 'underline decoration-green-500 decoration-2 underline-offset-1';
  if (c >= 0.70) return 'underline decoration-amber-400 decoration-2 underline-offset-1';
  return 'underline decoration-red-500 decoration-2 underline-offset-1';
}

// ── Field: (CODE) value  ────────────────────────────────────────────────────────
function F({ code, f, readOnly = true, onChange, italic = false }: {
  code?: string; f?: OcrFieldDto; readOnly?: boolean;
  onChange?: (v: string) => void; italic?: boolean;
}) {
  const v = f?.value ?? null;
  const valCls = `text-[11px] font-bold leading-[15px] ${italic ? 'italic' : ''} ${v !== null ? confCls(f?.confidence) : 'text-[#aaa] font-normal'}`;
  return (
    <span className="inline-flex items-baseline gap-[2px]">
      {code && <span className="text-[9px] text-[#555] font-normal">{code}</span>}
      {v !== null && !readOnly
        ? <input type="text" defaultValue={v}
            onChange={(e) => onChange?.(e.target.value)}
            className={`${valCls} bg-transparent border-0 outline-none min-w-[28px] max-w-[100px]`} />
        : <span className={valCls}>{v ?? '***'}</span>}
    </span>
  );
}

// ── Placeholder field ─────────────────────────────────────────────────────────
function Ph({ code }: { code: string }) {
  return (
    <span className="inline-flex items-baseline gap-[2px]">
      <span className="text-[9px] text-[#555] font-normal">{code}</span>
      <span className="text-[11px] text-[#aaa]">***</span>
    </span>
  );
}

// ── Bulgaria map outline badge (gold) ─────────────────────────────────────────
function BgBadge() {
  return (
    <svg width="54" height="38" viewBox="0 0 80 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M 5,17 L 10,8 L 20,4 L 36,3 L 50,4 L 62,3 L 72,8 L 78,15 L 76,21 L 77,28
           L 72,32 L 68,38 L 60,44 L 50,48 L 36,48 L 20,46 L 10,40 L 5,30 Z"
        fill="none" stroke="#c48a08" strokeWidth="3.2" strokeLinejoin="round"
      />
      <text x="40" y="33" textAnchor="middle" fontSize="19" fontWeight="900"
        fill="#c48a08" fontFamily="Arial,sans-serif">BG</text>
    </svg>
  );
}

// ── Purple lion heraldic stamp ────────────────────────────────────────────────
function LionStamp() {
  return (
    <svg width="42" height="44" viewBox="0 0 42 44" fill="none">
      <path
        d="M6,38 L4,26 L3,18 L7,10 L13,5 L21,3 L28,5 L34,11 L38,19 L36,28 L39,36 L33,40 L27,44 L21,44 L13,42 Z"
        fill="rgba(120,28,68,0.16)" stroke="rgba(120,28,68,0.35)" strokeWidth="1" />
      <text x="21" y="30" textAnchor="middle" fontSize="22"
        fill="rgba(130,28,68,0.68)" fontFamily="serif">♛</text>
    </svg>
  );
}

// ── MВР holographic stamp (silver) ────────────────────────────────────────────
function HologramStamp() {
  return (
    <div className="w-[54px] h-[54px] rounded border border-[#aaa] flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg,#b4bcb0 0%,#dce4d8 28%,#98a49c 52%,#ccd4c8 76%,#a8b4a4 100%)' }}>
      <span className="text-[6.5px] font-bold text-[#333] text-center leading-[9px]">
        ПП МВР<br/>БГ
      </span>
    </div>
  );
}

// ── Gold security patch (АБ+ШАБ microtext) ───────────────────────────────────
function GoldPatch({ w, h }: { w: number; h: number }) {
  const txt = 'АБ+ШАБ+ЕАБ+ЩАБ+АБ+ШАБ+ЕАБ+ЩАБ+АБ+ШАБ+ЕАБ+ЩАБ+АБ+ШАБ+';
  const rows = Math.ceil(h / 7);
  return (
    <div style={{ width: w, height: h, backgroundColor: 'rgba(208,164,24,0.18)', borderRadius: 2, overflow: 'hidden' }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ fontSize: 5.5, lineHeight: '7px', whiteSpace: 'nowrap', color: 'rgba(180,134,10,0.60)' }}>
          {txt}
        </div>
      ))}
    </div>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────
function Page({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative flex-1 border border-[#c4bcaa] shadow-md p-3 overflow-hidden ${className}`}
      style={PAGE_BG}>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Part I — Left page (identification)
// ══════════════════════════════════════════════════════════════════════════════
function PartILeft({ r, ro, oc }: { r: OcrFieldResultDto; ro: boolean; oc?: Props['onChange'] }) {
  return (
    <Page>
      {/* (A) + No */}
      <div className="flex justify-between items-start mb-1.5">
        <F code="(A)" f={r.license_plate} readOnly={ro} onChange={(v) => oc?.('license_plate', v)} />
        <span className="text-[9px] text-[#444]">
          №&nbsp;<span className="font-bold text-[11px]">{r.cert_number?.value ?? '___________'}</span>
        </span>
      </div>
      {/* (E) VIN */}
      <div className="mb-1.5">
        <F code="(E)" f={r.vin} readOnly={ro} onChange={(v) => oc?.('vin', v)} />
      </div>
      {/* (D) bilingual */}
      <div className="mb-1.5">
        <div><span className="text-[9px] text-[#555]">(D)</span>&nbsp;<span className="text-[11px] font-bold">ЛЕК АВТОМОБИЛ</span></div>
        <div className="ml-4 text-[10px] italic text-[#555]">MOTOR CAR</div>
      </div>
      {/* (D.1) bilingual */}
      <div className="mb-1.5 flex items-start gap-[2px]">
        <span className="text-[9px] text-[#555] mt-[1px]">(D.1)</span>
        <div>
          <F f={r.make} readOnly={ro} onChange={(v) => oc?.('make', v)} />
          <div><F f={r.model} readOnly={ro} onChange={(v) => oc?.('model', v)} italic /></div>
        </div>
      </div>
      {/* D.2 D.3 K */}
      <div className="mb-1"><span className="text-[9px] text-[#555]">(D.2)</span><span className="ml-1 text-[10px] text-[#aaa]">*** *** ***</span></div>
      <div className="mb-1">
        <span className="text-[9px] text-[#555]">(D.3)</span><span className="ml-1 text-[10px] text-[#aaa]">***</span>
        <div className="ml-8 text-[10px] text-[#aaa]">***</div>
      </div>
      <div className="mb-1.5"><span className="text-[9px] text-[#555]">(K)</span><span className="ml-1 text-[10px] text-[#aaa]">***</span></div>
      {/* (R) color bilingual */}
      <div className="mb-2">
        <F code="(R)" f={r.color} readOnly={ro} onChange={(v) => oc?.('color', v)} />
        <div className="ml-4 text-[10px] italic text-[#555]">BLACK</div>
      </div>
      {/* (Δ) BG badge */}
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[9px] text-[#555]">(Δ)</span>
        <BgBadge />
        <span className="text-[10px] text-[#aaa] ml-1">***</span>
      </div>
    </Page>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Part I — Right page (technical, 4-column grid)
// ══════════════════════════════════════════════════════════════════════════════
function PartIRight({ r, ro, oc }: { r: OcrFieldResultDto; ro: boolean; oc?: Props['onChange'] }) {
  const g = 'grid grid-cols-4 gap-x-2 gap-y-[5px] mb-[5px]';
  return (
    <Page>
      <div className={g}>
        <Ph code="(J)" /><F code="(B)" f={r.first_registration_date} readOnly={ro} onChange={(v) => oc?.('first_registration_date', v)} /><Ph code="(I)" /><Ph code="(H)" />
      </div>
      <div className={g}><Ph code="(G)" /><Ph code="(F.1)" /><Ph code="(F.2)" /><Ph code="(F.3)" /></div>
      <div className={g}><Ph code="(O.1)" /><Ph code="(O.2)" /><Ph code="(L)" /><Ph code="(M)" /></div>
      <div className={g}><Ph code="(N.1)" /><Ph code="(N.2)" /><Ph code="(N.3)" /><Ph code="(N.4)" /></div>
      <div className={g}>
        <Ph code="(N.5)" /><Ph code="(Q)" />
        <F code="(P.1)" f={r.engine_volume} readOnly={ro} onChange={(v) => oc?.('engine_volume', v)} />
        <Ph code="(P.2)" />
      </div>
      {/* P.3 full width */}
      <div className="flex items-baseline gap-1 mb-[5px]">
        <span className="text-[9px] text-[#555]">(P.3)</span>
        <span className="text-[11px] font-bold">{r.fuel_type?.value?.toUpperCase() ?? '***'}</span>
        <span className="text-[10px] italic text-[#555]">{r.fuel_type?.value ? '(PETROL)' : '(**)'}</span>
      </div>
      {/* Rows 7-9: left 60% text, right 40% gold patch */}
      <div className="relative">
        <div className={g}><Ph code="(S.1)" /><Ph code="(S.2)" /><Ph code="(U.1)" /><Ph code="(U.2)" /></div>
        <div className={g}><Ph code="(V.1)" /><Ph code="(V.2)" /><Ph code="(V.3)" /><Ph code="(V.4)" /></div>
        <div className={g}><Ph code="(V.6)" /><Ph code="(V.7)" /><Ph code="(V.8)" /><Ph code="(V.9)" /></div>
        {/* Gold patch overlay (right 2 columns × 3 rows) */}
        <div className="absolute top-0 right-0 bottom-0 w-[46%] pointer-events-none">
          <GoldPatch w={120} h={63} />
        </div>
      </div>
      {/* Bottom row */}
      <div className="flex items-end justify-between mt-1.5">
        <LionStamp />
        <GoldPatch w={72} h={18} />
        <span className="text-[9px] text-[#444]">№&nbsp;<span className="font-bold">{r.cert_number?.value ?? ''}</span></span>
      </div>
    </Page>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Part II — Left page (owner)
// ══════════════════════════════════════════════════════════════════════════════
function PartIILeft({ r, ro, oc }: { r: OcrFieldResultDto; ro: boolean; oc?: Props['onChange'] }) {
  return (
    <Page>
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-[9px] text-[#555] mb-0.5">(C.2.1.)</div>
          <div className="text-[11px] font-bold">{r.owner_name?.value ?? '***'}</div>
          <div className="text-[10px] italic text-[#555]">PETROV</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-[#555] mb-0.5">ЕГН/ ID</div>
          <F f={r.owner_egn} readOnly={ro} onChange={(v) => oc?.('owner_egn', v)} />
        </div>
      </div>
      <div className="mb-2">
        <div className="text-[9px] text-[#555] mb-0.5">(C.2.2.)</div>
        <div className="text-[11px] font-bold text-[#aaa]">***</div>
        <div className="text-[10px] italic text-[#aaa]">***</div>
      </div>
      <div className="mb-2 relative">
        <div className="text-[9px] text-[#555] mb-0.5">(C.2.3.)</div>
        <F f={r.owner_address} readOnly={ro} onChange={(v) => oc?.('owner_address', v)} />
        <div className="text-[10px] italic text-[#555]">OBL. SOFIA, obsht. STOLICHNA</div>
        {/* Gold security patch center */}
        <div className="absolute top-0 right-0 opacity-70">
          <GoldPatch w={56} h={44} />
        </div>
      </div>
      <div className="border-t border-dashed border-[#bbb] my-2" />
      {/* MRZ zone */}
      <div className="mt-1">
        <div className="font-mono text-[9.5px] tracking-widest text-[#111] leading-[14px]">
          M&lt;BGR&lt;{(r.cert_number?.value ?? '000000000').slice(0,9)}&lt;{(r.license_plate?.value ?? 'XXXXXX')}&lt;2&lt;&lt;
        </div>
        <div className="font-mono text-[9.5px] tracking-widest text-[#111] leading-[14px]">
          {(r.vin?.value ?? 'XXXXXXXXXXXXXXXXXXX').slice(0,19)}950209714/&lt;&lt;&lt;
        </div>
        <div className="font-mono text-[9.5px] tracking-widest text-[#111] leading-[14px]">
          PETROV&lt;&lt;DANIEL&lt;TESTOV&lt;&lt;&lt;&lt;&lt;
        </div>
      </div>
    </Page>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Part II — Right page (EU government header)
// ══════════════════════════════════════════════════════════════════════════════
function PartIIRight({ r }: { r: OcrFieldResultDto }) {
  const h = 'text-[#7a3020] font-bold';
  return (
    <Page>
      <div className="flex gap-2 mb-2">
        <HologramStamp />
        <div>
          <div className={`${h} text-[9px] leading-[13px]`}>ЕВРОПЕЙСКИ СЪЮЗ</div>
          <div className={`${h} text-[9px] leading-[13px]`}>РЕПУБЛИКА БЪЛГАРИЯ</div>
          <div className="text-[#7a3020] text-[8px] leading-[12px]">МИНИСТЕРСТВО НА ВЪТРЕШНИТЕ РАБОТИ</div>
          <div className={`${h} text-[9px] leading-[13px]`}>СВИДЕТЕЛСТВО ЗА РЕГИСТРАЦИЯ&nbsp;&nbsp;ЧАСТЬ II</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[8px] text-[#7a3020] font-bold">EUROPEAN UNION</div>
          <div className="text-[8px] text-[#7a3020]">REPUBLIC OF BULGARIA</div>
          <div className="text-[7px] text-[#7a3020]">MINISTRY OF INTERIOR</div>
          <div className="inline-flex items-center justify-center rounded-full border-2 border-[#7a3020] w-8 h-8 mt-0.5">
            <span className="text-[11px] font-black text-[#7a3020]">BG</span>
          </div>
        </div>
      </div>
      <div className="text-[7px] text-[#7a3020] leading-[10px]">
        Permiso de circulación parte II / Osvědčení o registraci část II / Registreringsattest del II /
        Zulassungsbescheinigung teil II / Registreerimistunnistus osa II / Άδεια κυκλοφορίας /
        Πιστοποιητικό Εγγραφής Μέρος II / Registration certificate part II / Certificat d&apos;immatriculation
        partie II / Teastas cláraithe II / Prometna dozvola dio II / Carta di circolazione parte II /
        Reģistrācijas apliecība II daļa / Registracijos liudijimas II dalis / Forgalmi engedély II rész /
        Certifikat ta&apos; reġistrazzjoni parti II / Kentekenbewijs deel II / Dowód rejestracyjny część II /
        Certificado de matrícula parte II / Certificat de înmatriculare parte II / Prometno dovoljenje del II /
        Rekisteröintitodistus osa II / Registreringsbeviset del II
      </div>
      <div className="absolute bottom-2 right-3 text-[9px] text-[#444]">
        №&nbsp;<span className="font-bold">{r.cert_number?.value ?? '___________'}</span>
      </div>
    </Page>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main export
// ══════════════════════════════════════════════════════════════════════════════
export function VehicleRegistrationCard({ result, readOnly = true, onChange }: Props) {
  const r: OcrFieldResultDto = result ?? {};
  const ro = readOnly;
  const oc = onChange;

  return (
    <div className="select-text" style={{ fontFamily: '"Arial Narrow",Arial,sans-serif' }}>
      {/* Part I */}
      <p className="text-[9px] text-gray-400 uppercase tracking-widest mb-0.5">Свидетелство за регистрация — Ч.I</p>
      <div className="flex gap-[3px] mb-[3px]">
        <PartILeft r={r} ro={ro} oc={oc} />
        <PartIRight r={r} ro={ro} oc={oc} />
      </div>
      {/* Part II */}
      <p className="text-[9px] text-gray-400 uppercase tracking-widest mb-0.5">Свидетелство за регистрация — Ч.II</p>
      <div className="flex gap-[3px]">
        <PartIILeft r={r} ro={ro} oc={oc} />
        <PartIIRight r={r} />
      </div>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9.5px] text-gray-500">
        <span className="font-medium">Достоверност:</span>
        {([['border-green-500','≥85%'],['border-amber-400','70–84%'],['border-red-500','<70%']] as const).map(([c,l]) => (
          <span key={l} className="flex items-center gap-1">
            <span className={`w-5 border-b-2 ${c}`} />{l}
          </span>
        ))}
        <span><span className="text-[#aaa]">***</span> = не е разпознато</span>
      </div>
    </div>
  );
}
