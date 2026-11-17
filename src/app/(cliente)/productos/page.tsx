'use client';

import Link from 'next/link';
import { useApp } from '@/components/client/app-context';
import { PageTitle } from '@/components/ui';
import { money } from '@/lib/format';

export default function Productos() {
  const { config, draft, setDraft } = useApp();
  const chosen = draft.productIds;
  const toggle = (id: string) =>
    setDraft({ productIds: chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id] });

  return (
    <div className="flex flex-col gap-3 px-4 pt-7 pb-6">
      <PageTitle kicker="Productos" title="Para tu peinado en casa" sub="Sumalos a tu turno y los pagás en el local." />
      <div className="h-1" />
      {config.products.length === 0 && <span className="px-1 text-muted">Pronto vas a ver los productos acá.</span>}
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
              <span className="text-sm font-medium text-accent">{p.price !== null ? money(p.price) : 'Consultar'}</span>
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
      {chosen.length > 0 && (
        <Link href="/turno" className="mt-2 flex min-h-14 items-center justify-center rounded-full bg-accent text-[17px] font-semibold text-bg">
          Seguir con mi turno →
        </Link>
      )}
    </div>
  );
}
