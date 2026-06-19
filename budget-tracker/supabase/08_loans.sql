create table if not exists loans (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references auth.users not null default auth.uid(),
  borrower_name text        not null,
  amount        numeric     not null check (amount > 0),
  amount_paid   numeric     not null default 0 check (amount_paid >= 0),
  lent_date     date        not null default current_date,
  promised_date date,
  note          text,
  written_off   boolean     not null default false,
  created_at    timestamptz not null default now()
);

alter table loans enable row level security;

create policy "Users manage their own loans"
  on loans for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
