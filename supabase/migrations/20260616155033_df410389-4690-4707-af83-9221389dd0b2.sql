CREATE OR REPLACE FUNCTION public.bump_variant_sent(_day int, _channel text, _key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.cadence_variants
    SET sent_count = sent_count + 1
    WHERE cadence_day = _day AND channel = _channel AND variant_key = _key;
$$;

CREATE OR REPLACE FUNCTION public.bump_variant_reply(_day int, _channel text, _key text, _positive boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.cadence_variants
    SET reply_count = reply_count + 1,
        positive_count = positive_count + CASE WHEN _positive THEN 1 ELSE 0 END
    WHERE cadence_day = _day AND channel = _channel AND variant_key = _key;
$$;

REVOKE ALL ON FUNCTION public.bump_variant_sent(int, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bump_variant_reply(int, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bump_variant_sent(int, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bump_variant_reply(int, text, text, boolean) TO authenticated, service_role;