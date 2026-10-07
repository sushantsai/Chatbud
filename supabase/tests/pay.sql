-- Transactional checks for consultation payments, pay-later, refunds and team handling. All synthetic records are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $test$
DECLARE client uuid := gen_random_uuid(); pro uuid := gen_random_uuid(); support uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
 who uuid; result jsonb; failed boolean; svc uuid; appt uuid; later uuid; lapsed uuid; pay uuid; first_pay uuid; refund uuid; t timestamptz := now() + interval '3 days';
BEGIN
 IF has_function_privilege('anon','public.chatbud_pay(text,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.chatbud_pay(text,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser roles must not execute the payment gateway';
 END IF;
 FOREACH who IN ARRAY ARRAY[client,pro,support,stranger] LOOP
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(who,'chatbud-test-'||who||'@example.invalid',now());
  PERFORM public.chatbud_api('account',who,jsonb_build_object('email','chatbud-test-'||who||'@example.invalid','name','Transactional test'));
 END LOOP;
 INSERT INTO core.role_assignment(user_id,role) VALUES(support,'SUPPORT');
 INSERT INTO care.provider(id,public_slug,status) VALUES(pro,'test-'||pro,'APPROVED');
 INSERT INTO care.provider_scope(provider_id,profession_code,status,scope_description,policy_version) VALUES(pro,'counselor','APPROVED','test','test');
 INSERT INTO care.service(provider_id,profession_code,title,duration_minutes,price_minor,active) VALUES(pro,'counselor','Test session',50,100000,true) RETURNING id INTO svc;
 INSERT INTO care.appointment(client_id,provider_id,service_id,status,starts_at,ends_at,reserved_start_at,reserved_end_at,hold_expires_at,price_minor,commission_bps,policy_snapshot,service_snapshot)
 VALUES(client,pro,svc,'HELD',t,t+interval '50 minutes',t,t+interval '50 minutes',now()+interval '1 day',100000,0,'{}','{"title":"Test session"}') RETURNING id INTO appt;

 -- A new request is unpaid, holds its time briefly, and cannot be confirmed.
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=appt AND payment_status='UNPAID' AND hold_expires_at<=now()+interval '31 minutes') THEN RAISE EXCEPTION 'New request is not a short unpaid hold'; END IF;
 failed := false;
 BEGIN UPDATE care.appointment SET status='CONFIRMED' WHERE id=appt; EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'An unpaid request was confirmed'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_pay('start',stranger,jsonb_build_object('appointmentId',appt,'gateway','KHALTI','idempotencyKey','k0')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Someone else started a payment'; END IF;

 -- Starting twice with the same key gives the same payment; a failed attempt changes nothing.
 result := public.chatbud_pay('start',client,jsonb_build_object('appointmentId',appt,'gateway','KHALTI','idempotencyKey','k1'));
 first_pay := (result->>'id')::uuid;
 IF (result->>'amountMinor')::bigint<>100000 THEN RAISE EXCEPTION 'Wrong amount: %',result; END IF;
 IF (public.chatbud_pay('start',client,jsonb_build_object('appointmentId',appt,'gateway','KHALTI','idempotencyKey','k1'))->>'id')::uuid<>first_pay THEN RAISE EXCEPTION 'Repeated start created a second payment'; END IF;
 PERFORM public.chatbud_pay('attach',client,jsonb_build_object('id',first_pay,'reference','pidx-test-1'));
 result := public.chatbud_pay('attempt',client,jsonb_build_object('id',first_pay));
 IF result->>'status'<>'PENDING' OR result->>'reference'<>'pidx-test-1' THEN RAISE EXCEPTION 'Attempt is wrong: %',result; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_pay('settle',stranger,jsonb_build_object('id',first_pay,'outcome','SUCCEEDED','reference','x')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Someone else settled a payment'; END IF;
 PERFORM public.chatbud_pay('settle',client,jsonb_build_object('id',first_pay,'outcome','FAILED'));
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=appt AND payment_status='UNPAID') THEN RAISE EXCEPTION 'A failed payment changed the booking'; END IF;

 -- A verified payment marks the booking paid and gives the professional 24 hours.
 pay := (public.chatbud_pay('start',client,jsonb_build_object('appointmentId',appt,'gateway','ESEWA','idempotencyKey','k2'))->>'id')::uuid;
 IF public.chatbud_pay('settle',client,jsonb_build_object('id',pay,'outcome','SUCCEEDED','reference','ref-test-2'))->>'status'<>'SUCCEEDED' THEN RAISE EXCEPTION 'Payment did not settle'; END IF;
 IF public.chatbud_pay('settle',client,jsonb_build_object('id',pay,'outcome','SUCCEEDED','reference','ref-test-2'))->>'status'<>'SUCCEEDED' THEN RAISE EXCEPTION 'Settling twice failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=appt AND payment_status='PAID' AND hold_expires_at>now()+interval '23 hours') THEN RAISE EXCEPTION 'Paid booking not released to the professional'; END IF;
 IF (SELECT count(*) FROM finance.payment_attempt WHERE appointment_id=appt AND status='SUCCEEDED')<>1 THEN RAISE EXCEPTION 'Payment recorded twice'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_pay('start',client,jsonb_build_object('appointmentId',appt,'gateway','KHALTI','idempotencyKey','k3')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A paid booking was paid again'; END IF;
 result := public.chatbud_pay('statuses',pro)->'appointments'->0;
 IF result->>'paymentStatus'<>'PAID' OR (result->>'mine')::boolean THEN RAISE EXCEPTION 'Professional sees the wrong payment state: %',result; END IF;

 -- Declined before confirmation: full refund is queued, and only the team can handle it.
 UPDATE care.appointment SET status='CANCELLED' WHERE id=appt;
 SELECT r.id INTO refund FROM finance.refund r WHERE r.payment_attempt_id=pay AND r.status='REQUESTED' AND r.amount_minor=100000 AND r.reason LIKE '%not confirmed%';
 IF refund IS NULL OR NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=appt AND payment_status='REFUND_DUE') THEN RAISE EXCEPTION 'Refund was not queued'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_pay('team_overview',client); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A client read team payments'; END IF;
 result := public.chatbud_pay('team_overview',support);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'refunds') r WHERE r->>'id'=refund::text) THEN RAISE EXCEPTION 'Team overview is missing the refund: %',result; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_pay('refund_decide',support,jsonb_build_object('refundId',refund,'decision','SENT','reference','')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Refund recorded without a reference'; END IF;
 PERFORM public.chatbud_pay('refund_decide',support,jsonb_build_object('refundId',refund,'decision','SENT','reference','RF-TEST-1'));
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=appt AND payment_status='REFUNDED') THEN RAISE EXCEPTION 'Refund not recorded on the booking'; END IF;

 -- Pay later: goes to the professional unpaid, and the team records the money when it arrives.
 INSERT INTO care.appointment(client_id,provider_id,service_id,status,starts_at,ends_at,reserved_start_at,reserved_end_at,hold_expires_at,price_minor,commission_bps,policy_snapshot,service_snapshot)
 VALUES(client,pro,svc,'HELD',t+interval '2 hours',t+interval '170 minutes',t+interval '2 hours',t+interval '170 minutes',now()+interval '1 day',100000,0,'{}','{"title":"Test session"}') RETURNING id INTO later;
 IF NOT (public.chatbud_pay('start',client,jsonb_build_object('appointmentId',later,'gateway','LATER'))->>'payLater')::boolean THEN RAISE EXCEPTION 'Pay later not accepted'; END IF;
 UPDATE care.appointment SET status='CONFIRMED' WHERE id=later;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.chatbud_pay('team_overview',support)->'payLater') b WHERE b->>'id'=later::text) THEN RAISE EXCEPTION 'Pay-later booking missing from the team list'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_pay('mark_paid',support,jsonb_build_object('appointmentId',later,'reference','')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Cash recorded without a reference'; END IF;
 PERFORM public.chatbud_pay('mark_paid',support,jsonb_build_object('appointmentId',later,'reference','Receipt 41'));
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=later AND payment_status='PAID') THEN RAISE EXCEPTION 'Cash payment not recorded'; END IF;
 -- Cancelled three days ahead: refund due in full; the team may still decline it.
 UPDATE care.appointment SET status='CANCELLED' WHERE id=later;
 SELECT r.id INTO refund FROM finance.refund r JOIN finance.payment_attempt pa ON pa.id=r.payment_attempt_id WHERE pa.appointment_id=later AND r.reason LIKE '%more than 24 hours%';
 IF refund IS NULL THEN RAISE EXCEPTION 'Early cancellation did not queue a refund'; END IF;
 PERFORM public.chatbud_pay('refund_decide',support,jsonb_build_object('refundId',refund,'decision','REJECTED'));
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=later AND payment_status='NOT_REFUNDED') THEN RAISE EXCEPTION 'Declined refund not recorded'; END IF;

 -- Money that arrives after the request lapsed goes straight to the refund queue.
 INSERT INTO care.appointment(client_id,provider_id,service_id,status,starts_at,ends_at,reserved_start_at,reserved_end_at,hold_expires_at,price_minor,commission_bps,policy_snapshot,service_snapshot)
 VALUES(client,pro,svc,'HELD',t+interval '4 hours',t+interval '290 minutes',t+interval '4 hours',t+interval '290 minutes',now()+interval '1 day',100000,0,'{}','{"title":"Test session"}') RETURNING id INTO lapsed;
 pay := (public.chatbud_pay('start',client,jsonb_build_object('appointmentId',lapsed,'gateway','KHALTI','idempotencyKey','k4'))->>'id')::uuid;
 UPDATE care.appointment SET status='EXPIRED',hold_expires_at=now()-interval '1 minute' WHERE id=lapsed;
 IF EXISTS(SELECT 1 FROM finance.refund r WHERE r.payment_attempt_id=pay) THEN RAISE EXCEPTION 'Refund queued for a booking that was never paid'; END IF;
 IF public.chatbud_pay('settle',client,jsonb_build_object('id',pay,'outcome','SUCCEEDED','reference','ref-test-4'))->>'status'<>'LAPSED' THEN RAISE EXCEPTION 'Late payment not treated as lapsed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finance.refund r WHERE r.payment_attempt_id=pay AND r.status='REQUESTED')
  OR NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=lapsed AND payment_status='REFUND_DUE') THEN RAISE EXCEPTION 'Late payment not queued for refund'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: unpaid holds, confirmation blocked until paid, idempotent start and settle, pay later, cash recording, refund queue and decisions, late payments; test records rolled back.' AS result;
