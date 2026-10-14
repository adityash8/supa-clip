-- Review/migrate by parent. Product objects only; no shared auth/global configuration.
create table public.supaclip_clips (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 title text not null check (char_length(title) between 1 and 100),
 size bigint not null check (size between 1 and 52428800),
 duration double precision not null check (duration > 0 and duration <= 300),
 fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
 status text not null default 'uploading' check (status in ('uploading','ready','deleted')),
 created_at timestamptz not null default now(), finalized_at timestamptz, deleted_at timestamptz, purged_at timestamptz, parts_cleaned_at timestamptz
);
create index on public.supaclip_clips(owner_id, created_at desc);
create table public.supaclip_upload_sessions (
 clip_id uuid primary key references public.supaclip_clips(id) on delete cascade,
 expires_at timestamptz not null default now() + interval '24 hours'
);
create table public.supaclip_share_tokens (
 clip_id uuid primary key references public.supaclip_clips(id) on delete cascade,
 token_hash text unique not null, expires_at timestamptz not null, revoked_at timestamptz
);
create table public.supaclip_rate_limits (key text primary key, window_at timestamptz not null, hits integer not null);
alter table public.supaclip_clips enable row level security;
alter table public.supaclip_upload_sessions enable row level security;
alter table public.supaclip_share_tokens enable row level security;
alter table public.supaclip_rate_limits enable row level security;
create policy supaclip_owner_read on public.supaclip_clips for select to authenticated using (owner_id = auth.uid() and status = 'ready');
revoke all on public.supaclip_clips, public.supaclip_upload_sessions, public.supaclip_share_tokens, public.supaclip_rate_limits from anon, authenticated;
grant select on public.supaclip_clips to authenticated;
grant all on public.supaclip_clips, public.supaclip_upload_sessions, public.supaclip_share_tokens, public.supaclip_rate_limits to service_role;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('supaclip_media','supaclip_media',false,52428800,array['application/octet-stream','video/webm'])
on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('supaclip_parts','supaclip_parts',false,5242880,array['application/octet-stream']) on conflict(id) do nothing;
-- No object policies: client cannot list/read/write. Server issues scoped signed uploads to staging parts only.

create function public.supaclip_rate(p_key text, p_limit integer, p_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
 insert into supaclip_rate_limits as r values (p_key, now(), 1)
 on conflict(key) do update set
 hits = case when r.window_at < now() - make_interval(secs=>p_seconds) then 1 else r.hits+1 end,
 window_at = case when r.window_at < now() - make_interval(secs=>p_seconds) then now() else r.window_at end
 returning hits into n;
 return n <= p_limit;
end $$;

create function public.supaclip_begin(p_owner uuid,p_title text,p_size bigint,p_duration double precision,p_fingerprint text)
returns public.supaclip_clips language plpgsql security definer set search_path=public as $$
declare c supaclip_clips; n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into c from supaclip_clips where owner_id=p_owner and fingerprint=p_fingerprint and status='uploading'
 and exists(select 1 from supaclip_upload_sessions s where s.clip_id=supaclip_clips.id and s.expires_at>now()) limit 1;
 if found then return c; end if;
 select count(*) into n from supaclip_clips where owner_id=p_owner and (status='ready' or
 (status='uploading' and exists(select 1 from supaclip_upload_sessions s where s.clip_id=supaclip_clips.id and s.expires_at>now())));
 if n >= 20 then raise exception 'supaclip_quota'; end if;
 insert into supaclip_clips(owner_id,title,size,duration,fingerprint) values(p_owner,p_title,p_size,p_duration,p_fingerprint) returning * into c;
 insert into supaclip_upload_sessions(clip_id) values(c.id);
 return c;
end $$;

create function public.supaclip_finalize(p_owner uuid,p_clip uuid,p_duration double precision) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 update supaclip_clips set status='ready',duration=p_duration,finalized_at=now() where id=p_clip and owner_id=p_owner and status='uploading'
 and exists(select 1 from supaclip_upload_sessions where clip_id=p_clip and expires_at>now());
 return found;
end $$;

create function public.supaclip_delete(p_owner uuid,p_clip uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 update supaclip_clips set status='deleted',deleted_at=coalesce(deleted_at,now()) where id=p_clip and owner_id=p_owner;
 if not found then return false; end if;
 update supaclip_share_tokens set revoked_at=now() where clip_id=p_clip;
 return true;
end $$;

create function public.supaclip_share(p_owner uuid,p_clip uuid,p_hash text,p_expiry timestamptz) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from supaclip_clips where id=p_clip and owner_id=p_owner and status='ready' for update;
 if not found then return false; end if;
 insert into supaclip_share_tokens(clip_id,token_hash,expires_at) values(p_clip,p_hash,p_expiry)
 on conflict(clip_id) do update set token_hash=p_hash,expires_at=p_expiry,revoked_at=null;
 return true;
end $$;
revoke all on function public.supaclip_rate(text,integer,integer), public.supaclip_begin(uuid,text,bigint,double precision,text),
 public.supaclip_finalize(uuid,uuid,double precision), public.supaclip_delete(uuid,uuid), public.supaclip_share(uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.supaclip_rate(text,integer,integer), public.supaclip_begin(uuid,text,bigint,double precision,text),
 public.supaclip_finalize(uuid,uuid,double precision), public.supaclip_delete(uuid,uuid), public.supaclip_share(uuid,uuid,text,timestamptz) to service_role;

create table public.supaclip_billing (
 owner_id uuid primary key references auth.users(id), customer_id text not null,
 subscription_id text not null, started_at timestamptz, active_until timestamptz not null
);
alter table public.supaclip_billing enable row level security;
revoke all on public.supaclip_billing from anon,authenticated;
grant all on public.supaclip_billing to service_role;
