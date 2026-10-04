BEGIN;
-- Grievances raised by clients and professionals, handled by the support team.
CREATE TABLE IF NOT EXISTS ops.support_ticket (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reference text NOT NULL UNIQUE DEFAULT ('CB-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 raised_by uuid NOT NULL REFERENCES core.app_user(id),
 raised_as text NOT NULL CHECK(raised_as IN ('CLIENT','PROFESSIONAL')),
 category text NOT NULL CHECK(category IN ('BOOKING','PROFESSIONAL','ORDER','ACCOUNT','PAYMENT','OTHER')),
 subject text NOT NULL CHECK(length(btrim(subject)) BETWEEN 3 AND 160),
 appointment_id uuid REFERENCES care.appointment(id),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','ESCALATED','RESOLVED','CLOSED')),
 priority text NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL','HIGH','URGENT')),
 assigned_to uuid REFERENCES core.app_user(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS support_ticket_queue ON ops.support_ticket(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS support_ticket_owner ON ops.support_ticket(raised_by,created_at DESC);
CREATE TABLE IF NOT EXISTS ops.support_message (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES ops.support_ticket(id),
 author_id uuid NOT NULL REFERENCES core.app_user(id),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),
 internal boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_message_thread ON ops.support_message(ticket_id,created_at);

-- Storefront: categories, time-limited offers and promo codes.
ALTER TABLE shop.product ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'WELLNESS'
 CHECK(category IN ('WELLNESS','NUTRITION','FITNESS','DEVICES','MENTAL_WELLNESS','PERSONAL_CARE'));
CREATE TABLE IF NOT EXISTS shop.offer (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 80),
 kind text NOT NULL CHECK(kind IN ('PERCENT','FIXED')), value numeric(12,2) NOT NULL CHECK(value>0),
 product_id uuid REFERENCES shop.product(id),
 starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz, active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES core.app_user(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind<>'PERCENT' OR value<=90), CHECK(ends_at IS NULL OR ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS shop.promo_code (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9]{4,20}$'),
 kind text NOT NULL CHECK(kind IN ('PERCENT','FIXED')), value numeric(12,2) NOT NULL CHECK(value>0),
 min_subtotal_minor bigint NOT NULL DEFAULT 0 CHECK(min_subtotal_minor>=0),
 starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz,
 max_redemptions integer CHECK(max_redemptions IS NULL OR max_redemptions>0),
 redeemed_count integer NOT NULL DEFAULT 0 CHECK(redeemed_count>=0), active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES core.app_user(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind<>'PERCENT' OR value<=90), CHECK(ends_at IS NULL OR ends_at>starts_at)
);
ALTER TABLE ops.support_ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.support_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop.offer ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop.promo_code ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.support_ticket, ops.support_message, shop.offer, shop.promo_code FROM PUBLIC, anon, authenticated;
-- Intentionally no RLS policies; access is through the server-only gateway below.

-- Chatbud's own supplier and warehouse for products the team lists.
INSERT INTO shop.supplier(legal_name,status) SELECT 'Chatbud','APPROVED' WHERE NOT EXISTS(SELECT 1 FROM shop.supplier WHERE legal_name='Chatbud');
INSERT INTO shop.warehouse(name,address_payload) SELECT 'Chatbud main warehouse','{"city":"Kathmandu"}' WHERE NOT EXISTS(SELECT 1 FROM shop.warehouse WHERE name='Chatbud main warehouse');

CREATE OR REPLACE FUNCTION public.chatbud_ops(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE
 v_roles text[]; v_id uuid; v_ticket ops.support_ticket; v_appt care.appointment; v_product shop.product; v_sku shop.sku;
 v_promo shop.promo_code; v_text text; v_subtotal numeric; v_discount numeric; v_target uuid; v_role text; v_batch uuid;
 team_roles CONSTANT text[] := ARRAY['VERIFICATION','CLINICAL_REVIEW','SUPPORT','CATALOG','SECURITY_ADMIN'];
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;

 -- Public storefront -------------------------------------------------------
 IF p_action='storefront' THEN
  RETURN jsonb_build_object('products',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('id',s.id,'category',p.category,'offerPrice',x.price,'offerTitle',x.title))
   FROM shop.product p JOIN shop.sku s ON s.product_id=p.id AND s.active
   LEFT JOIN LATERAL (
    SELECT o.title, round(GREATEST(0, CASE o.kind WHEN 'PERCENT' THEN s.price_minor*(100-o.value)/100 ELSE s.price_minor-o.value*100 END))/100.0 AS price
    FROM shop.offer o
    WHERE o.active AND o.starts_at<=now() AND (o.ends_at IS NULL OR o.ends_at>now()) AND (o.product_id IS NULL OR o.product_id=p.id)
    ORDER BY 2 LIMIT 1) x ON true
   WHERE p.status='PUBLISHED'),'[]'::jsonb));
 END IF;
 IF p_action='promo_check' THEN
  v_subtotal=(p_data->>'subtotal')::numeric;
  SELECT * INTO v_promo FROM shop.promo_code WHERE code=upper(btrim(p_data->>'code'));
  IF NOT FOUND OR NOT v_promo.active OR v_promo.starts_at>now() OR (v_promo.ends_at IS NOT NULL AND v_promo.ends_at<=now())
   OR (v_promo.max_redemptions IS NOT NULL AND v_promo.redeemed_count>=v_promo.max_redemptions) THEN
   RETURN jsonb_build_object('valid',false,'message','This code is not valid.');
  END IF;
  IF v_subtotal*100<v_promo.min_subtotal_minor THEN
   RETURN jsonb_build_object('valid',false,'message','This code applies to orders of NPR '||(v_promo.min_subtotal_minor/100)||' or more.');
  END IF;
  v_discount=CASE v_promo.kind WHEN 'PERCENT' THEN round(v_subtotal*v_promo.value/100,2) ELSE LEAST(v_promo.value,v_subtotal) END;
  RETURN jsonb_build_object('valid',true,'code',v_promo.code,'discount',v_discount);
 END IF;

 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;
 SELECT COALESCE(array_agg(role),'{}') INTO v_roles FROM core.role_assignment WHERE user_id=p_actor;

 -- Clients and professionals: their own grievances -----------------------
 IF p_action='ticket_create' THEN
  IF (SELECT count(*) FROM ops.support_ticket WHERE raised_by=p_actor AND status NOT IN ('RESOLVED','CLOSED'))>=5 THEN
   RAISE EXCEPTION 'You already have five open requests. Reply on one of those, or wait for it to be resolved.';
  END IF;
  v_id=NULLIF(p_data->>'appointmentId','')::uuid;
  IF v_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM care.appointment a WHERE a.id=v_id AND (a.client_id=p_actor OR a.provider_id=p_actor)) THEN
   RAISE EXCEPTION 'That appointment is not one of yours.';
  END IF;
  INSERT INTO ops.support_ticket(raised_by,raised_as,category,subject,appointment_id)
  VALUES(p_actor,CASE WHEN p_data->>'as'='PROFESSIONAL' AND EXISTS(SELECT 1 FROM care.provider WHERE id=p_actor) THEN 'PROFESSIONAL' ELSE 'CLIENT' END,
   p_data->>'category',btrim(p_data->>'subject'),v_id) RETURNING * INTO v_ticket;
  INSERT INTO ops.support_message(ticket_id,author_id,body) VALUES(v_ticket.id,p_actor,btrim(p_data->>'body'));
  RETURN jsonb_build_object('id',v_ticket.id,'reference',v_ticket.reference);
 END IF;
 IF p_action='tickets_mine' THEN
  RETURN jsonb_build_object('tickets',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('id',t.id,'reference',t.reference,'category',t.category,'subject',t.subject,'status',t.status,
     'createdAt',t.created_at,'updatedAt',t.updated_at,
     'messages',(SELECT jsonb_agg(jsonb_build_object('body',m.body,'at',m.created_at,'mine',m.author_id=p_actor,
        'author',CASE WHEN m.author_id=p_actor THEN 'You' ELSE 'Chatbud support' END) ORDER BY m.created_at)
       FROM ops.support_message m WHERE m.ticket_id=t.id AND NOT m.internal)) ORDER BY t.updated_at DESC)
   FROM ops.support_ticket t WHERE t.raised_by=p_actor),'[]'::jsonb),
   'appointments',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('id',a.id,'label',(a.service_snapshot->>'title')||' · '||to_char(a.starts_at AT TIME ZONE 'Asia/Kathmandu','DD Mon YYYY, HH24:MI')) ORDER BY a.starts_at DESC)
   FROM (SELECT * FROM care.appointment WHERE client_id=p_actor OR provider_id=p_actor ORDER BY starts_at DESC LIMIT 20) a),'[]'::jsonb));
 END IF;
 IF p_action='ticket_reply' THEN
  SELECT * INTO v_ticket FROM ops.support_ticket WHERE id=(p_data->>'id')::uuid AND raised_by=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;
  IF v_ticket.status='CLOSED' THEN RAISE EXCEPTION 'This request is closed. Raise a new one if you still need help.'; END IF;
  INSERT INTO ops.support_message(ticket_id,author_id,body) VALUES(v_ticket.id,p_actor,btrim(p_data->>'body'));
  UPDATE ops.support_ticket SET updated_at=now(),resolved_at=NULL,status=CASE WHEN status='RESOLVED' THEN 'OPEN' ELSE status END WHERE id=v_ticket.id;
  RETURN jsonb_build_object('id',v_ticket.id);
 END IF;

 -- Team ---------------------------------------------------------------------
 IF NOT v_roles && team_roles THEN RAISE EXCEPTION 'Team access required' USING ERRCODE='42501'; END IF;

 IF p_action='ops_dashboard' THEN
  RETURN jsonb_build_object('roles',to_jsonb(v_roles),
   'applications',CASE WHEN v_roles && ARRAY['VERIFICATION','CLINICAL_REVIEW'] THEN (SELECT count(*) FROM (SELECT DISTINCT ON (provider_id) status FROM care.verification_case ORDER BY provider_id,created_at DESC) c WHERE c.status IN ('SUBMITTED','UNDER_REVIEW')) END,
   'tickets',CASE WHEN v_roles && ARRAY['SUPPORT','SECURITY_ADMIN'] THEN jsonb_build_object(
     'open',(SELECT count(*) FROM ops.support_ticket WHERE status IN ('OPEN','IN_PROGRESS')),
     'escalated',(SELECT count(*) FROM ops.support_ticket WHERE status='ESCALATED'),
     'unassigned',(SELECT count(*) FROM ops.support_ticket WHERE status IN ('OPEN','IN_PROGRESS','ESCALATED') AND assigned_to IS NULL)) END,
   'bookings',CASE WHEN v_roles && ARRAY['SUPPORT','SECURITY_ADMIN'] THEN jsonb_build_object(
     'awaiting',(SELECT count(*) FROM care.appointment WHERE status='HELD' AND hold_expires_at>now()),
     'upcoming',(SELECT count(*) FROM care.appointment WHERE status='CONFIRMED' AND starts_at>now()),
     'lapsed',(SELECT count(*) FROM care.appointment WHERE status IN ('HELD','EXPIRED') AND hold_expires_at<=now() AND created_at>now()-interval '7 days')) END,
   'catalogue',CASE WHEN v_roles && ARRAY['CATALOG','SECURITY_ADMIN'] THEN jsonb_build_object(
     'published',(SELECT count(*) FROM shop.product WHERE status='PUBLISHED'),
     'drafts',(SELECT count(*) FROM shop.product WHERE status IN ('DRAFT','UNDER_REVIEW','APPROVED')),
     'offers',(SELECT count(*) FROM shop.offer WHERE active AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now())),
     'promos',(SELECT count(*) FROM shop.promo_code WHERE active AND (ends_at IS NULL OR ends_at>now()))) END);
 END IF;

 -- Support: grievances and bookings
 IF p_action IN ('tickets_queue','ticket_update','ticket_note','bookings_list','booking_cancel','booking_confirm') THEN
  IF NOT v_roles && ARRAY['SUPPORT','SECURITY_ADMIN'] THEN RAISE EXCEPTION 'Support access required' USING ERRCODE='42501'; END IF;

  IF p_action='tickets_queue' THEN
   RETURN jsonb_build_object('tickets',COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',t.id,'reference',t.reference,'category',t.category,'subject',t.subject,'status',t.status,
      'priority',t.priority,'raisedAs',t.raised_as,'raisedBy',u.display_name,'email',u.email,'assignedTo',au.display_name,
      'assignedToMe',t.assigned_to=p_actor,'createdAt',t.created_at,'updatedAt',t.updated_at,
      'appointment',(SELECT (a.service_snapshot->>'title')||' · '||to_char(a.starts_at AT TIME ZONE 'Asia/Kathmandu','DD Mon YYYY, HH24:MI')||' · '||a.status FROM care.appointment a WHERE a.id=t.appointment_id),
      'messages',(SELECT jsonb_agg(jsonb_build_object('body',m.body,'at',m.created_at,'internal',m.internal,
         'author',CASE WHEN m.author_id=t.raised_by THEN u.display_name ELSE mu.display_name||' (team)' END) ORDER BY m.created_at)
        FROM ops.support_message m JOIN core.app_user mu ON mu.id=m.author_id WHERE m.ticket_id=t.id))
     ORDER BY (t.status='ESCALATED') DESC,(t.priority='URGENT') DESC,(t.priority='HIGH') DESC,t.updated_at DESC)
    FROM (SELECT * FROM ops.support_ticket WHERE status NOT IN ('CLOSED') OR updated_at>now()-interval '14 days' ORDER BY updated_at DESC LIMIT 200) t
    JOIN core.app_user u ON u.id=t.raised_by LEFT JOIN core.app_user au ON au.id=t.assigned_to),'[]'::jsonb));
  END IF;

  IF p_action IN ('ticket_update','ticket_note') THEN
   SELECT * INTO v_ticket FROM ops.support_ticket WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;
   IF p_action='ticket_note' THEN
    INSERT INTO ops.support_message(ticket_id,author_id,body,internal) VALUES(v_ticket.id,p_actor,btrim(p_data->>'body'),COALESCE((p_data->>'internal')::boolean,false));
    UPDATE ops.support_ticket SET updated_at=now(),assigned_to=COALESCE(assigned_to,p_actor),
     status=CASE WHEN status='OPEN' AND NOT COALESCE((p_data->>'internal')::boolean,false) THEN 'IN_PROGRESS' ELSE status END WHERE id=v_ticket.id;
    RETURN jsonb_build_object('id',v_ticket.id);
   END IF;
   v_text=COALESCE(p_data->>'status',v_ticket.status);
   UPDATE ops.support_ticket SET status=v_text,
    priority=CASE WHEN v_text='ESCALATED' AND COALESCE(p_data->>'priority',priority)='NORMAL' THEN 'HIGH' ELSE COALESCE(p_data->>'priority',priority) END,
    assigned_to=CASE p_data->>'assign' WHEN 'me' THEN p_actor WHEN 'none' THEN NULL ELSE assigned_to END,
    resolved_at=CASE WHEN v_text IN ('RESOLVED','CLOSED') THEN COALESCE(resolved_at,now()) ELSE NULL END,updated_at=now()
   WHERE id=v_ticket.id;
   INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
   VALUES(p_actor,'SUPPORT_TICKET_UPDATED','support_ticket',v_ticket.id,'Customer support',p_data-'id');
   RETURN jsonb_build_object('id',v_ticket.id,'status',v_text);
  END IF;

  IF p_action='bookings_list' THEN
   RETURN jsonb_build_object('bookings',COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',a.id,'client',c.display_name,'clientEmail',c.email,'professional',pu.display_name,
      'service',a.service_snapshot->>'title','startsAt',a.starts_at,'requestedAt',a.created_at,
      'status',CASE WHEN a.status='HELD' AND a.hold_expires_at<=now() THEN 'EXPIRED' ELSE a.status END,
      'meetingUrl',a.meeting_url) ORDER BY a.starts_at DESC)
    FROM (SELECT * FROM care.appointment WHERE starts_at>now()-interval '30 days' ORDER BY starts_at DESC LIMIT 200) a
    JOIN core.app_user c ON c.id=a.client_id JOIN core.app_user pu ON pu.id=a.provider_id),'[]'::jsonb));
  END IF;

  SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found.'; END IF;
  IF p_action='booking_cancel' THEN
   IF v_appt.status NOT IN ('HELD','CONFIRMED') THEN RAISE EXCEPTION 'Only a pending or confirmed appointment can be cancelled.'; END IF;
   UPDATE care.appointment SET status='CANCELLED',revision=revision+1 WHERE id=v_appt.id;
   INSERT INTO care.appointment_event(appointment_id,actor_id,event_type,redacted_payload) VALUES(v_appt.id,p_actor,'CANCELLED_BY_TEAM',jsonb_build_object('reason',p_data->>'reason'));
  ELSE
   IF NOT (v_appt.status='HELD' AND v_appt.starts_at>now()) THEN RAISE EXCEPTION 'Only a pending request for a future time can be confirmed.'; END IF;
   UPDATE care.appointment SET status='CONFIRMED',meeting_url=p_data->>'meetingUrl',revision=revision+1 WHERE id=v_appt.id;
   INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(v_appt.id,p_actor,'CONFIRMED_BY_TEAM');
  END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,upper(p_action)||'_BY_TEAM','appointment',v_appt.id,'Customer support');
  RETURN jsonb_build_object('id',v_appt.id);
 END IF;

 -- Catalogue: products, stock, offers and promo codes
 IF p_action IN ('catalogue','product_save','product_status','stock_receive','offer_save','promo_save') THEN
  IF NOT v_roles && ARRAY['CATALOG','SECURITY_ADMIN'] THEN RAISE EXCEPTION 'Catalogue access required' USING ERRCODE='42501'; END IF;

  IF p_action='catalogue' THEN
   RETURN jsonb_build_object(
    'products',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'description',p.description,'kind',p.kind,'category',p.category,
       'status',p.status,'price',s.price_minor/100.0,
       'stock',COALESCE((SELECT sum(b.on_hand-b.reserved) FROM shop.stock_batch b WHERE b.sku_id=s.id AND b.status='AVAILABLE' AND (b.expires_on IS NULL OR b.expires_on>current_date)),0)) ORDER BY p.created_at DESC)
      FROM shop.product p LEFT JOIN LATERAL (SELECT * FROM shop.sku k WHERE k.product_id=p.id ORDER BY k.code LIMIT 1) s ON true),'[]'::jsonb),
    'offers',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'kind',o.kind,'value',o.value,'productId',o.product_id,
       'product',(SELECT title FROM shop.product WHERE id=o.product_id),'startsAt',o.starts_at,'endsAt',o.ends_at,'active',o.active,
       'live',o.active AND o.starts_at<=now() AND (o.ends_at IS NULL OR o.ends_at>now())) ORDER BY o.created_at DESC) FROM shop.offer o),'[]'::jsonb),
    'promos',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'kind',c.kind,'value',c.value,'minSubtotal',c.min_subtotal_minor/100.0,
       'endsAt',c.ends_at,'maxRedemptions',c.max_redemptions,'redeemed',c.redeemed_count,'active',c.active,
       'live',c.active AND c.starts_at<=now() AND (c.ends_at IS NULL OR c.ends_at>now()) AND (c.max_redemptions IS NULL OR c.redeemed_count<c.max_redemptions)) ORDER BY c.created_at DESC) FROM shop.promo_code c),'[]'::jsonb));
  END IF;

  IF p_action='product_save' THEN
   IF p_data->>'id' IS NULL THEN
    INSERT INTO shop.product(slug,title,kind,description,category,supplier_id,status)
    VALUES('p-'||replace(gen_random_uuid()::text,'-',''),btrim(p_data->>'title'),'WELLNESS',btrim(p_data->>'description'),p_data->>'category',
     (SELECT id FROM shop.supplier WHERE legal_name='Chatbud' AND status='APPROVED' LIMIT 1),'DRAFT') RETURNING id INTO v_id;
    INSERT INTO shop.sku(product_id,code,price_minor,active) VALUES(v_id,'SKU-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),round((p_data->>'price')::numeric*100)::bigint,true);
   ELSE
    UPDATE shop.product SET title=btrim(p_data->>'title'),description=btrim(p_data->>'description'),category=p_data->>'category',revision=revision+1
    WHERE id=(p_data->>'id')::uuid RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Product not found.'; END IF;
    UPDATE shop.sku SET price_minor=round((p_data->>'price')::numeric*100)::bigint,revision=revision+1 WHERE product_id=v_id;
   END IF;
   INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'PRODUCT_SAVED','product',v_id,'Catalogue management');
   RETURN jsonb_build_object('id',v_id);
  END IF;

  IF p_action IN ('product_status','stock_receive') THEN
   SELECT * INTO v_product FROM shop.product WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.'; END IF;
   IF v_product.kind='SUPPLEMENT' THEN RAISE EXCEPTION 'Supplements need ingredient, label and batch records before they can be changed here.'; END IF;
   IF p_action='product_status' THEN
    v_text=p_data->>'status';
    IF v_text='PUBLISHED' THEN
     UPDATE shop.product SET status='PUBLISHED',approved_by=p_actor,approved_at=now(),approval_reason='Listed by the catalogue team',revision=revision+1 WHERE id=v_product.id;
    ELSE
     UPDATE shop.product SET status=v_text,revision=revision+1 WHERE id=v_product.id;
    END IF;
    INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'PRODUCT_'||v_text,'product',v_product.id,'Catalogue management');
    RETURN jsonb_build_object('id',v_product.id,'status',v_text);
   END IF;
   SELECT * INTO v_sku FROM shop.sku WHERE product_id=v_product.id ORDER BY code LIMIT 1;
   INSERT INTO shop.stock_batch(sku_id,warehouse_id,lot_code,on_hand,unit_cost_minor)
   VALUES(v_sku.id,(SELECT id FROM shop.warehouse WHERE name='Chatbud main warehouse' LIMIT 1),'LOT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),(p_data->>'quantity')::int,0)
   RETURNING id INTO v_batch;
   INSERT INTO shop.stock_movement(batch_id,on_hand_delta,kind,reference_type,reference_id,dedupe_key,actor_id)
   VALUES(v_batch,(p_data->>'quantity')::int,'RECEIVE','TEAM_RECEIPT',v_batch,'team-receipt-'||v_batch,p_actor);
   RETURN jsonb_build_object('id',v_product.id);
  END IF;

  IF p_action='offer_save' THEN
   IF p_data->>'id' IS NULL THEN
    INSERT INTO shop.offer(title,kind,value,product_id,ends_at,active,created_by)
    VALUES(btrim(p_data->>'title'),p_data->>'kind',(p_data->>'value')::numeric,NULLIF(p_data->>'productId','')::uuid,NULLIF(p_data->>'endsOn','')::date+1,COALESCE((p_data->>'active')::boolean,true),p_actor)
    RETURNING id INTO v_id;
   ELSE
    UPDATE shop.offer SET title=btrim(p_data->>'title'),kind=p_data->>'kind',value=(p_data->>'value')::numeric,product_id=NULLIF(p_data->>'productId','')::uuid,
     ends_at=NULLIF(p_data->>'endsOn','')::date+1,active=COALESCE((p_data->>'active')::boolean,true)
    WHERE id=(p_data->>'id')::uuid RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Offer not found.'; END IF;
   END IF;
   INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'OFFER_SAVED','offer',v_id,'Catalogue management');
   RETURN jsonb_build_object('id',v_id);
  END IF;

  -- promo_save
  IF p_data->>'id' IS NULL THEN
   IF EXISTS(SELECT 1 FROM shop.promo_code WHERE code=upper(btrim(p_data->>'code'))) THEN RAISE EXCEPTION 'That code already exists.'; END IF;
   INSERT INTO shop.promo_code(code,kind,value,min_subtotal_minor,ends_at,max_redemptions,active,created_by)
   VALUES(upper(btrim(p_data->>'code')),p_data->>'kind',(p_data->>'value')::numeric,round(COALESCE((p_data->>'minSubtotal')::numeric,0)*100)::bigint,
    NULLIF(p_data->>'endsOn','')::date+1,NULLIF(p_data->>'maxRedemptions','')::int,COALESCE((p_data->>'active')::boolean,true),p_actor)
   RETURNING id INTO v_id;
  ELSE
   UPDATE shop.promo_code SET kind=p_data->>'kind',value=(p_data->>'value')::numeric,min_subtotal_minor=round(COALESCE((p_data->>'minSubtotal')::numeric,0)*100)::bigint,
    ends_at=NULLIF(p_data->>'endsOn','')::date+1,max_redemptions=NULLIF(p_data->>'maxRedemptions','')::int,active=COALESCE((p_data->>'active')::boolean,true)
   WHERE id=(p_data->>'id')::uuid RETURNING id INTO v_id;
   IF v_id IS NULL THEN RAISE EXCEPTION 'Promo code not found.'; END IF;
  END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'PROMO_SAVED','promo_code',v_id,'Catalogue management');
  RETURN jsonb_build_object('id',v_id);
 END IF;

 -- Administrators: who is on the team
 IF p_action IN ('team_list','team_role_set') THEN
  IF NOT 'SECURITY_ADMIN'=ANY(v_roles) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF p_action='team_list' THEN
   RETURN jsonb_build_object('members',COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name,'email',u.email,'me',u.id=p_actor,
      'roles',(SELECT jsonb_agg(r.role ORDER BY r.role) FROM core.role_assignment r WHERE r.user_id=u.id AND r.role=ANY(team_roles))) ORDER BY u.display_name)
    FROM core.app_user u WHERE EXISTS(SELECT 1 FROM core.role_assignment r WHERE r.user_id=u.id AND r.role=ANY(team_roles))),'[]'::jsonb));
  END IF;
  v_role=p_data->>'role';
  IF NOT v_role=ANY(team_roles) THEN RAISE EXCEPTION 'Unknown team role.'; END IF;
  SELECT id INTO v_target FROM core.app_user WHERE lower(email)=lower(btrim(p_data->>'email')) AND status='ACTIVE';
  IF v_target IS NULL THEN RAISE EXCEPTION 'No Chatbud account uses that email. The person must sign in once before they can be given a role.'; END IF;
  IF (p_data->>'grant')::boolean THEN
   INSERT INTO core.role_assignment(user_id,role,granted_by) VALUES(v_target,v_role,p_actor) ON CONFLICT DO NOTHING;
  ELSE
   IF v_target=p_actor AND v_role='SECURITY_ADMIN' THEN RAISE EXCEPTION 'You cannot remove your own administrator role.'; END IF;
   DELETE FROM core.role_assignment WHERE user_id=v_target AND role=v_role;
  END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,CASE WHEN (p_data->>'grant')::boolean THEN 'TEAM_ROLE_GRANTED' ELSE 'TEAM_ROLE_REMOVED' END,'app_user',v_target,'Team administration',jsonb_build_object('role',v_role));
  RETURN jsonb_build_object('id',v_target);
 END IF;

 RAISE EXCEPTION 'Unsupported action';
END $body$;
REVOKE ALL ON FUNCTION public.chatbud_ops(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chatbud_ops(text,uuid,jsonb) TO service_role;
COMMIT;
