-- Sottoscrizioni push: una riga per dispositivo/browser su cui un dipendente ha
-- attivato le notifiche. Ogni utente vede e gestisce solo le proprie; l'invio vero e
-- proprio (Edge Function send-push) usa la service_role key e bypassa la RLS, quindi
-- non serve una policy che permetta ad altri di leggerle.

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "un dipendente gestisce solo le proprie sottoscrizioni push"
  on public.push_subscriptions for all
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

NOTIFY pgrst, 'reload schema';
