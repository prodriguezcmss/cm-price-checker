begin;

select plan(16);

select ok((select relrowsecurity from pg_class where oid = 'public.cmss_quotes'::regclass), 'quotes has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.cmss_quote_deliveries'::regclass), 'deliveries has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.cmss_quote_rate_limits'::regclass), 'rate limits has RLS');

select isnt(has_table_privilege('anon', 'public.cmss_quotes', 'select'), true, 'anon cannot read quotes');
select isnt(has_table_privilege('authenticated', 'public.cmss_quotes', 'select'), true, 'authenticated cannot read quotes');
select ok(has_table_privilege('service_role', 'public.cmss_quotes', 'select'), 'service role reads quotes');
select isnt(has_table_privilege('anon', 'public.cmss_quote_deliveries', 'select'), true, 'anon cannot read deliveries');
select isnt(has_table_privilege('authenticated', 'public.cmss_quote_deliveries', 'select'), true, 'authenticated cannot read deliveries');
select ok(has_table_privilege('service_role', 'public.cmss_quote_deliveries', 'select'), 'service role reads deliveries');

select isnt(has_function_privilege('anon', 'public.cmss_quote_enqueue(jsonb,text,jsonb,jsonb)', 'execute'), true, 'anon cannot enqueue quotes');
select isnt(has_function_privilege('authenticated', 'public.cmss_quote_enqueue(jsonb,text,jsonb,jsonb)', 'execute'), true, 'authenticated cannot enqueue quotes');
select ok(has_function_privilege('service_role', 'public.cmss_quote_enqueue(jsonb,text,jsonb,jsonb)', 'execute'), 'service role can enqueue quotes');
select isnt(has_function_privilege('anon', 'public.cmss_quote_take_rate_limit(text,integer,integer)', 'execute'), true, 'anon cannot write rate limits');
select isnt(has_function_privilege('authenticated', 'public.cmss_quote_take_rate_limit(text,integer,integer)', 'execute'), true, 'authenticated cannot write rate limits');
select ok(has_function_privilege('service_role', 'public.cmss_quote_take_rate_limit(text,integer,integer)', 'execute'), 'service role can write rate limits');

set local role service_role;
select ok(public.cmss_quote_take_rate_limit('cmss-pgtap-verification', 2, 60), 'service role rate-limit RPC works');
reset role;

select * from finish();
rollback;
