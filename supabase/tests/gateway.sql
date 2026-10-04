-- Transactional integration checks. All synthetic records are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $test$
DECLARE actor uuid := gen_random_uuid(); result jsonb; denied boolean := false;
BEGIN
 IF has_function_privilege('anon','public.chatbud_api(text,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.chatbud_api(text,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser roles must not execute the server gateway';
 END IF;
 INSERT INTO auth.users(id,email,email_confirmed_at)
 VALUES(actor,'chatbud-test-'||actor||'@example.invalid',now());
 PERFORM public.chatbud_api('account',actor,jsonb_build_object('email','chatbud-test-'||actor||'@example.invalid','name','Transactional test'));
 result := public.chatbud_api('dashboard',actor);
 IF result->'roles' <> '["CONSUMER"]'::jsonb THEN RAISE EXCEPTION 'Unexpected initial roles'; END IF;
 BEGIN
  PERFORM public.chatbud_api('admin_overview',actor);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Ordinary user accessed reviewer data'; END IF;
 PERFORM public.chatbud_api('provider_apply',actor,'{"profession":"dietitian","bio":"Fictional test practitioner with a long biography.","experience":"Fictional training, rollback test."}'::jsonb);
 result := public.chatbud_api('dashboard',actor);
 IF result->'providerApplication'->>'status' <> 'UNDER_REVIEW' THEN RAISE EXCEPTION 'Application did not persist'; END IF;
 IF NOT EXISTS(SELECT 1 FROM care.verification_case WHERE provider_id=actor AND status='SUBMITTED') THEN RAISE EXCEPTION 'Missing verification case'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ops.audit_event WHERE actor_id=actor AND action='PROVIDER_APPLICATION_SUBMITTED') THEN RAISE EXCEPTION 'Missing audit record'; END IF;
 INSERT INTO core.role_assignment(user_id,role) VALUES(actor,'VERIFICATION');
 result := public.chatbud_api('admin_overview',actor);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'applications') a WHERE a->>'providerId'=actor::text) THEN RAISE EXCEPTION 'Reviewer queue missing application'; END IF;
 UPDATE core.app_user SET status='SUSPENDED' WHERE id=actor;
 denied := false;
 BEGIN
  PERFORM public.chatbud_api('dashboard',actor);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Suspended user retained access'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: gateway privileges, account creation, application persistence, audit, reviewer authorization, suspended-account denial; test records rolled back.' AS result;
