BEGIN;
-- Consultations are paid when they are requested. A request reaches the professional
-- only once it is paid, or the client chose to pay later.
-- Bookings made before payments existed carry on as pay-later; the trigger below sets new requests to unpaid.
ALTER TABLE care.appointment ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'PAY_LATER'
 CHECK(payment_status IN ('UNPAID','PAY_LATER','PAID','REFUND_DUE','REFUNDED','NOT_REFUNDED'));
ALTER TABLE finance.refund ADD COLUMN IF NOT EXISTS decided_at timestamptz;

-- Rules that hold however an appointment is changed.
CREATE OR REPLACE FUNCTION care.appointment_payment_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $rules$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status='HELD' THEN
   IF NEW.price_minor=0 THEN
    NEW.payment_status='PAID';
   ELSE
    -- An unpaid request keeps its time for 30 minutes only.
    NEW.payment_status='UNPAID';
    NEW.hold_expires_at=LEAST(NEW.hold_expires_at,now()+interval '30 minutes');
   END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.status='CONFIRMED' AND OLD.status='HELD' AND NEW.payment_status='UNPAID' THEN
  RAISE EXCEPTION 'The client has not paid for this request yet.';
 END IF;
 -- A paid booking that ends without a session goes to the refund queue.
 IF NEW.status IN ('CANCELLED','EXPIRED') AND OLD.status NOT IN ('CANCELLED','EXPIRED')
  AND OLD.payment_status='PAID' AND NEW.payment_status='PAID' AND NEW.price_minor>0 THEN
  NEW.payment_status='REFUND_DUE';
  INSERT INTO finance.refund(payment_attempt_id,amount_minor,status,idempotency_key,reason)
  SELECT pa.id,pa.amount_minor,'REQUESTED','refund-'||NEW.id,
   CASE WHEN OLD.status='HELD' THEN 'The request was not confirmed. Refund in full.'
    WHEN NEW.starts_at-now()>=interval '24 hours' THEN 'Cancelled more than 24 hours before the session. Refund in full.'
    ELSE 'Cancelled within 24 hours of the session. Refund only if the professional or Chatbud cancelled.' END
  FROM finance.payment_attempt pa WHERE pa.appointment_id=NEW.id AND pa.status='SUCCEEDED'
  ON CONFLICT (idempotency_key) DO NOTHING;
 END IF;
 RETURN NEW;
END $rules$;
DROP TRIGGER IF EXISTS appointment_payment_rules ON care.appointment;
CREATE TRIGGER appointment_payment_rules BEFORE INSERT OR UPDATE ON care.appointment
 FOR EACH ROW EXECUTE FUNCTION care.appointment_payment_rules();
REVOKE ALL ON FUNCTION care.appointment_payment_rules() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.chatbud_pay(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE v_roles text[]; v_appt care.appointment%ROWTYPE; v_pay finance.payment_attempt%ROWTYPE; v_refund finance.refund%ROWTYPE;
 v_id uuid; v_ref text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;

 -- Clients ------------------------------------------------------------------
 IF p_action='start' THEN
  SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'appointmentId')::uuid AND client_id=p_actor FOR UPDATE;
  IF v_appt.id IS NULL THEN RAISE EXCEPTION 'Appointment not found.'; END IF;
  IF v_appt.status<>'HELD' OR v_appt.hold_expires_at<=now() THEN RAISE EXCEPTION 'This request has lapsed. Please choose a time again.'; END IF;
  IF v_appt.payment_status<>'UNPAID' THEN RAISE EXCEPTION 'This request is already paid or set to pay later.'; END IF;
  IF p_data->>'gateway'='LATER' THEN
   UPDATE care.appointment SET payment_status='PAY_LATER',hold_expires_at=LEAST(now()+interval '24 hours',starts_at) WHERE id=v_appt.id;
   INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'PAY_LATER_CHOSEN','appointment',v_appt.id,'Payment');
   RETURN jsonb_build_object('payLater',true);
  END IF;
  SELECT * INTO v_pay FROM finance.payment_attempt WHERE idempotency_key=p_data->>'idempotencyKey';
  IF v_pay.id IS NULL THEN
   INSERT INTO finance.payment_attempt(appointment_id,gateway,idempotency_key,amount_minor,status)
   VALUES(v_appt.id,p_data->>'gateway',p_data->>'idempotencyKey',v_appt.price_minor,'CREATED') RETURNING * INTO v_pay;
  ELSIF v_pay.appointment_id<>v_appt.id THEN RAISE EXCEPTION 'Payment not found.';
  END IF;
  -- Give the client time to finish paying.
  UPDATE care.appointment SET hold_expires_at=LEAST(GREATEST(hold_expires_at,now()+interval '30 minutes'),starts_at) WHERE id=v_appt.id;
  RETURN jsonb_build_object('id',v_pay.id,'amountMinor',v_pay.amount_minor,'title',v_appt.service_snapshot->>'title',
   'name',(SELECT display_name FROM core.app_user WHERE id=p_actor),'email',(SELECT email FROM core.app_user WHERE id=p_actor));
 END IF;

 IF p_action IN ('attach','attempt','settle') THEN
  SELECT pa.* INTO v_pay FROM finance.payment_attempt pa JOIN care.appointment a ON a.id=pa.appointment_id
  WHERE pa.id=(p_data->>'id')::uuid AND a.client_id=p_actor FOR UPDATE OF pa;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'Payment not found.'; END IF;

  IF p_action='attach' THEN
   UPDATE finance.payment_attempt SET gateway_reference=p_data->>'reference',status='PENDING' WHERE id=v_pay.id AND status='CREATED';
   RETURN jsonb_build_object('id',v_pay.id);
  END IF;
  IF p_action='attempt' THEN
   RETURN jsonb_build_object('id',v_pay.id,'gateway',v_pay.gateway,'reference',v_pay.gateway_reference,'amountMinor',v_pay.amount_minor,
    'status',v_pay.status,'appointmentId',v_pay.appointment_id);
  END IF;

  -- settle: called by the server only after the payment provider itself confirmed the outcome.
  IF v_pay.status='SUCCEEDED' THEN RETURN jsonb_build_object('status','SUCCEEDED'); END IF;
  IF p_data->>'outcome'<>'SUCCEEDED' THEN
   UPDATE finance.payment_attempt SET status='FAILED' WHERE id=v_pay.id;
   RETURN jsonb_build_object('status','FAILED');
  END IF;
  SELECT * INTO v_appt FROM care.appointment WHERE id=v_pay.appointment_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM finance.payment_attempt WHERE appointment_id=v_appt.id AND status='SUCCEEDED') THEN
   -- Paid twice. The second payment is recorded for the team to return.
   INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
   VALUES(p_actor,'PAYMENT_DUPLICATE','payment_attempt',v_pay.id,'Payment',jsonb_build_object('gateway',v_pay.gateway,'reference',p_data->>'reference'));
   RETURN jsonb_build_object('status','DUPLICATE');
  END IF;
  UPDATE finance.payment_attempt SET status='SUCCEEDED',verified_at=now(),gateway_reference=COALESCE(p_data->>'reference',gateway_reference) WHERE id=v_pay.id;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,'PAYMENT_RECEIVED','appointment',v_appt.id,'Payment',jsonb_build_object('gateway',v_pay.gateway,'amountMinor',v_pay.amount_minor));
  IF v_appt.status='HELD' THEN
   -- Paid: the professional now has 24 hours to confirm.
   UPDATE care.appointment SET payment_status='PAID',hold_expires_at=LEAST(now()+interval '24 hours',starts_at) WHERE id=v_appt.id;
   RETURN jsonb_build_object('status','SUCCEEDED');
  END IF;
  -- The request lapsed while the client was paying, so the money goes back.
  UPDATE care.appointment SET payment_status='REFUND_DUE' WHERE id=v_appt.id;
  INSERT INTO finance.refund(payment_attempt_id,amount_minor,status,idempotency_key,reason)
  VALUES(v_pay.id,v_pay.amount_minor,'REQUESTED','refund-'||v_appt.id,'Paid after the request had lapsed. Refund in full.')
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('status','LAPSED');
 END IF;

 -- Payment state of every appointment the person is part of, as client or professional.
 IF p_action='statuses' THEN
  UPDATE care.appointment SET status='EXPIRED' WHERE (client_id=p_actor OR provider_id=p_actor) AND status='HELD' AND hold_expires_at<=now();
  RETURN jsonb_build_object('appointments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'paymentStatus',a.payment_status,
     'amount',a.price_minor/100.0,'mine',a.client_id=p_actor))
    FROM care.appointment a WHERE a.client_id=p_actor OR a.provider_id=p_actor),'[]'::jsonb));
 END IF;

 -- Team ---------------------------------------------------------------------
 SELECT COALESCE(array_agg(role),'{}') INTO v_roles FROM core.role_assignment WHERE user_id=p_actor;
 IF NOT v_roles && ARRAY['SUPPORT','FINANCE','SECURITY_ADMIN'] THEN RAISE EXCEPTION 'Team access required' USING ERRCODE='42501'; END IF;

 IF p_action='team_overview' THEN
  UPDATE care.appointment SET status='EXPIRED' WHERE status='HELD' AND hold_expires_at<=now();
  RETURN jsonb_build_object(
   'refunds',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'amount',r.amount_minor/100.0,'reason',r.reason,'gateway',pa.gateway,
      'reference',pa.gateway_reference,'client',c.display_name,'email',c.email,'provider',pr.display_name,'startsAt',a.starts_at,'requestedAt',r.created_at) ORDER BY r.created_at)
     FROM finance.refund r JOIN finance.payment_attempt pa ON pa.id=r.payment_attempt_id JOIN care.appointment a ON a.id=pa.appointment_id
     JOIN core.app_user c ON c.id=a.client_id JOIN core.app_user pr ON pr.id=a.provider_id WHERE r.status='REQUESTED'),'[]'::jsonb),
   'payLater',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'amount',a.price_minor/100.0,'client',c.display_name,'email',c.email,
      'provider',pr.display_name,'startsAt',a.starts_at,'status',a.status) ORDER BY a.starts_at)
     FROM care.appointment a JOIN core.app_user c ON c.id=a.client_id JOIN core.app_user pr ON pr.id=a.provider_id
     WHERE a.payment_status='PAY_LATER' AND a.price_minor>0 AND a.status IN ('HELD','CONFIRMED','IN_PROGRESS','COMPLETED')),'[]'::jsonb),
   'payments',COALESCE((SELECT jsonb_agg(item ORDER BY item->>'at' DESC) FROM (SELECT jsonb_build_object('id',pa.id,'amount',pa.amount_minor/100.0,
      'gateway',pa.gateway,'reference',pa.gateway_reference,'client',c.display_name,'provider',pr.display_name,'at',pa.verified_at,
      'paymentStatus',a.payment_status) AS item
     FROM finance.payment_attempt pa JOIN care.appointment a ON a.id=pa.appointment_id
     JOIN core.app_user c ON c.id=a.client_id JOIN core.app_user pr ON pr.id=a.provider_id
     WHERE pa.status='SUCCEEDED' ORDER BY pa.verified_at DESC LIMIT 50) recent),'[]'::jsonb),
   'received',COALESCE((SELECT sum(amount_minor) FROM finance.payment_attempt WHERE status='SUCCEEDED'),0)/100.0,
   'refunded',COALESCE((SELECT sum(amount_minor) FROM finance.refund WHERE status='SUCCEEDED'),0)/100.0);
 END IF;

 -- The team sends each refund from the payment provider's own dashboard, then records it here.
 IF p_action='refund_decide' THEN
  SELECT * INTO v_refund FROM finance.refund WHERE id=(p_data->>'refundId')::uuid AND status='REQUESTED' FOR UPDATE;
  IF v_refund.id IS NULL THEN RAISE EXCEPTION 'Refund not found or already handled.'; END IF;
  SELECT appointment_id INTO v_id FROM finance.payment_attempt WHERE id=v_refund.payment_attempt_id;
  IF p_data->>'decision'='SENT' THEN
   v_ref=btrim(COALESCE(p_data->>'reference',''));
   IF length(v_ref)<3 THEN RAISE EXCEPTION 'Enter the refund reference from the payment provider.'; END IF;
   UPDATE finance.refund SET status='SUCCEEDED',gateway_refund_reference=v_ref,approved_by=p_actor,decided_at=now() WHERE id=v_refund.id;
   UPDATE care.appointment SET payment_status='REFUNDED' WHERE id=v_id;
  ELSE
   UPDATE finance.refund SET status='REJECTED',approved_by=p_actor,decided_at=now() WHERE id=v_refund.id;
   UPDATE care.appointment SET payment_status='NOT_REFUNDED' WHERE id=v_id;
  END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,'REFUND_'||(p_data->>'decision'),'refund',v_refund.id,'Payment',jsonb_build_object('amountMinor',v_refund.amount_minor));
  RETURN jsonb_build_object('id',v_refund.id);
 END IF;

 -- Money received outside Chatbud (cash or bank transfer) for a pay-later booking.
 IF p_action='mark_paid' THEN
  SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'appointmentId')::uuid AND payment_status='PAY_LATER' FOR UPDATE;
  IF v_appt.id IS NULL THEN RAISE EXCEPTION 'Booking not found or not waiting for payment.'; END IF;
  v_ref=btrim(COALESCE(p_data->>'reference',''));
  IF length(v_ref)<3 THEN RAISE EXCEPTION 'Enter a receipt or transfer reference.'; END IF;
  INSERT INTO finance.payment_attempt(appointment_id,gateway,idempotency_key,gateway_reference,amount_minor,status,verified_at)
  VALUES(v_appt.id,'MANUAL','manual-'||v_appt.id,v_ref||' #'||left(v_appt.id::text,8),v_appt.price_minor,'SUCCEEDED',now());
  UPDATE care.appointment SET payment_status='PAID' WHERE id=v_appt.id;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,'PAYMENT_MARKED_RECEIVED','appointment',v_appt.id,'Payment',jsonb_build_object('amountMinor',v_appt.price_minor));
  RETURN jsonb_build_object('id',v_appt.id);
 END IF;

 RAISE EXCEPTION 'Unsupported action';
END $body$;
REVOKE ALL ON FUNCTION public.chatbud_pay(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chatbud_pay(text,uuid,jsonb) TO service_role;
COMMIT;
