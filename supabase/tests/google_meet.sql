-- All synthetic users, appointments and audit events are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $test$
DECLARE client uuid:=gen_random_uuid(); provider uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();
 who uuid; service uuid:=gen_random_uuid(); v_appt_id uuid:=gen_random_uuid(); result jsonb; failed boolean;
BEGIN
 IF has_function_privilege('anon','public.chatbud_meet(text,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.chatbud_meet(text,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser roles must not execute the meeting gateway';
 END IF;
 FOREACH who IN ARRAY ARRAY[client,provider,staff,other] LOOP
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(who,'meet-test-'||who||'@example.invalid',now());
  PERFORM public.chatbud_api('account',who,jsonb_build_object('email','meet-test-'||who||'@example.invalid','name','Meet rollback fixture'));
 END LOOP;
 INSERT INTO core.role_assignment(user_id,role) VALUES(staff,'SUPPORT');
 INSERT INTO care.provider(id,public_slug,status) VALUES(provider,'meet-test-'||provider,'APPROVED');
 INSERT INTO care.provider_scope(provider_id,profession_code,status,scope_description,policy_version) VALUES(provider,'nutritionist','APPROVED','Transactional fixture','test');
 INSERT INTO care.service(id,provider_id,profession_code,title,duration_minutes,price_minor) VALUES(service,provider,'nutritionist','Test session',50,100000);
 INSERT INTO care.appointment(id,client_id,provider_id,service_id,starts_at,ends_at,reserved_start_at,reserved_end_at,hold_expires_at,price_minor,commission_bps,policy_snapshot,service_snapshot)
 VALUES(v_appt_id,client,provider,service,now()+interval '3 days',now()+interval '3 days 50 minutes',now()+interval '3 days',now()+interval '3 days 50 minutes',now()+interval '1 hour',100000,1000,'{}','{}');

 failed:=false;
 BEGIN PERFORM public.chatbud_meet('status',client); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Client read integration administration'; END IF;
 PERFORM public.chatbud_meet('status',staff);
 PERFORM public.chatbud_meet('test',staff);
 failed:=false;
 BEGIN PERFORM public.chatbud_meet('test',staff); EXCEPTION WHEN raise_exception THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Repeated room test bypassed the budget'; END IF;

 result:=public.chatbud_meet('appointment',provider,jsonb_build_object('id',v_appt_id,'intent','provider_confirm'));
 IF NOT result ? 'meetingUrl' THEN RAISE EXCEPTION 'Authorized preflight did not return room state'; END IF;
 PERFORM public.chatbud_meet('appointment',staff,jsonb_build_object('id',v_appt_id,'intent','team_confirm'));
 failed:=false;
 BEGIN PERFORM public.chatbud_meet('appointment',other,jsonb_build_object('id',v_appt_id,'intent','provider_confirm')); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Unrelated user passed provider permission'; END IF;
 failed:=false;
 BEGIN PERFORM public.chatbud_meet('appointment',client,jsonb_build_object('id',v_appt_id,'intent','client_reschedule')); EXCEPTION WHEN raise_exception THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Client accepted a nonexistent proposed time'; END IF;

 UPDATE care.appointment SET proposed_starts_at=now()+interval '4 days',meeting_url='https://meet.google.com/abc-defg-hij' WHERE id=v_appt_id;
 result:=public.chatbud_meet('appointment',client,jsonb_build_object('id',v_appt_id,'intent','client_reschedule'));
 IF result->>'meetingUrl'<>'https://meet.google.com/abc-defg-hij' THEN RAISE EXCEPTION 'Existing room missing'; END IF;
 failed:=false;
 BEGIN PERFORM public.chatbud_meet('appointment',other,jsonb_build_object('id',v_appt_id,'intent','client_reschedule')); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Unrelated user passed client permission'; END IF;
 UPDATE care.appointment SET hold_expires_at=now()-interval '1 minute' WHERE id=v_appt_id;
 failed:=false;
 BEGIN PERFORM public.chatbud_meet('appointment',provider,jsonb_build_object('id',v_appt_id,'intent','provider_confirm')); EXCEPTION WHEN raise_exception THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Expired hold passed preflight'; END IF;
 UPDATE core.app_user SET status='SUSPENDED' WHERE id=staff;
 failed:=false;
 BEGIN PERFORM public.chatbud_meet('status',staff); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Suspended staff passed preflight'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
 failed:=false;
 BEGIN PERFORM public.chatbud_meet('status',provider); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Untrusted JWT role passed preflight'; END IF;
END;
$test$;
ROLLBACK;
