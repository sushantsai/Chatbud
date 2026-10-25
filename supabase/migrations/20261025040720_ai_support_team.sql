BEGIN;
CREATE SCHEMA assist;
REVOKE ALL ON SCHEMA assist FROM PUBLIC,anon,authenticated;
CREATE TABLE assist.conversation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES core.app_user(id),
 locale text NOT NULL CHECK(locale IN ('en','ne','hi')), channel text NOT NULL DEFAULT 'WEB' CHECK(channel IN ('WEB','VOICE','WHATSAPP','EMAIL','INSTAGRAM','FACEBOOK')),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','HUMAN_REQUESTED','CLOSED')),
 consent_version text NOT NULL, ticket_id uuid REFERENCES ops.support_ticket(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversation_owner ON assist.conversation(owner_id,updated_at DESC);
CREATE TABLE assist.run (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES assist.conversation(id),
 request_id uuid NOT NULL, status text NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','SUCCEEDED','FAILED')),
 request_text text NOT NULL CHECK(length(request_text) BETWEEN 1 AND 3000),
 response jsonb, tokens integer NOT NULL DEFAULT 0 CHECK(tokens>=0), created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(conversation_id,request_id)
);
CREATE INDEX run_conversation ON assist.run(conversation_id,created_at);
CREATE TABLE assist.message (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES assist.conversation(id),
 run_id uuid NOT NULL REFERENCES assist.run(id), role text NOT NULL CHECK(role IN ('user','assistant')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 12000), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,role)
);
CREATE INDEX message_conversation ON assist.message(conversation_id,created_at);
CREATE TABLE assist.action (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES assist.run(id),
 conversation_id uuid NOT NULL REFERENCES assist.conversation(id),
 kind text NOT NULL CHECK(kind IN ('BOOKING_REQUEST','CANCEL_APPOINTMENT','REQUEST_HUMAN','MESSAGE_DRAFT','LEAD_RESEARCH')),
 payload jsonb NOT NULL, summary text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','EXECUTED','REJECTED')),
 result jsonb, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes', decided_at timestamptz
);
CREATE INDEX action_conversation ON assist.action(conversation_id,created_at);
CREATE TABLE assist.communication_draft (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action_id uuid NOT NULL UNIQUE REFERENCES assist.action(id),
 created_by uuid NOT NULL REFERENCES core.app_user(id), recipient_id uuid REFERENCES core.app_user(id),
 audience text NOT NULL CHECK(audience IN ('support','professional','client')), appointment_id uuid REFERENCES care.appointment(id),
 body text NOT NULL CHECK(length(body) BETWEEN 10 AND 2000), status text NOT NULL DEFAULT 'DRAFT' CHECK(status='DRAFT'), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX communication_owner ON assist.communication_draft(created_by,created_at);
CREATE TABLE assist.research_job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action_id uuid NOT NULL UNIQUE REFERENCES assist.action(id),
 created_by uuid NOT NULL REFERENCES core.app_user(id), query text NOT NULL CHECK(length(query) BETWEEN 5 AND 500),
 platform text NOT NULL CHECK(platform IN ('public_web','instagram','facebook','linkedin')),
 status text NOT NULL DEFAULT 'WAITING_CONNECTOR' CHECK(status IN ('WAITING_CONNECTOR','READY','RUNNING','COMPLETED','FAILED','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_owner ON assist.research_job(created_by,created_at);
ALTER TABLE assist.conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE assist.run ENABLE ROW LEVEL SECURITY;
ALTER TABLE assist.message ENABLE ROW LEVEL SECURITY;
ALTER TABLE assist.action ENABLE ROW LEVEL SECURITY;
ALTER TABLE assist.communication_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE assist.research_job ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA assist FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.chatbud_assist(p_action text,p_actor uuid DEFAULT NULL,p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE
 v_con assist.conversation; v_run assist.run; v_action assist.action; v_appt care.appointment;
 v_roles text[]; v_id uuid; v_payload jsonb; v_result jsonb; v_summary text; v_recipient uuid; v_service care.service;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;
 SELECT COALESCE(array_agg(role),'{}') INTO v_roles FROM core.role_assignment WHERE user_id=p_actor;
 IF p_action='context' THEN
  RETURN jsonb_build_object('roles',v_roles,
   'appointments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'provider',p.display_name,'client',CASE WHEN a.provider_id=p_actor THEN c.display_name ELSE NULL END,
    'service',a.service_snapshot->>'title','startsAt',a.starts_at,'status',CASE WHEN a.status='HELD' AND a.hold_expires_at<=now() THEN 'EXPIRED' ELSE a.status END,'price',a.price_minor/100.0))
    FROM (SELECT * FROM care.appointment WHERE client_id=p_actor OR provider_id=p_actor ORDER BY starts_at DESC LIMIT 30) a
    JOIN core.app_user p ON p.id=a.provider_id JOIN core.app_user c ON c.id=a.client_id),'[]'::jsonb),
   'orders',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'reference',o.reference,'status',o.status,'paymentStatus',o.payment_status,
    'total',o.total_minor/100.0,'courier',o.courier,'tracking',o.tracking)) FROM (SELECT * FROM shop.product_order WHERE user_id=p_actor ORDER BY created_at DESC LIMIT 20) o),'[]'::jsonb));
 END IF;
 IF p_action='team_overview' THEN
  IF NOT v_roles && ARRAY['SUPPORT','SECURITY_ADMIN'] THEN RAISE EXCEPTION 'Support access required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('conversations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'status',c.status,'locale',c.locale,'channel',c.channel,'updatedAt',c.updated_at,'ticketId',c.ticket_id))
   FROM (SELECT * FROM assist.conversation ORDER BY updated_at DESC LIMIT 50) c),'[]'::jsonb),
   'research',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',j.id,'query',j.query,'platform',j.platform,'status',j.status,'createdAt',j.created_at))
   FROM (SELECT * FROM assist.research_job ORDER BY created_at DESC LIMIT 30) j),'[]'::jsonb),
   'counts',jsonb_build_object('conversations',(SELECT count(*) FROM assist.conversation),'handoffs',(SELECT count(*) FROM assist.conversation WHERE status='HUMAN_REQUESTED'),
    'pendingActions',(SELECT count(*) FROM assist.action WHERE status='PENDING' AND expires_at>now())));
 END IF;
 IF p_action='conversations' THEN
  RETURN jsonb_build_object('conversations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'locale',c.locale,'status',c.status,'updatedAt',c.updated_at,'ticketId',c.ticket_id))
   FROM (SELECT * FROM assist.conversation WHERE owner_id=p_actor ORDER BY updated_at DESC LIMIT 30) c),'[]'::jsonb));
 END IF;
 IF p_action='create' THEN
  IF p_data->>'consent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Conversation consent required'; END IF;
  IF (SELECT count(*) FROM assist.conversation WHERE owner_id=p_actor AND created_at>now()-interval '1 day')>=20 THEN RAISE EXCEPTION 'Daily conversation limit reached.'; END IF;
  INSERT INTO assist.conversation(owner_id,locale,consent_version) VALUES(p_actor,p_data->>'locale','ai-support-v1') RETURNING * INTO v_con;
  RETURN jsonb_build_object('id',v_con.id,'locale',v_con.locale,'status',v_con.status,'messages','[]'::jsonb,'actions','[]'::jsonb);
 END IF;
 IF p_action='decision' THEN
  SELECT a.* INTO v_action FROM assist.action a JOIN assist.conversation c ON c.id=a.conversation_id
   WHERE a.id=(p_data->>'actionId')::uuid AND c.owner_id=p_actor FOR UPDATE OF a;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action not found' USING ERRCODE='42501'; END IF;
  IF v_action.status<>'PENDING' THEN RETURN jsonb_build_object('id',v_action.id,'status',v_action.status,'result',v_action.result); END IF;
  IF v_action.expires_at<=now() THEN RAISE EXCEPTION 'This action has expired. Ask the assistant to prepare it again.'; END IF;
  SELECT * INTO v_con FROM assist.conversation WHERE id=v_action.conversation_id FOR UPDATE;
  IF v_con.status<>'OPEN' THEN RAISE EXCEPTION 'This conversation has been handed to support or closed.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM assist.run WHERE id=v_action.run_id AND status='SUCCEEDED') THEN RAISE EXCEPTION 'This response is not ready for confirmation.'; END IF;
  IF p_data->>'decision'='reject' THEN
   UPDATE assist.action SET status='REJECTED',decided_at=now() WHERE id=v_action.id;
   RETURN jsonb_build_object('id',v_action.id,'status','REJECTED');
  END IF;
  IF p_data->>'decision' IS DISTINCT FROM 'confirm' THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  v_payload=v_action.payload;
  CASE v_action.kind
  WHEN 'BOOKING_REQUEST' THEN
   v_result=public.chatbud_care('appointment_request',p_actor,jsonb_build_object('serviceId',v_payload->>'serviceId','startsAt',v_payload->>'startsAt','idempotencyKey',v_action.id));
  WHEN 'CANCEL_APPOINTMENT' THEN
   v_result=public.chatbud_care('appointment_cancel',p_actor,jsonb_build_object('id',v_payload->>'appointmentId'));
  WHEN 'REQUEST_HUMAN' THEN
   v_result=public.chatbud_ops('ticket_create',p_actor,jsonb_build_object('as',CASE WHEN EXISTS(SELECT 1 FROM care.provider WHERE id=p_actor) THEN 'PROFESSIONAL' ELSE 'CLIENT' END,
    'category','OTHER','subject','AI support handoff','body',v_payload->>'summary'));
   UPDATE assist.conversation SET status='HUMAN_REQUESTED',ticket_id=(v_result->>'id')::uuid,updated_at=now() WHERE id=v_con.id;
  WHEN 'MESSAGE_DRAFT' THEN
   v_recipient=NULL;
   IF NULLIF(v_payload->>'appointmentId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=(v_payload->>'appointmentId')::uuid AND (client_id=p_actor OR provider_id=p_actor)) THEN RAISE EXCEPTION 'Appointment not found' USING ERRCODE='42501'; END IF;
   IF v_payload->>'audience'<>'support' THEN
    SELECT * INTO v_appt FROM care.appointment WHERE id=(v_payload->>'appointmentId')::uuid AND (client_id=p_actor OR provider_id=p_actor);
    IF NOT FOUND OR (v_payload->>'audience'='professional' AND v_appt.client_id<>p_actor) OR (v_payload->>'audience'='client' AND v_appt.provider_id<>p_actor) THEN
     RAISE EXCEPTION 'This recipient is not linked to your appointment' USING ERRCODE='42501';
    END IF;
    v_recipient=CASE WHEN v_payload->>'audience'='client' THEN v_appt.client_id ELSE v_appt.provider_id END;
   END IF;
   INSERT INTO assist.communication_draft(action_id,created_by,recipient_id,audience,appointment_id,body)
   VALUES(v_action.id,p_actor,v_recipient,v_payload->>'audience',NULLIF(v_payload->>'appointmentId','')::uuid,v_payload->>'body') RETURNING id INTO v_id;
   v_result=jsonb_build_object('id',v_id,'status','DRAFT','delivery','NOT_SENT');
  WHEN 'LEAD_RESEARCH' THEN
   IF NOT v_roles && ARRAY['SUPPORT','SECURITY_ADMIN'] THEN RAISE EXCEPTION 'Support access required' USING ERRCODE='42501'; END IF;
   INSERT INTO assist.research_job(action_id,created_by,query,platform) VALUES(v_action.id,p_actor,v_payload->>'query',v_payload->>'platform') RETURNING id INTO v_id;
   v_result=jsonb_build_object('id',v_id,'status','WAITING_CONNECTOR','message','Search provider is not connected; no search or outreach has run.');
  ELSE RAISE EXCEPTION 'Unsupported action'; END CASE;
  UPDATE assist.action SET status='EXECUTED',result=v_result,decided_at=now() WHERE id=v_action.id;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
   VALUES(p_actor,'AI_ACTION_CONFIRMED','assistant_action',v_action.id,'User-confirmed support action',jsonb_build_object('kind',v_action.kind));
  RETURN jsonb_build_object('id',v_action.id,'status','EXECUTED','result',v_result);
 END IF;
 SELECT * INTO v_con FROM assist.conversation WHERE id=(p_data->>'conversationId')::uuid AND owner_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found' USING ERRCODE='42501'; END IF;
 IF p_action='conversation' THEN
  RETURN jsonb_build_object('id',v_con.id,'locale',v_con.locale,'status',v_con.status,'ticketId',v_con.ticket_id,
   'messages',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,'content',m.body,'runId',m.run_id) ORDER BY m.created_at,m.id)
    FROM assist.message m WHERE m.conversation_id=v_con.id),'[]'::jsonb),
   'actions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'summary',a.summary,'payload',a.payload,'status',CASE WHEN a.status='PENDING' AND a.expires_at<=now() THEN 'EXPIRED' ELSE a.status END,'result',a.result,'runId',a.run_id) ORDER BY a.created_at)
    FROM assist.action a WHERE a.conversation_id=v_con.id),'[]'::jsonb));
 END IF;
 IF p_action='begin_run' THEN
  SELECT * INTO v_run FROM assist.run WHERE conversation_id=v_con.id AND request_id=(p_data->>'requestId')::uuid;
  IF FOUND THEN
   IF v_run.request_text IS DISTINCT FROM p_data->>'text' THEN RAISE EXCEPTION 'Request key belongs to another message.'; END IF;
   RETURN jsonb_build_object('id',v_run.id,'status',v_run.status,'response',v_run.response,'replay',true);
  END IF;
  IF v_con.status<>'OPEN' THEN RAISE EXCEPTION 'This conversation is with human support or closed. Start a new chat if needed.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,17));
  IF (SELECT count(*) FROM assist.run r JOIN assist.conversation c ON c.id=r.conversation_id WHERE c.owner_id=p_actor AND r.created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'Hourly assistant limit reached. Contact support if needed.'; END IF;
  IF (SELECT COALESCE(sum(tokens),0) FROM assist.run r JOIN assist.conversation c ON c.id=r.conversation_id WHERE c.owner_id=p_actor AND r.created_at>now()-interval '1 day')>=100000 THEN RAISE EXCEPTION 'Daily assistant budget reached.'; END IF;
  UPDATE assist.run SET status='FAILED',completed_at=now() WHERE conversation_id=v_con.id AND status='RUNNING' AND created_at<now()-interval '90 seconds';
  IF EXISTS(SELECT 1 FROM assist.run WHERE conversation_id=v_con.id AND status='RUNNING') THEN RAISE EXCEPTION 'A reply is already being prepared. Please wait.'; END IF;
  INSERT INTO assist.run(conversation_id,request_id,request_text) VALUES(v_con.id,(p_data->>'requestId')::uuid,btrim(p_data->>'text')) RETURNING * INTO v_run;
  INSERT INTO assist.message(conversation_id,run_id,role,body) VALUES(v_con.id,v_run.id,'user',v_run.request_text);
  UPDATE assist.conversation SET updated_at=now() WHERE id=v_con.id;
  RETURN jsonb_build_object('id',v_run.id,'status','RUNNING','locale',v_con.locale);
 END IF;
 SELECT * INTO v_run FROM assist.run WHERE id=(p_data->>'runId')::uuid AND conversation_id=v_con.id FOR UPDATE;
 IF NOT FOUND OR v_run.status<>'RUNNING' THEN RAISE EXCEPTION 'Run is not active'; END IF;
 IF p_action='finish_run' THEN
  IF v_con.status<>'OPEN' THEN RAISE EXCEPTION 'Conversation is no longer active'; END IF;
  INSERT INTO assist.message(conversation_id,run_id,role,body) VALUES(v_con.id,v_run.id,'assistant',p_data->'response'->>'text');
  UPDATE assist.run SET status='SUCCEEDED',response=p_data->'response',tokens=GREATEST(0,COALESCE((p_data->'response'->>'tokens')::integer,0)),completed_at=now() WHERE id=v_run.id;
  RETURN p_data->'response';
 END IF;
 IF p_action='fail_run' THEN
  UPDATE assist.run SET status='FAILED',completed_at=now() WHERE id=v_run.id;
  UPDATE assist.action SET status='REJECTED',decided_at=now() WHERE run_id=v_run.id AND status='PENDING';
  RETURN jsonb_build_object('status','FAILED');
 END IF;
 IF p_action='propose' THEN
  IF (SELECT count(*) FROM assist.action WHERE run_id=v_run.id)>=5 THEN RAISE EXCEPTION 'Too many proposed actions'; END IF;
  v_payload=p_data->'payload';
  CASE p_data->>'kind'
  WHEN 'BOOKING_REQUEST' THEN
   SELECT s.* INTO v_service FROM care.service s JOIN care.provider p ON p.id=s.provider_id JOIN core.app_user u ON u.id=p.id
    JOIN care.provider_scope sc ON sc.provider_id=s.provider_id AND sc.profession_code=s.profession_code
    WHERE s.id=(v_payload->>'serviceId')::uuid AND s.active AND u.status='ACTIVE' AND p.status='APPROVED' AND sc.status='APPROVED' AND (sc.valid_until IS NULL OR sc.valid_until>now());
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM care.open_slots(v_service.id,((v_payload->>'startsAt')::timestamptz AT TIME ZONE 'Asia/Kathmandu')::date) o WHERE o.starts_at=(v_payload->>'startsAt')::timestamptz) THEN RAISE EXCEPTION 'That service or time is not available.'; END IF;
   v_summary='Request '||v_service.title||' on '||to_char((v_payload->>'startsAt')::timestamptz AT TIME ZONE 'Asia/Kathmandu','DD Mon YYYY, HH24:MI')||' NPT · NPR '||(v_service.price_minor/100.0)||'. Awaiting professional confirmation; no payment collected.';
  WHEN 'CANCEL_APPOINTMENT' THEN
   SELECT * INTO v_appt FROM care.appointment WHERE id=(v_payload->>'appointmentId')::uuid AND (client_id=p_actor OR provider_id=p_actor);
   IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found' USING ERRCODE='42501'; END IF;
   v_summary='Cancel your '||(v_appt.service_snapshot->>'title')||' appointment on '||to_char(v_appt.starts_at AT TIME ZONE 'Asia/Kathmandu','DD Mon YYYY, HH24:MI')||' NPT. Payment/refund rules remain separate.';
  WHEN 'REQUEST_HUMAN' THEN
   IF length(btrim(v_payload->>'summary')) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Invalid handoff summary'; END IF;
   v_summary='Create a Chatbud support ticket with this summary: '||(v_payload->>'summary');
  WHEN 'MESSAGE_DRAFT' THEN
   IF v_payload->>'audience' NOT IN ('support','professional','client') OR length(btrim(v_payload->>'body')) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Invalid draft'; END IF;
   IF v_payload->>'audience'<>'support' AND NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=(v_payload->>'appointmentId')::uuid AND
    ((v_payload->>'audience'='professional' AND client_id=p_actor) OR (v_payload->>'audience'='client' AND provider_id=p_actor))) THEN
    RAISE EXCEPTION 'Recipient is not linked to your appointment' USING ERRCODE='42501';
   END IF;
   IF NULLIF(v_payload->>'appointmentId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM care.appointment WHERE id=(v_payload->>'appointmentId')::uuid AND (client_id=p_actor OR provider_id=p_actor)) THEN RAISE EXCEPTION 'Appointment not found' USING ERRCODE='42501'; END IF;
   v_summary='Save a draft for '||(v_payload->>'audience')||'. This does not send a message.';
  WHEN 'LEAD_RESEARCH' THEN
   IF NOT v_roles && ARRAY['SUPPORT','SECURITY_ADMIN'] THEN RAISE EXCEPTION 'Support access required' USING ERRCODE='42501'; END IF;
   IF length(btrim(v_payload->>'query')) NOT BETWEEN 5 AND 500 OR v_payload->>'platform' NOT IN ('public_web','instagram','facebook','linkedin') THEN RAISE EXCEPTION 'Invalid research brief'; END IF;
   v_summary='Queue a public business/professional research brief. A search connector is required; no outreach is performed.';
  ELSE RAISE EXCEPTION 'Unsupported proposal'; END CASE;
  SELECT * INTO v_action FROM assist.action WHERE run_id=v_run.id AND kind=p_data->>'kind' AND payload=v_payload;
  IF FOUND THEN RETURN jsonb_build_object('id',v_action.id,'kind',v_action.kind,'payload',v_action.payload,'summary',v_action.summary,'status',v_action.status); END IF;
  INSERT INTO assist.action(run_id,conversation_id,kind,payload,summary) VALUES(v_run.id,v_con.id,p_data->>'kind',v_payload,v_summary)
   RETURNING * INTO v_action;
  RETURN jsonb_build_object('id',v_action.id,'kind',v_action.kind,'payload',v_action.payload,'summary',v_action.summary,'status',v_action.status);
 END IF;
 RAISE EXCEPTION 'Unsupported assistant operation';
END $body$;
REVOKE ALL ON FUNCTION public.chatbud_assist(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chatbud_assist(text,uuid,jsonb) TO service_role;
COMMIT;
