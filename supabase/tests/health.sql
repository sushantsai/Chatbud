-- Transactional checks for goals, care plans and consent-gated sharing. All synthetic records are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $test$
DECLARE client uuid := gen_random_uuid(); dietitian uuid := gen_random_uuid(); trainer uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
 who uuid; result jsonb; failed boolean; goal_id uuid; plan_id uuid; svc uuid; t timestamptz := now() + interval '3 days';
BEGIN
 IF has_function_privilege('anon','public.chatbud_health(text,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.chatbud_health(text,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser roles must not execute the health gateway';
 END IF;
 FOREACH who IN ARRAY ARRAY[client,dietitian,trainer,stranger] LOOP
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(who,'chatbud-test-'||who||'@example.invalid',now());
  PERFORM public.chatbud_api('account',who,jsonb_build_object('email','chatbud-test-'||who||'@example.invalid','name','Transactional test'));
 END LOOP;
 -- Two approved professionals in different areas, each with a confirmed appointment with the client.
 INSERT INTO care.provider(id,public_slug,status) VALUES(dietitian,'test-'||dietitian,'APPROVED'),(trainer,'test-'||trainer,'APPROVED'),(stranger,'test-'||stranger,'APPROVED');
 INSERT INTO care.provider_scope(provider_id,profession_code,status,scope_description,policy_version)
 VALUES(dietitian,'dietitian','APPROVED','test','test'),(trainer,'personal_trainer','APPROVED','test','test'),(stranger,'dietitian','APPROVED','test','test');
 FOREACH who IN ARRAY ARRAY[dietitian,trainer] LOOP
  INSERT INTO care.service(provider_id,profession_code,title,duration_minutes,price_minor,active)
  SELECT who,profession_code,'Test session',50,100000,true FROM care.provider_scope WHERE provider_id=who RETURNING id INTO svc;
  INSERT INTO care.appointment(client_id,provider_id,service_id,status,starts_at,ends_at,reserved_start_at,reserved_end_at,price_minor,commission_bps,policy_snapshot,service_snapshot)
  VALUES(client,who,svc,'CONFIRMED',t,t+interval '50 minutes',t,t+interval '50 minutes',100000,0,'{}','{}');
 END LOOP;

 goal_id := (public.chatbud_health('goal_save',client,'{"domain":"nutrition","title":"Eat breakfast daily"}'::jsonb)->>'id')::uuid;
 PERFORM public.chatbud_health('goal_save',client,'{"domain":"mental","title":"Sleep by eleven"}'::jsonb);
 failed := false;
 BEGIN PERFORM public.chatbud_health('goal_save',stranger,jsonb_build_object('id',goal_id,'status','DONE')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Another user changed a goal'; END IF;

 failed := false;
 BEGIN PERFORM public.chatbud_health('plan_save',trainer,jsonb_build_object('clientId',client,'domain','nutrition','title','Meal plan','body','Out of scope'));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Trainer wrote a nutrition plan'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_health('plan_save',stranger,jsonb_build_object('clientId',client,'domain','nutrition','title','Meal plan','body','No relationship'));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Professional without an appointment wrote a plan'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_health('plan_save',client,jsonb_build_object('clientId',client,'domain','nutrition','title','Meal plan','body','Not a professional'));
 EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Client wrote a plan'; END IF;
 plan_id := (public.chatbud_health('plan_save',dietitian,jsonb_build_object('clientId',client,'domain','nutrition','title','Meal plan','body','Three regular meals.'))->>'id')::uuid;
 PERFORM public.chatbud_health('plan_save',dietitian,jsonb_build_object('id',plan_id,'clientId',client,'domain','nutrition','title','Meal plan','body','Three regular meals and a snack.'));

 result := public.chatbud_health('health_mine',client);
 IF jsonb_array_length(result->'plans')<>1 OR result->'plans'->0->>'version'<>'2' OR jsonb_array_length(result->'goals')<>2
  OR jsonb_array_length(result->'professionals')<>2 OR result->>'consent' IS NULL THEN
  RAISE EXCEPTION 'Client view is wrong: %',result;
 END IF;

 -- Without consent the trainer sees the client but nothing from other areas.
 result := public.chatbud_health('provider_clients',trainer)->'clients'->0;
 IF jsonb_array_length(result->'sharedPlans')<>0 OR jsonb_array_length(result->'sharedGoals')<>0 THEN RAISE EXCEPTION 'Trainer saw unshared records'; END IF;
 -- The author sees their own plan but not the client's goals until shared.
 result := public.chatbud_health('provider_clients',dietitian)->'clients'->0;
 IF jsonb_array_length(result->'plans')<>1 OR jsonb_array_length(result->'sharedGoals')<>0 THEN RAISE EXCEPTION 'Author view is wrong'; END IF;
 IF jsonb_array_length(public.chatbud_health('provider_clients',stranger)->'clients')<>0 THEN RAISE EXCEPTION 'Unrelated professional saw a client'; END IF;

 failed := false;
 BEGIN PERFORM public.chatbud_health('share_set',client,jsonb_build_object('providerId',stranger,'domain','nutrition','share',true));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Shared with a professional the client has never seen'; END IF;
 PERFORM public.chatbud_health('share_set',client,jsonb_build_object('providerId',trainer,'domain','nutrition','share',true));
 PERFORM public.chatbud_health('share_set',client,jsonb_build_object('providerId',trainer,'domain','nutrition','share',true));
 IF (SELECT count(*) FROM care.compartment_grant WHERE client_id=client AND provider_id=trainer AND revoked_at IS NULL)<>1 THEN RAISE EXCEPTION 'Sharing twice created two grants'; END IF;
 result := public.chatbud_health('provider_clients',trainer)->'clients'->0;
 IF jsonb_array_length(result->'sharedPlans')<>1 OR jsonb_array_length(result->'sharedGoals')<>1
  OR result->'sharedGoals'->0->>'domain'<>'nutrition' THEN RAISE EXCEPTION 'Sharing nutrition exposed the wrong records: %',result; END IF;

 PERFORM public.chatbud_health('share_set',client,jsonb_build_object('providerId',trainer,'domain','nutrition','share',false));
 result := public.chatbud_health('provider_clients',trainer)->'clients'->0;
 IF jsonb_array_length(result->'sharedPlans')<>0 OR jsonb_array_length(result->'sharedGoals')<>0 THEN RAISE EXCEPTION 'Records still visible after sharing stopped'; END IF;
 IF NOT EXISTS(SELECT 1 FROM core.consent_acceptance WHERE user_id=client AND withdrawn_at IS NOT NULL) THEN RAISE EXCEPTION 'Consent withdrawal not recorded'; END IF;

 PERFORM public.chatbud_health('goal_save',client,jsonb_build_object('id',goal_id,'status','DONE'));
 IF NOT EXISTS(SELECT 1 FROM care.goal WHERE id=goal_id AND status='DONE' AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Goal not completed'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: goals, scope-limited plans, client view, default isolation between areas, consent-gated sharing and revocation; test records rolled back.' AS result;
