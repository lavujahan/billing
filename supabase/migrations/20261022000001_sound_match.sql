-- Sound-alike item search. Spoken Tamil reaches search as a rough Latin spelling
-- ("சிமெண்ட்" → "chimend"), which plain trigram search can't match to an English item
-- name ("cement"). sound_key reduces both to a consonant skeleton ("smnt") so they meet.
-- Steps, inside out: letters only; zh → l; ph → f; ch/sh/soft c/j/x/z → s (before the
-- c → k step, so cement ≠ cable); voiced → unvoiced, c/q → k, w → v; a leading vowel run
-- → "a"; drop vowels and h inside words; collapse repeats ("smmnt" → "smnt").
create or replace function public.sound_key(t text)
returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(lower(coalesce(t, '')), '[^a-z]+', ' ', 'g'),
                'zh', 'l', 'g'),
              'ph', 'f', 'g'),
            'ch|sh|c(?=[eiy])|[jxz]', 's', 'g'),
          'cqdbgw', 'kktpkv'),
        '\m[aeiouy]+', 'a', 'g'),
      '\Y[aeiouyh]+', '', 'g'),
    '([a-z])\1+', '\1', 'g'),
  '\s+', ' ', 'g'))
$$;

-- Sound matches are capped below an exact/prefix hit (1.0) so a real name match still wins.
create or replace function public.search_products(q text, lim int default 8)
returns table (id uuid, name text, name_ta text, aliases text[], unit text, default_rate numeric,
               gst_rate numeric, hsn_code text, score real)
language sql stable security invoker set search_path = public, extensions
as $$
  with k as (select public.sound_key(q) as qk)
  select p.id, p.name, p.name_ta, p.aliases, p.unit, p.default_rate, p.gst_rate, p.hsn_code,
         greatest(similarity(lower(p.name), lower(q)),
                  similarity(coalesce(p.name_ta, ''), q),
                  similarity(coalesce(p.name_latin, ''), lower(q)),
                  coalesce((select max(similarity(lower(a), lower(q))) from unnest(p.aliases) a), 0),
                  case when length(k.qk) >= 3 then least(0.85, greatest(
                    similarity(public.sound_key(p.name), k.qk),
                    similarity(public.sound_key(p.name_latin), k.qk),
                    coalesce((select max(similarity(public.sound_key(a), k.qk)) from unnest(p.aliases) a), 0)))
                  else 0 end,
                  case when p.name ilike q || '%' or p.name_ta ilike q || '%'
                         or exists (select 1 from unnest(p.aliases) a where lower(a) = lower(q)) then 1 else 0 end)::real as score
  from products p, k
  where p.active
    and (q = '' or p.name ilike '%' || q || '%' or p.name_ta ilike '%' || q || '%' or p.name_latin ilike '%' || q || '%'
         or exists (select 1 from unnest(p.aliases) a where a ilike '%' || q || '%' or similarity(lower(a), lower(q)) > 0.3)
         or similarity(lower(p.name), lower(q)) > 0.25
         or (length(k.qk) >= 3 and (similarity(public.sound_key(p.name), k.qk) > 0.45
                                    or similarity(public.sound_key(p.name_latin), k.qk) > 0.45
                                    or exists (select 1 from unnest(p.aliases) a where similarity(public.sound_key(a), k.qk) > 0.45))))
  order by score desc, p.name
  limit lim
$$;
grant execute on function public.search_products(text, int) to authenticated;
