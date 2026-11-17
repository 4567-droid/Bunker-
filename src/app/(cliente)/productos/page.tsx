'use client';

import Link from 'next/link';
import { useApp } from '@/components/client/app-context';
import { PageTitle } from '@/components/ui';
import { money } from '@/lib/format';
import { enviarWhatsApp } from '@/lib/whatsapp';

export default function Productos() {
  const { config, draft, setDraft } = useApp();
  const biz = config.business;
  const ask = (name: string) =>
    biz.whatsapp ? enviarWhatsApp({ to: biz.whatsapp, text: `Hola ${biz.name.split(/\s+/)[0]}! Quería consultar el precio de ${name}.` }).url : null;
  const chosen = draft.productIds;
  const toggle = (id: string) =>
    setDraft({ productIds: chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id] });

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3 px-4 pt-7 pb-6 md:max-w-[1080px] md:px-10">
      <PageTitle kicker="Productos" title="Para tu peinado en casa" sub="Sumalos a tu turno y los pagás en el local." />
      <div className="h-1" />
      {config.products.length === 0 && <span className="px-1 text-muted">Pronto vas a ver los productos acá.</span>}
      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4 lg:grid-cols-3">
      {config.products.map((p) => {
        const on = chosen.includes(p.id);
        return (
          <article key={p.id} className={`flex flex-col gap-2.5 overflow-hidden rounded-[20px] border-[1.5px] bg-card px-5 py-[18px] ${on ? 'border-accent' : 'border-line'}`}>
            {p.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt={p.name} loading="lazy" className="-mx-5 -mt-[18px] mb-1 aspect-[4/3] w-[calc(100%+40px)] max-w-none object-cover" />
            )}
            <div className="flex items-baseline justify-between gap-2.5">
              <h2 className="m-0 text-lg font-medium">{p.name}</h2>
              {p.price !== null ? (
                <span className="text-sm font-medium text-accent">{money(p.price)}</span>
              ) : ask(p.name) ? (
                <a href={ask(p.name)!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center text-sm font-medium text-accent underline underline-offset-4">
                  Consultar precio
                </a>
              ) : (
                <span className="text-sm font-medium text-accent">Consultar</span>
              )}
            </div>
            {p.description && <span className="text-sm font-light text-muted">{p.description}</span>}
            <button
              type="button"
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              className={`min-h-[46px] rounded-full border border-accent text-[15px] font-medium ${on ? 'bg-accent text-bg' : 'bg-transparent text-ink'}`}
            >
              {on ? '✓ Sumado a mi turno' : 'Sumar a mi turno'}
            </button>
          </article>
        );
      })}
      </div>
      {chosen.length > 0 && (
        <Link href="/turno" className="mt-2 flex min-h-14 md:mx-auto md:w-full md:max-w-[420px] items-center justify-center rounded-full bg-accent text-[17px] font-semibold text-bg">
          Seguir con mi turno →
        </Link>
      )}
    </div>
  );
}
