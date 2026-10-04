BEGIN;
-- Fitness professions, kept in their own domain so they are never presented as medical care.
ALTER TABLE care.profession ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'mental'
 CHECK (domain IN ('mental','nutrition','fitness'));
UPDATE care.profession SET domain='nutrition' WHERE code IN ('nutritionist','dietitian');
INSERT INTO care.profession(code,display_name,scope_policy_version,domain) VALUES
 ('personal_trainer','Personal trainer','pending-review-v1','fitness'),
 ('fitness_coach','Fitness coach','pending-review-v1','fitness'),
 ('yoga_instructor','Yoga instructor','pending-review-v1','fitness')
ON CONFLICT (code) DO NOTHING;

-- Unpaid appointment requests: the professional shares their own meeting link on confirmation.
ALTER TABLE care.appointment ADD COLUMN IF NOT EXISTS meeting_url text;
ALTER TABLE care.appointment ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS appointment_client_idempotency
 ON care.appointment(client_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Bookable start times for one service on one Nepal calendar day.
CREATE OR REPLACE FUNCTION care.open_slots(p_service uuid, p_day date)
RETURNS TABLE(starts_at timestamptz) LANGUAGE sql STABLE SET search_path=pg_catalog AS $slots$
 SELECT slot
 FROM care.service s
 JOIN care.provider p ON p.id=s.provider_id AND p.status='APPROVED'
 JOIN care.availability_rule r ON r.provider_id=s.provider_id
  AND r.weekday=extract(dow FROM p_day)::int
  AND r.valid_from<=p_day AND (r.valid_until IS NULL OR r.valid_until>=p_day)
 CROSS JOIN LATERAL generate_series(
  (p_day + r.local_start) AT TIME ZONE r.timezone,
  ((p_day + r.local_end) AT TIME ZONE r.timezone) - make_interval(mins => s.duration_minutes),
  make_interval(mins => s.duration_minutes + s.buffer_before_minutes + s.buffer_after_minutes)) AS slot
 WHERE s.id=p_service AND s.active
  AND slot >= now() + interval '2 hours' AND slot <= now() + interval '60 days'
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
REVOKE ALL ON FUNCTION care.open_slots(uuid,date) FROM PUBLIC,anon,authenticated;

-- Server-only RPC for review, practice setup and appointment requests. Same rules as chatbud_api.
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
  IF FOUND THEN RETURN jsonb_build_object('id',v_appt.id,'status',v_appt.status); END IF;
  SELECT * INTO v_service FROM care.service WHERE id=(p_data->>'serviceId')::uuid AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'This service is not available.'; END IF;
  IF v_service.provider_id=p_actor THEN RAISE EXCEPTION 'You cannot book your own service.'; END IF;
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
  RETURN jsonb_build_object('id',v_id,'status','HELD');
 END IF;

 IF p_action='appointments_mine' THEN
  RETURN jsonb_build_object('appointments',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('id',a.id,'provider',u.display_name,'service',a.service_snapshot->>'title',
    'startsAt',a.starts_at,'endsAt',a.ends_at,
    'status',CASE WHEN a.status='HELD' AND a.hold_expires_at<=now() THEN 'EXPIRED' ELSE a.status END,
    'price',a.price_minor/100.0,
    'meetingUrl',CASE WHEN a.status IN ('CONFIRMED','IN_PROGRESS') THEN a.meeting_url END) ORDER BY a.starts_at DESC)
   FROM care.appointment a JOIN core.app_user u ON u.id=a.provider_id WHERE a.client_id=p_actor),'[]'::jsonb));
 END IF;

 IF p_action='appointment_cancel' THEN
  SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'id')::uuid AND (client_id=p_actor OR provider_id=p_actor) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found.'; END IF;
  IF v_appt.status NOT IN ('HELD','CONFIRMED') OR v_appt.starts_at<=now() THEN RAISE EXCEPTION 'This appointment can no longer be cancelled.'; END IF;
  UPDATE care.appointment SET status='CANCELLED',revision=revision+1 WHERE id=v_appt.id;
  INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(v_appt.id,p_actor,'CANCELLED');
  RETURN jsonb_build_object('id',v_appt.id,'status','CANCELLED');
 END IF;

 -- Professionals ------------------------------------------------------------
 IF p_action='provider_workspace' THEN
  SELECT * INTO v_provider FROM care.provider WHERE id=p_actor;
  IF NOT FOUND THEN RETURN jsonb_build_object('status',NULL); END IF;
  SELECT * INTO v_case FROM care.verification_case WHERE provider_id=p_actor ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('status',v_provider.status,'caseStatus',v_case.status,
   'rationale',CASE WHEN v_case.status IN ('NEEDS_INFORMATION','REJECTED') THEN v_case.rationale END,
   'professions',COALESCE((SELECT jsonb_agg(profession_code) FROM care.provider_scope WHERE provider_id=p_actor AND status='APPROVED'),'[]'::jsonb),
   'services',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'profession',s.profession_code,'title',s.title,
     'durationMinutes',s.duration_minutes,'price',s.price_minor/100.0,'active',s.active) ORDER BY s.title)
    FROM care.service s WHERE s.provider_id=p_actor),'[]'::jsonb),
   'availability',COALESCE((SELECT jsonb_agg(jsonb_build_object('weekday',r.weekday,'start',to_char(r.local_start,'HH24:MI'),
     'end',to_char(r.local_end,'HH24:MI')) ORDER BY r.weekday,r.local_start)
    FROM care.availability_rule r WHERE r.provider_id=p_actor AND (r.valid_until IS NULL OR r.valid_until>=current_date)),'[]'::jsonb),
   'appointments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'client',u.display_name,'service',a.service_snapshot->>'title',
     'startsAt',a.starts_at,'status',CASE WHEN a.status='HELD' AND a.hold_expires_at<=now() THEN 'EXPIRED' ELSE a.status END,
     'meetingUrl',a.meeting_url) ORDER BY a.starts_at)
    FROM care.appointment a JOIN core.app_user u ON u.id=a.client_id
    WHERE a.provider_id=p_actor AND a.starts_at>now()-interval '1 day'),'[]'::jsonb));
 END IF;

 IF p_action IN ('provider_service_save','provider_availability_save','provider_appointment_decide') THEN
  IF NOT EXISTS(SELECT 1 FROM care.provider WHERE id=p_actor AND status='APPROVED') THEN
   RAISE EXCEPTION 'An approved professional profile is required' USING ERRCODE='42501';
  END IF;

  IF p_action='provider_service_save' THEN
   IF NOT EXISTS(SELECT 1 FROM care.provider_scope WHERE provider_id=p_actor AND profession_code=p_data->>'profession' AND status='APPROVED') THEN
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

  IF p_action='provider_appointment_decide' THEN
   SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'id')::uuid AND provider_id=p_actor FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found.'; END IF;
   v_decision=p_data->>'decision';
   IF v_decision='CONFIRM' THEN
    IF NOT (v_appt.status='CONFIRMED' OR (v_appt.status='HELD' AND v_appt.hold_expires_at>now())) THEN
     RAISE EXCEPTION 'This request has expired or was cancelled.';
    END IF;
    UPDATE care.appointment SET status='CONFIRMED',meeting_url=p_data->>'meetingUrl',revision=revision+1 WHERE id=v_appt.id;
    INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(v_appt.id,p_actor,'CONFIRMED');
    RETURN jsonb_build_object('id',v_appt.id,'status','CONFIRMED');
   END IF;
   IF v_appt.status<>'HELD' THEN RAISE EXCEPTION 'Only a pending request can be declined.'; END IF;
   UPDATE care.appointment SET status='CANCELLED',revision=revision+1 WHERE id=v_appt.id;
   INSERT INTO care.appointment_event(appointment_id,actor_id,event_type) VALUES(v_appt.id,p_actor,'DECLINED');
   RETURN jsonb_build_object('id',v_appt.id,'status','CANCELLED');
  END IF;
 END IF;

 -- Reviewers ----------------------------------------------------------------
 IF p_action IN ('admin_queue','admin_review','admin_document') THEN
  IF NOT EXISTS(SELECT 1 FROM core.role_assignment WHERE user_id=p_actor AND role IN ('VERIFICATION','CLINICAL_REVIEW')) THEN
   RAISE EXCEPTION 'Reviewer access required' USING ERRCODE='42501';
  END IF;

  IF p_action='admin_queue' THEN
   RETURN jsonb_build_object(
    'applications',COALESCE((
     SELECT jsonb_agg(jsonb_build_object('id',c.id,'providerId',c.provider_id,'name',u.display_name,'email',u.email,
       'status',c.status,'submittedAt',c.submitted_at,'bio',p.biography,'rationale',c.rationale,
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
  UPDATE care.verification_case SET status=v_decision,reviewer_id=p_actor,rationale=NULLIF(v_text,''),
   decided_at=CASE WHEN v_decision='NEEDS_INFORMATION' THEN NULL ELSE now() END WHERE id=v_case.id;
  IF v_decision='APPROVED' THEN
   UPDATE care.provider_scope SET status='APPROVED',reviewed_by=p_actor,approved_at=now()
   WHERE provider_id=v_case.provider_id AND status='PENDING'
    AND profession_code=COALESCE(v_case.application->>'profession',profession_code);
   UPDATE care.provider SET status='APPROVED',revision=revision+1,
    languages=COALESCE((SELECT array_agg(CASE l WHEN 'English' THEN 'en' WHEN 'Nepali' THEN 'ne' ELSE l END)
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
REVOKE ALL ON FUNCTION public.chatbud_care(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chatbud_care(text,uuid,jsonb) TO service_role;
COMMIT;
