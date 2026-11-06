-- =========================================================================
-- FINANCEIRO: extrato bancário (entradas e saídas das contas) e regras de classificação
-- Rode no SQL Editor do projeto "niellypinheiro portfólio". Pode rodar mais de uma vez.
-- Depende de public.eh_da_smartbrand() (criada no banco.sql).
-- =========================================================================

create table if not exists public.fin_extrato (
  id               uuid primary key default gen_random_uuid(),
  chave            text not null unique check (char_length(chave) <= 500),
  conta            text not null check (char_length(conta) between 1 and 80),
  data             date not null,
  descricao        text not null check (char_length(descricao) <= 300),
  valor            numeric(14,2) not null,
  saldo            numeric(14,2),
  categoria        text check (char_length(categoria) <= 80),
  categoria_origem text not null default 'auto' check (categoria_origem in ('auto', 'regra', 'manual')),
  arquivo          text check (char_length(arquivo) <= 200),
  criado_em        timestamptz not null default now()
);
create index if not exists fin_extrato_data_idx on public.fin_extrato (data);
create index if not exists fin_extrato_conta_idx on public.fin_extrato (conta);

-- o que o painel aprende quando você classifica um lançamento ("sempre que aparecer isto, é aquilo")
create table if not exists public.fin_extrato_regras (
  id         uuid primary key default gen_random_uuid(),
  padrao     text not null unique check (char_length(padrao) between 2 and 120),
  categoria  text not null check (char_length(categoria) <= 80),
  criado_em  timestamptz not null default now()
);

alter table public.fin_extrato enable row level security;
alter table public.fin_extrato_regras enable row level security;
grant select, insert, update, delete on public.fin_extrato, public.fin_extrato_regras to authenticated;
drop policy if exists "so_smartbrand_fin_extrato" on public.fin_extrato;
create policy "so_smartbrand_fin_extrato" on public.fin_extrato
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());
drop policy if exists "so_smartbrand_fin_extrato_regras" on public.fin_extrato_regras;
create policy "so_smartbrand_fin_extrato_regras" on public.fin_extrato_regras
  for all to authenticated using (public.eh_da_smartbrand()) with check (public.eh_da_smartbrand());
