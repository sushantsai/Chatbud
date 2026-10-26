BEGIN;
-- Additive release. Existing bookings retain their snapshots and history.
-- A verified gateway can report a duplicate real receipt. Keep every receipt and refund the extra capture.
DROP INDEX finance.one_booking_capture;
DROP INDEX finance.one_order_capture;
CREATE INDEX booking_success_receipts ON finance.payment_attempt(appointment_id) WHERE status='SUCCEEDED';
CREATE INDEX order_success_receipts ON finance.payment_attempt(order_id) WHERE status='SUCCEEDED';
ALTER TABLE care.verification_case ADD COLUMN corrections jsonb NOT NULL DEFAULT '[]';
ALTER TABLE care.appointment ADD COLUMN reschedule_requested_by uuid REFERENCES core.app_user(id);
ALTER TABLE ops.support_ticket ADD COLUMN order_id uuid REFERENCES shop.product_order(id);
ALTER TABLE care.service ADD COLUMN confirmation_mode text NOT NULL DEFAULT 'APPROVAL' CHECK(confirmation_mode IN ('INSTANT','APPROVAL'));
ALTER TABLE care.service ADD COLUMN minimum_notice_minutes integer NOT NULL DEFAULT 240 CHECK(minimum_notice_minutes BETWEEN 60 AND 43200);
ALTER TABLE care.service ADD COLUMN intake_stage text NOT NULL DEFAULT 'NONE' CHECK(intake_stage IN ('NONE','BEFORE_PAYMENT','AFTER_CONFIRMATION'));
ALTER TABLE care.service ADD COLUMN intake_questions jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(intake_questions)='array');
ALTER TABLE care.appointment ADD COLUMN paid_at timestamptz;
ALTER TABLE care.appointment ADD COLUMN approval_due_at timestamptz;
ALTER TABLE care.appointment ADD COLUMN escalation_at timestamptz;
ALTER TABLE care.appointment ADD COLUMN client_reschedules integer NOT NULL DEFAULT 0;
ALTER TABLE care.appointment ADD COLUMN cancelled_by uuid REFERENCES core.app_user(id);
ALTER TABLE core.app_user DROP CONSTRAINT app_user_language_code_check;
ALTER TABLE core.app_user ADD CONSTRAINT app_user_language_code_check CHECK(language_code IN ('en','ne','hi'));
CREATE TABLE ops.nepal_holiday(day date PRIMARY KEY, label text NOT NULL);
CREATE TABLE ops.staff_presence(user_id uuid PRIMARY KEY REFERENCES core.app_user(id), available_until timestamptz NOT NULL);
CREATE TABLE ops.staff_permission(user_id uuid REFERENCES core.app_user(id), permission text CHECK(permission IN ('SUPERVISOR','VERIFY_APPROVE')), PRIMARY KEY(user_id,permission));
-- Existing designated verification role is the explicit approval grant. Clinical review alone is not.
INSERT INTO ops.staff_permission SELECT user_id,'VERIFY_APPROVE' FROM core.role_assignment WHERE role='VERIFICATION' ON CONFLICT DO NOTHING;
CREATE TABLE ops.workflow_case(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dedupe_key text UNIQUE NOT NULL,
 client_id uuid NOT NULL REFERENCES core.app_user(id), appointment_id uuid REFERENCES care.appointment(id),
 order_id uuid REFERENCES shop.product_order(id), refund_id uuid REFERENCES finance.refund(id),
 kind text NOT NULL, title text NOT NULL, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','REVIEW','RESOLVED','CLOSED')),
 priority text NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL','URGENT')),
 owner_id uuid REFERENCES core.app_user(id), assigned_at timestamptz, acted_at timestamptz, due_at timestamptz,
 escalated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), last_contact_at timestamptz, next_contact_at timestamptz, target_date date,
 context jsonb NOT NULL DEFAULT '{}', requested_by uuid REFERENCES core.app_user(id), contact_stopped boolean NOT NULL DEFAULT false, outcome text NOT NULL DEFAULT ''
);
CREATE INDEX workflow_case_queue ON ops.workflow_case(status,due_at,priority);
CREATE INDEX workflow_case_client ON ops.workflow_case(client_id,created_at DESC);
CREATE INDEX workflow_case_owner ON ops.workflow_case(owner_id,status);
CREATE TABLE ops.workflow_event(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES ops.workflow_case(id), actor_id uuid REFERENCES core.app_user(id), event text NOT NULL, detail text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX workflow_event_case ON ops.workflow_event(case_id,created_at);
CREATE TABLE care.intake_submission(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES core.app_user(id),provider_id uuid NOT NULL REFERENCES care.provider(id), service_id uuid NOT NULL REFERENCES care.service(id),appointment_id uuid REFERENCES care.appointment(id), answers jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), parent_id uuid REFERENCES care.intake_submission(id));
CREATE INDEX intake_client ON care.intake_submission(client_id,service_id,created_at DESC);
CREATE INDEX intake_provider ON care.intake_submission(provider_id,client_id);
CREATE TABLE care.private_note(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),author_id uuid NOT NULL REFERENCES care.provider(id),client_id uuid NOT NULL REFERENCES core.app_user(id),appointment_id uuid NOT NULL REFERENCES care.appointment(id),body text NOT NULL CHECK(length(body) BETWEEN 1 AND 16000),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX private_note_author ON care.private_note(author_id,client_id,created_at DESC);
CREATE TABLE care.plan_record(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider_id uuid NOT NULL REFERENCES care.provider(id),client_id uuid NOT NULL REFERENCES core.app_user(id),domain text NOT NULL CHECK(domain IN ('mental','nutrition','fitness')),title text NOT NULL,current_version_id uuid,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX plan_record_client ON care.plan_record(client_id);
CREATE INDEX plan_record_provider ON care.plan_record(provider_id);
CREATE TABLE care.plan_revision(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_id uuid NOT NULL REFERENCES care.plan_record(id),version integer NOT NULL,title text NOT NULL,body text NOT NULL,tasks jsonb NOT NULL DEFAULT '[]',published_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(plan_id,version));
ALTER TABLE care.plan_record ADD CONSTRAINT plan_current_revision FOREIGN KEY(current_version_id) REFERENCES care.plan_revision(id);
CREATE TABLE care.task_progress(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES core.app_user(id),revision_id uuid NOT NULL REFERENCES care.plan_revision(id),task_key uuid NOT NULL,completed boolean NOT NULL,note text NOT NULL DEFAULT '',measurements jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX task_progress_owner ON care.task_progress(client_id,revision_id,created_at DESC);
CREATE TABLE care.reminder_preference(client_id uuid NOT NULL REFERENCES core.app_user(id),task_key uuid NOT NULL,muted boolean NOT NULL DEFAULT false,local_time time NOT NULL DEFAULT '09:00',PRIMARY KEY(client_id,task_key));
CREATE TABLE core.in_app_notification(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES core.app_user(id),kind text NOT NULL,message text NOT NULL,href text NOT NULL,language_code text NOT NULL DEFAULT 'en',dedupe_key text UNIQUE NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz);
CREATE INDEX notification_user ON core.in_app_notification(user_id,created_at DESC);
CREATE TABLE care.application_draft(user_id uuid PRIMARY KEY REFERENCES core.app_user(id),payload jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE finance.refund ADD COLUMN eligibility text NOT NULL DEFAULT 'REVIEW' CHECK(eligibility IN ('ELIGIBLE','REVIEW','DECLINED'));
ALTER TABLE finance.refund ADD COLUMN eligible_at timestamptz;
ALTER TABLE finance.refund ADD COLUMN initiate_by timestamptz;
ALTER TABLE finance.refund ADD COLUMN initiated_at timestamptz;
ALTER TABLE finance.refund ADD COLUMN payout_confirmation text;
ALTER TABLE finance.refund ADD COLUMN completed_on date;
ALTER TABLE finance.refund ADD COLUMN exception_decided_by uuid REFERENCES core.app_user(id);
-- Private schemas use deny-by-default RLS and explicit server-only RPCs.
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['ops.nepal_holiday','ops.staff_presence','ops.staff_permission','ops.workflow_case','ops.workflow_event','care.intake_submission','care.private_note','care.plan_record','care.plan_revision','care.task_progress','care.reminder_preference','core.in_app_notification','care.application_draft'] LOOP EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated',t); END LOOP; END $$;
CREATE FUNCTION ops.next_refund_deadline(p_at timestamptz) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE d date := (p_at AT TIME ZONE 'Asia/Kathmandu')::date+1;
BEGIN WHILE extract(isodow FROM d)>5 OR EXISTS(SELECT 1 FROM ops.nepal_holiday WHERE day=d) LOOP d=d+1; END LOOP; RETURN (d+time '18:00') AT TIME ZONE 'Asia/Kathmandu'; END $$;
CREATE FUNCTION ops.working_day_after(p_at timestamptz,p_count integer) RETURNS date LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$ DECLARE d date:=(p_at AT TIME ZONE 'Asia/Kathmandu')::date;n int:=0;BEGIN WHILE n<p_count LOOP d=d+1;IF extract(isodow FROM d)<=5 AND NOT EXISTS(SELECT 1 FROM ops.nepal_holiday WHERE day=d) THEN n=n+1; END IF;END LOOP;RETURN d;END $$;
REVOKE ALL ON FUNCTION ops.working_day_after(timestamptz,integer) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION ops.assign_case(p_id uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE chosen uuid; k text;
BEGIN SELECT kind INTO k FROM ops.workflow_case WHERE id=p_id FOR UPDATE;
 SELECT r.user_id INTO chosen FROM core.role_assignment r JOIN ops.staff_presence p ON p.user_id=r.user_id AND p.available_until>now() JOIN core.app_user u ON u.id=r.user_id AND u.status='ACTIVE'
 WHERE r.user_id IS DISTINCT FROM (SELECT owner_id FROM ops.workflow_case WHERE id=p_id) AND r.role=CASE WHEN k='REFUND' THEN 'FINANCE' ELSE 'SUPPORT' END
 ORDER BY (SELECT count(*) FROM ops.workflow_case c WHERE c.owner_id=r.user_id AND c.status IN ('OPEN','IN_PROGRESS','REVIEW')),r.user_id LIMIT 1;
 IF chosen IS NOT NULL THEN UPDATE ops.workflow_case SET owner_id=chosen,assigned_at=now(),acted_at=NULL WHERE id=p_id; END IF;
END $$;
CREATE FUNCTION ops.open_case(p_key text,p_client uuid,p_appt uuid,p_kind text,p_title text,p_due timestamptz,p_urgent boolean DEFAULT false,p_refund uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_id uuid;
BEGIN INSERT INTO ops.workflow_case(dedupe_key,client_id,appointment_id,kind,title,due_at,priority,refund_id) VALUES(p_key,p_client,p_appt,p_kind,p_title,p_due,CASE WHEN p_urgent THEN 'URGENT' ELSE 'NORMAL' END,p_refund) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NOT NULL THEN PERFORM ops.assign_case(v_id); INSERT INTO ops.workflow_event(case_id,event) VALUES(v_id,'Case opened'); END IF; RETURN v_id;
END $$;
CREATE FUNCTION ops.refund_case() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE a care.appointment; client uuid;
BEGIN
 IF NEW.reason ILIKE '%lapsed%' OR NEW.reason ILIKE 'Duplicate successful%' THEN NEW.eligibility='ELIGIBLE'; END IF;
 SELECT x.* INTO a FROM finance.payment_attempt p JOIN care.appointment x ON x.id=p.appointment_id WHERE p.id=NEW.payment_attempt_id;
 IF a.id IS NOT NULL THEN
  client=a.client_id;
  NEW.eligibility=CASE WHEN NEW.reason ILIKE 'Professional cancelled%' THEN 'REVIEW' WHEN NEW.eligibility='ELIGIBLE' OR a.status='HELD' OR a.status='EXPIRED' OR a.approval_due_at IS NOT NULL AND a.status='CANCELLED' AND a.cancelled_by IS DISTINCT FROM a.client_id OR a.cancelled_by=a.provider_id OR a.starts_at-now()>=interval '24 hours' OR NEW.reason ILIKE '%lapsed%' THEN 'ELIGIBLE' ELSE 'REVIEW' END;
 ELSE SELECT o.user_id INTO client FROM finance.payment_attempt p JOIN shop.product_order o ON o.id=p.order_id WHERE p.id=NEW.payment_attempt_id; END IF;
 IF NEW.eligibility='ELIGIBLE' THEN NEW.eligible_at=now();NEW.initiate_by=ops.next_refund_deadline(now()); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER refund_eligibility BEFORE INSERT ON finance.refund FOR EACH ROW EXECUTE FUNCTION ops.refund_case();
CREATE FUNCTION ops.after_refund_case() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE a care.appointment; client uuid;
BEGIN SELECT x.* INTO a FROM finance.payment_attempt p JOIN care.appointment x ON x.id=p.appointment_id WHERE p.id=NEW.payment_attempt_id;
 IF a.id IS NOT NULL THEN client=a.client_id; ELSE SELECT o.user_id INTO client FROM finance.payment_attempt p JOIN shop.product_order o ON o.id=p.order_id WHERE p.id=NEW.payment_attempt_id; END IF;
 IF client IS NOT NULL THEN PERFORM ops.open_case('refund-'||NEW.id,client,a.id,'REFUND','Refund case',NEW.initiate_by,false,NEW.id); END IF; RETURN NEW;
END $$;
CREATE TRIGGER refund_open_case AFTER INSERT ON finance.refund FOR EACH ROW EXECUTE FUNCTION ops.after_refund_case();
CREATE OR REPLACE FUNCTION care.appointment_payment_rules() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s care.service; eligible boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO s FROM care.service WHERE id=NEW.service_id;
  NEW.policy_snapshot=NEW.policy_snapshot||jsonb_build_object('workflowVersion',2,'confirmationMode',s.confirmation_mode,'minimumNoticeMinutes',GREATEST(s.minimum_notice_minutes,CASE WHEN s.confirmation_mode='APPROVAL' THEN 240 ELSE 60 END),'intakeStage',s.intake_stage,'cancellationNoticeHours',24,'freeClientReschedules',1);
  NEW.service_snapshot=NEW.service_snapshot||jsonb_build_object('priceMinor',NEW.price_minor,'intakeQuestions',s.intake_questions);
  IF NEW.status='HELD' THEN NEW.payment_status=CASE WHEN NEW.price_minor=0 THEN 'PAID' ELSE 'UNPAID' END; NEW.hold_expires_at=now()+interval '10 minutes';
   IF NEW.price_minor=0 THEN NEW.paid_at=now(); NEW.approval_due_at=now()+interval '60 minutes';NEW.escalation_at=now()+interval '30 minutes';NEW.hold_expires_at=NEW.approval_due_at;IF s.confirmation_mode='INSTANT' THEN NEW.status='CONFIRMED'; END IF; END IF;
  END IF; RETURN NEW;
 END IF;
 IF NEW.payment_status='PAID' AND OLD.payment_status<>'PAID' THEN
  NEW.paid_at=COALESCE(NEW.paid_at,now());
  IF NEW.policy_snapshot->>'workflowVersion'='2' THEN
   IF NEW.policy_snapshot->>'confirmationMode'='INSTANT' THEN NEW.status='CONFIRMED';NEW.approval_due_at=NULL;NEW.escalation_at=NULL;
   ELSE NEW.approval_due_at=now()+interval '60 minutes';NEW.escalation_at=now()+interval '30 minutes';NEW.hold_expires_at=NEW.approval_due_at; END IF;
  END IF;
 END IF;
 IF NEW.status='CONFIRMED' AND OLD.status<>'CONFIRMED' AND NEW.payment_status NOT IN ('PAID','PAY_LATER') THEN RAISE EXCEPTION 'Full payment is required before confirmation.'; END IF;
 IF NEW.policy_snapshot->>'workflowVersion'='2' AND NEW.status='CONFIRMED' AND NEW.payment_status<>'PAID' THEN RAISE EXCEPTION 'Full online payment is required.'; END IF;
 IF NEW.status IN ('CANCELLED','EXPIRED') AND OLD.status NOT IN ('CANCELLED','EXPIRED') AND OLD.payment_status='PAID' AND NEW.payment_status='PAID' AND NEW.price_minor>0 THEN
  NEW.payment_status='REFUND_DUE';
  INSERT INTO finance.refund(payment_attempt_id,amount_minor,status,idempotency_key,reason,eligibility)
  SELECT p.id,p.amount_minor,'REQUESTED','refund-'||NEW.id,CASE WHEN OLD.status='HELD' THEN 'Paid request ended before approval. Full refund eligible.' WHEN NEW.cancelled_by=NEW.provider_id THEN 'Professional cancelled. Client chooses refund or rescheduling.' WHEN NEW.starts_at-now()>=interval '24 hours' THEN 'Client cancellation at least 24 hours before the session.' ELSE 'Late cancellation requires supervisor review.' END,CASE WHEN OLD.status='HELD' OR NEW.cancelled_by=NEW.provider_id OR NEW.starts_at-now()>=interval '24 hours' THEN 'ELIGIBLE' ELSE 'REVIEW' END
  FROM finance.payment_attempt p WHERE p.appointment_id=NEW.id AND p.status='SUCCEEDED' ORDER BY p.verified_at LIMIT 1 ON CONFLICT(idempotency_key) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
-- Every minute, independent of browser visits. Calls are queued for staff; AI remains paused.
CREATE FUNCTION ops.workflow_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a care.appointment; c ops.workflow_case;
BEGIN
 PERFORM pg_advisory_xact_lock(805226);
 PERFORM shop.expire_orders(NULL);
 UPDATE ops.workflow_case wc SET status='RESOLVED',updated_at=now() FROM care.appointment ap WHERE wc.appointment_id=ap.id AND wc.kind='CONFIRMATION_CALL' AND wc.status IN ('OPEN','IN_PROGRESS','REVIEW') AND ap.status<>'HELD';
 FOR a IN SELECT * FROM care.appointment WHERE status='HELD' AND payment_status='PAID' AND escalation_at<=now() AND hold_expires_at>now() LOOP
  PERFORM ops.open_case('approval-call-'||a.id,a.client_id,a.id,'CONFIRMATION_CALL','Call professional for explicit booking approval',a.approval_due_at,true);
 END LOOP;
 UPDATE care.appointment SET status='EXPIRED' WHERE status='HELD' AND hold_expires_at<=now();
 UPDATE care.appointment SET status='NO_SHOW' WHERE policy_snapshot->>'workflowVersion'='2' AND status='CONFIRMED' AND starts_at+interval '15 minutes'<=now() AND ends_at>now() AND NOT EXISTS(SELECT 1 FROM care.appointment_event e WHERE e.appointment_id=care.appointment.id AND e.event_type='CLIENT_JOINED');
 -- A no-show is a support review, never an automatic refund denial.
 FOR a IN SELECT * FROM care.appointment WHERE status='NO_SHOW' LOOP PERFORM ops.open_case('no-show-'||a.id,a.client_id,a.id,'SESSION_REVIEW','Verify attendance or technical incident',now(),false); END LOOP;
 FOR c IN SELECT * FROM ops.workflow_case WHERE status IN ('OPEN','IN_PROGRESS','REVIEW') LOOP
  IF c.owner_id IS NULL THEN PERFORM ops.assign_case(c.id); END IF;
  IF c.escalated_at IS NULL AND ((c.priority='URGENT' AND c.acted_at IS NULL AND COALESCE(c.assigned_at,c.created_at)+interval '5 minutes'<=now()) OR (c.kind='FOLLOWUP' AND c.attempts=0 AND c.due_at<=now())) THEN
   UPDATE ops.workflow_case SET escalated_at=now() WHERE id=c.id;
   INSERT INTO core.in_app_notification(user_id,kind,message,href,dedupe_key) SELECT user_id,'ESCALATION','An operational case needs supervisor attention.','/admin','case-escalation-'||c.id||'-'||user_id FROM ops.staff_permission WHERE permission='SUPERVISOR' ON CONFLICT(dedupe_key) DO NOTHING;INSERT INTO ops.workflow_event(case_id,event) VALUES(c.id,'Supervisor escalation: deadline or unhandled task');
   IF c.kind='FOLLOWUP' THEN PERFORM ops.assign_case(c.id); END IF;
  END IF;
 END LOOP;
END $$;
-- Restrict all helpers, including the definer cron entry point.
REVOKE ALL ON FUNCTION ops.next_refund_deadline(timestamptz),ops.assign_case(uuid),ops.open_case(text,uuid,uuid,text,text,timestamptz,boolean,uuid),ops.refund_case(),ops.after_refund_case(),ops.workflow_tick() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION care.open_slots(p_service uuid, p_day date)
RETURNS TABLE(starts_at timestamptz) LANGUAGE sql STABLE SET search_path=pg_catalog AS $slots$
 SELECT slot
 FROM care.service s
 JOIN care.provider p ON p.id=s.provider_id AND p.status='APPROVED'
 JOIN care.provider_scope sc ON sc.provider_id=p.id AND sc.profession_code=s.profession_code AND sc.status='APPROVED' AND (sc.valid_until IS NULL OR sc.valid_until>now())
 JOIN care.availability_rule r ON r.provider_id=s.provider_id
  AND r.weekday=extract(dow FROM p_day)::int
  AND r.valid_from<=p_day AND (r.valid_until IS NULL OR r.valid_until>=p_day)
 CROSS JOIN LATERAL generate_series(
  (p_day + r.local_start) AT TIME ZONE r.timezone,
  ((p_day + r.local_end) AT TIME ZONE r.timezone) - make_interval(mins => s.duration_minutes),
  make_interval(mins => s.duration_minutes + s.buffer_before_minutes + s.buffer_after_minutes)) AS slot
 WHERE s.id=p_service AND s.active
  AND slot >= now() + make_interval(mins => GREATEST(s.minimum_notice_minutes,CASE WHEN s.confirmation_mode='APPROVAL' THEN 240 ELSE 60 END)) AND slot <= now() + interval '60 days'
  AND NOT EXISTS(
   SELECT 1 FROM care.appointment a
   WHERE a.provider_id=s.provider_id
    AND (a.status IN ('CONFIRMED','IN_PROGRESS') OR (a.status='HELD' AND a.hold_expires_at>now()))
    AND a.reserved_range && tstzrange(
     slot - make_interval(mins => s.buffer_before_minutes),
     slot + make_interval(mins => s.duration_minutes + s.buffer_after_minutes),'[)'))
  AND NOT EXISTS(
   SELECT 1 FROM care.availability_exception x
   WHERE x.provider_id=s.provider_id AND x.kind='UNAVAILABLE'
    AND tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(slot, slot + make_interval(mins => s.duration_minutes),'[)'))
 ORDER BY slot
$slots$;
CREATE OR REPLACE FUNCTION public.chatbud_api(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE result jsonb; provider_row care.provider; v_profession text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;
 IF p_action='catalog' THEN
  RETURN jsonb_build_object(
   -- Approved professionals are listed as soon as their scope is approved; serviceId is null until they offer a service.
   'providers',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',u.display_name,'qualifications',(SELECT string_agg(concat_ws(' ',q->>'level',q->>'field'),'; ') FROM (SELECT application FROM care.verification_case WHERE provider_id=p.id AND status='APPROVED' ORDER BY decided_at DESC LIMIT 1) vc CROSS JOIN LATERAL jsonb_array_elements(COALESCE(vc.application->'qualifications','[]'))q),'scopeDescription',sc.scope_description,'bio',p.biography,'languages',p.languages,'profession',sc.profession_code,'serviceId',s.id,'service',s.title,'price',s.price_minor/100.0,'duration',s.duration_minutes,'confirmationMode',s.confirmation_mode,'minimumNoticeMinutes',s.minimum_notice_minutes,'intakeStage',s.intake_stage,'intakeQuestions',s.intake_questions) ORDER BY (s.id IS NULL),u.display_name)
    FROM care.provider p JOIN core.app_user u ON u.id=p.id
    JOIN care.provider_scope sc ON sc.provider_id=p.id AND sc.status='APPROVED' AND (sc.valid_until IS NULL OR sc.valid_until>now())
    LEFT JOIN care.service s ON s.provider_id=p.id AND s.profession_code=sc.profession_code AND s.active
    WHERE u.status='ACTIVE' AND p.status='APPROVED'), '[]'::jsonb),
   'products',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',p.title,'description',p.description,'kind',p.kind,'price',s.price_minor/100.0,'stock',COALESCE((SELECT sum(b.on_hand-b.reserved) FROM shop.stock_batch b WHERE b.sku_id=s.id AND b.status='AVAILABLE' AND (b.expires_on IS NULL OR b.expires_on>current_date)),0)))
    FROM shop.product p JOIN shop.sku s ON s.product_id=p.id JOIN shop.supplier sp ON sp.id=p.supplier_id WHERE p.status='PUBLISHED' AND s.active AND sp.status='APPROVED'),'[]'::jsonb));
 END IF;
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor required' USING ERRCODE='42501'; END IF;
 IF p_action='account' THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND (email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL)) THEN RAISE EXCEPTION 'Verified account required' USING ERRCODE='42501'; END IF;
  INSERT INTO core.app_user(id,auth_subject,email,phone_e164,display_name) VALUES(p_actor,p_actor::text,p_data->>'email',p_data->>'phone',COALESCE(NULLIF(p_data->>'name',''),'Chatbud member'))
  ON CONFLICT(id) DO UPDATE SET email=excluded.email,phone_e164=COALESCE(excluded.phone_e164,core.app_user.phone_e164);
  INSERT INTO core.role_assignment(user_id,role) VALUES(p_actor,'CONSUMER') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('id',p_actor);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 IF p_action='dashboard' THEN
  RETURN jsonb_build_object(
   'appointments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'provider',u.display_name,'service',s.title,'startsAt',a.starts_at,'status',a.status,'price',a.price_minor/100.0) ORDER BY a.starts_at DESC) FROM care.appointment a JOIN care.service s ON s.id=a.service_id JOIN core.app_user u ON u.id=a.provider_id WHERE a.client_id=p_actor),'[]'::jsonb),
   'orders',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'status',o.status,'total',o.total_minor/100.0,'createdAt',o.created_at) ORDER BY o.created_at DESC) FROM shop.product_order o WHERE o.user_id=p_actor),'[]'::jsonb),
   'providerApplication',(SELECT jsonb_build_object('status',p.status,'bio',p.biography,'profession',(SELECT sc.profession_code FROM care.provider_scope sc WHERE sc.provider_id=p.id LIMIT 1)) FROM care.provider p WHERE p.id=p_actor),
   'displayName',(SELECT display_name FROM core.app_user WHERE id=p_actor),
   'roles',COALESCE((SELECT jsonb_agg(role) FROM core.role_assignment WHERE user_id=p_actor),'[]'::jsonb));
 END IF;
 IF p_action='provider_apply' THEN
  v_profession=p_data->>'profession';
  IF NOT EXISTS(SELECT 1 FROM care.profession WHERE code=v_profession) THEN RAISE EXCEPTION 'Invalid profession'; END IF;
  INSERT INTO care.provider(id,public_slug,biography,status) VALUES(p_actor,'provider-'||p_actor::text,p_data->>'bio','APPLIED')
  ON CONFLICT(id) DO NOTHING;
  SELECT * INTO provider_row FROM care.provider WHERE id=p_actor FOR UPDATE;
  IF provider_row.status NOT IN ('APPLIED','REJECTED') THEN RAISE EXCEPTION 'Application is already being reviewed'; END IF;
  UPDATE care.provider SET biography=p_data->>'bio',status='UNDER_REVIEW',revision=revision+1 WHERE id=p_actor;
  INSERT INTO care.provider_scope(provider_id,profession_code,status,scope_description,policy_version)
   VALUES(p_actor,v_profession,'PENDING',p_data->>'experience','pending-review-v1') ON CONFLICT(provider_id,profession_code) DO UPDATE SET scope_description=excluded.scope_description;
  -- The name the applicant chose for their public profile.
  UPDATE core.app_user SET display_name=btrim(p_data->'details'->'practice'->>'displayName'),updated_at=now()
  WHERE id=p_actor AND length(btrim(COALESCE(p_data->'details'->'practice'->>'displayName','')))>=3;
  INSERT INTO care.verification_case(provider_id,status,submitted_at,application) VALUES(p_actor,'SUBMITTED',now(),COALESCE(p_data->'details','{}'::jsonb));
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'PROVIDER_APPLICATION_SUBMITTED','provider',p_actor,'Provider onboarding');
  RETURN jsonb_build_object('status','UNDER_REVIEW');
 END IF;
 IF p_action='profile_save' THEN
  IF NOT EXISTS(SELECT 1 FROM care.provider WHERE id=p_actor AND status='APPROVED') THEN
   RAISE EXCEPTION 'An approved professional profile is required' USING ERRCODE='42501';
  END IF;
  UPDATE core.app_user SET display_name=btrim(p_data->>'displayName'),updated_at=now() WHERE id=p_actor;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'PROVIDER_PROFILE_UPDATED','provider',p_actor,'Public profile');
  RETURN jsonb_build_object('displayName',btrim(p_data->>'displayName'));
 END IF;
 IF p_action='admin_overview' THEN
  IF NOT EXISTS(SELECT 1 FROM core.role_assignment WHERE user_id=p_actor AND role IN ('VERIFICATION','CLINICAL_REVIEW')) THEN RAISE EXCEPTION 'Reviewer access required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('applications',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'providerId',p.id,'name',u.display_name,'status',v.status,'submittedAt',v.submitted_at,'bio',p.biography)) FROM care.verification_case v JOIN care.provider p ON p.id=v.provider_id JOIN core.app_user u ON u.id=p.id WHERE v.status IN ('SUBMITTED','UNDER_REVIEW','NEEDS_INFORMATION')),'[]'::jsonb));
 END IF;
 RAISE EXCEPTION 'Unsupported action';
END $body$;
CREATE OR REPLACE FUNCTION public.chatbud_care(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE
 v_service care.service; v_appt care.appointment; v_case care.verification_case; v_provider care.provider;
 v_start timestamptz; v_id uuid; v_decision text; v_text text; v_rule jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;

 IF p_action='slots' THEN
  RETURN jsonb_build_object('slots',COALESCE((
   SELECT jsonb_agg(o.starts_at ORDER BY o.starts_at)
   FROM care.open_slots((p_data->>'serviceId')::uuid,(p_data->>'date')::date) o),'[]'::jsonb));
 END IF;

 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;

 -- Clients ------------------------------------------------------------------
 IF p_action='appointment_request' THEN
  SELECT * INTO v_appt FROM care.appointment WHERE client_id=p_actor AND idempotency_key=(p_data->>'idempotencyKey')::uuid;
  IF FOUND THEN IF v_appt.service_id IS DISTINCT FROM (p_data->>'serviceId')::uuid OR v_appt.starts_at IS DISTINCT FROM (p_data->>'startsAt')::timestamptz THEN RAISE EXCEPTION 'Idempotency key belongs to another selection.'; END IF; RETURN jsonb_build_object('id',v_appt.id,'status',v_appt.status,'expiresAt',v_appt.hold_expires_at); END IF;
  SELECT * INTO v_service FROM care.service WHERE id=(p_data->>'serviceId')::uuid AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'This service is not available.'; END IF;
  IF v_service.provider_id=p_actor THEN RAISE EXCEPTION 'You cannot book your own service.'; END IF;
  IF v_service.intake_stage='BEFORE_PAYMENT' AND NOT EXISTS(SELECT 1 FROM care.intake_submission WHERE client_id=p_actor AND service_id=v_service.id AND parent_id IS NULL) THEN RAISE EXCEPTION 'Complete required intake before payment.'; END IF;
  v_start=(p_data->>'startsAt')::timestamptz;
  -- One booking at a time per professional.
  PERFORM 1 FROM care.provider WHERE id=v_service.provider_id FOR UPDATE;
  UPDATE care.appointment SET status='EXPIRED' WHERE provider_id=v_service.provider_id AND status='HELD' AND hold_expires_at<=now();
  IF NOT EXISTS(SELECT 1 FROM care.open_slots(v_service.id,(v_start AT TIME ZONE 'Asia/Kathmandu')::date) o WHERE o.starts_at=v_start) THEN
   RAISE EXCEPTION 'That time is no longer available. Choose another time.';
  END IF;
  IF (SELECT count(*) FROM care.appointment WHERE client_id=p_actor AND status='HELD' AND hold_expires_at>now())>=3 THEN
   RAISE EXCEPTION 'You have three requests awaiting confirmation. Wait for a reply or cancel one first.';
  END IF;
  INSERT INTO care.appointment(client_id,provider_id,service_id,status,starts_at,ends_at,reserved_start_at,reserved_end_at,
   hold_expires_at,price_minor,commission_bps,policy_snapshot,service_snapshot,idempotency_key)
  VALUES(p_actor,v_service.provider_id,v_service.id,'HELD',v_start,v_start+make_interval(mins => v_service.duration_minutes),
   v_start-make_interval(mins => v_service.buffer_before_minutes),
   v_start+make_interval(mins => v_service.duration_minutes+v_service.buffer_after_minutes),
   LEAST(now()+interval '24 hours',v_start),v_service.price_minor,0,
   jsonb_build_object('payment','unpaid_request','confirmation','professional'),
   jsonb_build_object('title',v_service.title,'durationMinutes',v_service.duration_minutes,'profession',v_service.profession_code),
   (p_data->>'idempotencyKey')::uuid)
  RETURNING id INTO v_id;
  INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(v_id,p_actor,'REQUESTED');
  UPDATE care.intake_submission SET appointment_id=v_id WHERE client_id=p_actor AND service_id=v_service.id AND appointment_id IS NULL;
  RETURN (SELECT jsonb_build_object('id',id,'status',status,'expiresAt',hold_expires_at) FROM care.appointment WHERE id=v_id);
 END IF;

 IF p_action='appointments_mine' THEN
  PERFORM ops.workflow_tick();
  RETURN jsonb_build_object('appointments',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('id',a.id,'provider',u.display_name,'service',a.service_snapshot->>'title',
    'startsAt',a.starts_at,'endsAt',a.ends_at,
    'status',CASE WHEN a.status='HELD' AND a.hold_expires_at<=now() THEN 'EXPIRED' ELSE a.status END,
    'price',a.price_minor/100.0,'paymentStatus',a.payment_status,'paidAt',a.paid_at,'approvalDueAt',a.approval_due_at,'escalationAt',a.escalation_at,'expiresAt',a.hold_expires_at,'confirmationMode',a.policy_snapshot->>'confirmationMode','intakeStage',a.policy_snapshot->>'intakeStage',
    'meetingUrl',CASE WHEN a.status IN ('CONFIRMED','IN_PROGRESS') THEN a.meeting_url END,
    'proposedStartsAt',a.proposed_starts_at) ORDER BY a.starts_at DESC)
   FROM care.appointment a JOIN core.app_user u ON u.id=a.provider_id WHERE a.client_id=p_actor),'[]'::jsonb));
 END IF;

 IF p_action='appointment_cancel' THEN
  SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'id')::uuid AND (client_id=p_actor OR provider_id=p_actor) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found.'; END IF;
  IF v_appt.status NOT IN ('HELD','CONFIRMED') OR v_appt.starts_at<=now() THEN RAISE EXCEPTION 'This appointment can no longer be cancelled.'; END IF;
  UPDATE care.appointment SET status='CANCELLED',cancelled_by=p_actor,revision=revision+1 WHERE id=v_appt.id;
  PERFORM ops.open_case('cancel-'||v_appt.id,v_appt.client_id,v_appt.id,'CANCELLATION','Booking cancellation',now(),false);
  INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(v_appt.id,p_actor,'CANCELLED');
  RETURN jsonb_build_object('id',v_appt.id,'status','CANCELLED');
 END IF;

 IF p_action='appointment_reschedule_respond' THEN
  SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'id')::uuid AND client_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found.'; END IF;
  IF v_appt.proposed_starts_at IS NULL THEN RAISE EXCEPTION 'There is no new time to respond to.'; END IF;
  IF NOT (p_data->>'accept')::boolean THEN
   UPDATE care.appointment SET proposed_starts_at=NULL,proposed_at=NULL,revision=revision+1 WHERE id=v_appt.id;
   INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(v_appt.id,p_actor,'RESCHEDULE_DECLINED');
   RETURN jsonb_build_object('id',v_appt.id,'status',v_appt.status);
  END IF;
  IF (p_data->>'accept')::boolean AND v_appt.status='CANCELLED' AND v_appt.cancelled_by=v_appt.provider_id THEN
   IF NOT EXISTS(SELECT 1 FROM ops.workflow_case WHERE appointment_id=v_appt.id AND dedupe_key='pro-cancel-reschedule-'||v_appt.id) OR NOT EXISTS(SELECT 1 FROM finance.refund rf JOIN finance.payment_attempt pa ON pa.id=rf.payment_attempt_id WHERE pa.appointment_id=v_appt.id AND rf.status='REQUESTED' AND rf.initiated_at IS NULL) THEN RAISE EXCEPTION 'Replacement cannot reuse a payment already refunded or initiated.'; END IF;
   PERFORM 1 FROM finance.refund rf JOIN finance.payment_attempt pa ON pa.id=rf.payment_attempt_id WHERE pa.appointment_id=v_appt.id FOR UPDATE OF rf;
   UPDATE finance.refund SET status='REJECTED',eligibility='DECLINED',reason='Payment retained for client-approved replacement; no payout.' WHERE payment_attempt_id IN (SELECT id FROM finance.payment_attempt WHERE appointment_id=v_appt.id) AND status='REQUESTED';
   UPDATE ops.workflow_case SET status='RESOLVED',outcome='Client accepted replacement; original payment retained' WHERE appointment_id=v_appt.id AND kind IN ('REFUND','RESCHEDULE');
   UPDATE care.appointment SET payment_status='PAID' WHERE id=v_appt.id;
   v_appt.status='CONFIRMED';
  END IF;
  IF v_appt.proposed_starts_at<=now() OR NOT (v_appt.status='CONFIRMED' OR (v_appt.status='HELD' AND v_appt.hold_expires_at>now())) THEN
   RAISE EXCEPTION 'This proposed time has lapsed. Ask the professional for another time.';
  END IF;
  BEGIN
   -- Accepting finalises the consultation at the new time, keeping its length and buffers.
   UPDATE care.appointment SET client_reschedules=client_reschedules+CASE WHEN reschedule_requested_by=client_id THEN 1 ELSE 0 END,starts_at=proposed_starts_at,ends_at=proposed_starts_at+(ends_at-starts_at),
    reserved_start_at=proposed_starts_at-(starts_at-reserved_start_at),reserved_end_at=proposed_starts_at+(reserved_end_at-starts_at),
    status='CONFIRMED',meeting_url=COALESCE(meeting_url,p_data->>'meetingUrl'),proposed_starts_at=NULL,proposed_at=NULL,revision=revision+1
   WHERE id=v_appt.id;
  EXCEPTION WHEN exclusion_violation THEN
   RAISE EXCEPTION 'That time has since been taken. Ask the professional for another time.';
  END;
  INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(v_appt.id,p_actor,'RESCHEDULE_ACCEPTED');
  RETURN jsonb_build_object('id',v_appt.id,'status','CONFIRMED');
 END IF;

 -- Professionals ------------------------------------------------------------
 IF p_action='provider_workspace' THEN
  SELECT * INTO v_provider FROM care.provider WHERE id=p_actor;
  IF NOT FOUND THEN RETURN jsonb_build_object('status',NULL); END IF;
  SELECT * INTO v_case FROM care.verification_case WHERE provider_id=p_actor ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('status',v_provider.status,'caseStatus',v_case.status,
   'rationale',CASE WHEN v_case.status IN ('NEEDS_INFORMATION','REJECTED') THEN v_case.rationale END,'corrections',v_case.corrections,'reviewDueOn',ops.working_day_after(v_case.submitted_at,2),
   'professions',COALESCE((SELECT jsonb_agg(profession_code) FROM care.provider_scope WHERE provider_id=p_actor AND status='APPROVED'),'[]'::jsonb),
   'services',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'profession',s.profession_code,'title',s.title,
     'durationMinutes',s.duration_minutes,'price',s.price_minor/100.0,'active',s.active,'confirmationMode',s.confirmation_mode,'minimumNoticeMinutes',s.minimum_notice_minutes,'intakeStage',s.intake_stage,'intakeQuestions',s.intake_questions) ORDER BY s.title)
    FROM care.service s WHERE s.provider_id=p_actor),'[]'::jsonb),
   'availability',COALESCE((SELECT jsonb_agg(jsonb_build_object('weekday',r.weekday,'start',to_char(r.local_start,'HH24:MI'),
     'end',to_char(r.local_end,'HH24:MI')) ORDER BY r.weekday,r.local_start)
    FROM care.availability_rule r WHERE r.provider_id=p_actor AND (r.valid_until IS NULL OR r.valid_until>=current_date)),'[]'::jsonb),
   'appointments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'client',u.display_name,'service',a.service_snapshot->>'title',
     'startsAt',a.starts_at,'status',CASE WHEN a.status='HELD' AND a.hold_expires_at<=now() THEN 'EXPIRED' ELSE a.status END,
     'meetingUrl',a.meeting_url,'proposedStartsAt',a.proposed_starts_at) ORDER BY a.starts_at)
    FROM care.appointment a JOIN core.app_user u ON u.id=a.client_id
    WHERE a.provider_id=p_actor AND a.starts_at>now()-interval '1 day'),'[]'::jsonb));
 END IF;

 IF p_action IN ('provider_service_save','provider_availability_save','provider_appointment_decide','provider_appointment_propose') THEN
  IF NOT EXISTS(SELECT 1 FROM care.provider WHERE id=p_actor AND status='APPROVED') THEN
   RAISE EXCEPTION 'An approved professional profile is required' USING ERRCODE='42501';
  END IF;

  IF p_action='provider_service_save' THEN
   IF NOT EXISTS(SELECT 1 FROM care.provider_scope WHERE provider_id=p_actor AND profession_code=p_data->>'profession' AND status='APPROVED' AND (valid_until IS NULL OR valid_until>now())) THEN
    RAISE EXCEPTION 'You can only offer services within your approved scope.';
   END IF;
   IF p_data->>'id' IS NULL THEN
    IF (SELECT count(*) FROM care.service WHERE provider_id=p_actor)>=5 THEN RAISE EXCEPTION 'You can offer up to five services.'; END IF;
    INSERT INTO care.service(provider_id,profession_code,title,duration_minutes,price_minor,active)
    VALUES(p_actor,p_data->>'profession',p_data->>'title',(p_data->>'durationMinutes')::int,
     round((p_data->>'price')::numeric*100)::bigint,(p_data->>'active')::boolean) RETURNING id INTO v_id;
   ELSE
    UPDATE care.service SET profession_code=p_data->>'profession',title=p_data->>'title',
     duration_minutes=(p_data->>'durationMinutes')::int,price_minor=round((p_data->>'price')::numeric*100)::bigint,
     active=(p_data->>'active')::boolean
    WHERE id=(p_data->>'id')::uuid AND provider_id=p_actor RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Service not found.'; END IF;
   END IF;
   IF (p_data->>'active')::boolean AND NOT EXISTS(SELECT 1 FROM care.availability_rule WHERE provider_id=p_actor) THEN RAISE EXCEPTION 'Set weekly availability before publishing.'; END IF;
   UPDATE care.service SET confirmation_mode=COALESCE(p_data->>'confirmationMode','APPROVAL'),minimum_notice_minutes=GREATEST(COALESCE((p_data->>'minimumNoticeMinutes')::int,240),CASE WHEN p_data->>'confirmationMode'='INSTANT' THEN 60 ELSE 240 END),intake_stage=COALESCE(p_data->>'intakeStage','NONE'),intake_questions=COALESCE(p_data->'intakeQuestions','[]') WHERE id=v_id;
   RETURN jsonb_build_object('id',v_id);
  END IF;

  IF p_action='provider_availability_save' THEN
   DELETE FROM care.availability_rule WHERE provider_id=p_actor;
   FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(p_data->'rules','[]'::jsonb)) LOOP
    INSERT INTO care.availability_rule(provider_id,weekday,local_start,local_end,valid_from)
    VALUES(p_actor,(v_rule->>'weekday')::smallint,(v_rule->>'start')::time,(v_rule->>'end')::time,current_date);
   END LOOP;
   RETURN jsonb_build_object('saved',true);
  END IF;

  IF p_action='provider_appointment_propose' THEN
   SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'id')::uuid AND provider_id=p_actor FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found.'; END IF;
   IF NOT (v_appt.status='CONFIRMED' OR (v_appt.status='HELD' AND v_appt.hold_expires_at>now())) THEN
    RAISE EXCEPTION 'Only a pending or confirmed appointment can be moved.';
   END IF;
   v_start=(p_data->>'startsAt')::timestamptz;
   IF v_start<now()+interval '1 hour' OR v_start>now()+interval '60 days' THEN RAISE EXCEPTION 'Choose a time between one hour and 60 days from now.'; END IF;
   IF v_start=v_appt.starts_at THEN RAISE EXCEPTION 'That is the current time of this appointment.'; END IF;
   IF EXISTS(SELECT 1 FROM care.appointment a WHERE a.provider_id=p_actor AND a.id<>v_appt.id
     AND (a.status IN ('CONFIRMED','IN_PROGRESS') OR (a.status='HELD' AND a.hold_expires_at>now()))
     AND a.reserved_range && tstzrange(v_start-(v_appt.starts_at-v_appt.reserved_start_at),v_start+(v_appt.reserved_end_at-v_appt.starts_at),'[)')) THEN
    RAISE EXCEPTION 'You already have an appointment at that time.';
   END IF;
   -- A pending request stays open long enough for the client to answer.
   UPDATE care.appointment SET proposed_starts_at=v_start,proposed_at=now(),
    hold_expires_at=CASE WHEN status='HELD' THEN LEAST(now()+interval '24 hours',v_start) ELSE hold_expires_at END,revision=revision+1
   WHERE id=v_appt.id;
   INSERT INTO care.appointment_event(appointment_id,actor_id,event_type,redacted_payload) VALUES(v_appt.id,p_actor,'RESCHEDULE_PROPOSED',jsonb_build_object('startsAt',v_start));
   RETURN jsonb_build_object('id',v_appt.id,'proposedStartsAt',v_start);
  END IF;

  IF p_action='provider_appointment_decide' THEN
   SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'id')::uuid AND provider_id=p_actor FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found.'; END IF;
   v_decision=p_data->>'decision';
   IF v_decision='CONFIRM' THEN
    IF NOT (v_appt.status='CONFIRMED' OR (v_appt.status='HELD' AND v_appt.hold_expires_at>now())) THEN
     RAISE EXCEPTION 'This request has expired or was cancelled.';
    END IF;
    UPDATE care.appointment SET status='CONFIRMED',meeting_url=COALESCE(p_data->>'meetingUrl',meeting_url),proposed_starts_at=NULL,proposed_at=NULL,revision=revision+1 WHERE id=v_appt.id;
    INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(v_appt.id,p_actor,'CONFIRMED');
    RETURN jsonb_build_object('id',v_appt.id,'status','CONFIRMED');
   END IF;
   IF v_appt.status<>'HELD' THEN RAISE EXCEPTION 'Only a pending request can be declined.'; END IF;
   UPDATE care.appointment SET status='CANCELLED',cancelled_by=p_actor,revision=revision+1 WHERE id=v_appt.id;
  PERFORM ops.open_case('cancel-'||v_appt.id,v_appt.client_id,v_appt.id,'CANCELLATION','Booking cancellation',now(),false);
   INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(v_appt.id,p_actor,'DECLINED');
   RETURN jsonb_build_object('id',v_appt.id,'status','CANCELLED');
  END IF;
 END IF;

 -- Reviewers ----------------------------------------------------------------
 IF p_action IN ('admin_queue','admin_review','admin_document') THEN
  IF NOT EXISTS(SELECT 1 FROM core.role_assignment WHERE user_id=p_actor AND role='VERIFICATION') THEN
   RAISE EXCEPTION 'Reviewer access required' USING ERRCODE='42501';
  END IF;

  IF p_action='admin_queue' THEN
   RETURN jsonb_build_object(
    'applications',COALESCE((
     SELECT jsonb_agg(jsonb_build_object('id',c.id,'providerId',c.provider_id,'name',u.display_name,'email',u.email,
       'status',c.status,'submittedAt',c.submitted_at,'reviewDueOn',ops.working_day_after(c.submitted_at,2),'corrections',c.corrections,'bio',p.biography,'rationale',c.rationale,
       'profession',c.application->>'profession','application',c.application,
       'own',c.provider_id=p_actor) ORDER BY c.submitted_at)
     FROM (SELECT DISTINCT ON (provider_id) * FROM care.verification_case ORDER BY provider_id,created_at DESC) c
     JOIN care.provider p ON p.id=c.provider_id JOIN core.app_user u ON u.id=p.id
     WHERE c.status IN ('SUBMITTED','UNDER_REVIEW','NEEDS_INFORMATION')),'[]'::jsonb),
    'audit',COALESCE((
     SELECT jsonb_agg(jsonb_build_object('action',initcap(replace(lower(e.action),'_',' ')),'at',e.occurred_at) ORDER BY e.occurred_at DESC)
     FROM (SELECT action,occurred_at FROM ops.audit_event WHERE target_type='provider' ORDER BY occurred_at DESC LIMIT 12) e),'[]'::jsonb));
  END IF;

  SELECT * INTO v_case FROM care.verification_case WHERE id=(p_data->>'caseId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found.'; END IF;

  IF p_action='admin_document' THEN
   IF NOT v_case.application->'documents' @> jsonb_build_array(jsonb_build_object('path',p_data->>'path')) THEN
    RAISE EXCEPTION 'Document not found.';
   END IF;
   INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose)
   VALUES(p_actor,'CREDENTIAL_DOCUMENT_VIEWED','provider',v_case.provider_id,'Credential verification');
   RETURN jsonb_build_object('allowed',true);
  END IF;

  -- admin_review
  v_decision=p_data->>'decision';
  v_text=btrim(COALESCE(p_data->>'rationale',''));
  IF v_case.provider_id=p_actor THEN RAISE EXCEPTION 'You cannot review your own application.'; END IF;
  IF v_case.status NOT IN ('SUBMITTED','UNDER_REVIEW','NEEDS_INFORMATION')
   OR v_case.id<>(SELECT id FROM care.verification_case WHERE provider_id=v_case.provider_id ORDER BY created_at DESC LIMIT 1) THEN
   RAISE EXCEPTION 'This application has already been decided or replaced.';
  END IF;
  IF v_decision NOT IN ('APPROVED','REJECTED','NEEDS_INFORMATION') THEN RAISE EXCEPTION 'Unsupported decision.'; END IF;
  IF v_decision<>'APPROVED' AND length(v_text)<10 THEN RAISE EXCEPTION 'Explain the decision so the applicant knows what to do next.'; END IF;
  UPDATE care.verification_case SET status=v_decision,reviewer_id=p_actor,rationale=NULLIF(v_text,''),corrections=COALESCE(p_data->'corrections','[]'),
   decided_at=CASE WHEN v_decision='NEEDS_INFORMATION' THEN NULL ELSE now() END WHERE id=v_case.id;
  IF v_decision='APPROVED' THEN
   UPDATE care.provider_scope SET status='APPROVED',reviewed_by=p_actor,approved_at=now()
   WHERE provider_id=v_case.provider_id AND status='PENDING'
    AND profession_code=COALESCE(v_case.application->>'profession',profession_code);
   UPDATE care.provider SET status='APPROVED',revision=revision+1,
    languages=COALESCE((SELECT array_agg(CASE l WHEN 'English' THEN 'en' WHEN 'Nepali' THEN 'ne' WHEN 'Hindi' THEN 'hi' ELSE l END)
      FROM jsonb_array_elements_text(v_case.application->'practice'->'languages') l),languages)
   WHERE id=v_case.provider_id;
   INSERT INTO core.role_assignment(user_id,role,granted_by) VALUES(v_case.provider_id,'PROVIDER',p_actor) ON CONFLICT DO NOTHING;
  ELSE
   -- A request for information reopens the form; a rejection allows a fresh application.
   UPDATE care.provider SET status=CASE WHEN v_decision='REJECTED' THEN 'REJECTED' ELSE 'APPLIED' END,revision=revision+1
   WHERE id=v_case.provider_id;
  END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose)
  VALUES(p_actor,'PROVIDER_APPLICATION_'||v_decision,'provider',v_case.provider_id,'Credential verification');
  RETURN jsonb_build_object('id',v_case.id,'status',v_decision);
 END IF;

 RAISE EXCEPTION 'Unsupported action';
END $body$;
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
   IF v_appt.policy_snapshot->>'workflowVersion'='2' THEN RAISE EXCEPTION 'Full online payment is required.'; END IF;
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
  -- Starting or retrying payment never extends the original slot reservation.
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
   UPDATE finance.payment_attempt SET status='SUCCEEDED',verified_at=now(),gateway_reference=COALESCE(p_data->>'reference',gateway_reference) WHERE id=v_pay.id;
   INSERT INTO finance.refund(payment_attempt_id,amount_minor,status,idempotency_key,reason,eligibility) VALUES(v_pay.id,v_pay.amount_minor,'REQUESTED','duplicate-'||v_pay.id,'Duplicate successful payment. Refund in full.','ELIGIBLE') ON CONFLICT(idempotency_key) DO NOTHING;
   RETURN jsonb_build_object('status','DUPLICATE');
  END IF;
  UPDATE finance.payment_attempt SET status='SUCCEEDED',verified_at=now(),gateway_reference=COALESCE(p_data->>'reference',gateway_reference) WHERE id=v_pay.id;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,'PAYMENT_RECEIVED','appointment',v_appt.id,'Payment',jsonb_build_object('gateway',v_pay.gateway,'amountMinor',v_pay.amount_minor));
  IF v_appt.status IN ('HELD','EXPIRED') AND v_appt.cancelled_by IS NULL THEN
   IF v_appt.hold_expires_at<=now() OR v_appt.status='EXPIRED' THEN
    PERFORM 1 FROM care.provider WHERE id=v_appt.provider_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM care.open_slots(v_appt.service_id,(v_appt.starts_at AT TIME ZONE 'Asia/Kathmandu')::date) WHERE starts_at=v_appt.starts_at) THEN
     UPDATE care.appointment SET status='EXPIRED',payment_status='REFUND_DUE' WHERE id=v_appt.id;
     INSERT INTO finance.refund(payment_attempt_id,amount_minor,status,idempotency_key,reason,eligibility) VALUES(v_pay.id,v_pay.amount_minor,'REQUESTED','refund-'||v_appt.id,'Late payment: original slot is no longer eligible. Full refund or another time.','ELIGIBLE') ON CONFLICT(idempotency_key) DO NOTHING;
     RETURN jsonb_build_object('status','LAPSED');
    END IF;
   END IF;
   -- Paid: the professional now has 24 hours to confirm.
   UPDATE care.appointment SET status='HELD',payment_status='PAID',hold_expires_at=LEAST(now()+interval '60 minutes',starts_at) WHERE id=v_appt.id;
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
  RAISE EXCEPTION 'Use the finance workspace and provide payout evidence.' USING ERRCODE='42501';
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
  IF NOT 'FINANCE'=ANY(v_roles) THEN RAISE EXCEPTION 'Finance permission required' USING ERRCODE='42501'; END IF;
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
CREATE TABLE shop.delivery_zone(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),city text NOT NULL,area text NOT NULL,fee_minor bigint NOT NULL CHECK(fee_minor>=0),cod_enabled boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT true,UNIQUE(city,area));
ALTER TABLE shop.delivery_zone ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shop.delivery_zone FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.chatbud_shop(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE v_roles text[]; v_order shop.product_order%ROWTYPE; v_pay finance.payment_attempt%ROWTYPE; v_refund finance.refund%ROWTYPE;
 v_quote jsonb; v_line jsonb; v_id uuid; v_item uuid; v_left integer; v_take integer; v_batch record; v_ref text; v_cod boolean; r record;
 v_zone shop.delivery_zone; v_batch2 record; v_left2 integer; v_take2 integer; v_line2 record;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;

 -- Customers ----------------------------------------------------------------
 IF p_action='quote' THEN RETURN shop.price_cart(p_data->'items',p_data->>'promoCode'); END IF;

 IF p_action='order_create' THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_actor AND u.phone_confirmed_at IS NOT NULL AND '+'||ltrim(u.phone,'+')=btrim(p_data->'delivery'->>'phone')) THEN RAISE EXCEPTION 'Verify your phone before checkout.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_zone FROM shop.delivery_zone WHERE active AND lower(city)=lower(btrim(p_data->'delivery'->>'city')) AND lower(area)=lower(btrim(p_data->'delivery'->>'district'));
  IF v_zone.id IS NULL THEN RAISE EXCEPTION 'This delivery area is not currently covered.'; END IF;
  IF p_data->>'method'='COD' AND NOT v_zone.cod_enabled THEN RAISE EXCEPTION 'Cash on delivery is not offered in this area.'; END IF;
  SELECT * INTO v_order FROM shop.product_order WHERE idempotency_key=p_data->>'idempotencyKey';
  IF v_order.id IS NOT NULL THEN
   IF v_order.user_id<>p_actor THEN RAISE EXCEPTION 'Order not found.'; END IF;
   RETURN jsonb_build_object('id',v_order.id,'reference',v_order.reference,'total',v_order.total_minor/100.0,'status',v_order.status,'expiresAt',v_order.checkout_expires_at);
  END IF;
  PERFORM shop.expire_orders(NULL);
  IF (SELECT count(*) FROM shop.product_order WHERE user_id=p_actor AND status='AWAITING_PAYMENT')>=3 THEN
   RAISE EXCEPTION 'You have orders waiting for payment. Pay or cancel one first.';
  END IF;
  v_quote=shop.price_cart(p_data->'items',p_data->>'promoCode');
  v_quote=v_quote||jsonb_build_object('shippingMinor',v_zone.fee_minor,'shipping',v_zone.fee_minor/100.0,'total',((v_quote->>'subtotalMinor')::bigint-(v_quote->>'discountMinor')::bigint+v_zone.fee_minor)/100.0);
  IF p_data->>'promoCode'<>'' AND v_quote->>'promoCode' IS NULL THEN RAISE EXCEPTION '%',COALESCE(v_quote->>'promoMessage','This code is not valid.'); END IF;
  v_cod=p_data->>'method'='COD';
  v_id=gen_random_uuid();
  INSERT INTO shop.product_order(id,user_id,status,items_subtotal_minor,shipping_minor,discount_minor,total_minor,policy_snapshot,
   checkout_expires_at,reference,idempotency_key,payment_method,payment_status,promo_code)
  VALUES(v_id,p_actor,CASE WHEN v_cod THEN 'PROCESSING' ELSE 'AWAITING_PAYMENT' END,(v_quote->>'subtotalMinor')::bigint,(v_quote->>'shippingMinor')::bigint,
   (v_quote->>'discountMinor')::bigint,(v_quote->>'subtotalMinor')::bigint+(v_quote->>'shippingMinor')::bigint-(v_quote->>'discountMinor')::bigint,
   jsonb_build_object('deliveryZoneId',v_zone.id,'deliveryFeeMinor',v_zone.fee_minor,'returnDays',7,'returnShipping','Chatbud pays approved returns','originalDeliveryFee','Refund for damaged, incorrect or faulty items; retained for change of mind'),now()+interval '15 minutes',
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
    VALUES(v_item,(v_line->>'skuId')::uuid,v_batch.id,v_take,CASE WHEN v_cod THEN 'ALLOCATED' ELSE 'HELD' END,now()+interval '15 minutes');
    INSERT INTO shop.stock_movement(batch_id,reserved_delta,kind,reference_type,reference_id,dedupe_key,actor_id)
    VALUES(v_batch.id,v_take,'RESERVE','order',v_id,'reserve-'||v_item||'-'||v_batch.id,p_actor);
    v_left=v_left-v_take;
   END LOOP;
   IF v_left>0 THEN RAISE EXCEPTION '“%” has just sold out. Please update your bag.',v_line->>'title'; END IF;
  END LOOP;
  IF v_cod AND v_quote->>'promoCode' IS NOT NULL THEN UPDATE shop.promo_code SET redeemed_count=redeemed_count+1 WHERE code=v_quote->>'promoCode'; END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,'ORDER_PLACED','product_order',v_id,'Store order',jsonb_build_object('method',p_data->>'method'));
  RETURN jsonb_build_object('expiresAt',(SELECT checkout_expires_at FROM shop.product_order WHERE id=v_id),'id',v_id,'reference','ORD-'||upper(substr(replace(v_id::text,'-',''),1,8)),'total',(v_quote->>'total')::numeric,
   'status',CASE WHEN v_cod THEN 'PROCESSING' ELSE 'AWAITING_PAYMENT' END);
 END IF;

 IF p_action='orders_mine' THEN
  PERFORM shop.expire_orders(NULL);
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
  PERFORM shop.expire_orders(NULL);
  SELECT * INTO v_order FROM shop.product_order WHERE id=(p_data->>'orderId')::uuid AND user_id=p_actor FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.status<>'AWAITING_PAYMENT' THEN RAISE EXCEPTION 'This order is no longer waiting for payment.'; END IF;
  SELECT * INTO v_pay FROM finance.payment_attempt WHERE idempotency_key=p_data->>'idempotencyKey';
  IF v_pay.id IS NULL THEN
   INSERT INTO finance.payment_attempt(order_id,gateway,idempotency_key,amount_minor,status)
   VALUES(v_order.id,p_data->>'gateway',p_data->>'idempotencyKey',v_order.total_minor,'CREATED') RETURNING * INTO v_pay;
  ELSIF v_pay.order_id IS DISTINCT FROM v_order.id THEN RAISE EXCEPTION 'Payment not found.';
  END IF;
  UPDATE shop.product_order SET checkout_expires_at=GREATEST(checkout_expires_at,now()+interval '15 minutes') WHERE id=v_order.id;
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
   UPDATE finance.payment_attempt SET status='SUCCEEDED',verified_at=now(),gateway_reference=COALESCE(p_data->>'reference',gateway_reference) WHERE id=v_pay.id;
   INSERT INTO finance.refund(payment_attempt_id,amount_minor,status,idempotency_key,reason,eligibility) VALUES(v_pay.id,v_pay.amount_minor,'REQUESTED','duplicate-'||v_pay.id,'Duplicate successful order payment. Refund in full.','ELIGIBLE') ON CONFLICT(idempotency_key) DO NOTHING;
   RETURN jsonb_build_object('status','DUPLICATE');
  END IF;
  UPDATE finance.payment_attempt SET status='SUCCEEDED',verified_at=now(),gateway_reference=COALESCE(p_data->>'reference',gateway_reference) WHERE id=v_pay.id;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,'PAYMENT_RECEIVED','product_order',v_order.id,'Payment',jsonb_build_object('gateway',v_pay.gateway,'amountMinor',v_pay.amount_minor));
  -- Recheck coverage even if the payment arrives after the reservation expired.
  SELECT * INTO v_zone FROM shop.delivery_zone WHERE id=(v_order.policy_snapshot->>'deliveryZoneId')::uuid AND active;
  IF v_zone.id IS NOT NULL AND v_order.status IN ('AWAITING_PAYMENT','EXPIRED') AND v_order.cancelled_at IS NULL THEN
   IF v_order.checkout_expires_at<=now() OR v_order.status='EXPIRED' THEN
    PERFORM shop.release_order(v_order.id,p_actor);
    BEGIN
     FOR v_line2 IN SELECT * FROM shop.order_item WHERE order_id=v_order.id ORDER BY sku_id LOOP
      v_left2=v_line2.quantity;
      FOR v_batch2 IN SELECT * FROM shop.stock_batch WHERE sku_id=v_line2.sku_id AND status='AVAILABLE' AND (expires_on IS NULL OR expires_on>current_date) AND on_hand>reserved ORDER BY expires_on NULLS LAST,received_at FOR UPDATE LOOP
       EXIT WHEN v_left2=0;v_take2=LEAST(v_left2,v_batch2.on_hand-v_batch2.reserved);
       UPDATE shop.stock_batch SET reserved=reserved+v_take2 WHERE id=v_batch2.id;
       INSERT INTO shop.stock_reservation(order_item_id,sku_id,batch_id,quantity,status,expires_at) VALUES(v_line2.id,v_line2.sku_id,v_batch2.id,v_take2,'ALLOCATED',now()+interval '15 minutes');
       INSERT INTO shop.stock_movement(batch_id,reserved_delta,kind,reference_type,reference_id,dedupe_key,actor_id) VALUES(v_batch2.id,v_take2,'RESERVE','order',v_order.id,'late-'||v_pay.id||'-'||v_line2.id||'-'||v_batch2.id,p_actor);
       v_left2=v_left2-v_take2;
      END LOOP;
      IF v_left2>0 THEN RAISE EXCEPTION 'late_stock_unavailable'; END IF;
     END LOOP;
    EXCEPTION WHEN raise_exception THEN
     UPDATE shop.product_order SET status='EXPIRED',payment_status='REFUND_DUE' WHERE id=v_order.id;
     INSERT INTO finance.refund(payment_attempt_id,amount_minor,status,idempotency_key,reason,eligibility) VALUES(v_pay.id,v_pay.amount_minor,'REQUESTED','refund-order-'||v_order.id,'Late payment: original order cannot be fulfilled. Full refund eligible.','ELIGIBLE') ON CONFLICT(idempotency_key) DO NOTHING;
     RETURN jsonb_build_object('status','LAPSED');
    END;
   END IF;
   UPDATE shop.product_order SET status='PAID',payment_status='PAID',revision=revision+1 WHERE id=v_order.id;
   UPDATE shop.stock_reservation sr SET status='ALLOCATED' FROM shop.order_item oi WHERE oi.id=sr.order_item_id AND oi.order_id=v_order.id AND sr.status='HELD';
   IF v_order.promo_code IS NOT NULL THEN UPDATE shop.promo_code SET redeemed_count=redeemed_count+1 WHERE code=v_order.promo_code; END IF;
   RETURN jsonb_build_object('status','SUCCEEDED');
  END IF;
  -- The order lapsed while the customer was paying, so the money goes back.
  UPDATE shop.product_order SET payment_status='REFUND_DUE' WHERE id=v_order.id;
  INSERT INTO finance.refund(payment_attempt_id,amount_minor,status,idempotency_key,reason)
  VALUES(v_pay.id,v_pay.amount_minor,'REQUESTED','refund-order-'||v_order.id,'Paid after the order had lapsed or delivery coverage changed. Refund in full.')
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
  RAISE EXCEPTION 'Use the finance workspace with payout evidence.' USING ERRCODE='42501';
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
CREATE OR REPLACE FUNCTION public.chatbud_health(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE v_id uuid; v_provider uuid; v_client uuid; v_domain text; v_acceptance uuid; v_status text;
 v_today date := (now() AT TIME ZONE 'Asia/Kathmandu')::date; v_day date; v_week date;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;
 IF p_action='plan_save' THEN RAISE EXCEPTION 'Use the versioned care-plan workspace and explicitly publish.'; END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;
 v_domain=p_data->>'domain';
 IF v_domain IS NOT NULL AND v_domain NOT IN ('mental','nutrition','fitness') THEN RAISE EXCEPTION 'Unknown area of care.'; END IF;

 -- Clients ------------------------------------------------------------------
 IF p_action='health_mine' THEN
  RETURN jsonb_build_object(
   'plans',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pl.id,'domain',pl.domain,'title',pl.title,'body',pl.body,
      'professional',u.display_name,'version',pl.version,'updatedAt',pl.updated_at) ORDER BY pl.updated_at DESC)
     FROM care.care_plan pl JOIN core.app_user u ON u.id=pl.provider_id
     WHERE pl.client_id=p_actor AND pl.status='ACTIVE'),'[]'::jsonb),
   'goals',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',g.id,'domain',g.domain,'title',g.title,'note',g.note,
      'targetDate',g.target_date,'status',g.status,'action',g.action,'weeklyTarget',g.weekly_target,'template',g.template_code,
      'total',(SELECT count(*) FROM care.goal_checkin c WHERE c.goal_id=g.id),
      'days',COALESCE((SELECT jsonb_agg(c.day ORDER BY c.day) FROM care.goal_checkin c WHERE c.goal_id=g.id AND c.day>v_today-84),'[]'::jsonb))
      ORDER BY g.status,g.created_at DESC)
     FROM care.goal g WHERE g.user_id=p_actor AND g.status<>'ARCHIVED'),'[]'::jsonb),
   'today',v_today,
   'wellbeing',COALESCE((SELECT jsonb_agg(jsonb_build_object('week',w.week_start,'mood',w.mood,'sleep',w.sleep,'energy',w.energy) ORDER BY w.week_start)
     FROM care.wellbeing_checkin w WHERE w.user_id=p_actor AND w.week_start>v_today-56),'[]'::jsonb),
   'professionals',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pr.id,'name',u.display_name,
      'professions',COALESCE((SELECT jsonb_agg(sc.profession_code) FROM care.provider_scope sc WHERE sc.provider_id=pr.id AND sc.status='APPROVED'),'[]'::jsonb),
      'shared',COALESCE((SELECT jsonb_agg(gr.domain) FROM care.compartment_grant gr
        WHERE gr.client_id=p_actor AND gr.provider_id=pr.id AND gr.revoked_at IS NULL),'[]'::jsonb)) ORDER BY u.display_name)
     FROM care.provider pr JOIN core.app_user u ON u.id=pr.id
     WHERE EXISTS(SELECT 1 FROM care.appointment a WHERE a.client_id=p_actor AND a.provider_id=pr.id
       AND a.status IN ('CONFIRMED','IN_PROGRESS','COMPLETED'))),'[]'::jsonb),
   'consent',(SELECT content FROM core.consent_version WHERE purpose='compartment_share' AND language_code='en' ORDER BY effective_at DESC LIMIT 1));
 END IF;

 IF p_action='goal_save' THEN
  v_status=COALESCE(p_data->>'status','ACTIVE');
  IF p_data->>'id' IS NULL THEN
   IF (SELECT count(*) FROM care.goal WHERE user_id=p_actor AND status='ACTIVE')>=20 THEN RAISE EXCEPTION 'Finish or remove a goal before adding another.'; END IF;
   INSERT INTO care.goal(user_id,domain,title,note,target_date,action,weekly_target,template_code)
   VALUES(p_actor,v_domain,btrim(p_data->>'title'),COALESCE(p_data->>'note',''),NULLIF(p_data->>'targetDate','')::date,
    btrim(COALESCE(p_data->>'action','')),COALESCE((p_data->>'weeklyTarget')::smallint,7),NULLIF(p_data->>'template',''))
   RETURNING id INTO v_id;
  ELSE
   UPDATE care.goal SET status=v_status,
    completed_at=CASE WHEN v_status='DONE' THEN COALESCE(completed_at,now()) ELSE NULL END
   WHERE id=(p_data->>'id')::uuid AND user_id=p_actor RETURNING id INTO v_id;
   IF v_id IS NULL THEN RAISE EXCEPTION 'Goal not found.'; END IF;
  END IF;
  RETURN jsonb_build_object('id',v_id);
 END IF;

 -- One tap a day. Yesterday can still be marked, so a late evening is not a lost day.
 IF p_action='goal_checkin' THEN
  v_day=COALESCE(NULLIF(p_data->>'date','')::date,v_today);
  IF v_day>v_today OR v_day<v_today-1 THEN RAISE EXCEPTION 'You can mark today or yesterday.'; END IF;
  SELECT id INTO v_id FROM care.goal WHERE id=(p_data->>'id')::uuid AND user_id=p_actor AND status='ACTIVE';
  IF v_id IS NULL THEN RAISE EXCEPTION 'Goal not found.'; END IF;
  IF (p_data->>'done')::boolean THEN
   INSERT INTO care.goal_checkin(goal_id,day) VALUES(v_id,v_day) ON CONFLICT DO NOTHING;
  ELSE
   DELETE FROM care.goal_checkin WHERE goal_id=v_id AND day=v_day;
  END IF;
  RETURN jsonb_build_object('id',v_id,'day',v_day);
 END IF;

 -- A private weekly note of how the week felt. Weeks start on Sunday, Nepal time.
 IF p_action='wellbeing_save' THEN
  v_week=v_today-extract(dow FROM v_today)::int;
  INSERT INTO care.wellbeing_checkin(user_id,week_start,mood,sleep,energy)
  VALUES(p_actor,v_week,(p_data->>'mood')::smallint,(p_data->>'sleep')::smallint,(p_data->>'energy')::smallint)
  ON CONFLICT (user_id,week_start) DO UPDATE SET mood=EXCLUDED.mood,sleep=EXCLUDED.sleep,energy=EXCLUDED.energy,updated_at=now();
  RETURN jsonb_build_object('week',v_week);
 END IF;

 IF p_action='share_set' THEN
  v_provider=(p_data->>'providerId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM care.appointment a WHERE a.client_id=p_actor AND a.provider_id=v_provider
    AND a.status IN ('CONFIRMED','IN_PROGRESS','COMPLETED')) THEN
   RAISE EXCEPTION 'You can share only with a professional you have a confirmed appointment with.';
  END IF;
  IF (p_data->>'share')::boolean THEN
   IF NOT EXISTS(SELECT 1 FROM care.compartment_grant WHERE client_id=p_actor AND provider_id=v_provider AND domain=v_domain AND revoked_at IS NULL) THEN
    INSERT INTO core.consent_acceptance(user_id,consent_version_id)
    SELECT p_actor,id FROM core.consent_version WHERE purpose='compartment_share' AND language_code='en' ORDER BY effective_at DESC LIMIT 1
    RETURNING id INTO v_acceptance;
    INSERT INTO care.compartment_grant(client_id,provider_id,domain,consent_acceptance_id) VALUES(p_actor,v_provider,v_domain,v_acceptance);
    INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
    VALUES(p_actor,'COMPARTMENT_SHARED','provider',v_provider,'Client-directed sharing',jsonb_build_object('domain',v_domain));
   END IF;
  ELSE
   UPDATE care.compartment_grant SET revoked_at=now()
   WHERE client_id=p_actor AND provider_id=v_provider AND domain=v_domain AND revoked_at IS NULL
   RETURNING consent_acceptance_id INTO v_acceptance;
   IF v_acceptance IS NOT NULL THEN
    UPDATE core.consent_acceptance SET withdrawn_at=now() WHERE id=v_acceptance;
    INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
    VALUES(p_actor,'COMPARTMENT_SHARE_REVOKED','provider',v_provider,'Client-directed sharing',jsonb_build_object('domain',v_domain));
   END IF;
  END IF;
  RETURN jsonb_build_object('shared',(p_data->>'share')::boolean);
 END IF;

 -- Professionals ------------------------------------------------------------
 IF p_action IN ('provider_clients','plan_save') THEN
  IF NOT EXISTS(SELECT 1 FROM care.provider WHERE id=p_actor AND status='APPROVED') THEN
   RAISE EXCEPTION 'An approved professional profile is required' USING ERRCODE='42501';
  END IF;

  IF p_action='provider_clients' THEN
   RETURN jsonb_build_object(
    'domains',COALESCE((SELECT jsonb_agg(DISTINCT f.domain) FROM care.provider_scope sc JOIN care.profession f ON f.code=sc.profession_code
      WHERE sc.provider_id=p_actor AND sc.status='APPROVED'),'[]'::jsonb),
    'clients',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.display_name,
       'plans',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pl.id,'domain',pl.domain,'title',pl.title,'body',pl.body,
          'version',pl.version,'updatedAt',pl.updated_at) ORDER BY pl.updated_at DESC)
         FROM care.care_plan pl WHERE pl.client_id=c.id AND pl.provider_id=p_actor AND pl.status='ACTIVE'),'[]'::jsonb),
       'sharedDomains',COALESCE((SELECT jsonb_agg(gr.domain) FROM care.compartment_grant gr
         WHERE gr.client_id=c.id AND gr.provider_id=p_actor AND gr.revoked_at IS NULL),'[]'::jsonb),
       'sharedPlans',COALESCE((SELECT jsonb_agg(jsonb_build_object('domain',pl.domain,'title',pl.title,'body',pl.body,
          'professional',au.display_name,'updatedAt',pl.updated_at) ORDER BY pl.updated_at DESC)
         FROM care.care_plan pl JOIN core.app_user au ON au.id=pl.provider_id
         WHERE pl.client_id=c.id AND pl.provider_id<>p_actor AND pl.status='ACTIVE'
          AND EXISTS(SELECT 1 FROM care.compartment_grant gr WHERE gr.client_id=c.id AND gr.provider_id=p_actor
            AND gr.domain=pl.domain AND gr.revoked_at IS NULL)),'[]'::jsonb),
       'sharedGoals',COALESCE((SELECT jsonb_agg(jsonb_build_object('domain',g.domain,'title',g.title,'note',g.note,
          'targetDate',g.target_date,'status',g.status) ORDER BY g.status,g.created_at DESC)
         FROM care.goal g WHERE g.user_id=c.id AND g.status<>'ARCHIVED'
          AND EXISTS(SELECT 1 FROM care.compartment_grant gr WHERE gr.client_id=c.id AND gr.provider_id=p_actor
            AND gr.domain=g.domain AND gr.revoked_at IS NULL)),'[]'::jsonb)) ORDER BY c.display_name)
      FROM core.app_user c
      WHERE EXISTS(SELECT 1 FROM care.appointment a WHERE a.client_id=c.id AND a.provider_id=p_actor
        AND a.status IN ('CONFIRMED','IN_PROGRESS','COMPLETED'))),'[]'::jsonb));
  END IF;

  -- plan_save
  v_client=(p_data->>'clientId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM care.provider_scope sc JOIN care.profession f ON f.code=sc.profession_code
    WHERE sc.provider_id=p_actor AND sc.status='APPROVED' AND f.domain=v_domain) THEN
   RAISE EXCEPTION 'You can write plans only within your approved area of care.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM care.appointment a WHERE a.client_id=v_client AND a.provider_id=p_actor
    AND a.status IN ('CONFIRMED','IN_PROGRESS','COMPLETED')) THEN
   RAISE EXCEPTION 'You can write plans only for clients with a confirmed appointment.';
  END IF;
  IF p_data->>'id' IS NULL THEN
   INSERT INTO care.care_plan(client_id,provider_id,domain,title,body)
   VALUES(v_client,p_actor,v_domain,btrim(p_data->>'title'),p_data->>'body') RETURNING id INTO v_id;
  ELSE
   UPDATE care.care_plan SET title=btrim(p_data->>'title'),body=p_data->>'body',domain=v_domain,
    status=CASE WHEN (p_data->>'archived')::boolean THEN 'ARCHIVED' ELSE 'ACTIVE' END,
    version=version+1,updated_at=now()
   WHERE id=(p_data->>'id')::uuid AND provider_id=p_actor AND client_id=v_client RETURNING id INTO v_id;
   IF v_id IS NULL THEN RAISE EXCEPTION 'Plan not found.'; END IF;
  END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'CARE_PLAN_SAVED','care_plan',v_id,'Care delivery');
  RETURN jsonb_build_object('id',v_id);
 END IF;

 RAISE EXCEPTION 'Unsupported action';
END $body$;
CREATE OR REPLACE FUNCTION public.chatbud_ops(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE
 v_roles text[]; v_id uuid; v_ticket ops.support_ticket; v_appt care.appointment; v_product shop.product; v_sku shop.sku;
 v_promo shop.promo_code; v_text text; v_subtotal numeric; v_discount numeric; v_target uuid; v_role text; v_batch uuid;
 team_roles CONSTANT text[] := ARRAY['VERIFICATION','CLINICAL_REVIEW','SUPPORT','FINANCE','FULFILLMENT','CATALOG','SECURITY_ADMIN'];
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
 IF p_action='booking_confirm' THEN RAISE EXCEPTION 'Record explicit approval evidence in the work queue.'; END IF;
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
CREATE FUNCTION public.chatbud_workflow(p_action text,p_actor uuid DEFAULT NULL,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a care.appointment;s care.service;case_row ops.workflow_case;refund_row finance.refund;plan care.plan_record;rev care.plan_revision;entry care.intake_submission;
 roles text[];v_id uuid;v_text text;item jsonb;v_tasks jsonb;prior jsonb;v_num integer;result jsonb;is_super boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(array_agg(role),'{}') INTO roles FROM core.role_assignment WHERE user_id=p_actor;
 is_super=EXISTS(SELECT 1 FROM ops.staff_permission WHERE user_id=p_actor AND permission='SUPERVISOR');
 IF p_action='availability_block' THEN
  IF NOT EXISTS(SELECT 1 FROM care.provider WHERE id=p_actor AND status='APPROVED') THEN RAISE EXCEPTION 'Approved professional required' USING ERRCODE='42501'; END IF;
  INSERT INTO care.availability_exception(provider_id,starts_at,ends_at,kind) VALUES(p_actor,(p_data->>'startsAt')::timestamptz,(p_data->>'endsAt')::timestamptz,'UNAVAILABLE') RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id);
 END IF;
 IF p_action='delivery_zones' THEN
  RETURN jsonb_build_object('phone',(SELECT '+'||ltrim(phone,'+') FROM auth.users WHERE id=p_actor AND phone_confirmed_at IS NOT NULL),'zones',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'city',city,'area',area,'fee',fee_minor/100.0,'cod',cod_enabled)) FROM shop.delivery_zone WHERE active),'[]'));
 END IF;
 IF p_action='delivery_quote' THEN
  PERFORM shop.expire_orders(NULL);
  SELECT to_jsonb(z) INTO result FROM shop.delivery_zone z WHERE id=(p_data->>'zoneId')::uuid AND active;
  IF result IS NULL THEN RAISE EXCEPTION 'Choose a covered delivery area.'; END IF;
  v_tasks=shop.price_cart(p_data->'items',p_data->>'promoCode');
  RETURN v_tasks||jsonb_build_object('shipping',(result->>'fee_minor')::bigint/100.0,'total',((v_tasks->>'subtotalMinor')::bigint-(v_tasks->>'discountMinor')::bigint+(result->>'fee_minor')::bigint)/100.0,'cod',(result->>'cod_enabled')::boolean);
 END IF;
 IF p_action='zone_save' THEN
  IF p_data->>'city' NOT IN ('Kathmandu','Lalitpur','Bhaktapur') THEN RAISE EXCEPTION 'Launch delivery coverage is limited to Kathmandu Valley.'; END IF;
  IF NOT roles && ARRAY['CATALOG','FULFILLMENT'] THEN RAISE EXCEPTION 'Store operations permission required' USING ERRCODE='42501'; END IF;
  INSERT INTO shop.delivery_zone(city,area,fee_minor,cod_enabled,active) VALUES(p_data->>'city',p_data->>'area',round((p_data->>'fee')::numeric*100)::bigint,(p_data->>'cod')::boolean,(p_data->>'active')::boolean) ON CONFLICT(city,area) DO UPDATE SET fee_minor=excluded.fee_minor,cod_enabled=excluded.cod_enabled,active=excluded.active;
  RETURN '{"saved":true}';
 END IF;
 IF p_action='return_request' THEN
  SELECT to_jsonb(o) INTO result FROM shop.product_order o WHERE id=(p_data->>'orderId')::uuid AND user_id=p_actor AND status='FULFILLED';
  IF result IS NULL THEN RAISE EXCEPTION 'A delivered order belonging to you is required.'; END IF;
  IF p_data->>'reason'='CHANGE_OF_MIND' AND ((result->>'delivered_at')::timestamptz+interval '7 days'<now() OR NOT COALESCE((p_data->>'unopenedUnused')::boolean,false)) THEN RAISE EXCEPTION 'Change-of-mind returns require unopened, unused items with seals intact, within 7 days of delivery.'; END IF;
  v_id=ops.open_case('return-'||(p_data->>'orderId'),p_actor,NULL,'RETURN','Product return: receive and inspect before refund eligibility',NULL,false);
  IF v_id IS NULL THEN RAISE EXCEPTION 'A return case already exists for this order. Contact support for updates.'; END IF;
  UPDATE ops.workflow_case SET order_id=(p_data->>'orderId')::uuid,requested_by=p_actor,context=jsonb_build_object('reason',p_data->>'reason','unopenedUnused',p_data->'unopenedUnused','scope','WHOLE_ORDER','returnShippingPayer','CHATBUD') WHERE id=v_id;
  INSERT INTO ops.workflow_event(case_id,actor_id,event,detail) VALUES(v_id,p_actor,'Customer requested whole-order return',p_data->>'note');
  RETURN jsonb_build_object('id',v_id);
 END IF;
 IF p_action='return_inspect' THEN
  IF NOT roles && ARRAY['FULFILLMENT'] AND NOT is_super THEN RAISE EXCEPTION 'Authorized returns staff required' USING ERRCODE='42501'; END IF;
  IF (p_data->>'waive')::boolean AND NOT is_super THEN RAISE EXCEPTION 'Authorized supervisor required to waive return' USING ERRCODE='42501'; END IF;
  SELECT * INTO case_row FROM ops.workflow_case WHERE id=(p_data->>'id')::uuid AND kind='RETURN' AND status NOT IN ('RESOLVED','CLOSED') FOR UPDATE;
  IF case_row.id IS NULL THEN RAISE EXCEPTION 'Open return case required.'; END IF;
  IF NOT (p_data->>'receivedAndInspected')::boolean AND NOT (p_data->>'waive')::boolean THEN RAISE EXCEPTION 'Receipt and inspection, or an authorized waiver, is required before eligibility.'; END IF;
  SELECT to_jsonb(o) INTO result FROM shop.product_order o WHERE id=case_row.order_id;
  SELECT rf.* INTO refund_row FROM finance.refund rf WHERE false;
  SELECT pa.id INTO v_id FROM finance.payment_attempt pa WHERE pa.order_id=case_row.order_id AND status='SUCCEEDED' ORDER BY verified_at LIMIT 1 FOR UPDATE;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Verified received payment required. Cash reconciliation needs finance review.'; END IF;
  INSERT INTO finance.refund(payment_attempt_id,amount_minor,status,idempotency_key,reason,eligibility,eligible_at,initiate_by) VALUES(v_id,(result->>'total_minor')::bigint-CASE WHEN case_row.context->>'reason'='CHANGE_OF_MIND' THEN (result->>'shipping_minor')::bigint ELSE 0 END,'REQUESTED','return-'||case_row.order_id,'Approved whole-order return. Chatbud pays return shipping.','ELIGIBLE',now(),ops.next_refund_deadline(now())) ON CONFLICT(idempotency_key) DO NOTHING;
  UPDATE ops.workflow_case SET status='RESOLVED',acted_at=now(),updated_at=now() WHERE id=case_row.id;
  INSERT INTO ops.workflow_event(case_id,actor_id,event,detail) VALUES(case_row.id,p_actor,CASE WHEN (p_data->>'waive')::boolean THEN 'Authorized return waiver' ELSE 'Return received and inspected' END,p_data->>'evidence');
  RETURN '{"saved":true}';
 END IF;
 IF p_action='operating_settings' THEN
  IF NOT 'SECURITY_ADMIN'=ANY(roles) THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('members',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name,'email',u.email,'permissions',COALESCE((SELECT jsonb_agg(permission) FROM ops.staff_permission WHERE user_id=u.id),'[]'))) FROM core.app_user u WHERE EXISTS(SELECT 1 FROM core.role_assignment WHERE user_id=u.id AND role NOT IN ('CONSUMER','PROVIDER'))),'[]'),'holidays',COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY day) FROM ops.nepal_holiday h),'[]'));
 END IF;
 IF p_action='permission_set' THEN
  IF NOT 'SECURITY_ADMIN'=ANY(roles) THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
  IF (p_data->>'grant')::boolean THEN INSERT INTO ops.staff_permission(user_id,permission) VALUES((p_data->>'userId')::uuid,p_data->>'permission') ON CONFLICT DO NOTHING;
  ELSE DELETE FROM ops.staff_permission WHERE user_id=(p_data->>'userId')::uuid AND permission=p_data->>'permission'; END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata) VALUES(p_actor,'OPERATING_PERMISSION_CHANGED','app_user',(p_data->>'userId')::uuid,'Permission administration',p_data-'userId');
  RETURN '{"saved":true}';
 END IF;
 IF p_action='holiday_save' THEN
  IF NOT 'SECURITY_ADMIN'=ANY(roles) THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
  INSERT INTO ops.nepal_holiday(day,label) VALUES((p_data->>'day')::date,p_data->>'label') ON CONFLICT(day) DO UPDATE SET label=excluded.label;
  UPDATE finance.refund SET initiate_by=ops.next_refund_deadline(eligible_at) WHERE status='REQUESTED' AND eligibility='ELIGIBLE' AND initiated_at IS NULL;
  UPDATE ops.workflow_case c SET due_at=r.initiate_by FROM finance.refund r WHERE c.refund_id=r.id AND r.status='REQUESTED';
  RETURN '{"saved":true}';
 END IF;
 IF p_action='rereview_request' THEN
  SELECT * INTO entry FROM care.intake_submission WHERE false;
  SELECT to_jsonb(v) INTO result FROM care.verification_case v WHERE provider_id=p_actor ORDER BY created_at DESC LIMIT 1;
  IF result->>'status'<>'REJECTED' THEN RAISE EXCEPTION 'A rejected application is required for re-review.'; END IF;
  INSERT INTO care.verification_case(provider_id,status,submitted_at,application,rationale) VALUES(p_actor,'SUBMITTED',now(),result->'application',p_data->>'reason') RETURNING id INTO v_id;
  UPDATE care.provider SET status='UNDER_REVIEW' WHERE id=p_actor;
  RETURN jsonb_build_object('id',v_id);
 END IF;
 IF p_action='cancellation_choice' THEN
  SELECT * INTO a FROM care.appointment WHERE id=(p_data->>'id')::uuid AND client_id=p_actor AND status='CANCELLED' FOR UPDATE;
  IF a.id IS NULL OR a.cancelled_by IS DISTINCT FROM a.provider_id THEN RAISE EXCEPTION 'Professional-cancelled appointment required.'; END IF;
  SELECT rf.* INTO refund_row FROM finance.refund rf JOIN finance.payment_attempt pa ON pa.id=rf.payment_attempt_id WHERE pa.appointment_id=a.id AND rf.status='REQUESTED' FOR UPDATE OF rf;
  IF refund_row.id IS NULL THEN RAISE EXCEPTION 'Refund or replacement has already been handled.'; END IF;
  IF p_data->>'choice'='REFUND' THEN UPDATE finance.refund SET eligibility='ELIGIBLE',eligible_at=now(),initiate_by=ops.next_refund_deadline(now()) WHERE id=refund_row.id;UPDATE ops.workflow_case SET due_at=ops.next_refund_deadline(now()) WHERE refund_id=refund_row.id;
  ELSE v_id=ops.open_case('pro-cancel-reschedule-'||a.id,p_actor,a.id,'RESCHEDULE','Client chose replacement after professional cancellation',now()+interval '5 minutes',true); UPDATE ops.workflow_case SET requested_by=a.provider_id WHERE id=v_id; END IF;
  RETURN '{"saved":true}';
 END IF;
 IF p_action='reschedule_offer' THEN
  IF NOT 'SUPPORT'=ANY(roles) AND NOT is_super THEN RAISE EXCEPTION 'Support permission required' USING ERRCODE='42501'; END IF;
  SELECT * INTO case_row FROM ops.workflow_case WHERE id=(p_data->>'caseId')::uuid AND kind='RESCHEDULE' FOR UPDATE;
  SELECT * INTO a FROM care.appointment WHERE id=case_row.appointment_id AND (status='CONFIRMED' OR status='CANCELLED' AND cancelled_by=provider_id AND case_row.dedupe_key='pro-cancel-reschedule-'||id) FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'A confirmed original appointment is required. Cancelled sessions need a new client-authorized booking.'; END IF;
  IF case_row.requested_by=a.client_id AND (a.client_reschedules>=1 OR a.starts_at-now()<interval '24 hours') AND NOT is_super THEN RAISE EXCEPTION 'Supervisor review is required for late or additional client changes.'; END IF;
  PERFORM 1 FROM care.provider WHERE id=a.provider_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM care.open_slots(a.service_id,((p_data->>'startsAt')::timestamptz AT TIME ZONE 'Asia/Kathmandu')::date) WHERE starts_at=(p_data->>'startsAt')::timestamptz) THEN RAISE EXCEPTION 'Replacement time is unavailable.'; END IF;
  UPDATE care.appointment SET proposed_starts_at=(p_data->>'startsAt')::timestamptz,proposed_at=now(),reschedule_requested_by=case_row.requested_by WHERE id=a.id;
  INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(a.id,p_actor,'REPLACEMENT_OFFERED');
  RETURN '{"saved":true}';
 END IF;
 IF p_action='provider_summary' THEN
  IF NOT EXISTS(SELECT 1 FROM care.provider WHERE id=p_actor AND status='APPROVED') THEN RAISE EXCEPTION 'Approved professional required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('draftPlans',(SELECT count(*) FROM care.plan_record p JOIN care.plan_revision v ON v.plan_id=p.id WHERE p.provider_id=p_actor AND v.published_at IS NULL),'followups',(SELECT count(*) FROM ops.workflow_case c JOIN care.appointment a ON a.id=c.appointment_id WHERE a.provider_id=p_actor AND c.kind='FOLLOWUP' AND c.status NOT IN ('CLOSED','RESOLVED')),'calendar',COALESCE((SELECT jsonb_agg(jsonb_build_object('status',status,'lastSyncedAt',last_synced_at)) FROM care.calendar_connection WHERE provider_id=p_actor),'[]'));
 END IF;
 IF p_action='preferences' THEN
  IF p_data ? 'language' THEN UPDATE core.app_user SET language_code=p_data->>'language' WHERE id=p_actor; END IF;
  RETURN jsonb_build_object('language',(SELECT language_code FROM core.app_user WHERE id=p_actor));
 END IF;
 IF p_action='notifications' THEN
  RETURN jsonb_build_object('notifications',COALESCE((SELECT jsonb_agg(to_jsonb(n)-'user_id' ORDER BY n.created_at DESC) FROM (SELECT * FROM core.in_app_notification WHERE user_id=p_actor ORDER BY created_at DESC LIMIT 50)n),'[]'));
 END IF;
 IF p_action='draft_load' THEN RETURN COALESCE((SELECT jsonb_build_object('payload',payload,'revision',revision,'updatedAt',updated_at) FROM care.application_draft WHERE user_id=p_actor),'{"payload":null,"revision":0}'); END IF;
 IF p_action='draft_save' THEN
  INSERT INTO care.application_draft(user_id,payload) VALUES(p_actor,p_data->'payload') ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,revision=care.application_draft.revision+1,updated_at=now() WHERE care.application_draft.revision=(p_data->>'revision')::int RETURNING revision INTO v_num;
  IF v_num IS NULL THEN RAISE EXCEPTION 'This application changed on another device. Reload before saving.'; END IF;
  RETURN jsonb_build_object('revision',v_num,'savedAt',now());
 END IF;
 IF p_action IN ('intake_form','intake_submit') THEN
  SELECT * INTO s FROM care.service WHERE id=(p_data->>'serviceId')::uuid AND (active OR EXISTS(SELECT 1 FROM care.intake_submission WHERE client_id=p_actor AND service_id=care.service.id));
  IF s.id IS NULL THEN RAISE EXCEPTION 'Service unavailable.'; END IF;
  IF p_action='intake_form' THEN RETURN jsonb_build_object('stage',s.intake_stage,'questions',s.intake_questions,'submitted',EXISTS(SELECT 1 FROM care.intake_submission WHERE client_id=p_actor AND service_id=s.id AND parent_id IS NULL)); END IF;
  IF s.intake_stage='NONE' THEN RAISE EXCEPTION 'This service does not require intake.'; END IF;
  IF s.intake_stage='AFTER_CONFIRMATION' THEN
   SELECT * INTO a FROM care.appointment WHERE id=(p_data->>'appointmentId')::uuid AND client_id=p_actor AND service_id=s.id AND status='CONFIRMED';
   IF a.id IS NULL THEN RAISE EXCEPTION 'A confirmed appointment is required.' USING ERRCODE='42501'; END IF;
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(s.intake_questions) LOOP
   IF p_data->>'parentId' IS NULL AND COALESCE((item->>'required')::boolean,true) AND length(btrim(COALESCE(p_data->'answers'->>(item->>'id'),'')))=0 THEN RAISE EXCEPTION 'Complete every required intake question.'; END IF;
  END LOOP;
  IF p_data->>'parentId' IS NOT NULL THEN
   SELECT * INTO entry FROM care.intake_submission WHERE id=(p_data->>'parentId')::uuid AND client_id=p_actor AND service_id=s.id;
   IF entry.id IS NULL THEN RAISE EXCEPTION 'Original intake not found.'; END IF;
  ELSIF EXISTS(SELECT 1 FROM care.intake_submission WHERE client_id=p_actor AND service_id=s.id AND parent_id IS NULL AND (appointment_id IS NULL OR appointment_id=a.id)) THEN RAISE EXCEPTION 'Preserve the original submission; add a dated update.'; END IF;
  INSERT INTO care.intake_submission(client_id,provider_id,service_id,appointment_id,answers,parent_id) VALUES(p_actor,s.provider_id,s.id,COALESCE(a.id,entry.appointment_id),p_data->'answers',entry.id) RETURNING id INTO v_id;
  INSERT INTO core.in_app_notification(user_id,kind,message,href,dedupe_key) VALUES(s.provider_id,'INTAKE','A client submitted intake or a dated update.','/pro/clients','intake-'||v_id);
  RETURN jsonb_build_object('id',v_id,'submittedAt',now());
 END IF;
 IF p_action='appointment_detail' THEN
  PERFORM ops.workflow_tick();
  SELECT * INTO a FROM care.appointment WHERE id=(p_data->>'id')::uuid AND (client_id=p_actor OR provider_id=p_actor);
  IF a.id IS NULL THEN RAISE EXCEPTION 'Appointment not found.' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('id',a.id,'serviceId',a.service_id,'service',a.service_snapshot->>'title','provider',(SELECT display_name FROM core.app_user WHERE id=a.provider_id),'client',(SELECT display_name FROM core.app_user WHERE id=a.client_id),'isClient',a.client_id=p_actor,'status',a.status,'paymentStatus',a.payment_status,'startsAt',a.starts_at,'endsAt',a.ends_at,'price',a.price_minor/100.0,'paidAt',a.paid_at,'expiresAt',a.hold_expires_at,'approvalDueAt',a.approval_due_at,'escalationAt',a.escalation_at,'policy',a.policy_snapshot,'proposedStartsAt',a.proposed_starts_at,'joinOpensAt',a.starts_at-interval '10 minutes','meetingUrl',CASE WHEN a.status IN ('CONFIRMED','IN_PROGRESS') AND now()>=a.starts_at-interval '10 minutes' THEN a.meeting_url END,'intakeComplete',EXISTS(SELECT 1 FROM care.intake_submission WHERE client_id=a.client_id AND service_id=a.service_id AND (appointment_id IS NULL OR appointment_id=a.id)),
   'timeline',COALESCE((SELECT jsonb_agg(jsonb_build_object('event',event_type,'at',occurred_at) ORDER BY occurred_at) FROM care.appointment_event WHERE appointment_id=a.id),'[]'),
   'cases',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'status',status,'dueAt',due_at)) FROM ops.workflow_case WHERE appointment_id=a.id),'[]'),
   'refund',(SELECT jsonb_build_object('id',rf.id,'amount',rf.amount_minor/100.0,'status',rf.status,'eligibility',rf.eligibility,'reason',rf.reason,'initiateBy',rf.initiate_by,'initiatedAt',rf.initiated_at,'completedOn',rf.completed_on) FROM finance.refund rf JOIN finance.payment_attempt p ON p.id=rf.payment_attempt_id WHERE p.appointment_id=a.id AND rf.reason NOT ILIKE 'Payment retained for client-approved replacement%' ORDER BY rf.created_at DESC LIMIT 1));
 END IF;
 IF p_action='meeting_ready' THEN
  UPDATE care.appointment SET meeting_url=p_data->>'url' WHERE id=(p_data->>'id')::uuid AND (client_id=p_actor OR provider_id=p_actor) AND status IN ('CONFIRMED','IN_PROGRESS') AND now()>=starts_at-interval '10 minutes' AND now()<=ends_at AND meeting_url IS NULL;
  RETURN '{"saved":true}';
 END IF;
 IF p_action='join' THEN
  SELECT * INTO a FROM care.appointment WHERE id=(p_data->>'id')::uuid AND (client_id=p_actor OR provider_id=p_actor) FOR UPDATE;
  IF a.id IS NULL OR a.status NOT IN ('CONFIRMED','IN_PROGRESS') OR now()<a.starts_at-interval '10 minutes' OR now()>a.ends_at THEN RAISE EXCEPTION 'Joining is available from ten minutes before the confirmed session.'; END IF;
  IF a.meeting_url IS NULL THEN RAISE EXCEPTION 'The meeting link is not ready. Contact Chatbud support.'; END IF;
  INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(a.id,p_actor,CASE WHEN a.client_id=p_actor THEN 'CLIENT_JOINED' ELSE 'PROFESSIONAL_JOINED' END);
  RETURN jsonb_build_object('url',a.meeting_url);
 END IF;
 IF p_action IN ('coordination','session_incident','reschedule_request') THEN
  SELECT * INTO a FROM care.appointment WHERE id=(p_data->>'id')::uuid AND (client_id=p_actor OR provider_id=p_actor) FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Appointment not found.' USING ERRCODE='42501'; END IF;
  IF p_action='reschedule_request' AND a.status<>'CONFIRMED' THEN RAISE EXCEPTION 'Only confirmed sessions can be rescheduled.'; END IF;
  v_id=ops.open_case(p_action||'-'||a.id||'-'||gen_random_uuid(),a.client_id,a.id,CASE WHEN p_action='reschedule_request' THEN 'RESCHEDULE' WHEN p_action='session_incident' THEN 'SESSION_REVIEW' ELSE 'COORDINATION' END,CASE WHEN p_action='reschedule_request' THEN CASE WHEN a.client_id=p_actor AND (a.starts_at-now()<interval '24 hours' OR a.client_reschedules>=1) THEN 'Reschedule: supervisor review required' ELSE 'Coordinate replacement; retain original until confirmed' END ELSE 'Booking support request' END,now()+interval '5 minutes',true);
  UPDATE ops.workflow_case SET requested_by=p_actor WHERE id=v_id;
  INSERT INTO ops.workflow_event(case_id,actor_id,event,detail) VALUES(v_id,p_actor,'Client or professional requested coordination',p_data->>'note');
  RETURN jsonb_build_object('id',v_id);
 END IF;
 IF p_action IN ('my_care','client_care') THEN
  v_id=CASE WHEN p_action='my_care' THEN p_actor ELSE (p_data->>'clientId')::uuid END;
  IF v_id IS NULL OR (v_id<>p_actor AND NOT EXISTS(SELECT 1 FROM care.appointment WHERE provider_id=p_actor AND client_id=v_id AND status IN ('CONFIRMED','IN_PROGRESS','COMPLETED','NO_SHOW'))) THEN RAISE EXCEPTION 'Assigned professional required.' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('appointments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ap.id,'service',ap.service_snapshot->>'title','startsAt',ap.starts_at)) FROM care.appointment ap WHERE ap.client_id=v_id AND ap.provider_id=p_actor AND ap.status IN ('CONFIRMED','IN_PROGRESS','COMPLETED','NO_SHOW')),'[]'),'intake',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'serviceId',i.service_id,'appointmentId',i.appointment_id,'providerId',i.provider_id,'answers',i.answers,'parentId',i.parent_id,'createdAt',i.created_at) ORDER BY i.created_at) FROM care.intake_submission i WHERE i.client_id=v_id AND (v_id=p_actor OR i.provider_id=p_actor)),'[]'),
   'plans',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'domain',p.domain,'providerId',p.provider_id,'versions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'title',v.title,'body',v.body,'tasks',v.tasks,'publishedAt',v.published_at,'current',p.current_version_id=v.id) ORDER BY v.version DESC) FROM care.plan_revision v WHERE v.plan_id=p.id AND (v.published_at IS NOT NULL OR p.provider_id=p_actor)),'[]'))) FROM care.plan_record p WHERE p.client_id=v_id AND (p.provider_id=p_actor OR p.current_version_id IS NOT NULL)),'[]'),
   'notes',CASE WHEN v_id=p_actor THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(to_jsonb(n)-'author_id') FROM care.private_note n WHERE author_id=p_actor AND client_id=v_id),'[]') END,
   'progress',COALESCE((SELECT jsonb_agg(to_jsonb(g)-'client_id' ORDER BY g.created_at DESC) FROM care.task_progress g JOIN care.plan_revision v ON v.id=g.revision_id JOIN care.plan_record p ON p.id=v.plan_id WHERE g.client_id=v_id AND (v_id=p_actor OR p.provider_id=p_actor)),'[]'),
   'reminders',CASE WHEN v_id=p_actor THEN COALESCE((SELECT jsonb_agg(to_jsonb(r)-'client_id') FROM care.reminder_preference r WHERE client_id=p_actor),'[]') ELSE '[]'::jsonb END);
 END IF;
 IF p_action='private_note' THEN
  SELECT * INTO a FROM care.appointment WHERE id=(p_data->>'appointmentId')::uuid AND provider_id=p_actor AND status IN ('CONFIRMED','IN_PROGRESS','COMPLETED','NO_SHOW');
  IF a.id IS NULL THEN RAISE EXCEPTION 'Assigned professional required.' USING ERRCODE='42501'; END IF;
  INSERT INTO care.private_note(author_id,client_id,appointment_id,body) VALUES(p_actor,a.client_id,a.id,p_data->>'body') RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id);
 END IF;
 IF p_action='plan_save' THEN
  IF NOT EXISTS(SELECT 1 FROM care.provider p JOIN care.provider_scope sc ON sc.provider_id=p.id JOIN care.profession pr ON pr.code=sc.profession_code WHERE p.id=p_actor AND p.status='APPROVED' AND sc.status='APPROVED' AND (sc.valid_until IS NULL OR sc.valid_until>now()) AND pr.domain=p_data->>'domain') THEN RAISE EXCEPTION 'Approved scope required.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM care.appointment WHERE provider_id=p_actor AND client_id=(p_data->>'clientId')::uuid AND status IN ('CONFIRMED','IN_PROGRESS','COMPLETED','NO_SHOW')) THEN RAISE EXCEPTION 'Assigned client required.' USING ERRCODE='42501'; END IF;
  IF p_data->>'id' IS NULL THEN INSERT INTO care.plan_record(provider_id,client_id,domain,title) VALUES(p_actor,(p_data->>'clientId')::uuid,p_data->>'domain',p_data->>'title') RETURNING * INTO plan;
  ELSE SELECT * INTO plan FROM care.plan_record WHERE id=(p_data->>'id')::uuid AND provider_id=p_actor AND client_id=(p_data->>'clientId')::uuid AND domain=p_data->>'domain' FOR UPDATE;IF plan.id IS NULL THEN RAISE EXCEPTION 'Plan not found.'; END IF; END IF;
  SELECT * INTO rev FROM care.plan_revision WHERE plan_id=plan.id AND published_at IS NULL ORDER BY version DESC LIMIT 1;
  v_tasks='[]';
  FOR item IN SELECT * FROM jsonb_array_elements(p_data->'tasks') LOOP
   -- A task retains its key only when every clinical definition field is unchanged.
   SELECT t INTO prior FROM care.plan_revision v CROSS JOIN LATERAL jsonb_array_elements(v.tasks)t WHERE v.id=plan.current_version_id AND t->>'id'=item->>'id';
   IF prior IS NULL OR (prior-'id') IS DISTINCT FROM (item-'id') THEN item=jsonb_set(item,'{id}',to_jsonb(gen_random_uuid()::text)); END IF;
   v_tasks=v_tasks||jsonb_build_array(item);prior=NULL;
  END LOOP;
  IF rev.id IS NULL THEN INSERT INTO care.plan_revision(plan_id,version,title,body,tasks) SELECT plan.id,COALESCE(max(version),0)+1,p_data->>'title',p_data->>'body',v_tasks FROM care.plan_revision WHERE plan_id=plan.id RETURNING id INTO v_id;
  ELSE UPDATE care.plan_revision SET title=p_data->>'title',body=p_data->>'body',tasks=v_tasks WHERE id=rev.id RETURNING id INTO v_id; END IF;
  RETURN jsonb_build_object('id',plan.id,'revisionId',v_id,'status','DRAFT');
 END IF;
 IF p_action='plan_publish' THEN
  SELECT p.* INTO plan FROM care.plan_record p JOIN care.plan_revision v ON v.plan_id=p.id WHERE v.id=(p_data->>'revisionId')::uuid AND p.provider_id=p_actor FOR UPDATE OF p;
  IF plan.id IS NULL THEN RAISE EXCEPTION 'Only the author can publish this plan.' USING ERRCODE='42501'; END IF;
  SELECT * INTO rev FROM care.plan_revision WHERE id=(p_data->>'revisionId')::uuid;
  IF rev.published_at IS NOT NULL THEN RETURN jsonb_build_object('id',rev.id,'status','PUBLISHED'); END IF;
  UPDATE care.plan_revision SET published_at=now() WHERE id=rev.id;
  UPDATE care.plan_record SET current_version_id=rev.id,title=rev.title WHERE id=plan.id;
  INSERT INTO core.in_app_notification(user_id,kind,message,href,dedupe_key) VALUES(plan.client_id,'CARE_PLAN','Your professional published a care-plan update.','/my-health','plan-'||rev.id);
  RETURN jsonb_build_object('id',rev.id,'status','PUBLISHED');
 END IF;
 IF p_action='progress_submit' THEN
  SELECT p.* INTO plan FROM care.plan_record p WHERE p.client_id=p_actor AND p.current_version_id=(p_data->>'revisionId')::uuid;
  SELECT * INTO rev FROM care.plan_revision WHERE id=plan.current_version_id;
  SELECT t INTO item FROM jsonb_array_elements(rev.tasks)t WHERE t->>'id'=p_data->>'taskId';
  IF item IS NULL THEN RAISE EXCEPTION 'This task is no longer current. Your earlier progress remains in history.'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(COALESCE(p_data->'measurements','{}'))k WHERE NOT COALESCE(item->'measurements','[]') ? k) THEN RAISE EXCEPTION 'Only professional-configured measurements may be submitted.'; END IF;
  INSERT INTO care.task_progress(client_id,revision_id,task_key,completed,note,measurements) VALUES(p_actor,rev.id,(p_data->>'taskId')::uuid,(p_data->>'completed')::boolean,COALESCE(p_data->>'note',''),COALESCE(p_data->'measurements','{}')) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'sharedWith','Assigned professional');
 END IF;
 IF p_action='reminder_save' THEN
  IF NOT EXISTS(SELECT 1 FROM care.plan_record p JOIN care.plan_revision v ON v.id=p.current_version_id CROSS JOIN LATERAL jsonb_array_elements(v.tasks)t WHERE p.client_id=p_actor AND t->>'id'=p_data->>'taskId') THEN RAISE EXCEPTION 'Current task required.'; END IF;
  INSERT INTO care.reminder_preference(client_id,task_key,muted,local_time) VALUES(p_actor,(p_data->>'taskId')::uuid,(p_data->>'muted')::boolean,(p_data->>'time')::time) ON CONFLICT(client_id,task_key) DO UPDATE SET muted=excluded.muted,local_time=excluded.local_time;
  RETURN '{"saved":true}';
 END IF;
 IF p_action='followup_create' THEN
  SELECT * INTO a FROM care.appointment WHERE id=(p_data->>'appointmentId')::uuid AND provider_id=p_actor;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Assigned professional required.' USING ERRCODE='42501'; END IF;
  v_id=ops.open_case('followup-'||a.id||'-'||(p_data->>'targetDate'),a.client_id,a.id,'FOLLOWUP','Help client book a follow-up',LEAST(now()+interval '24 hours',GREATEST(now(),((p_data->>'targetDate')::date AT TIME ZONE 'Asia/Kathmandu')-make_interval(mins=>COALESCE((a.policy_snapshot->>'minimumNoticeMinutes')::int,240)))),false);
  UPDATE ops.workflow_case SET target_date=(p_data->>'targetDate')::date WHERE id=v_id;
  RETURN jsonb_build_object('id',v_id);
 END IF;
 IF p_action IN ('cases_mine') THEN RETURN jsonb_build_object('cases',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'status',status,'kind',kind,'dueAt',due_at,'createdAt',created_at,'appointmentId',appointment_id,'orderId',order_id,'contactStopped',contact_stopped)) FROM ops.workflow_case WHERE client_id=p_actor),'[]')); END IF;
 IF p_action='contact_optout' THEN UPDATE ops.workflow_case SET contact_stopped=true,status='REVIEW',outcome='Client opted out' WHERE id=(p_data->>'id')::uuid AND client_id=p_actor AND kind='FOLLOWUP';RETURN '{"saved":true}'; END IF;
 -- Every remaining action requires its own trusted role, never a browser-provided role.
 IF p_action='staff_presence' THEN
  IF NOT roles && ARRAY['SUPPORT','FINANCE','VERIFICATION','SECURITY_ADMIN'] THEN RAISE EXCEPTION 'Team access required' USING ERRCODE='42501'; END IF;
  INSERT INTO ops.staff_presence VALUES(p_actor,CASE WHEN (p_data->>'available')::boolean THEN now()+interval '15 minutes' ELSE now() END) ON CONFLICT(user_id) DO UPDATE SET available_until=excluded.available_until;
  RETURN '{"saved":true}';
 END IF;
 IF p_action='queue' THEN
  IF NOT roles && ARRAY['SUPPORT','FINANCE','FULFILLMENT'] AND NOT is_super THEN RAISE EXCEPTION 'Operations role required' USING ERRCODE='42501'; END IF;
  PERFORM ops.workflow_tick();
  RETURN jsonb_build_object('isSupervisor',is_super,'isFinance','FINANCE'=ANY(roles),'cases',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'kind',c.kind,'status',c.status,'priority',c.priority,'ownerId',c.owner_id,'owner',(SELECT display_name FROM core.app_user WHERE id=c.owner_id),'dueAt',c.due_at,'escalatedAt',c.escalated_at,'attempts',c.attempts,'lastContactAt',c.last_contact_at,'nextContactAt',c.next_contact_at,'contactStopped',c.contact_stopped,'appointmentId',c.appointment_id,'orderId',c.order_id,'context',c.context,'client',(SELECT display_name FROM core.app_user WHERE id=c.client_id),'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('event',event,'detail',detail,'at',created_at) ORDER BY created_at) FROM ops.workflow_event WHERE case_id=c.id),'[]'),'refund',(SELECT jsonb_build_object('id',r.id,'amount',r.amount_minor/100.0,'eligibility',r.eligibility,'status',r.status,'initiateBy',r.initiate_by,'initiatedAt',r.initiated_at,'completedOn',r.completed_on,'reference',r.gateway_refund_reference,'reason',r.reason) FROM finance.refund r WHERE r.id=c.refund_id)) ORDER BY c.escalated_at NULLS LAST,CASE WHEN c.priority='URGENT' THEN 0 ELSE 1 END,c.due_at NULLS LAST,c.created_at) FROM ops.workflow_case c WHERE (c.status NOT IN ('RESOLVED','CLOSED') OR COALESCE((p_data->>'includeClosed')::boolean,false)) AND (c.kind<>'REFUND' AND ('SUPPORT'=ANY(roles) OR is_super OR c.kind='RETURN' AND 'FULFILLMENT'=ANY(roles)) OR c.kind='REFUND' AND ('FINANCE'=ANY(roles) OR is_super OR 'SUPPORT'=ANY(roles)))),'[]'));
 END IF;
 IF p_action='finance_update' THEN
  IF NOT 'FINANCE'=ANY(roles) THEN RAISE EXCEPTION 'Designated finance permission required' USING ERRCODE='42501'; END IF;
  SELECT * INTO refund_row FROM finance.refund WHERE id=(p_data->>'refundId')::uuid FOR UPDATE;
  IF refund_row.id IS NULL OR refund_row.eligibility<>'ELIGIBLE' OR refund_row.status<>'REQUESTED' THEN RAISE EXCEPTION 'An eligible unpaid refund is required.'; END IF;
  PERFORM 1 FROM finance.payment_attempt WHERE id=refund_row.payment_attempt_id AND status='SUCCEEDED' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A verified received payment is required.'; END IF;
  IF (SELECT COALESCE(sum(amount_minor),0) FROM finance.refund WHERE payment_attempt_id=refund_row.payment_attempt_id AND status='SUCCEEDED')+refund_row.amount_minor>(SELECT amount_minor FROM finance.payment_attempt WHERE id=refund_row.payment_attempt_id) THEN RAISE EXCEPTION 'Refund exceeds the remaining received balance.'; END IF;
  IF p_data->>'stage'='INITIATED' THEN UPDATE finance.refund SET initiated_at=COALESCE(initiated_at,now()),gateway_refund_reference=p_data->>'reference' WHERE id=refund_row.id;
  ELSE
   IF round((p_data->>'amount')::numeric*100)::bigint<>refund_row.amount_minor OR length(btrim(COALESCE(p_data->>'confirmation','')))<3 OR length(btrim(COALESCE(p_data->>'reference','')))<3 OR (p_data->>'completedOn')::date>(now() AT TIME ZONE 'Asia/Kathmandu')::date THEN RAISE EXCEPTION 'Amount, gateway reference, completion date and payout confirmation are required.'; END IF;
   UPDATE finance.refund SET status='SUCCEEDED',gateway_refund_reference=p_data->>'reference',payout_confirmation=p_data->>'confirmation',completed_on=(p_data->>'completedOn')::date,decided_at=now(),approved_by=p_actor,initiated_at=COALESCE(initiated_at,now()) WHERE id=refund_row.id;
   UPDATE care.appointment SET payment_status='REFUNDED' WHERE id=(SELECT appointment_id FROM finance.payment_attempt WHERE id=refund_row.payment_attempt_id);
   UPDATE shop.product_order SET payment_status='REFUNDED' WHERE id=(SELECT order_id FROM finance.payment_attempt WHERE id=refund_row.payment_attempt_id);
   UPDATE ops.workflow_case SET status='RESOLVED',updated_at=now() WHERE refund_id=refund_row.id;
  END IF;
  INSERT INTO ops.workflow_event(case_id,actor_id,event) SELECT id,p_actor,'Finance recorded '||(p_data->>'stage') FROM ops.workflow_case WHERE refund_id=refund_row.id;
  RETURN '{"saved":true}';
 END IF;
 IF p_action='refund_exception' THEN
  IF NOT is_super THEN RAISE EXCEPTION 'Authorized supervisor permission required' USING ERRCODE='42501'; END IF;
  SELECT * INTO refund_row FROM finance.refund WHERE id=(p_data->>'refundId')::uuid AND eligibility='REVIEW' AND status='REQUESTED' FOR UPDATE;
  IF refund_row.id IS NULL THEN RAISE EXCEPTION 'Refund is not awaiting exception review.'; END IF;
  IF (p_data->>'approve')::boolean THEN
   IF round((p_data->>'amount')::numeric*100)::bigint>refund_row.amount_minor OR (p_data->>'amount')::numeric<=0 THEN RAISE EXCEPTION 'Approved amount must be within the refundable balance.'; END IF;
   UPDATE finance.refund SET amount_minor=round((p_data->>'amount')::numeric*100)::bigint,eligibility='ELIGIBLE',eligible_at=now(),initiate_by=ops.next_refund_deadline(now()),exception_decided_by=p_actor WHERE id=refund_row.id;
   UPDATE ops.workflow_case SET due_at=ops.next_refund_deadline(now()) WHERE refund_id=refund_row.id;
  ELSE UPDATE finance.refund SET eligibility='DECLINED',exception_decided_by=p_actor WHERE id=refund_row.id; END IF;
  INSERT INTO ops.workflow_event(case_id,actor_id,event,detail) SELECT id,p_actor,'Supervisor exception decision',p_data->>'reason' FROM ops.workflow_case WHERE refund_id=refund_row.id;
  RETURN '{"saved":true}';
 END IF;
 IF p_action IN ('case_action','followup_contact','call_approval') THEN
  SELECT * INTO case_row FROM ops.workflow_case WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF case_row.id IS NULL OR (NOT 'SUPPORT'=ANY(roles) AND NOT is_super) THEN RAISE EXCEPTION 'Support permission required' USING ERRCODE='42501'; END IF;
  IF p_action='call_approval' THEN
   SELECT * INTO a FROM care.appointment WHERE id=case_row.appointment_id FOR UPDATE;
   IF case_row.kind<>'CONFIRMATION_CALL' OR a.status<>'HELD' OR a.payment_status<>'PAID' OR a.approval_due_at<=now() OR length(btrim(COALESCE(p_data->>'evidence','')))<10 OR NOT COALESCE((p_data->>'explicitApproval')::boolean,false) THEN RAISE EXCEPTION 'Explicit professional approval evidence and an active paid request are required.'; END IF;
   UPDATE care.appointment SET status='CONFIRMED' WHERE id=a.id;
   INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(a.id,p_actor,'CONFIRMED_ON_CALL');
   UPDATE ops.workflow_case SET status='RESOLVED',acted_at=now() WHERE id=case_row.id;
  ELSIF p_action='followup_contact' THEN
   IF case_row.kind<>'FOLLOWUP' OR case_row.contact_stopped OR case_row.attempts>=3 OR case_row.status IN ('RESOLVED','CLOSED') OR case_row.next_contact_at>now() OR case_row.last_contact_at+interval '24 hours'>now() THEN RAISE EXCEPTION 'Contact is paused, opted out, or retry is not yet due.'; END IF;
   UPDATE ops.workflow_case SET attempts=attempts+1,last_contact_at=now(),next_contact_at=now()+interval '24 hours',acted_at=now(),outcome=p_data->>'outcome',contact_stopped=(p_data->>'outcome') IN ('DECLINED','OPTED_OUT'),status=CASE WHEN p_data->>'outcome' IN ('BOOKED','DECLINED','OPTED_OUT') THEN 'RESOLVED' WHEN attempts+1>=3 THEN 'REVIEW' ELSE 'IN_PROGRESS' END WHERE id=case_row.id;
  ELSE
   IF case_row.kind='RETURN' AND p_data->>'status' IN ('RESOLVED','CLOSED') AND NOT is_super THEN RAISE EXCEPTION 'Returns close after inspection or authorized review.'; END IF;
   IF case_row.kind='REFUND' AND p_data->>'status' IN ('RESOLVED','CLOSED') THEN RAISE EXCEPTION 'Refund cases close through finance completion.'; END IF;
   UPDATE ops.workflow_case SET status=COALESCE(p_data->>'status','IN_PROGRESS'),acted_at=now(),updated_at=now(),owner_id=COALESCE(owner_id,p_actor) WHERE id=case_row.id;
  END IF;
  INSERT INTO ops.workflow_event(case_id,actor_id,event,detail) VALUES(case_row.id,p_actor,p_action,COALESCE(p_data->>'note',p_data->>'evidence',''));
  RETURN '{"saved":true}';
 END IF;
 RAISE EXCEPTION 'Unknown workflow action';
END $$;
REVOKE ALL ON FUNCTION public.chatbud_workflow(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chatbud_workflow(text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.chatbud_meet(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE v_appt care.appointment; v_intent text := p_data->>'intent'; v_team boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501';
 END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;
 SELECT EXISTS(SELECT 1 FROM core.role_assignment WHERE user_id=p_actor AND role IN ('SUPPORT','SECURITY_ADMIN')) INTO v_team;
 IF p_action IN ('status','test') THEN
  IF NOT v_team THEN RAISE EXCEPTION 'Support access required' USING ERRCODE='42501'; END IF;
  IF p_action='test' THEN
   -- Serialize test attempts for this account so concurrent requests cannot bypass the budget.
   PERFORM 1 FROM core.app_user WHERE id=p_actor FOR UPDATE;
   IF EXISTS(SELECT 1 FROM ops.audit_event WHERE actor_id=p_actor AND action='MEET_CONNECTION_TEST' AND occurred_at>now()-interval '1 minute') THEN
    RAISE EXCEPTION 'Wait one minute before testing Google Meet again.';
   END IF;
   INSERT INTO ops.audit_event(actor_id,action,target_type,purpose)
    VALUES(p_actor,'MEET_CONNECTION_TEST','google_integration','Verify Google Meet connection');
  END IF;
  RETURN jsonb_build_object('authorized',true);
 END IF;
 IF p_action<>'appointment' OR v_intent IS NULL OR v_intent NOT IN ('provider_confirm','client_reschedule','team_confirm','confirmed_participant') THEN
  RAISE EXCEPTION 'Unknown meeting action';
 END IF;
 SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found.'; END IF;
 IF v_intent='confirmed_participant' THEN
  IF p_actor NOT IN (v_appt.client_id,v_appt.provider_id) OR v_appt.status NOT IN ('CONFIRMED','IN_PROGRESS') OR now()<v_appt.starts_at-interval '10 minutes' OR now()>v_appt.ends_at THEN RAISE EXCEPTION 'Confirmed participant within join window required' USING ERRCODE='42501'; END IF;
 ELSIF v_intent='provider_confirm' THEN
  IF v_appt.provider_id<>p_actor OR NOT EXISTS(SELECT 1 FROM care.provider WHERE id=p_actor AND status='APPROVED') THEN
   RAISE EXCEPTION 'Professional access required' USING ERRCODE='42501';
  END IF;
 ELSIF v_intent='client_reschedule' THEN
  IF v_appt.client_id<>p_actor THEN RAISE EXCEPTION 'Client access required' USING ERRCODE='42501'; END IF;
  IF v_appt.proposed_starts_at IS NULL OR v_appt.proposed_starts_at<=now() THEN
   RAISE EXCEPTION 'There is no current proposed time to accept.';
  END IF;
 ELSE
  IF NOT v_team THEN RAISE EXCEPTION 'Support access required' USING ERRCODE='42501'; END IF;
  IF v_appt.status<>'HELD' OR v_appt.starts_at<=now() THEN
   RAISE EXCEPTION 'Only a pending request for a future time can be confirmed.';
  END IF;
 END IF;
 IF NOT (v_appt.status IN ('CONFIRMED','IN_PROGRESS') OR v_intent='client_reschedule' AND v_appt.status='CANCELLED' AND v_appt.cancelled_by=v_appt.provider_id AND EXISTS(SELECT 1 FROM ops.workflow_case WHERE dedupe_key='pro-cancel-reschedule-'||v_appt.id AND client_id=p_actor) OR (v_appt.status='HELD' AND v_appt.hold_expires_at>now())) THEN
  RAISE EXCEPTION 'This request has expired or was cancelled.';
 END IF;
 RETURN jsonb_build_object('meetingUrl',v_appt.meeting_url);
END;
$body$;

DO $$ DECLARE rf record;BEGIN FOR rf IN SELECT r.id,r.initiate_by,pa.appointment_id,COALESCE(a.client_id,o.user_id) AS client_id FROM finance.refund r JOIN finance.payment_attempt pa ON pa.id=r.payment_attempt_id LEFT JOIN care.appointment a ON a.id=pa.appointment_id LEFT JOIN shop.product_order o ON o.id=pa.order_id WHERE r.status='REQUESTED' LOOP PERFORM ops.open_case('refund-'||rf.id,rf.client_id,rf.appointment_id,'REFUND','Refund case',rf.initiate_by,false,rf.id);END LOOP;END $$;

CREATE FUNCTION ops.reminder_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task record; a care.appointment; day date:=(now() AT TIME ZONE 'Asia/Kathmandu')::date;
BEGIN
 PERFORM pg_advisory_xact_lock(805227);
 FOR task IN SELECT p.client_id,t->>'id' AS task_id,u.language_code FROM care.plan_record p JOIN care.plan_revision v ON v.id=p.current_version_id JOIN core.app_user u ON u.id=p.client_id CROSS JOIN LATERAL jsonb_array_elements(v.tasks)t LEFT JOIN care.reminder_preference pref ON pref.client_id=p.client_id AND pref.task_key=(t->>'id')::uuid
 WHERE NOT COALESCE(pref.muted,false) AND (now() AT TIME ZONE 'Asia/Kathmandu')::time>=COALESCE(pref.local_time,time '09:00') AND (t->>'schedule'='DAILY' OR t->'weekdays' @> jsonb_build_array(extract(dow FROM day)::int))
 AND NOT EXISTS(SELECT 1 FROM care.task_progress g WHERE g.client_id=p.client_id AND g.task_key=(t->>'id')::uuid AND (g.created_at AT TIME ZONE 'Asia/Kathmandu')::date=day AND g.completed)
 LOOP INSERT INTO core.in_app_notification(user_id,kind,message,href,language_code,dedupe_key) VALUES(task.client_id,'CARE_REMINDER',CASE task.language_code WHEN 'ne' THEN 'तपाईंको हेरचाह कार्य समीक्षा गर्ने समय भयो।' WHEN 'hi' THEN 'अपने देखभाल कार्य की समीक्षा करने का समय है।' ELSE 'You have a care task to review.' END,'/my-health',task.language_code,'task-'||task.client_id||'-'||task.task_id||'-'||day) ON CONFLICT(dedupe_key) DO NOTHING; END LOOP;
 FOR a IN SELECT * FROM care.appointment x WHERE status='CONFIRMED' AND starts_at>now() AND starts_at<=now()+interval '24 hours' AND policy_snapshot->>'intakeStage'='AFTER_CONFIRMATION' AND NOT EXISTS(SELECT 1 FROM care.intake_submission WHERE client_id=x.client_id AND service_id=x.service_id AND (appointment_id IS NULL OR appointment_id=x.id)) LOOP
  INSERT INTO core.in_app_notification(user_id,kind,message,href,dedupe_key) VALUES(a.client_id,'INTAKE_REMINDER','Please complete your appointment preparation.','/appointments/'||a.id,'intake-reminder-'||a.id),(a.provider_id,'INTAKE_STATUS','An upcoming client intake is incomplete. Decide whether to proceed or ask Chatbud to coordinate.','/appointments/'||a.id,'intake-warning-'||a.id) ON CONFLICT(dedupe_key) DO NOTHING;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION ops.reminder_tick() FROM PUBLIC,anon,authenticated;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_cron') THEN EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog'; EXECUTE $cron$SELECT cron.schedule('chatbud-locked-workflows','* * * * *','SELECT ops.workflow_tick(); SELECT ops.reminder_tick();')$cron$; END IF; END $$;
COMMIT;
