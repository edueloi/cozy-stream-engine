UPDATE public.prospecting_sources
SET config_schema = jsonb_set(
  config_schema,
  '{fields}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN f->>'key' = 'limit'
        THEN jsonb_set(jsonb_set(f, '{label}', '"Quantidade de leads"'), '{description}', '"Número máximo de leads a buscar"')
        ELSE f
      END
    )
    FROM jsonb_array_elements(config_schema->'fields') f
  )
)
WHERE config_schema->'fields' @> '[{"key":"limit"}]'::jsonb;