-- =========================================================================
-- FINANCEIRO: dívidas e impostos em aberto (pendências da contabilidade), por empresa
-- Rode no SQL Editor do projeto "niellypinheiro portfólio". Pode rodar mais de uma vez.
-- Depende de public.eh_da_smartbrand() (criada no banco.sql).
-- =========================================================================

create table if not exists public.fin_pendencias (
  id            uuid primary key default gen_random_uuid(),
  chave         text not null unique check (char_length(chave) <= 400),
  empresa_doc   text check (char_length(empresa_doc) <= 20),
  empresa_nome  text check (char_length(empresa_nome) <= 200),
  tributo       text not null check (char_length(tributo) between 1 and 120),
  descricao     text check (char_length(descricao) <= 300),
  competencia   text check (char_length(competencia) <= 7),
  vencimento    date,
  valor         numeric(14,2) not null default 0,
  situacao      text not null default 'aberta' check (situacao in ('aberta', 'parcelada', 'paga')),
  pagamento     date,
  origem        text not null default 'manual' check (origem in ('pdf', 'manual')),
  arquivo       text check (char_length(arquivo) <= 200),
  obs           text check (char_length(obs) <= 1000),
  criado_em     timestamptz not null default now()
);
create index if not exists fin_pendencias_empresa_idx on public.fin_pendencias (empresa_doc);
create index if not exists fin_pendencias_venc_idx on public.fin_pendencias (vencimento);

alter table public.fin_pendencias enable row level security;
grant select, insert, update, delete on public.fin_pendencias to authenticated;
drop policy if exists "so_smartbrand_fin_pendencias" on public.fin_pendencias;
create policy "so_smartbrand_fin_pendencias" on public.fin_pendencias
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());
