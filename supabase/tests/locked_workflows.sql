-- Synthetic fixtures, always rolled back. No messages or payment-provider calls.
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $test$
DECLARE cl uuid:=gen_random_uuid();pr uuid:=gen_random_uuid();su uuid:=gen_random_uuid();fi uuid:=gen_random_uuid();ot uuid:=gen_random_uuid();sv uuid;ap uuid;pa uuid;rf uuid;cs uuid;pl uuid;rv uuid;tk uuid;ap2 uuid;t timestamptz;d date;v jsonb;v2 jsonb;failed boolean;
BEGIN
 INSERT INTO core.app_user(id,auth_subject,email,display_name) VALUES(cl,cl::text,'client-locked@example.invalid','Test client'),(pr,pr::text,'pro-locked@example.invalid','Test professional'),(su,su::text,'support-locked@example.invalid','Test support'),(fi,fi::text,'finance-locked@example.invalid','Test finance'),(ot,ot::text,'other-locked@example.invalid','Test other');
 INSERT INTO core.role_assignment VALUES(su,'SUPPORT',NULL,now()),(fi,'FINANCE',NULL,now());
 INSERT INTO ops.staff_presence VALUES(su,now()+interval '1 hour'),(fi,now()+interval '1 hour');
 INSERT INTO care.provider(id,public_slug,status) VALUES(pr,'locked-test-professional','APPROVED');
 INSERT INTO care.provider_scope(provider_id,profession_code,status,scope_description,policy_version) VALUES(pr,'dietitian','APPROVED','Test only','test');
 INSERT INTO care.service(provider_id,profession_code,title,duration_minutes,price_minor,active) VALUES(pr,'dietitian','Locked test service',45,120000,true) RETURNING id INTO sv;
 INSERT INTO care.availability_rule(provider_id,weekday,local_start,local_end,valid_from) SELECT pr,i,'09:00','18:00',current_date FROM generate_series(0,6)i;
 d=(now() AT TIME ZONE 'Asia/Kathmandu')::date+3;
 SELECT starts_at INTO t FROM care.open_slots(sv,d) LIMIT 1;
 IF t IS NULL THEN RAISE EXCEPTION 'No fixture slot'; END IF;
 v=public.chatbud_care('appointment_request',cl,jsonb_build_object('serviceId',sv,'startsAt',t,'idempotencyKey',gen_random_uuid()));ap=(v->>'id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=ap AND hold_expires_at=now()+interval '10 minutes' AND payment_status='UNPAID') THEN RAISE EXCEPTION 'Hold is not exactly 10 minutes';END IF;
 failed=false;BEGIN PERFORM public.chatbud_pay('start',cl,jsonb_build_object('appointmentId',ap,'gateway','LATER','idempotencyKey',gen_random_uuid()));EXCEPTION WHEN raise_exception THEN failed=true;END;IF NOT failed THEN RAISE EXCEPTION 'Pay later permitted for new booking';END IF;
 v=public.chatbud_pay('start',cl,jsonb_build_object('appointmentId',ap,'gateway','ESEWA','idempotencyKey',gen_random_uuid()));pa=(v->>'id')::uuid;
 PERFORM public.chatbud_pay('settle',cl,jsonb_build_object('id',pa,'outcome','SUCCEEDED','reference','TEST-RECEIPT-1'));
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=ap AND paid_at=now() AND approval_due_at=now()+interval '60 minutes' AND escalation_at=now()+interval '30 minutes' AND status='HELD') THEN RAISE EXCEPTION 'Paid approval deadlines incorrect';END IF;
 UPDATE care.appointment SET escalation_at=now()-interval '1 minute' WHERE id=ap;
 PERFORM ops.workflow_tick();SELECT id INTO cs FROM ops.workflow_case WHERE dedupe_key='approval-call-'||ap;
 IF cs IS NULL OR NOT EXISTS(SELECT 1 FROM ops.workflow_case WHERE id=cs AND owner_id=su) THEN RAISE EXCEPTION 'Call case not assigned to support';END IF;
 PERFORM public.chatbud_workflow('call_approval',su,jsonb_build_object('id',cs,'explicitApproval',true,'evidence','Professional explicitly accepted exact booking on confirmation call.'));
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=ap AND status='CONFIRMED') THEN RAISE EXCEPTION 'Call acceptance did not confirm';END IF;
 failed=false;BEGIN PERFORM public.chatbud_workflow('join',cl,jsonb_build_object('id',ap));EXCEPTION WHEN raise_exception THEN failed=true;END;IF NOT failed THEN RAISE EXCEPTION 'Early join allowed';END IF;
 PERFORM public.chatbud_care('appointment_cancel',cl,jsonb_build_object('id',ap));SELECT id INTO rf FROM finance.refund WHERE payment_attempt_id=pa;
 IF NOT EXISTS(SELECT 1 FROM finance.refund WHERE id=rf AND eligibility='ELIGIBLE' AND initiate_by IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM ops.workflow_case WHERE refund_id=rf) THEN RAISE EXCEPTION 'Eligible refund case missing';END IF;
 failed=false;BEGIN PERFORM public.chatbud_workflow('finance_update',su,jsonb_build_object('refundId',rf,'stage','INITIATED','reference','TEST-REF'));EXCEPTION WHEN insufficient_privilege THEN failed=true;END;IF NOT failed THEN RAISE EXCEPTION 'Support executed refund';END IF;
 PERFORM public.chatbud_workflow('finance_update',fi,jsonb_build_object('refundId',rf,'stage','INITIATED','reference','TEST-REF'));
 IF EXISTS(SELECT 1 FROM finance.refund WHERE id=rf AND status='SUCCEEDED') THEN RAISE EXCEPTION 'Initiation marked refund completed';END IF;
 PERFORM public.chatbud_workflow('finance_update',fi,jsonb_build_object('refundId',rf,'stage','COMPLETED','reference','TEST-REF','amount',1200,'completedOn',(now() AT TIME ZONE 'Asia/Kathmandu')::date,'confirmation','Gateway payout confirmation TEST EVIDENCE'));
 IF NOT EXISTS(SELECT 1 FROM finance.refund WHERE id=rf AND status='SUCCEEDED' AND payout_confirmation IS NOT NULL) THEN RAISE EXCEPTION 'Refund evidence not saved';END IF;
 -- Instant service and immutable published clinical records.
 UPDATE care.service SET confirmation_mode='INSTANT',minimum_notice_minutes=60 WHERE id=sv;
 v=public.chatbud_care('appointment_request',cl,jsonb_build_object('serviceId',sv,'startsAt',t,'idempotencyKey',gen_random_uuid()));ap2=(v->>'id')::uuid;
 v=public.chatbud_pay('start',cl,jsonb_build_object('appointmentId',ap2,'gateway','ESEWA','idempotencyKey',gen_random_uuid()));pa=(v->>'id')::uuid;
 PERFORM public.chatbud_pay('settle',cl,jsonb_build_object('id',pa,'outcome','SUCCEEDED','reference','TEST-RECEIPT-2'));
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=ap2 AND status='CONFIRMED' AND payment_status='PAID') THEN RAISE EXCEPTION 'Instant payment did not confirm';END IF;
 PERFORM public.chatbud_workflow('private_note',pr,jsonb_build_object('appointmentId',ap2,'body','Author-only test note'));
 v=public.chatbud_workflow('my_care',cl,'{}');IF jsonb_array_length(v->'notes')<>0 THEN RAISE EXCEPTION 'Client read private note';END IF;
 failed=false;BEGIN PERFORM public.chatbud_workflow('client_care',su,jsonb_build_object('clientId',cl));EXCEPTION WHEN insufficient_privilege THEN failed=true;END;IF NOT failed THEN RAISE EXCEPTION 'Support read clinical records';END IF;
 v=public.chatbud_workflow('plan_save',pr,jsonb_build_object('clientId',cl,'domain','nutrition','title','Test care plan','body','Draft is private.','tasks',jsonb_build_array(jsonb_build_object('title','Daily test task','schedule','DAILY','weekdays','[]'::jsonb,'measurements',jsonb_build_array('Test measurement')))));pl=(v->>'id')::uuid;rv=(v->>'revisionId')::uuid;
 IF jsonb_array_length(public.chatbud_workflow('my_care',cl,'{}')->'plans')<>0 THEN RAISE EXCEPTION 'Client saw draft plan';END IF;
 PERFORM public.chatbud_workflow('plan_publish',pr,jsonb_build_object('revisionId',rv));
 SELECT (tasks->0->>'id')::uuid INTO tk FROM care.plan_revision WHERE id=rv;
 PERFORM public.chatbud_workflow('progress_submit',cl,jsonb_build_object('revisionId',rv,'taskId',tk,'completed',true,'note','Optional note','measurements',jsonb_build_object('Test measurement','5')));
 v=public.chatbud_workflow('plan_save',pr,jsonb_build_object('id',pl,'clientId',cl,'domain','nutrition','title','Test care plan','body','Second draft','tasks',(SELECT tasks FROM care.plan_revision WHERE id=rv)));
 IF (SELECT tasks->0->>'id' FROM care.plan_revision WHERE id=(v->>'revisionId')::uuid)<>tk::text THEN RAISE EXCEPTION 'Unchanged task lost key';END IF;
 IF NOT EXISTS(SELECT 1 FROM care.plan_record WHERE id=pl AND current_version_id=rv) THEN RAISE EXCEPTION 'Draft replaced current published plan';END IF;
 -- Follow-up coordination does not reserve or book a session.
 v=public.chatbud_workflow('followup_create',pr,jsonb_build_object('appointmentId',ap2,'targetDate',d+7));cs=(v->>'id')::uuid;
 PERFORM public.chatbud_workflow('followup_contact',su,jsonb_build_object('id',cs,'outcome','UNANSWERED','note','Test contact, no delivery'));
 failed=false;BEGIN PERFORM public.chatbud_workflow('followup_contact',su,jsonb_build_object('id',cs,'outcome','UNANSWERED','note','Early retry'));EXCEPTION WHEN raise_exception THEN failed=true;END;IF NOT failed THEN RAISE EXCEPTION 'Retry under 24 hours permitted';END IF;
 -- Role gates and cross-device application save conflicts.
 v=public.chatbud_workflow('draft_save',cl,'{"payload":{"data":{"bio":"Draft"}},"revision":0}');
 failed=false;BEGIN PERFORM public.chatbud_workflow('draft_save',cl,'{"payload":{},"revision":0}');EXCEPTION WHEN raise_exception THEN failed=true;END;IF NOT failed THEN RAISE EXCEPTION 'Stale application overwrote new data';END IF;
 IF has_function_privilege('authenticated','public.chatbud_workflow(text,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Browser can bypass API actor verification';END IF;
 -- Intake keeps question wording even when the professional edits the service later.
 UPDATE care.service SET intake_stage='BEFORE_PAYMENT',intake_questions='[{"id":"reason","label":"Original question","required":true}]' WHERE id=sv;
 v=public.chatbud_workflow('intake_submit',cl,jsonb_build_object('serviceId',sv,'bookingKey',gen_random_uuid(),'answers',jsonb_build_object('reason','Original answer')));
 IF NOT EXISTS(SELECT 1 FROM care.intake_submission WHERE id=(v->>'id')::uuid AND question_snapshot->0->>'label'='Original question') THEN RAISE EXCEPTION 'Intake wording snapshot missing';END IF;
 IF (public.chatbud_workflow('intake_form',cl,jsonb_build_object('serviceId',sv,'bookingKey',gen_random_uuid()))->>'submitted')::boolean THEN RAISE EXCEPTION 'An unrelated booking reused intake completion';END IF;
 IF NOT (public.chatbud_workflow('intake_form',cl,jsonb_build_object('serviceId',sv,'bookingKey',(SELECT booking_key FROM care.intake_submission WHERE id=(v->>'id')::uuid)))->>'submitted')::boolean THEN RAISE EXCEPTION 'The correct booking lost its submitted intake';END IF;
 UPDATE care.service SET intake_questions='[{"id":"reason","label":"Changed question","required":true}]' WHERE id=sv;
 IF NOT EXISTS(SELECT 1 FROM care.intake_submission WHERE id=(v->>'id')::uuid AND question_snapshot->0->>'label'='Original question') THEN RAISE EXCEPTION 'Service edit changed original intake wording';END IF;
 -- Client replacement choice keeps the captured funds available for a later eligible cancellation.
 PERFORM public.chatbud_care('appointment_cancel',pr,jsonb_build_object('id',ap2));
 PERFORM public.chatbud_workflow('cancellation_choice',cl,jsonb_build_object('id',ap2,'choice','RESCHEDULE'));
 SELECT id INTO cs FROM ops.workflow_case WHERE dedupe_key='pro-cancel-reschedule-'||ap2;
 SELECT starts_at INTO t FROM care.open_slots(sv,d+1) LIMIT 1;
 PERFORM public.chatbud_workflow('reschedule_offer',su,jsonb_build_object('caseId',cs,'startsAt',t));
 PERFORM public.chatbud_care('appointment_reschedule_respond',cl,jsonb_build_object('id',ap2,'accept',true,'meetingUrl','https://meet.example.invalid/fixture'));
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=ap2 AND status='CONFIRMED' AND payment_status='PAID' AND client_reschedules=0) THEN RAISE EXCEPTION 'Professional replacement consumed allowance or failed';END IF;
 PERFORM public.chatbud_care('appointment_cancel',cl,jsonb_build_object('id',ap2));
 IF NOT EXISTS(SELECT 1 FROM finance.refund WHERE payment_attempt_id=pa AND status='REQUESTED' AND eligibility='ELIGIBLE') THEN RAISE EXCEPTION 'Replacement payment could not be refunded after a later eligible cancellation';END IF;
 RAISE NOTICE 'PASS: holds, paid approvals, instant confirmation, case assignment, finance permission/evidence, clinical privacy/publication, progress carryover, retry limits and autosave conflicts';
END $test$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $test$
DECLARE buyer uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();product uuid;sku uuid;batch uuid;zone uuid;ord uuid;pay uuid;v jsonb;items jsonb;delivery jsonb;failed boolean;
BEGIN
 INSERT INTO core.app_user(id,auth_subject,email,display_name) VALUES(buyer,buyer::text,'store-locked@example.invalid','Store fixture'),(staff,staff::text,'stock-locked@example.invalid','Stock fixture');
 INSERT INTO auth.users(id,phone,phone_confirmed_at) VALUES(buyer,'999000000001',now());
 INSERT INTO shop.delivery_zone(city,area,fee_minor,cod_enabled) VALUES('Kathmandu','Transactional fixture',15000,true) RETURNING id INTO zone;
 INSERT INTO shop.product(slug,title,kind,description,supplier_id,status,approved_by,approved_at) VALUES('fixture-'||buyer,'Test product','WELLNESS','Transactional fixture',(SELECT id FROM shop.supplier WHERE status='APPROVED' LIMIT 1),'PUBLISHED',staff,now()) RETURNING id INTO product;
 INSERT INTO shop.sku(product_id,code,price_minor,active) VALUES(product,'FIXTURE-'||buyer,50000,true) RETURNING id INTO sku;
 INSERT INTO shop.stock_batch(sku_id,warehouse_id,lot_code,on_hand,unit_cost_minor) VALUES(sku,(SELECT id FROM shop.warehouse LIMIT 1),'FIXTURE',5,0) RETURNING id INTO batch;
 items=jsonb_build_array(jsonb_build_object('skuId',sku,'quantity',1));delivery=jsonb_build_object('recipient','Fixture customer','phone','+999000000001','address','Fixture address','city','Kathmandu','district','Transactional fixture','note','');
 v=public.chatbud_workflow('delivery_quote',buyer,jsonb_build_object('zoneId',zone,'items',items,'promoCode',''));
 IF (v->>'shipping')::numeric<>150 OR (v->>'total')::numeric<>650 THEN RAISE EXCEPTION 'Area delivery fee mismatch';END IF;
 v=public.chatbud_shop('order_create',buyer,jsonb_build_object('items',items,'delivery',delivery,'promoCode','','method','ONLINE','idempotencyKey',gen_random_uuid()));ord=(v->>'id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM shop.product_order WHERE id=ord AND checkout_expires_at=now()+interval '15 minutes' AND shipping_minor=15000 AND total_minor=65000) THEN RAISE EXCEPTION 'Stock hold or area pricing incorrect';END IF;
 v=public.chatbud_shop('pay_start',buyer,jsonb_build_object('orderId',ord,'gateway','ESEWA','idempotencyKey',gen_random_uuid()));pay=(v->>'id')::uuid;
 UPDATE shop.product_order SET checkout_expires_at=now()-interval '1 minute' WHERE id=ord;PERFORM shop.expire_orders(NULL);
 IF NOT EXISTS(SELECT 1 FROM shop.stock_batch WHERE id=batch AND reserved=0) THEN RAISE EXCEPTION 'Expired order did not release stock';END IF;
 PERFORM public.chatbud_shop('pay_settle',buyer,jsonb_build_object('id',pay,'outcome','SUCCEEDED','reference','FIXTURE-ORDER-RECEIPT'));
 IF NOT EXISTS(SELECT 1 FROM shop.product_order WHERE id=ord AND status='PAID' AND payment_status='PAID') OR NOT EXISTS(SELECT 1 FROM shop.stock_batch WHERE id=batch AND reserved=1) THEN RAISE EXCEPTION 'Late fulfillable payment failed stock reallocation';END IF;
 UPDATE auth.users SET phone_confirmed_at=NULL WHERE id=buyer;
 failed=false;BEGIN PERFORM public.chatbud_shop('order_create',buyer,jsonb_build_object('items',items,'delivery',delivery,'promoCode','','method','COD','idempotencyKey',gen_random_uuid()));EXCEPTION WHEN insufficient_privilege THEN failed=true;END;IF NOT failed THEN RAISE EXCEPTION 'COD accepted unverified phone';END IF;
 RAISE NOTICE 'PASS: zone pricing, 15-minute stock hold, unpaid expiry release, late-payment reallocation and verified-phone enforcement';
END $test$;
ROLLBACK;
