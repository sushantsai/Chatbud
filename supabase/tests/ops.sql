-- Transactional checks for support, booking oversight, catalogue, offers, promo codes and team roles. All synthetic records are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $test$
DECLARE admin uuid := gen_random_uuid(); support uuid := gen_random_uuid(); cataloguer uuid := gen_random_uuid(); client uuid := gen_random_uuid(); pro uuid := gen_random_uuid();
 who uuid; result jsonb; failed boolean; ticket uuid; product uuid; sku uuid; svc uuid; appt uuid; t timestamptz := now() + interval '3 days';
BEGIN
 IF has_function_privilege('anon','public.chatbud_ops(text,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.chatbud_ops(text,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser roles must not execute the operations gateway';
 END IF;
 FOREACH who IN ARRAY ARRAY[admin,support,cataloguer,client,pro] LOOP
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(who,'chatbud-test-'||who||'@example.invalid',now());
  PERFORM public.chatbud_api('account',who,jsonb_build_object('email','chatbud-test-'||who||'@example.invalid','name','Transactional test'));
 END LOOP;
 INSERT INTO core.role_assignment(user_id,role) VALUES(admin,'SECURITY_ADMIN'),(support,'SUPPORT'),(cataloguer,'CATALOG');

 -- Grievances
 result := public.chatbud_ops('ticket_create',client,'{"category":"BOOKING","subject":"My appointment was not confirmed","body":"I requested a time two days ago."}'::jsonb);
 ticket := (result->>'id')::uuid;
 IF result->>'reference' NOT LIKE 'CB-%' THEN RAISE EXCEPTION 'Ticket has no reference'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_ops('tickets_queue',client); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Client read the support queue'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_ops('tickets_queue',cataloguer); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Catalogue role read the support queue'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.chatbud_ops('tickets_queue',support)->'tickets') x WHERE x->>'id'=ticket::text) THEN RAISE EXCEPTION 'Queue missing the ticket'; END IF;
 PERFORM public.chatbud_ops('ticket_note',support,jsonb_build_object('id',ticket,'body','Checking with the professional.','internal',true));
 IF jsonb_array_length(public.chatbud_ops('tickets_mine',client)->'tickets'->0->'messages')<>1 THEN RAISE EXCEPTION 'Internal note shown to the client'; END IF;
 PERFORM public.chatbud_ops('ticket_note',support,jsonb_build_object('id',ticket,'body','We are looking into this.','internal',false));
 result := public.chatbud_ops('tickets_mine',client)->'tickets'->0;
 IF jsonb_array_length(result->'messages')<>2 OR result->>'status'<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Reply not visible to the client: %',result; END IF;
 PERFORM public.chatbud_ops('ticket_update',support,jsonb_build_object('id',ticket,'status','ESCALATED'));
 IF NOT EXISTS(SELECT 1 FROM ops.support_ticket WHERE id=ticket AND status='ESCALATED' AND priority='HIGH') THEN RAISE EXCEPTION 'Escalation did not raise priority'; END IF;
 PERFORM public.chatbud_ops('ticket_update',support,jsonb_build_object('id',ticket,'status','RESOLVED'));
 PERFORM public.chatbud_ops('ticket_reply',client,jsonb_build_object('id',ticket,'body','It is still not confirmed.'));
 IF NOT EXISTS(SELECT 1 FROM ops.support_ticket WHERE id=ticket AND status='OPEN' AND resolved_at IS NULL) THEN RAISE EXCEPTION 'Reply did not reopen the ticket'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_ops('ticket_reply',pro,jsonb_build_object('id',ticket,'body','Not mine.')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Someone replied on another person''s ticket'; END IF;

 -- Booking oversight
 INSERT INTO care.provider(id,public_slug,status) VALUES(pro,'test-'||pro,'APPROVED');
 INSERT INTO care.provider_scope(provider_id,profession_code,status,scope_description,policy_version) VALUES(pro,'counselor','APPROVED','test','test');
 INSERT INTO care.service(provider_id,profession_code,title,duration_minutes,price_minor,active) VALUES(pro,'counselor','Test session',50,100000,true) RETURNING id INTO svc;
 INSERT INTO care.appointment(client_id,provider_id,service_id,status,starts_at,ends_at,reserved_start_at,reserved_end_at,hold_expires_at,price_minor,commission_bps,policy_snapshot,service_snapshot)
 VALUES(client,pro,svc,'HELD',t,t+interval '50 minutes',t,t+interval '50 minutes',now()+interval '1 day',100000,0,'{}','{"title":"Test session"}') RETURNING id INTO appt;
 UPDATE care.appointment SET payment_status='PAY_LATER',hold_expires_at=now()+interval '1 day' WHERE id=appt;
 failed := false;
 BEGIN PERFORM public.chatbud_ops('bookings_list',cataloguer); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Catalogue role read bookings'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.chatbud_ops('bookings_list',support)->'bookings') b WHERE b->>'id'=appt::text AND b->>'status'='HELD') THEN RAISE EXCEPTION 'Bookings list missing the request'; END IF;
 PERFORM public.chatbud_ops('booking_confirm',support,jsonb_build_object('id',appt,'meetingUrl','https://meet.example.invalid/x'));
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=appt AND status='CONFIRMED' AND meeting_url IS NOT NULL) THEN RAISE EXCEPTION 'Team confirmation failed'; END IF;
 PERFORM public.chatbud_ops('booking_cancel',support,jsonb_build_object('id',appt,'reason','Professional unavailable; client informed.'));
 IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=appt AND status='CANCELLED')
  OR NOT EXISTS(SELECT 1 FROM care.appointment_event WHERE appointment_id=appt AND event_type='CANCELLED_BY_TEAM') THEN RAISE EXCEPTION 'Team cancellation not recorded'; END IF;

 -- Catalogue, offers and promo codes
 failed := false;
 BEGIN PERFORM public.chatbud_ops('product_save',support,'{"title":"Nope","description":"Not allowed to list products.","category":"WELLNESS","price":100}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Support role listed a product'; END IF;
 product := (public.chatbud_ops('product_save',cataloguer,'{"title":"Test yoga mat","description":"A fictional mat for the rollback test.","category":"FITNESS","price":2000}'::jsonb)->>'id')::uuid;
 SELECT id INTO sku FROM shop.sku WHERE product_id=product;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.chatbud_api('catalog')->'products') p WHERE p->>'id'=sku::text) THEN RAISE EXCEPTION 'Draft product is on the storefront'; END IF;
 PERFORM public.chatbud_ops('product_status',cataloguer,jsonb_build_object('id',product,'status','PUBLISHED'));
 PERFORM public.chatbud_ops('stock_receive',cataloguer,jsonb_build_object('id',product,'quantity',5));
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.chatbud_api('catalog')->'products') p WHERE p->>'id'=sku::text AND (p->>'stock')::int=5 AND (p->>'price')::numeric=2000) THEN
  RAISE EXCEPTION 'Published product missing or wrong on the storefront';
 END IF;
 PERFORM public.chatbud_ops('offer_save',cataloguer,jsonb_build_object('title','Test offer','kind','PERCENT','value',20,'productId',product,'endsOn',''));
 result := (SELECT x FROM jsonb_array_elements(public.chatbud_ops('storefront')->'products') x WHERE x->>'id'=sku::text);
 IF (result->>'offerPrice')::numeric<>1600 OR result->>'category'<>'FITNESS' THEN RAISE EXCEPTION 'Offer price wrong: %',result; END IF;
 PERFORM public.chatbud_ops('promo_save',cataloguer,'{"code":"test10","kind":"PERCENT","value":10,"minSubtotal":500,"endsOn":"","maxRedemptions":""}'::jsonb);
 result := public.chatbud_ops('promo_check',NULL,'{"code":"Test10","subtotal":1000}'::jsonb);
 IF NOT (result->>'valid')::boolean OR (result->>'discount')::numeric<>100 THEN RAISE EXCEPTION 'Promo not applied: %',result; END IF;
 IF (public.chatbud_ops('promo_check',NULL,'{"code":"TEST10","subtotal":100}'::jsonb)->>'valid')::boolean THEN RAISE EXCEPTION 'Promo applied below its minimum'; END IF;
 IF (public.chatbud_ops('promo_check',NULL,'{"code":"NOSUCHCODE","subtotal":1000}'::jsonb)->>'valid')::boolean THEN RAISE EXCEPTION 'Unknown promo accepted'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_ops('promo_save',cataloguer,'{"code":"TEST10","kind":"FIXED","value":50,"minSubtotal":0,"endsOn":"","maxRedemptions":""}'::jsonb);
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Duplicate promo code created'; END IF;

 -- Dashboard shows only what each role may see
 result := public.chatbud_ops('ops_dashboard',support);
 IF result->'tickets' IS NULL OR result->'tickets'='null'::jsonb OR result->'catalogue'<>'null'::jsonb THEN RAISE EXCEPTION 'Support dashboard scope wrong: %',result; END IF;

 -- Team roles
 failed := false;
 BEGIN PERFORM public.chatbud_ops('team_list',support); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Support role managed the team'; END IF;
 PERFORM public.chatbud_ops('team_role_set',admin,jsonb_build_object('email','CHATBUD-TEST-'||client||'@example.invalid','role','SUPPORT','grant',true));
 IF NOT EXISTS(SELECT 1 FROM core.role_assignment WHERE user_id=client AND role='SUPPORT') THEN RAISE EXCEPTION 'Role not granted'; END IF;
 PERFORM public.chatbud_ops('team_role_set',admin,jsonb_build_object('email','chatbud-test-'||client||'@example.invalid','role','SUPPORT','grant',false));
 IF EXISTS(SELECT 1 FROM core.role_assignment WHERE user_id=client AND role='SUPPORT') THEN RAISE EXCEPTION 'Role not removed'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_ops('team_role_set',admin,jsonb_build_object('email','chatbud-test-'||admin||'@example.invalid','role','SECURITY_ADMIN','grant',false));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Administrator removed their own access'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_ops('team_role_set',admin,jsonb_build_object('email','chatbud-test-'||client||'@example.invalid','role','CONSUMER','grant',true));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A non-team role was assigned through team management'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: grievances and visibility, escalation and reopening, booking oversight, role-limited catalogue, offers, promo codes, dashboard scope and team roles; test records rolled back.' AS result;
