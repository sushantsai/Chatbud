BEGIN;
-- Store checkout: orders with delivery details, stock held while paying, online payment or cash on delivery.
ALTER TABLE shop.product_order
 ALTER COLUMN encrypted_shipping_address DROP NOT NULL,
 ALTER COLUMN encryption_key_reference DROP NOT NULL,
 ADD COLUMN IF NOT EXISTS reference text UNIQUE,
 ADD COLUMN IF NOT EXISTS idempotency_key text UNIQUE,
 ADD COLUMN IF NOT EXISTS payment_method text CHECK(payment_method IN ('ONLINE','COD')),
 ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'UNPAID'
  CHECK(payment_status IN ('UNPAID','COD_DUE','PAID','REFUND_DUE','REFUNDED','NOT_REFUNDED')),
 ADD COLUMN IF NOT EXISTS promo_code text,
 ADD COLUMN IF NOT EXISTS courier text, ADD COLUMN IF NOT EXISTS tracking text,
 ADD COLUMN IF NOT EXISTS dispatched_at timestamptz, ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
 ADD COLUMN IF NOT EXISTS cancelled_at timestamptz, ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Where an order goes. Kept apart from the order so few queries ever touch it.
CREATE TABLE IF NOT EXISTS shop.order_delivery (
 order_id uuid PRIMARY KEY REFERENCES shop.product_order(id),
 recipient text NOT NULL CHECK(length(btrim(recipient)) BETWEEN 2 AND 120),
 phone text NOT NULL CHECK(length(btrim(phone)) BETWEEN 7 AND 30),
 address text NOT NULL CHECK(length(btrim(address)) BETWEEN 5 AND 300),
 city text NOT NULL CHECK(length(btrim(city)) BETWEEN 2 AND 80),
 district text NOT NULL CHECK(length(btrim(district)) BETWEEN 2 AND 80),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=300)
);
ALTER TABLE shop.order_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shop.order_delivery FROM PUBLIC, anon, authenticated;
-- Intentionally no RLS policies; access is through the server-only gateway below.

-- Prices a bag exactly as it will be charged: live offers, promo code, then delivery.
-- Delivery is NPR 100, free once the goods come to NPR 2,000 or more after discount.
CREATE OR REPLACE FUNCTION shop.price_cart(p_items jsonb, p_promo text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $price$
DECLARE v_item jsonb; v_lines jsonb := '[]'; v_sub bigint := 0; v_unit bigint; v_qty integer; v_row record;
 v_promo shop.promo_code%ROWTYPE; v_code text; v_discount bigint := 0; v_ship bigint; v_msg text;
BEGIN
 IF p_items IS NULL OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Your bag is empty.'; END IF;
 FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  v_qty=(v_item->>'quantity')::int;
  SELECT s.id,p.title,s.code,s.price_minor,
   COALESCE((SELECT sum(b.on_hand-b.reserved) FROM shop.stock_batch b WHERE b.sku_id=s.id AND b.status='AVAILABLE'
     AND (b.expires_on IS NULL OR b.expires_on>current_date)),0) AS stock,
   (SELECT min(round(GREATEST(0,CASE o.kind WHEN 'PERCENT' THEN s.price_minor*(100-o.value)/100 ELSE s.price_minor-o.value*100 END)))
     FROM shop.offer o WHERE o.active AND o.starts_at<=now() AND (o.ends_at IS NULL OR o.ends_at>now())
      AND (o.product_id IS NULL OR o.product_id=p.id)) AS offer
  INTO v_row FROM shop.sku s JOIN shop.product p ON p.id=s.product_id JOIN shop.supplier sp ON sp.id=p.supplier_id
  WHERE s.id=(v_item->>'skuId')::uuid AND s.active AND p.status='PUBLISHED' AND sp.status='APPROVED';
  IF NOT FOUND THEN RAISE EXCEPTION 'A product in your bag is no longer sold. Remove it and try again.'; END IF;
  IF v_row.stock<v_qty THEN RAISE EXCEPTION 'Only % of “%” left in stock.',v_row.stock,v_row.title; END IF;
  v_unit=LEAST(v_row.price_minor,COALESCE(v_row.offer,v_row.price_minor))::bigint;
  v_lines=v_lines||jsonb_build_object('skuId',v_row.id,'title',v_row.title,'code',v_row.code,'quantity',v_qty,
   'unit',v_unit/100.0,'unitMinor',v_unit,'line',v_unit*v_qty/100.0);
  v_sub=v_sub+v_unit*v_qty;
 END LOOP;
 v_code=upper(btrim(COALESCE(p_promo,'')));
 IF v_code<>'' THEN
  SELECT * INTO v_promo FROM shop.promo_code WHERE code=v_code;
  IF NOT FOUND OR NOT v_promo.active OR v_promo.starts_at>now() OR (v_promo.ends_at IS NOT NULL AND v_promo.ends_at<=now())
   OR (v_promo.max_redemptions IS NOT NULL AND v_promo.redeemed_count>=v_promo.max_redemptions) THEN
   v_msg='This code is not valid.';
  ELSIF v_sub<v_promo.min_subtotal_minor THEN
   v_msg='This code applies to orders of NPR '||(v_promo.min_subtotal_minor/100)||' or more.';
  ELSE
   v_discount=CASE v_promo.kind WHEN 'PERCENT' THEN round(v_sub*v_promo.value/100) ELSE LEAST(round(v_promo.value*100),v_sub) END;
  END IF;
 END IF;
 v_ship=CASE WHEN v_sub-v_discount>=200000 THEN 0 ELSE 10000 END;
 RETURN jsonb_build_object('lines',v_lines,'subtotal',v_sub/100.0,'discount',v_discount/100.0,'shipping',v_ship/100.0,
  'total',(v_sub-v_discount+v_ship)/100.0,'subtotalMinor',v_sub,'discountMinor',v_discount,'shippingMinor',v_ship,
  'promoCode',CASE WHEN v_discount>0 THEN v_code END,'promoMessage',v_msg);
END $price$;

-- Puts an order's held stock back on the shelf.
CREATE OR REPLACE FUNCTION shop.release_order(p_order uuid, p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $release$
DECLARE r record;
BEGIN
 FOR r IN SELECT sr.id,sr.batch_id,sr.quantity FROM shop.stock_reservation sr JOIN shop.order_item oi ON oi.id=sr.order_item_id
  WHERE oi.order_id=p_order AND sr.status IN ('HELD','ALLOCATED') FOR UPDATE OF sr LOOP
  UPDATE shop.stock_batch SET reserved=reserved-r.quantity WHERE id=r.batch_id;
  UPDATE shop.stock_reservation SET status='RELEASED' WHERE id=r.id;
  INSERT INTO shop.stock_movement(batch_id,reserved_delta,kind,reference_type,reference_id,dedupe_key,actor_id)
  VALUES(r.batch_id,-r.quantity,'RELEASE','order',p_order,'release-'||r.id,p_actor);
 END LOOP;
END $release$;

-- Unpaid orders give their stock back after 30 minutes.
CREATE OR REPLACE FUNCTION shop.expire_orders(p_user uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $expire$
DECLARE o record;
BEGIN
 FOR o IN SELECT id FROM shop.product_order WHERE status='AWAITING_PAYMENT' AND checkout_expires_at<=now()
  AND (p_user IS NULL OR user_id=p_user) FOR UPDATE LOOP
  UPDATE shop.product_order SET status='EXPIRED',revision=revision+1 WHERE id=o.id;
  PERFORM shop.release_order(o.id,NULL);
 END LOOP;
END $expire$;
REVOKE ALL ON FUNCTION shop.price_cart(jsonb,text), shop.release_order(uuid,uuid), shop.expire_orders(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.chatbud_shop(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE v_roles text[]; v_order shop.product_order%ROWTYPE; v_pay finance.payment_attempt%ROWTYPE; v_refund finance.refund%ROWTYPE;
 v_quote jsonb; v_line jsonb; v_id uuid; v_item uuid; v_left integer; v_take integer; v_batch record; v_ref text; v_cod boolean; r record;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;

 -- Customers ----------------------------------------------------------------
 IF p_action='quote' THEN RETURN shop.price_cart(p_data->'items',p_data->>'promoCode'); END IF;

 IF p_action='order_create' THEN
  SELECT * INTO v_order FROM shop.product_order WHERE idempotency_key=p_data->>'idempotencyKey';
  IF v_order.id IS NOT NULL THEN
   IF v_order.user_id<>p_actor THEN RAISE EXCEPTION 'Order not found.'; END IF;
   RETURN jsonb_build_object('id',v_order.id,'reference',v_order.reference,'total',v_order.total_minor/100.0,'status',v_order.status);
  END IF;
  PERFORM shop.expire_orders(p_actor);
  IF (SELECT count(*) FROM shop.product_order WHERE user_id=p_actor AND status='AWAITING_PAYMENT')>=3 THEN
   RAISE EXCEPTION 'You have orders waiting for payment. Pay or cancel one first.';
  END IF;
  v_quote=shop.price_cart(p_data->'items',p_data->>'promoCode');
  IF p_data->>'promoCode'<>'' AND v_quote->>'promoCode' IS NULL THEN RAISE EXCEPTION '%',COALESCE(v_quote->>'promoMessage','This code is not valid.'); END IF;
  v_cod=p_data->>'method'='COD';
  v_id=gen_random_uuid();
  INSERT INTO shop.product_order(id,user_id,status,items_subtotal_minor,shipping_minor,discount_minor,total_minor,policy_snapshot,
   checkout_expires_at,reference,idempotency_key,payment_method,payment_status,promo_code)
  VALUES(v_id,p_actor,CASE WHEN v_cod THEN 'PROCESSING' ELSE 'AWAITING_PAYMENT' END,(v_quote->>'subtotalMinor')::bigint,(v_quote->>'shippingMinor')::bigint,
   (v_quote->>'discountMinor')::bigint,(v_quote->>'subtotalMinor')::bigint+(v_quote->>'shippingMinor')::bigint-(v_quote->>'discountMinor')::bigint,
   jsonb_build_object('delivery','NPR 100, free from NPR 2,000','cancellation','Free until dispatch'),now()+interval '30 minutes',
   'ORD-'||upper(substr(replace(v_id::text,'-',''),1,8)),p_data->>'idempotencyKey',p_data->>'method',
   CASE WHEN v_cod THEN 'COD_DUE' ELSE 'UNPAID' END,v_quote->>'promoCode');
  INSERT INTO shop.order_delivery(order_id,recipient,phone,address,city,district,note)
  VALUES(v_id,btrim(p_data->'delivery'->>'recipient'),btrim(p_data->'delivery'->>'phone'),btrim(p_data->'delivery'->>'address'),
   btrim(p_data->'delivery'->>'city'),btrim(p_data->'delivery'->>'district'),btrim(COALESCE(p_data->'delivery'->>'note','')));
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_quote->'lines') LOOP
   INSERT INTO shop.order_item(order_id,sku_id,title_snapshot,sku_snapshot,quantity,unit_price_minor,line_total_minor)
   VALUES(v_id,(v_line->>'skuId')::uuid,v_line->>'title',jsonb_build_object('code',v_line->>'code'),(v_line->>'quantity')::int,
    (v_line->>'unitMinor')::bigint,(v_line->>'unitMinor')::bigint*(v_line->>'quantity')::int) RETURNING id INTO v_item;
   -- Hold stock, earliest expiry first.
   v_left=(v_line->>'quantity')::int;
   FOR v_batch IN SELECT b.id,b.on_hand-b.reserved AS free FROM shop.stock_batch b WHERE b.sku_id=(v_line->>'skuId')::uuid AND b.status='AVAILABLE'
     AND (b.expires_on IS NULL OR b.expires_on>current_date) AND b.on_hand>b.reserved ORDER BY b.expires_on NULLS LAST,b.received_at FOR UPDATE LOOP
    EXIT WHEN v_left=0;
    v_take=LEAST(v_left,v_batch.free);
    UPDATE shop.stock_batch SET reserved=reserved+v_take WHERE id=v_batch.id;
    INSERT INTO shop.stock_reservation(order_item_id,sku_id,batch_id,quantity,status,expires_at)
    VALUES(v_item,(v_line->>'skuId')::uuid,v_batch.id,v_take,CASE WHEN v_cod THEN 'ALLOCATED' ELSE 'HELD' END,now()+interval '30 minutes');
    INSERT INTO shop.stock_movement(batch_id,reserved_delta,kind,reference_type,reference_id,dedupe_key,actor_id)
    VALUES(v_batch.id,v_take,'RESERVE','order',v_id,'reserve-'||v_item||'-'||v_batch.id,p_actor);
    v_left=v_left-v_take;
   END LOOP;
   IF v_left>0 THEN RAISE EXCEPTION '“%” has just sold out. Please update your bag.',v_line->>'title'; END IF;
  END LOOP;
  IF v_cod AND v_quote->>'promoCode' IS NOT NULL THEN UPDATE shop.promo_code SET redeemed_count=redeemed_count+1 WHERE code=v_quote->>'promoCode'; END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,'ORDER_PLACED','product_order',v_id,'Store order',jsonb_build_object('method',p_data->>'method'));
  RETURN jsonb_build_object('id',v_id,'reference','ORD-'||upper(substr(replace(v_id::text,'-',''),1,8)),'total',(v_quote->>'total')::numeric,
   'status',CASE WHEN v_cod THEN 'PROCESSING' ELSE 'AWAITING_PAYMENT' END);
 END IF;

 IF p_action='orders_mine' THEN
  PERFORM shop.expire_orders(p_actor);
  RETURN jsonb_build_object('orders',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'reference',o.reference,'status',o.status,
     'paymentStatus',o.payment_status,'method',o.payment_method,'total',o.total_minor/100.0,'subtotal',o.items_subtotal_minor/100.0,
     'discount',o.discount_minor/100.0,'shipping',o.shipping_minor/100.0,'createdAt',o.created_at,'dispatchedAt',o.dispatched_at,
     'deliveredAt',o.delivered_at,'courier',o.courier,'tracking',o.tracking,
     'canCancel',o.status IN ('AWAITING_PAYMENT','PAID','PROCESSING') AND o.dispatched_at IS NULL,
     'items',(SELECT jsonb_agg(jsonb_build_object('title',i.title_snapshot,'quantity',i.quantity,'unit',i.unit_price_minor/100.0) ORDER BY i.title_snapshot)
       FROM shop.order_item i WHERE i.order_id=o.id),
     'deliverTo',(SELECT d.recipient||', '||d.address||', '||d.city FROM shop.order_delivery d WHERE d.order_id=o.id)) ORDER BY o.created_at DESC)
    FROM shop.product_order o WHERE o.user_id=p_actor AND o.reference IS NOT NULL),'[]'::jsonb));
 END IF;

 -- Payment for an order, mirroring consultation payments.
 IF p_action='pay_start' THEN
  PERFORM shop.expire_orders(p_actor);
  SELECT * INTO v_order FROM shop.product_order WHERE id=(p_data->>'orderId')::uuid AND user_id=p_actor FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.status<>'AWAITING_PAYMENT' THEN RAISE EXCEPTION 'This order is no longer waiting for payment.'; END IF;
  SELECT * INTO v_pay FROM finance.payment_attempt WHERE idempotency_key=p_data->>'idempotencyKey';
  IF v_pay.id IS NULL THEN
   INSERT INTO finance.payment_attempt(order_id,gateway,idempotency_key,amount_minor,status)
   VALUES(v_order.id,p_data->>'gateway',p_data->>'idempotencyKey',v_order.total_minor,'CREATED') RETURNING * INTO v_pay;
  ELSIF v_pay.order_id IS DISTINCT FROM v_order.id THEN RAISE EXCEPTION 'Payment not found.';
  END IF;
  UPDATE shop.product_order SET checkout_expires_at=GREATEST(checkout_expires_at,now()+interval '30 minutes') WHERE id=v_order.id;
  RETURN jsonb_build_object('id',v_pay.id,'amountMinor',v_pay.amount_minor,'title','Chatbud order '||v_order.reference,
   'name',(SELECT display_name FROM core.app_user WHERE id=p_actor),'email',(SELECT email FROM core.app_user WHERE id=p_actor));
 END IF;

 IF p_action IN ('pay_attach','pay_attempt','pay_settle') THEN
  SELECT pa.* INTO v_pay FROM finance.payment_attempt pa JOIN shop.product_order o ON o.id=pa.order_id
  WHERE pa.id=(p_data->>'id')::uuid AND o.user_id=p_actor FOR UPDATE OF pa;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'Payment not found.'; END IF;
  IF p_action='pay_attach' THEN
   UPDATE finance.payment_attempt SET gateway_reference=p_data->>'reference',status='PENDING' WHERE id=v_pay.id AND status='CREATED';
   RETURN jsonb_build_object('id',v_pay.id);
  END IF;
  IF p_action='pay_attempt' THEN
   RETURN jsonb_build_object('id',v_pay.id,'gateway',v_pay.gateway,'reference',v_pay.gateway_reference,'amountMinor',v_pay.amount_minor,
    'status',v_pay.status,'orderId',v_pay.order_id);
  END IF;
  -- pay_settle: called by the server only after the payment provider itself confirmed the outcome.
  IF v_pay.status='SUCCEEDED' THEN RETURN jsonb_build_object('status','SUCCEEDED'); END IF;
  IF p_data->>'outcome'<>'SUCCEEDED' THEN
   UPDATE finance.payment_attempt SET status='FAILED' WHERE id=v_pay.id;
   RETURN jsonb_build_object('status','FAILED');
  END IF;
  SELECT * INTO v_order FROM shop.product_order WHERE id=v_pay.order_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM finance.payment_attempt WHERE order_id=v_order.id AND status='SUCCEEDED') THEN
   INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
   VALUES(p_actor,'PAYMENT_DUPLICATE','payment_attempt',v_pay.id,'Payment',jsonb_build_object('gateway',v_pay.gateway,'reference',p_data->>'reference'));
   RETURN jsonb_build_object('status','DUPLICATE');
  END IF;
  UPDATE finance.payment_attempt SET status='SUCCEEDED',verified_at=now(),gateway_reference=COALESCE(p_data->>'reference',gateway_reference) WHERE id=v_pay.id;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,'PAYMENT_RECEIVED','product_order',v_order.id,'Payment',jsonb_build_object('gateway',v_pay.gateway,'amountMinor',v_pay.amount_minor));
  IF v_order.status='AWAITING_PAYMENT' THEN
   UPDATE shop.product_order SET status='PAID',payment_status='PAID',revision=revision+1 WHERE id=v_order.id;
   UPDATE shop.stock_reservation sr SET status='ALLOCATED' FROM shop.order_item oi WHERE oi.id=sr.order_item_id AND oi.order_id=v_order.id AND sr.status='HELD';
   IF v_order.promo_code IS NOT NULL THEN UPDATE shop.promo_code SET redeemed_count=redeemed_count+1 WHERE code=v_order.promo_code; END IF;
   RETURN jsonb_build_object('status','SUCCEEDED');
  END IF;
  -- The order lapsed while the customer was paying, so the money goes back.
  UPDATE shop.product_order SET payment_status='REFUND_DUE' WHERE id=v_order.id;
  INSERT INTO finance.refund(payment_attempt_id,amount_minor,status,idempotency_key,reason)
  VALUES(v_pay.id,v_pay.amount_minor,'REQUESTED','refund-order-'||v_order.id,'Paid after the order had lapsed. Refund in full.')
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('status','LAPSED');
 END IF;

 -- Cancelling, by the customer or the team, is free until the order is dispatched.
 IF p_action IN ('order_cancel','order_team_cancel') THEN
  SELECT COALESCE(array_agg(role),'{}') INTO v_roles FROM core.role_assignment WHERE user_id=p_actor;
  SELECT * INTO v_order FROM shop.product_order WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF v_order.id IS NULL OR (p_action='order_cancel' AND v_order.user_id<>p_actor) THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF p_action='order_team_cancel' AND NOT v_roles && ARRAY['SUPPORT','CATALOG','FULFILLMENT','SECURITY_ADMIN'] THEN
   RAISE EXCEPTION 'Team access required' USING ERRCODE='42501';
  END IF;
  IF v_order.status NOT IN ('AWAITING_PAYMENT','PAID','PROCESSING') OR v_order.dispatched_at IS NOT NULL THEN
   RAISE EXCEPTION 'This order can no longer be cancelled. Contact us through Help.';
  END IF;
  UPDATE shop.product_order SET status='CANCELLED',cancelled_at=now(),revision=revision+1,
   cancel_reason=COALESCE(NULLIF(btrim(p_data->>'reason'),''),'Cancelled by the customer'),
   payment_status=CASE payment_status WHEN 'PAID' THEN 'REFUND_DUE' WHEN 'COD_DUE' THEN 'UNPAID' ELSE payment_status END WHERE id=v_order.id;
  PERFORM shop.release_order(v_order.id,p_actor);
  IF v_order.payment_status='PAID' THEN
   INSERT INTO finance.refund(payment_attempt_id,amount_minor,status,idempotency_key,reason)
   SELECT pa.id,pa.amount_minor,'REQUESTED','refund-order-'||v_order.id,'Order cancelled before dispatch. Refund in full.'
   FROM finance.payment_attempt pa WHERE pa.order_id=v_order.id AND pa.status='SUCCEEDED' ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'ORDER_CANCELLED','product_order',v_order.id,'Store order');
  RETURN jsonb_build_object('id',v_order.id);
 END IF;

 -- Team ---------------------------------------------------------------------
 SELECT COALESCE(array_agg(role),'{}') INTO v_roles FROM core.role_assignment WHERE user_id=p_actor;
 IF NOT v_roles && ARRAY['SUPPORT','CATALOG','FULFILLMENT','SECURITY_ADMIN'] THEN RAISE EXCEPTION 'Team access required' USING ERRCODE='42501'; END IF;

 IF p_action='team_orders' THEN
  PERFORM shop.expire_orders(NULL);
  RETURN jsonb_build_object(
   'orders',COALESCE((SELECT jsonb_agg(item ORDER BY item->>'createdAt' DESC) FROM (SELECT jsonb_build_object('id',o.id,'reference',o.reference,'status',o.status,
      'paymentStatus',o.payment_status,'method',o.payment_method,'total',o.total_minor/100.0,'createdAt',o.created_at,'dispatchedAt',o.dispatched_at,
      'deliveredAt',o.delivered_at,'courier',o.courier,'tracking',o.tracking,'cancelReason',o.cancel_reason,'client',u.display_name,'email',u.email,
      'delivery',(SELECT jsonb_build_object('recipient',d.recipient,'phone',d.phone,'address',d.address,'city',d.city,'district',d.district,'note',d.note)
        FROM shop.order_delivery d WHERE d.order_id=o.id),
      'items',(SELECT jsonb_agg(jsonb_build_object('title',i.title_snapshot,'quantity',i.quantity,'code',i.sku_snapshot->>'code') ORDER BY i.title_snapshot)
        FROM shop.order_item i WHERE i.order_id=o.id)) AS item
     FROM shop.product_order o JOIN core.app_user u ON u.id=o.user_id
     WHERE o.reference IS NOT NULL AND o.created_at>now()-interval '90 days' ORDER BY o.created_at DESC LIMIT 200) recent),'[]'::jsonb),
   'refunds',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',rf.id,'amount',rf.amount_minor/100.0,'reason',rf.reason,'gateway',pa.gateway,
      'reference',pa.gateway_reference,'order',o.reference,'client',u.display_name,'email',u.email) ORDER BY rf.created_at)
     FROM finance.refund rf JOIN finance.payment_attempt pa ON pa.id=rf.payment_attempt_id JOIN shop.product_order o ON o.id=pa.order_id
     JOIN core.app_user u ON u.id=o.user_id WHERE rf.status='REQUESTED'),'[]'::jsonb));
 END IF;

 IF p_action='order_refund_decide' THEN
  SELECT rf.* INTO v_refund FROM finance.refund rf JOIN finance.payment_attempt pa ON pa.id=rf.payment_attempt_id
  WHERE rf.id=(p_data->>'refundId')::uuid AND rf.status='REQUESTED' AND pa.order_id IS NOT NULL FOR UPDATE OF rf;
  IF v_refund.id IS NULL THEN RAISE EXCEPTION 'Refund not found or already handled.'; END IF;
  SELECT order_id INTO v_id FROM finance.payment_attempt WHERE id=v_refund.payment_attempt_id;
  IF p_data->>'decision'='SENT' THEN
   v_ref=btrim(COALESCE(p_data->>'reference',''));
   IF length(v_ref)<3 THEN RAISE EXCEPTION 'Enter the refund reference from the payment provider.'; END IF;
   UPDATE finance.refund SET status='SUCCEEDED',gateway_refund_reference=v_ref,approved_by=p_actor,decided_at=now() WHERE id=v_refund.id;
   UPDATE shop.product_order SET payment_status='REFUNDED' WHERE id=v_id;
  ELSE
   UPDATE finance.refund SET status='REJECTED',approved_by=p_actor,decided_at=now() WHERE id=v_refund.id;
   UPDATE shop.product_order SET payment_status='NOT_REFUNDED' WHERE id=v_id;
  END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,'REFUND_'||(p_data->>'decision'),'refund',v_refund.id,'Payment',jsonb_build_object('amountMinor',v_refund.amount_minor));
  RETURN jsonb_build_object('id',v_refund.id);
 END IF;

 SELECT * INTO v_order FROM shop.product_order WHERE id=(p_data->>'id')::uuid FOR UPDATE;
 IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found.'; END IF;

 -- Dispatch takes the goods out of stock.
 IF p_action='order_dispatch' THEN
  IF v_order.status NOT IN ('PAID','PROCESSING') OR v_order.dispatched_at IS NOT NULL THEN RAISE EXCEPTION 'This order is not ready to dispatch.'; END IF;
  FOR r IN SELECT sr.id,sr.batch_id,sr.quantity FROM shop.stock_reservation sr JOIN shop.order_item oi ON oi.id=sr.order_item_id
   WHERE oi.order_id=v_order.id AND sr.status='ALLOCATED' FOR UPDATE OF sr LOOP
   UPDATE shop.stock_batch SET on_hand=on_hand-r.quantity,reserved=reserved-r.quantity WHERE id=r.batch_id;
   UPDATE shop.stock_reservation SET status='DISPATCHED' WHERE id=r.id;
   INSERT INTO shop.stock_movement(batch_id,on_hand_delta,reserved_delta,kind,reference_type,reference_id,dedupe_key,actor_id)
   VALUES(r.batch_id,-r.quantity,-r.quantity,'DISPATCH','order',v_order.id,'dispatch-'||r.id,p_actor);
  END LOOP;
  UPDATE shop.product_order SET status='PROCESSING',dispatched_at=now(),courier=btrim(p_data->>'courier'),
   tracking=NULLIF(btrim(COALESCE(p_data->>'tracking','')),''),revision=revision+1 WHERE id=v_order.id;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'ORDER_DISPATCHED','product_order',v_order.id,'Store order');
  RETURN jsonb_build_object('id',v_order.id);
 END IF;

 -- Delivery completes the order. Cash collected at the door is recorded here.
 IF p_action='order_deliver' THEN
  IF v_order.dispatched_at IS NULL OR v_order.status<>'PROCESSING' THEN RAISE EXCEPTION 'Only a dispatched order can be marked delivered.'; END IF;
  IF v_order.payment_status='COD_DUE' AND v_order.total_minor>0 THEN
   v_ref=btrim(COALESCE(p_data->>'cashReference',''));
   IF length(v_ref)<3 THEN RAISE EXCEPTION 'Enter the cash receipt reference for this cash-on-delivery order.'; END IF;
   INSERT INTO finance.payment_attempt(order_id,gateway,idempotency_key,gateway_reference,amount_minor,status,verified_at)
   VALUES(v_order.id,'MANUAL','cod-'||v_order.id,v_ref||' #'||v_order.reference,v_order.total_minor,'SUCCEEDED',now());
  END IF;
  UPDATE shop.product_order SET status='FULFILLED',delivered_at=now(),revision=revision+1,
   payment_status=CASE WHEN payment_status='COD_DUE' THEN 'PAID' ELSE payment_status END WHERE id=v_order.id;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'ORDER_DELIVERED','product_order',v_order.id,'Store order');
  RETURN jsonb_build_object('id',v_order.id);
 END IF;

 RAISE EXCEPTION 'Unsupported action';
END $body$;
REVOKE ALL ON FUNCTION public.chatbud_shop(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chatbud_shop(text,uuid,jsonb) TO service_role;
COMMIT;
