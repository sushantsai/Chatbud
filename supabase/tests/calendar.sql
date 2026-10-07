-- Transactional checks for professionals' calendar connections. All synthetic records are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $test$
DECLARE pro uuid := gen_random_uuid(); client uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
 who uuid; result jsonb; failed boolean; svc uuid; appt uuid; t timestamptz := now() + interval '3 days';
BEGIN
 IF has_function_privilege('anon','public.chatbud_calendar(text,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.chatbud_calendar(text,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser roles must not execute the calendar gateway';
 END IF;
 FOREACH who IN ARRAY ARRAY[pro,client,stranger] LOOP
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(who,'chatbud-test-'||who||'@example.invalid',now());
  PERFORM public.chatbud_api('account',who,jsonb_build_object('email','chatbud-test-'||who||'@example.invalid','name','Transactional test'));
 END LOOP;
 INSERT INTO care.provider(id,public_slug,status) VALUES(pro,'test-'||pro,'APPROVED');
 INSERT INTO care.provider_scope(provider_id,profession_code,status,scope_description,policy_version) VALUES(pro,'counselor','APPROVED','test','test');
 INSERT INTO care.service(provider_id,profession_code,title,duration_minutes,price_minor,active) VALUES(pro,'counselor','Test session',50,100000,true) RETURNING id INTO svc;
 INSERT INTO care.appointment(client_id,provider_id,service_id,status,starts_at,ends_at,reserved_start_at,reserved_end_at,price_minor,commission_bps,policy_snapshot,service_snapshot)
 VALUES(client,pro,svc,'CONFIRMED',t,t+interval '50 minutes',t,t+interval '50 minutes',100000,0,'{}','{}') RETURNING id INTO appt;

 -- Only an approved professional has a connection, and only their own.
 failed := false;
 BEGIN PERFORM public.chatbud_calendar('save',client,'{"email":"x@example.invalid","cipher":"c"}'::jsonb); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A client connected a calendar'; END IF;
 IF (public.chatbud_calendar('status',pro)->>'connected')::boolean THEN RAISE EXCEPTION 'Connected before connecting'; END IF;
 IF public.chatbud_calendar('for_service',NULL,jsonb_build_object('serviceId',svc))<>'{}'::jsonb THEN RAISE EXCEPTION 'Unconnected service returned a calendar'; END IF;
 result := public.chatbud_calendar('save',pro,'{"email":"pro@example.invalid","cipher":"sealed-1"}'::jsonb);
 PERFORM public.chatbud_calendar('save',pro,'{"email":"pro@example.invalid","cipher":"sealed-2"}'::jsonb);
 IF NOT (result->>'connected')::boolean OR result::text LIKE '%sealed%' THEN RAISE EXCEPTION 'Status is wrong or shows the token: %',result; END IF;
 result := public.chatbud_calendar('for_service',NULL,jsonb_build_object('serviceId',svc));
 IF result->>'cipher'<>'sealed-2' OR (result->>'durationMinutes')::int<>50 THEN RAISE EXCEPTION 'Service calendar is wrong: %',result; END IF;

 -- Appointment details go only to its two parties.
 failed := false;
 BEGIN PERFORM public.chatbud_calendar('event_state',stranger,jsonb_build_object('id',appt)); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A stranger read an appointment'; END IF;
 result := public.chatbud_calendar('event_state',client,jsonb_build_object('id',appt));
 IF result->>'status'<>'CONFIRMED' OR (result->>'isProvider')::boolean OR result->>'eventId' IS NOT NULL THEN RAISE EXCEPTION 'Event state is wrong: %',result; END IF;
 PERFORM public.chatbud_calendar('event_saved',pro,jsonb_build_object('id',appt,'eventId','ev-test'));
 IF public.chatbud_calendar('event_state',pro,jsonb_build_object('id',appt))->>'eventId'<>'ev-test' THEN RAISE EXCEPTION 'Event id not saved'; END IF;
 PERFORM public.chatbud_calendar('error_note',client,jsonb_build_object('id',appt,'message','Google Calendar request failed: 401'));
 IF public.chatbud_calendar('status',pro)->>'lastError' IS NULL THEN RAISE EXCEPTION 'Calendar problem not shown to the professional'; END IF;
 -- Checked in a separate statement: a query cannot see rows removed by a function it is still running.
 result := public.chatbud_calendar('disconnect',pro);
 IF (result->>'connected')::boolean OR EXISTS(SELECT 1 FROM care.provider_calendar WHERE provider_id=pro) THEN RAISE EXCEPTION 'Disconnect kept the token'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: calendar connection limited to approved professionals, token never returned to the browser, appointment details limited to its parties, disconnect removes the token; test records rolled back.' AS result;
