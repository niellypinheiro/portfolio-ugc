-- =========================================================================
-- FINANCEIRO: relatório de vendas da loja (por produto, de um período)
-- Rode no SQL Editor do projeto "niellypinheiro portfólio". Pode rodar mais de uma vez.
-- Depende de public.eh_da_smartbrand() (criada no banco.sql).
-- =========================================================================

create table if not exists public.fin_vendas_loja (
  id           uuid primary key default gen_random_uuid(),
  chave        text not null unique check (char_length(chave) <= 400),
  periodo_ini  date not null,
  periodo_fim  date not null,
  produto      text not null check (char_length(produto) between 1 and 300),
  sku          text check (char_length(sku) <= 120),
  quantidade   numeric(14,3) not null default 0,
  valor        numeric(14,2) not null default 0,
  frete        numeric(14,2) not null default 0,
  total        numeric(14,2) not null default 0,
  arquivo      text check (char_length(arquivo) <= 200),
  criado_em    timestamptz not null default now(),
  check (periodo_fim >= periodo_ini)
);
create index if not exists fin_vendas_loja_periodo_idx on public.fin_vendas_loja (periodo_ini, periodo_fim);

alter table public.fin_vendas_loja enable row level security;
grant select, insert, update, delete on public.fin_vendas_loja to authenticated;
drop policy if exists "so_smartbrand_fin_vendas_loja" on public.fin_vendas_loja;
create policy "so_smartbrand_fin_vendas_loja" on public.fin_vendas_loja
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());
