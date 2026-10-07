-- Transactional checks for store checkout: pricing, stock holds, online payment, cash on delivery, cancellation, dispatch and delivery. All synthetic records are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $test$
DECLARE buyer uuid := gen_random_uuid(); other uuid := gen_random_uuid(); staff uuid := gen_random_uuid();
 who uuid; result jsonb; failed boolean; product uuid; sku uuid; batch uuid; ord uuid; cod uuid; lapsed uuid; pay uuid; refund uuid;
 items jsonb; delivery jsonb := '{"recipient":"Synthetic Buyer","phone":"9800000000","address":"12 Test Marg","city":"Kathmandu","district":"Kathmandu","note":""}';
BEGIN
 IF has_function_privilege('anon','public.chatbud_shop(text,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.chatbud_shop(text,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser roles must not execute the shop gateway';
 END IF;
 FOREACH who IN ARRAY ARRAY[buyer,other,staff] LOOP
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(who,'chatbud-test-'||who||'@example.invalid',now());
  PERFORM public.chatbud_api('account',who,jsonb_build_object('email','chatbud-test-'||who||'@example.invalid','name','Transactional test'));
 END LOOP;
 INSERT INTO core.role_assignment(user_id,role) VALUES(staff,'SUPPORT');
 INSERT INTO shop.product(slug,title,kind,description,category,supplier_id,status,approved_by,approved_at)
 VALUES('test-'||buyer,'Test bottle','WELLNESS','Synthetic product','WELLNESS',(SELECT id FROM shop.supplier WHERE status='APPROVED' LIMIT 1),'PUBLISHED',staff,now()) RETURNING id INTO product;
 INSERT INTO shop.sku(product_id,code,price_minor,active) VALUES(product,'TEST-'||left(buyer::text,8),50000,true) RETURNING id INTO sku;
 INSERT INTO shop.stock_batch(sku_id,warehouse_id,lot_code,on_hand,unit_cost_minor) VALUES(sku,(SELECT id FROM shop.warehouse LIMIT 1),'LOT-TEST',5,0) RETURNING id INTO batch;
 INSERT INTO shop.offer(title,kind,value,product_id) VALUES('Test offer','PERCENT',10,product);
 INSERT INTO shop.promo_code(code,kind,value,min_subtotal_minor) VALUES('TESTCODE9','FIXED',50,0);
 items := jsonb_build_array(jsonb_build_object('skuId',sku,'quantity',2));

 -- The quote applies the live offer, the promo code and delivery.
 result := public.chatbud_shop('quote',buyer,jsonb_build_object('items',items,'promoCode','testcode9'));
 IF (result->>'subtotal')::numeric<>900 OR (result->>'discount')::numeric<>50 OR (result->>'shipping')::numeric<>100 OR (result->>'total')::numeric<>950 THEN RAISE EXCEPTION 'Quote is wrong: %',result; END IF;
 IF public.chatbud_shop('quote',buyer,jsonb_build_object('items',items,'promoCode','NOPE1'))->>'promoMessage' IS NULL THEN RAISE EXCEPTION 'An unknown code was accepted'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_shop('quote',buyer,jsonb_build_object('items',jsonb_build_array(jsonb_build_object('skuId',sku,'quantity',6)))); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'More than the stock was quoted'; END IF;

 -- Placing an order holds stock; repeating the request does not place a second one.
 result := public.chatbud_shop('order_create',buyer,jsonb_build_object('items',items,'promoCode','TESTCODE9','delivery',delivery,'method','ONLINE','idempotencyKey','o1'));
 ord := (result->>'id')::uuid;
 IF result->>'status'<>'AWAITING_PAYMENT' OR (result->>'total')::numeric<>950 OR result->>'reference' NOT LIKE 'ORD-%' THEN RAISE EXCEPTION 'Order is wrong: %',result; END IF;
 IF (public.chatbud_shop('order_create',buyer,jsonb_build_object('items',items,'promoCode','TESTCODE9','delivery',delivery,'method','ONLINE','idempotencyKey','o1'))->>'id')::uuid<>ord THEN RAISE EXCEPTION 'Repeated request placed a second order'; END IF;
 IF (SELECT reserved FROM shop.stock_batch WHERE id=batch)<>2 THEN RAISE EXCEPTION 'Stock was not held'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_shop('order_create',other,jsonb_build_object('items',jsonb_build_array(jsonb_build_object('skuId',sku,'quantity',4)),'promoCode','','delivery',delivery,'method','COD','idempotencyKey','o2')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Held stock was sold to someone else'; END IF;

 -- Payment: only the buyer, idempotent, and it allocates the stock and counts the promo code.
 failed := false;
 BEGIN PERFORM public.chatbud_shop('pay_start',other,jsonb_build_object('orderId',ord,'gateway','ESEWA','idempotencyKey','p0')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Someone else started paying for an order'; END IF;
 result := public.chatbud_shop('pay_start',buyer,jsonb_build_object('orderId',ord,'gateway','ESEWA','idempotencyKey','p1'));
 pay := (result->>'id')::uuid;
 IF (result->>'amountMinor')::bigint<>95000 THEN RAISE EXCEPTION 'Wrong amount to pay: %',result; END IF;
 IF public.chatbud_shop('pay_settle',buyer,jsonb_build_object('id',pay,'outcome','SUCCEEDED','reference','shop-ref-1'))->>'status'<>'SUCCEEDED' THEN RAISE EXCEPTION 'Order payment did not settle'; END IF;
 IF public.chatbud_shop('pay_settle',buyer,jsonb_build_object('id',pay,'outcome','SUCCEEDED','reference','shop-ref-1'))->>'status'<>'SUCCEEDED' THEN RAISE EXCEPTION 'Settling twice failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM shop.product_order WHERE id=ord AND status='PAID' AND payment_status='PAID')
  OR (SELECT redeemed_count FROM shop.promo_code WHERE code='TESTCODE9')<>1
  OR NOT EXISTS(SELECT 1 FROM shop.stock_reservation sr JOIN shop.order_item oi ON oi.id=sr.order_item_id WHERE oi.order_id=ord AND sr.status='ALLOCATED') THEN RAISE EXCEPTION 'Paid order not recorded properly'; END IF;
 result := public.chatbud_shop('orders_mine',buyer)->'orders'->0;
 IF result->>'status'<>'PAID' OR jsonb_array_length(result->'items')<>1 OR NOT (result->>'canCancel')::boolean THEN RAISE EXCEPTION 'Customer order view is wrong: %',result; END IF;
 IF jsonb_array_length(public.chatbud_shop('orders_mine',other)->'orders')<>0 THEN RAISE EXCEPTION 'Someone else sees the order'; END IF;

 -- The team dispatches and delivers; customers cannot.
 failed := false;
 BEGIN PERFORM public.chatbud_shop('team_orders',buyer); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A customer read team orders'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.chatbud_shop('team_orders',staff)->'orders') o WHERE o->>'id'=ord::text AND o->'delivery'->>'recipient'='Synthetic Buyer') THEN RAISE EXCEPTION 'Team order list is wrong'; END IF;
 PERFORM public.chatbud_shop('order_dispatch',staff,jsonb_build_object('id',ord,'courier','Test Courier','tracking','TRK1'));
 IF NOT EXISTS(SELECT 1 FROM shop.stock_batch WHERE id=batch AND on_hand=3 AND reserved=0) THEN RAISE EXCEPTION 'Dispatch did not take stock'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_shop('order_cancel',buyer,jsonb_build_object('id',ord)); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A dispatched order was cancelled'; END IF;
 PERFORM public.chatbud_shop('order_deliver',staff,jsonb_build_object('id',ord,'cashReference',''));
 IF NOT EXISTS(SELECT 1 FROM shop.product_order WHERE id=ord AND status='FULFILLED' AND delivered_at IS NOT NULL) THEN RAISE EXCEPTION 'Delivery not recorded'; END IF;

 -- Cash on delivery: ready to pack at once; cash is recorded on delivery.
 result := public.chatbud_shop('order_create',buyer,jsonb_build_object('items',jsonb_build_array(jsonb_build_object('skuId',sku,'quantity',1)),'promoCode','','delivery',delivery,'method','COD','idempotencyKey','o3'));
 cod := (result->>'id')::uuid;
 IF result->>'status'<>'PROCESSING' OR (result->>'total')::numeric<>550 THEN RAISE EXCEPTION 'Cash-on-delivery order is wrong: %',result; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_shop('pay_start',buyer,jsonb_build_object('orderId',cod,'gateway','ESEWA','idempotencyKey','p3')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A cash-on-delivery order was paid online'; END IF;
 PERFORM public.chatbud_shop('order_dispatch',staff,jsonb_build_object('id',cod,'courier','Test Courier','tracking',''));
 failed := false;
 BEGIN PERFORM public.chatbud_shop('order_deliver',staff,jsonb_build_object('id',cod,'cashReference','')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Cash order delivered without a receipt'; END IF;
 PERFORM public.chatbud_shop('order_deliver',staff,jsonb_build_object('id',cod,'cashReference','Receipt 7'));
 IF NOT EXISTS(SELECT 1 FROM shop.product_order WHERE id=cod AND status='FULFILLED' AND payment_status='PAID')
  OR NOT EXISTS(SELECT 1 FROM finance.payment_attempt WHERE order_id=cod AND gateway='MANUAL' AND status='SUCCEEDED') THEN RAISE EXCEPTION 'Cash not recorded on delivery'; END IF;

 -- Cancelling a paid order before dispatch frees the stock and queues a refund.
 result := public.chatbud_shop('order_create',buyer,jsonb_build_object('items',jsonb_build_array(jsonb_build_object('skuId',sku,'quantity',1)),'promoCode','','delivery',delivery,'method','ONLINE','idempotencyKey','o4'));
 ord := (result->>'id')::uuid;
 pay := (public.chatbud_shop('pay_start',buyer,jsonb_build_object('orderId',ord,'gateway','KHALTI','idempotencyKey','p4'))->>'id')::uuid;
 PERFORM public.chatbud_shop('pay_settle',buyer,jsonb_build_object('id',pay,'outcome','SUCCEEDED','reference','shop-ref-4'));
 PERFORM public.chatbud_shop('order_cancel',buyer,jsonb_build_object('id',ord));
 SELECT rf.id INTO refund FROM finance.refund rf WHERE rf.payment_attempt_id=pay AND rf.status='REQUESTED';
 IF refund IS NULL OR NOT EXISTS(SELECT 1 FROM shop.product_order WHERE id=ord AND status='CANCELLED' AND payment_status='REFUND_DUE')
  OR (SELECT reserved FROM shop.stock_batch WHERE id=batch)<>0 THEN RAISE EXCEPTION 'Cancellation did not free stock and queue a refund'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.chatbud_shop('team_orders',staff)->'refunds') rf WHERE rf->>'id'=refund::text) THEN RAISE EXCEPTION 'Refund missing from the team list'; END IF;
 PERFORM public.chatbud_shop('order_refund_decide',staff,jsonb_build_object('refundId',refund,'decision','SENT','reference','RF-SHOP-1'));
 IF NOT EXISTS(SELECT 1 FROM shop.product_order WHERE id=ord AND payment_status='REFUNDED') THEN RAISE EXCEPTION 'Order refund not recorded'; END IF;

 -- An unpaid order lapses, frees its stock, and a late payment is refunded.
 result := public.chatbud_shop('order_create',buyer,jsonb_build_object('items',jsonb_build_array(jsonb_build_object('skuId',sku,'quantity',2)),'promoCode','','delivery',delivery,'method','ONLINE','idempotencyKey','o5'));
 lapsed := (result->>'id')::uuid;
 pay := (public.chatbud_shop('pay_start',buyer,jsonb_build_object('orderId',lapsed,'gateway','ESEWA','idempotencyKey','p5'))->>'id')::uuid;
 UPDATE shop.product_order SET checkout_expires_at=now()-interval '1 minute' WHERE id=lapsed;
 PERFORM public.chatbud_shop('orders_mine',buyer);
 IF NOT EXISTS(SELECT 1 FROM shop.product_order WHERE id=lapsed AND status='EXPIRED') OR (SELECT reserved FROM shop.stock_batch WHERE id=batch)<>0 THEN RAISE EXCEPTION 'Unpaid order did not lapse and free stock'; END IF;
 IF public.chatbud_shop('pay_settle',buyer,jsonb_build_object('id',pay,'outcome','SUCCEEDED','reference','shop-ref-5'))->>'status'<>'LAPSED' THEN RAISE EXCEPTION 'Late order payment not treated as lapsed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finance.refund rf WHERE rf.payment_attempt_id=pay AND rf.status='REQUESTED') THEN RAISE EXCEPTION 'Late order payment not queued for refund'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: quotes with offers, promo and delivery; stock holds; idempotent orders and payments; dispatch and delivery; cash on delivery; cancellation refunds; lapsed orders; test records rolled back.' AS result;
