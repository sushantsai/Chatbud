-- Transactional checks for review, practice setup and appointment requests. All synthetic records are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $test$
DECLARE reviewer uuid := gen_random_uuid(); applicant uuid := gen_random_uuid(); client uuid := gen_random_uuid(); other uuid := gen_random_uuid();
 result jsonb; case_id uuid; service_id uuid; day date := (now() AT TIME ZONE 'Asia/Kathmandu')::date + 3; slot timestamptz; appt uuid; failed boolean; who uuid;
BEGIN
 IF has_function_privilege('anon','public.chatbud_care(text,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.chatbud_care(text,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser roles must not execute the care gateway';
 END IF;
 FOREACH who IN ARRAY ARRAY[reviewer,applicant,client,other] LOOP
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(who,'chatbud-test-'||who||'@example.invalid',now());
  PERFORM public.chatbud_api('account',who,jsonb_build_object('email','chatbud-test-'||who||'@example.invalid','name','Transactional test'));
 END LOOP;
 INSERT INTO core.role_assignment(user_id,role) VALUES(reviewer,'VERIFICATION');
 PERFORM public.chatbud_api('provider_apply',applicant,jsonb_build_object('profession','yoga_instructor',
  'bio','Fictional test practitioner with a long biography.','experience','Fictional training, rollback test.',
  'details',jsonb_build_object('profession','yoga_instructor','practice',jsonb_build_object('languages',jsonb_build_array('English','Nepali')),
   'documents',jsonb_build_array(jsonb_build_object('kind','identity','path',applicant||'/identity-test.pdf','name','id.pdf')))));

 failed := false;
 BEGIN PERFORM public.chatbud_care('admin_queue',client); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Ordinary user read the review queue'; END IF;
 result := public.chatbud_care('admin_queue',reviewer);
 SELECT (a->>'id')::uuid INTO case_id FROM jsonb_array_elements(result->'applications') a WHERE a->>'providerId'=applicant::text;
 IF case_id IS NULL THEN RAISE EXCEPTION 'Review queue missing the application'; END IF;
 PERFORM public.chatbud_care('admin_document',reviewer,jsonb_build_object('caseId',case_id,'path',applicant||'/identity-test.pdf'));
 failed := false;
 BEGIN PERFORM public.chatbud_care('admin_document',reviewer,jsonb_build_object('caseId',case_id,'path',client||'/other.pdf')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Reviewer opened a document outside the application'; END IF;

 failed := false;
 BEGIN PERFORM public.chatbud_care('provider_service_save',applicant,'{"profession":"yoga_instructor","title":"Yoga","durationMinutes":50,"price":1000,"active":true}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Unapproved applicant created a service'; END IF;

 failed := false;
 BEGIN PERFORM public.chatbud_care('admin_review',reviewer,jsonb_build_object('caseId',case_id,'decision','NEEDS_INFORMATION','rationale',''));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A request for information needs a reason'; END IF;
 PERFORM public.chatbud_care('admin_review',reviewer,jsonb_build_object('caseId',case_id,'decision','NEEDS_INFORMATION','rationale','Please upload a clearer copy of your ID.'));
 result := public.chatbud_care('provider_workspace',applicant);
 IF result->>'status'<>'APPLIED' OR result->>'rationale' IS NULL THEN RAISE EXCEPTION 'Applicant cannot see the request for information'; END IF;
 -- Both applications share this transaction's timestamp; age the first so ordering is realistic.
 UPDATE care.verification_case SET created_at=created_at-interval '1 minute' WHERE id=case_id;
 PERFORM public.chatbud_api('provider_apply',applicant,jsonb_build_object('profession','yoga_instructor',
  'bio','Fictional test practitioner with a long biography.','experience','Fictional training, rollback test.',
  'details',jsonb_build_object('profession','yoga_instructor','practice',jsonb_build_object('languages',jsonb_build_array('English','Nepali')))));
 failed := false;
 BEGIN PERFORM public.chatbud_care('admin_review',reviewer,jsonb_build_object('caseId',case_id,'decision','APPROVED'));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A superseded application was approved'; END IF;
 SELECT id INTO case_id FROM care.verification_case WHERE provider_id=applicant ORDER BY created_at DESC LIMIT 1;
 INSERT INTO core.role_assignment(user_id,role) VALUES(applicant,'VERIFICATION');
 failed := false;
 BEGIN PERFORM public.chatbud_care('admin_review',applicant,jsonb_build_object('caseId',case_id,'decision','APPROVED'));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Applicant approved their own application'; END IF;
 PERFORM public.chatbud_care('admin_review',reviewer,jsonb_build_object('caseId',case_id,'decision','APPROVED'));
 IF NOT EXISTS(SELECT 1 FROM care.provider WHERE id=applicant AND status='APPROVED' AND languages=ARRAY['en','ne'])
  OR NOT EXISTS(SELECT 1 FROM care.provider_scope WHERE provider_id=applicant AND profession_code='yoga_instructor' AND status='APPROVED')
  OR NOT EXISTS(SELECT 1 FROM core.role_assignment WHERE user_id=applicant AND role='PROVIDER') THEN
  RAISE EXCEPTION 'Approval did not publish the professional';
 END IF;

 failed := false;
 BEGIN PERFORM public.chatbud_care('provider_service_save',applicant,'{"profession":"psychiatrist","title":"Out of scope","durationMinutes":50,"price":1000,"active":true}'::jsonb);
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Service created outside the approved scope'; END IF;
 service_id := (public.chatbud_care('provider_service_save',applicant,'{"profession":"yoga_instructor","title":"Yoga session","durationMinutes":50,"price":1000,"active":true}'::jsonb)->>'id')::uuid;
 PERFORM public.chatbud_care('provider_availability_save',applicant,jsonb_build_object('rules',
  (SELECT jsonb_agg(jsonb_build_object('weekday',d,'start','09:00','end','12:00')) FROM generate_series(0,6) d)));
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.chatbud_api('catalog')->'providers') p WHERE p->>'serviceId'=service_id::text) THEN
  RAISE EXCEPTION 'Approved service missing from the catalog';
 END IF;
 result := public.chatbud_care('slots',NULL,jsonb_build_object('serviceId',service_id,'date',day));
 IF jsonb_array_length(result->'slots')<>3 THEN RAISE EXCEPTION 'Expected three slots, got %',result; END IF;
 slot := (result->'slots'->>0)::timestamptz;
 IF slot <> (day + time '09:00') AT TIME ZONE 'Asia/Kathmandu' THEN RAISE EXCEPTION 'First slot is not 09:00 Nepal time: %',slot; END IF;

 failed := false;
 BEGIN PERFORM public.chatbud_care('appointment_request',applicant,jsonb_build_object('serviceId',service_id,'startsAt',slot,'idempotencyKey',gen_random_uuid()));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Professional booked their own service'; END IF;
 result := public.chatbud_care('appointment_request',client,jsonb_build_object('serviceId',service_id,'startsAt',slot,'idempotencyKey','11111111-1111-4111-8111-111111111111'));
 appt := (result->>'id')::uuid;
 IF (public.chatbud_care('appointment_request',client,jsonb_build_object('serviceId',service_id,'startsAt',slot,'idempotencyKey','11111111-1111-4111-8111-111111111111'))->>'id')::uuid<>appt THEN
  RAISE EXCEPTION 'Repeated request created a second appointment';
 END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_care('appointment_request',other,jsonb_build_object('serviceId',service_id,'startsAt',slot,'idempotencyKey',gen_random_uuid()));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Two clients requested the same time'; END IF;
 -- An unpaid request cannot be confirmed; choosing to pay later releases it to the professional.
 failed := false;
 BEGIN PERFORM public.chatbud_care('provider_appointment_decide',applicant,jsonb_build_object('id',appt,'decision','CONFIRM','meetingUrl','https://meet.example.invalid/x'));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'An unpaid request was confirmed'; END IF;
 PERFORM public.chatbud_pay('start',client,jsonb_build_object('appointmentId',appt,'gateway','LATER'));
 IF jsonb_array_length(public.chatbud_care('slots',NULL,jsonb_build_object('serviceId',service_id,'date',day))->'slots')<>2 THEN
  RAISE EXCEPTION 'Requested time still offered';
 END IF;
 IF public.chatbud_care('appointments_mine',client)->'appointments'->0->>'meetingUrl' IS NOT NULL THEN RAISE EXCEPTION 'Meeting link shown before confirmation'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_care('provider_appointment_decide',other,jsonb_build_object('id',appt,'decision','CONFIRM','meetingUrl','https://meet.example.invalid/x'));
 EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Another user confirmed the appointment'; END IF;
 PERFORM public.chatbud_care('provider_appointment_decide',applicant,jsonb_build_object('id',appt,'decision','CONFIRM','meetingUrl','https://meet.example.invalid/x'));
 result := public.chatbud_care('appointments_mine',client)->'appointments'->0;
 IF result->>'status'<>'CONFIRMED' OR result->>'meetingUrl'<>'https://meet.example.invalid/x' THEN RAISE EXCEPTION 'Client cannot see the confirmed appointment'; END IF;
 IF jsonb_array_length(public.chatbud_care('provider_workspace',applicant)->'appointments')<>1 THEN RAISE EXCEPTION 'Professional cannot see the appointment'; END IF;
 -- Rescheduling: the professional proposes, the client finalises.
 failed := false;
 BEGIN PERFORM public.chatbud_care('provider_appointment_propose',applicant,jsonb_build_object('id',appt,'startsAt',slot));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Proposed the same time'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_care('appointment_reschedule_respond',client,jsonb_build_object('id',appt,'accept',true));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Accepted a proposal that does not exist'; END IF;
 PERFORM public.chatbud_care('provider_appointment_propose',applicant,jsonb_build_object('id',appt,'startsAt',slot+interval '1 day 3 hours'));
 IF public.chatbud_care('appointments_mine',client)->'appointments'->0->>'proposedStartsAt' IS NULL THEN RAISE EXCEPTION 'Client cannot see the proposed time'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_care('appointment_reschedule_respond',other,jsonb_build_object('id',appt,'accept',true));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Another user accepted the proposal'; END IF;
 PERFORM public.chatbud_care('appointment_reschedule_respond',client,jsonb_build_object('id',appt,'accept',false));
 IF EXISTS(SELECT 1 FROM care.appointment WHERE id=appt AND (proposed_starts_at IS NOT NULL OR starts_at<>slot)) THEN RAISE EXCEPTION 'Declining changed the appointment'; END IF;
 PERFORM public.chatbud_care('provider_appointment_propose',applicant,jsonb_build_object('id',appt,'startsAt',slot+interval '1 day 3 hours'));
 PERFORM public.chatbud_care('appointment_reschedule_respond',client,jsonb_build_object('id',appt,'accept',true,'meetingUrl','https://meet.example.invalid/ignored'));
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=appt AND status='CONFIRMED' AND starts_at=slot+interval '1 day 3 hours'
   AND ends_at-starts_at=interval '50 minutes' AND proposed_starts_at IS NULL AND meeting_url='https://meet.example.invalid/x') THEN
  RAISE EXCEPTION 'Accepting did not finalise the new time';
 END IF;
 IF jsonb_array_length(public.chatbud_care('slots',NULL,jsonb_build_object('serviceId',service_id,'date',day))->'slots')<>3 THEN
  RAISE EXCEPTION 'Original time was not released after the move';
 END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_care('appointment_cancel',other,jsonb_build_object('id',appt)); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Another user cancelled the appointment'; END IF;
 PERFORM public.chatbud_care('appointment_cancel',client,jsonb_build_object('id',appt));
 IF jsonb_array_length(public.chatbud_care('slots',NULL,jsonb_build_object('serviceId',service_id,'date',day))->'slots')<>3 THEN
  RAISE EXCEPTION 'Cancelled time was not released';
 END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: review queue and decisions, document access, scope-limited services, slots, requests, idempotency, double-booking, confirmation, cancellation; test records rolled back.' AS result;
