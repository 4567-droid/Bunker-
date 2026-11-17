'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/client/app-context';
import { Card, Kicker, PageTitle, StampGrid } from '@/components/ui';
import { addDays, dayLabel } from '@/lib/time';
import { enviarWhatsApp } from '@/lib/whatsapp';

export default function Fidelidad() {
  const { config, me } = useApp();
  const biz = config.business;
  const goal = biz.loyaltyGoal;
  const c = me?.client ?? null;
  const stamps = c ? Math.min(c.stamps, goal - 1) : 6;
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const visitsToFree = Math.ceil((goal - 1 - 1) / 2) + 2; // 1 + 2 + 2… hasta llenar, y la siguiente gratis
  const inviteUrl = c ? `${origin}/?ref=${c.referralCode}` : origin;
  const inviteText =
    `Te invito a ${biz.name}! Si nunca te cortaste ahí, tenemos ${biz.referralPercent}% de descuento cada uno ` +
    `en el primer corte. Reservá acá: ${inviteUrl}`;
  const invite = enviarWhatsApp({ text: inviteText }).url;
  const available = (me?.rewards ?? []).filter((r) => r.status !== 'used');
  const doubleUntil = c?.lastVisitOn && biz.doubleStampDays ? addDays(c.lastVisitOn, biz.doubleStampDays) : null;

  return (
    <div className="flex flex-col gap-4 px-4 pt-7 pb-6">
      <PageTitle kicker="Fidelidad" title={`El ${goal}.º corte es gratis`} />

      <Card className="gap-[18px] rounded-3xl p-[22px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium tracking-[.32em]">{biz.name.split(/\s+/)[0].toUpperCase()}</span>
          <span className="text-sm font-light text-muted">{c ? c.name : 'Ejemplo'}</span>
        </div>
        <StampGrid stamps={stamps} goal={goal} />
        <div className="flex justify-between gap-2.5 text-[15px]">
          <span className="font-medium">
            {stamps} de {goal} sellos
          </span>
          <span className="font-light text-muted">El {goal}.º es gratis</span>
        </div>
        {c?.nextFree && <span className="text-[15px] font-medium text-accent">Tarjeta llena: tu próximo corte es gratis.</span>}
        {!c && (
          <Link href="/cuenta" className="flex min-h-[52px] items-center justify-center rounded-full bg-accent text-base font-semibold text-bg">
            Crear mi tarjeta
          </Link>
        )}
      </Card>

      {biz.doubleStampDays > 0 && (
        <section className="flex flex-col gap-1.5 rounded-[20px] bg-accent px-[22px] py-5 text-bg">
          <span className="text-[13px] font-semibold tracking-[.18em]">PROMO DEL MES</span>
          <span className="text-2xl font-bold">Doble sello</span>
          <span className="text-[15px]">
            Si volvés antes de {biz.doubleStampDays} días, ese corte suma 2 sellos. Llegás al gratis en {visitsToFree} visitas.
          </span>
          {doubleUntil && doubleUntil >= config.today && (
            <span className="text-sm font-semibold">Tu doble sello vale hasta el {dayLabel(doubleUntil).toLowerCase()}.</span>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-[20px] border border-line-2 px-5 py-[18px]">
        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-base font-medium">Invitá a un amigo</span>
            <span className="text-sm font-light text-muted">{biz.referralPercent}% para cada uno en su primer corte</span>
          </span>
          {c ? (
            <a
              href={invite}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-wa px-4 text-sm font-semibold text-wa-ink"
            >
              Invitar
            </a>
          ) : (
            <Link href="/cuenta" className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line-2 px-4 text-sm">
              Crear cuenta
            </Link>
          )}
        </div>
        {c && (
          <span className="text-[13px] font-light text-muted">
            Tu código: <span className="font-medium tracking-wider text-ink">{c.referralCode}</span>
            {me?.referrals?.invited ? ` · invitaste a ${me.referrals.invited}` : ''}
          </span>
        )}
      </section>

      {available.length > 0 && (
        <Card className="gap-2 px-5 py-[18px]">
          <Kicker>Tus beneficios</Kicker>
          {available.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3">
              <span className="text-[15px]">
                {r.kind === 'welcome' ? `Bienvenida${r.from ? ` (te invitó ${r.from})` : ''}` : `Invitaste a ${r.from ?? 'un amigo'}`}
              </span>
              <span className="text-[15px] font-semibold text-accent">
                {r.percent}% {r.status === 'reserved' ? '· en tu turno' : ''}
              </span>
            </div>
          ))}
          <span className="text-[13px] font-light text-muted">Se aplican solos en tu próximo turno.</span>
        </Card>
      )}
    </div>
  );
}
