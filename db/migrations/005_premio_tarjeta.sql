-- Premio de la tarjeta de fidelidad: lo elige cada negocio en Central → Ajustes.
--   free     = el corte del premio sale gratis (como hasta ahora)
--   discount = ese corte tiene un % de descuento (loyalty_reward_pct)
--   gift     = ese corte se cobra normal y se lleva un regalo (loyalty_reward_text, ej: "una cera mate")
-- La cantidad de cortes sigue en loyalty_goal (el N.º corte tiene el premio).
alter table businesses add column if not exists loyalty_reward      text not null default 'free';
alter table businesses add column if not exists loyalty_reward_pct  int  not null default 50;
alter table businesses add column if not exists loyalty_reward_text text;

do $$
begin
  alter table businesses add constraint businesses_loyalty_reward_check
    check (loyalty_reward in ('free', 'discount', 'gift'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table businesses add constraint businesses_loyalty_reward_pct_check
    check (loyalty_reward_pct between 1 and 100);
exception when duplicate_object then null;
end $$;
