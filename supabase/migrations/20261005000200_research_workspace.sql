BEGIN;
-- Field research: studies, consent, participants under study codes, assessments and referrals.
-- Names and phone numbers live in their own table; everything else carries only the study code.
CREATE SCHEMA IF NOT EXISTS research;
REVOKE ALL ON SCHEMA research FROM PUBLIC, anon, authenticated;

ALTER TABLE core.role_assignment DROP CONSTRAINT IF EXISTS role_assignment_role_check;
ALTER TABLE core.role_assignment ADD CONSTRAINT role_assignment_role_check
 CHECK (role IN ('CONSUMER','PROVIDER','VERIFICATION','CLINICAL_REVIEW','SUPPORT','FINANCE','CATALOG','FULFILLMENT','CONTENT','SECURITY_ADMIN','RESEARCH_LEAD'));

CREATE TABLE IF NOT EXISTS research.study (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z]{2,6}$'),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160),
 summary text NOT NULL DEFAULT '' CHECK(length(summary)<=2000),
 partner text NOT NULL DEFAULT '' CHECK(length(partner)<=160),
 ethics_reference text NOT NULL DEFAULT '' CHECK(length(ethics_reference)<=120), ethics_approved_on date,
 instruments text[] NOT NULL DEFAULT '{}',
 consent_text text NOT NULL DEFAULT '' CHECK(length(consent_text)<=6000), consent_version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','CLOSED')),
 next_participant integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES core.app_user(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 -- A study cannot collect data without an ethics approval and consent wording on record.
 CHECK(status='DRAFT' OR (length(btrim(ethics_reference))>=3 AND ethics_approved_on IS NOT NULL AND length(btrim(consent_text))>=50))
);
CREATE TABLE IF NOT EXISTS research.study_member (
 study_id uuid NOT NULL REFERENCES research.study(id), user_id uuid NOT NULL REFERENCES core.app_user(id),
 role text NOT NULL CHECK(role IN ('LEAD','CLINICIAN','HEALTH_WORKER')),
 added_by uuid REFERENCES core.app_user(id), added_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(study_id,user_id)
);
CREATE TABLE IF NOT EXISTS research.participant (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), study_id uuid NOT NULL REFERENCES research.study(id),
 code text NOT NULL, sex text NOT NULL CHECK(sex IN ('FEMALE','MALE','OTHER','UNDISCLOSED')),
 birth_year integer NOT NULL CHECK(birth_year BETWEEN 1900 AND 2100), district text NOT NULL CHECK(length(btrim(district)) BETWEEN 2 AND 80),
 enrolled_by uuid NOT NULL REFERENCES core.app_user(id), enrolled_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(study_id,code)
);
-- The only place a participant's name and phone are kept. Removed when consent is withdrawn.
CREATE TABLE IF NOT EXISTS research.participant_identity (
 participant_id uuid PRIMARY KEY REFERENCES research.participant(id) ON DELETE CASCADE,
 full_name text NOT NULL CHECK(length(btrim(full_name)) BETWEEN 2 AND 120),
 phone text NOT NULL DEFAULT '' CHECK(length(phone)<=30), locality text NOT NULL DEFAULT '' CHECK(length(locality)<=160)
);
CREATE TABLE IF NOT EXISTS research.consent (
 participant_id uuid PRIMARY KEY REFERENCES research.participant(id),
 consent_version integer NOT NULL, consent_text text NOT NULL,
 recording boolean NOT NULL, future_use boolean NOT NULL,
 method text NOT NULL CHECK(method IN ('SIGNED','THUMBPRINT','VERBAL_WITNESSED')), witness_name text NOT NULL DEFAULT '',
 given_at timestamptz NOT NULL DEFAULT now(), recorded_by uuid NOT NULL REFERENCES core.app_user(id),
 withdrawn_at timestamptz, withdrawn_by uuid REFERENCES core.app_user(id),
 -- A thumbprint or spoken consent needs a witness.
 CHECK(method='SIGNED' OR length(btrim(witness_name))>=3)
);
CREATE TABLE IF NOT EXISTS research.assessment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), participant_id uuid NOT NULL REFERENCES research.participant(id),
 instrument text NOT NULL, answers jsonb NOT NULL, score numeric NOT NULL, severity text NOT NULL,
 flags text[] NOT NULL DEFAULT '{}', notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 assessed_by uuid NOT NULL REFERENCES core.app_user(id), assessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessment_participant ON research.assessment(participant_id,assessed_at DESC);
CREATE TABLE IF NOT EXISTS research.referral (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), participant_id uuid NOT NULL REFERENCES research.participant(id),
 assessment_id uuid REFERENCES research.assessment(id),
 profession text NOT NULL REFERENCES care.profession(code), urgency text NOT NULL CHECK(urgency IN ('ROUTINE','SOON','URGENT')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=2000), treatment text NOT NULL DEFAULT '' CHECK(length(treatment)<=2000),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CONTACTED','BOOKED','CLOSED')),
 created_by uuid NOT NULL REFERENCES core.app_user(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_participant ON research.referral(participant_id,created_at DESC);

ALTER TABLE research.study ENABLE ROW LEVEL SECURITY;
ALTER TABLE research.study_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE research.participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE research.participant_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE research.consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE research.assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE research.referral ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA research FROM PUBLIC, anon, authenticated;
-- Intentionally no RLS policies; access is through the server-only gateway below.

CREATE OR REPLACE FUNCTION public.chatbud_research(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE v_roles text[]; v_study research.study%ROWTYPE; v_member text; v_part research.participant%ROWTYPE;
 v_id uuid; v_target uuid; v_code text; v_n integer; v_status text; v_text text;
 v_year integer := extract(year FROM now() AT TIME ZONE 'Asia/Kathmandu')::int;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;
 SELECT COALESCE(array_agg(role),'{}') INTO v_roles FROM core.role_assignment WHERE user_id=p_actor;

 -- Administrators decide who may set up studies.
 IF p_action='lead_set' THEN
  IF NOT 'SECURITY_ADMIN'=ANY(v_roles) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_target FROM core.app_user WHERE lower(email)=lower(btrim(p_data->>'email')) AND status='ACTIVE';
  IF v_target IS NULL THEN RAISE EXCEPTION 'No Chatbud account uses that email. The person must sign in once first.'; END IF;
  IF (p_data->>'grant')::boolean THEN
   INSERT INTO core.role_assignment(user_id,role,granted_by) VALUES(v_target,'RESEARCH_LEAD',p_actor) ON CONFLICT DO NOTHING;
  ELSE
   DELETE FROM core.role_assignment WHERE user_id=v_target AND role='RESEARCH_LEAD';
  END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose)
  VALUES(p_actor,CASE WHEN (p_data->>'grant')::boolean THEN 'RESEARCH_LEAD_GRANTED' ELSE 'RESEARCH_LEAD_REMOVED' END,'app_user',v_target,'Research administration');
  RETURN jsonb_build_object('id',v_target);
 END IF;

 IF p_action='workspace' THEN
  RETURN jsonb_build_object(
   'canCreate','RESEARCH_LEAD'=ANY(v_roles),
   'isAdmin','SECURITY_ADMIN'=ANY(v_roles),
   'leads',CASE WHEN 'SECURITY_ADMIN'=ANY(v_roles) THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('name',u.display_name,'email',u.email) ORDER BY u.display_name)
     FROM core.app_user u JOIN core.role_assignment r ON r.user_id=u.id AND r.role='RESEARCH_LEAD'),'[]'::jsonb) ELSE '[]'::jsonb END,
   'studies',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'title',s.title,'status',s.status,'partner',s.partner,'role',m.role,
      'participants',(SELECT count(*) FROM research.participant p WHERE p.study_id=s.id),
      'openReferrals',(SELECT count(*) FROM research.referral r JOIN research.participant p ON p.id=r.participant_id WHERE p.study_id=s.id AND r.status<>'CLOSED'))
      ORDER BY s.created_at DESC)
     FROM research.study s JOIN research.study_member m ON m.study_id=s.id AND m.user_id=p_actor),'[]'::jsonb));
 END IF;

 IF p_action='study_save' AND p_data->>'id' IS NULL THEN
  IF NOT 'RESEARCH_LEAD'=ANY(v_roles) THEN RAISE EXCEPTION 'Only a research lead can set up a study' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM research.study WHERE code=upper(p_data->>'code')) THEN RAISE EXCEPTION 'Another study already uses that short code.'; END IF;
  INSERT INTO research.study(code,title,created_by) VALUES(upper(p_data->>'code'),btrim(p_data->>'title'),p_actor) RETURNING id INTO v_id;
  INSERT INTO research.study_member(study_id,user_id,role,added_by) VALUES(v_id,p_actor,'LEAD',p_actor);
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'RESEARCH_STUDY_CREATED','study',v_id,'Research administration');
  RETURN jsonb_build_object('id',v_id);
 END IF;

 -- Everything below happens inside one study, and only for its members.
 IF p_data->>'participantId' IS NOT NULL THEN
  SELECT * INTO v_part FROM research.participant WHERE id=(p_data->>'participantId')::uuid;
  SELECT * INTO v_study FROM research.study WHERE id=v_part.study_id;
 ELSE
  SELECT * INTO v_study FROM research.study WHERE id=COALESCE(p_data->>'studyId',p_data->>'id')::uuid;
 END IF;
 SELECT role INTO v_member FROM research.study_member WHERE study_id=v_study.id AND user_id=p_actor;
 IF v_member IS NULL THEN RAISE EXCEPTION 'You are not part of this study' USING ERRCODE='42501'; END IF;
 IF p_action IN ('study_save','member_set','export') AND v_member<>'LEAD' THEN
  RAISE EXCEPTION 'Only the study lead can do this' USING ERRCODE='42501';
 END IF;

 IF p_action='study_save' THEN
  v_status=p_data->>'status';
  IF v_status<>'DRAFT' AND (length(btrim(p_data->>'ethicsReference'))<3 OR NULLIF(p_data->>'ethicsApprovedOn','') IS NULL OR length(btrim(p_data->>'consentText'))<50) THEN
   RAISE EXCEPTION 'Add the ethics approval reference, its date and the consent wording before opening the study.';
  END IF;
  IF v_status<>'DRAFT' AND jsonb_array_length(p_data->'instruments')=0 THEN RAISE EXCEPTION 'Choose at least one assessment for the study.'; END IF;
  UPDATE research.study SET title=btrim(p_data->>'title'),summary=p_data->>'summary',partner=btrim(p_data->>'partner'),
   ethics_reference=btrim(p_data->>'ethicsReference'),ethics_approved_on=NULLIF(p_data->>'ethicsApprovedOn','')::date,
   instruments=ARRAY(SELECT jsonb_array_elements_text(p_data->'instruments')),
   consent_version=consent_version+CASE WHEN consent_text<>p_data->>'consentText' AND consent_text<>'' THEN 1 ELSE 0 END,
   consent_text=p_data->>'consentText',status=v_status,updated_at=now()
  WHERE id=v_study.id;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,'RESEARCH_STUDY_SAVED','study',v_study.id,'Research administration',jsonb_build_object('status',v_status));
  RETURN jsonb_build_object('id',v_study.id);
 END IF;

 IF p_action='member_set' THEN
  SELECT id INTO v_target FROM core.app_user WHERE lower(email)=lower(btrim(p_data->>'email')) AND status='ACTIVE';
  IF v_target IS NULL THEN RAISE EXCEPTION 'No Chatbud account uses that email. The person must sign in once first.'; END IF;
  IF (p_data->>'grant')::boolean THEN
   INSERT INTO research.study_member(study_id,user_id,role,added_by) VALUES(v_study.id,v_target,p_data->>'role',p_actor)
   ON CONFLICT (study_id,user_id) DO UPDATE SET role=EXCLUDED.role;
  ELSE
   IF v_target=p_actor THEN RAISE EXCEPTION 'You cannot remove yourself from your own study.'; END IF;
   DELETE FROM research.study_member WHERE study_id=v_study.id AND user_id=v_target;
  END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose,redacted_metadata)
  VALUES(p_actor,'RESEARCH_MEMBER_SET','study',v_study.id,'Research administration',jsonb_build_object('member',v_target,'role',p_data->>'role','grant',p_data->'grant'));
  RETURN jsonb_build_object('id',v_target);
 END IF;

 IF p_action='study_view' THEN
  RETURN jsonb_build_object('role',v_member,
   'study',jsonb_build_object('id',v_study.id,'code',v_study.code,'title',v_study.title,'summary',v_study.summary,'partner',v_study.partner,
     'ethicsReference',v_study.ethics_reference,'ethicsApprovedOn',v_study.ethics_approved_on,'instruments',to_jsonb(v_study.instruments),
     'consentText',v_study.consent_text,'consentVersion',v_study.consent_version,'status',v_study.status),
   'members',CASE WHEN v_member='LEAD' THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('name',u.display_name,'email',u.email,'role',m.role,'me',u.id=p_actor) ORDER BY u.display_name)
     FROM research.study_member m JOIN core.app_user u ON u.id=m.user_id WHERE m.study_id=v_study.id),'[]'::jsonb) ELSE '[]'::jsonb END,
   'participants',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'sex',p.sex,'birthYear',p.birth_year,'district',p.district,
      'enrolledAt',p.enrolled_at,'withdrawn',c.withdrawn_at IS NOT NULL,
      'last',(SELECT jsonb_build_object('instrument',a.instrument,'score',a.score,'severity',a.severity,'flags',to_jsonb(a.flags),'at',a.assessed_at)
        FROM research.assessment a WHERE a.participant_id=p.id ORDER BY a.assessed_at DESC LIMIT 1),
      'openReferrals',(SELECT count(*) FROM research.referral r WHERE r.participant_id=p.id AND r.status<>'CLOSED')) ORDER BY p.code DESC)
     FROM research.participant p JOIN research.consent c ON c.participant_id=p.id WHERE p.study_id=v_study.id),'[]'::jsonb));
 END IF;

 IF p_action='participant_enroll' THEN
  IF v_study.status<>'ACTIVE' THEN RAISE EXCEPTION 'This study is not open for enrolment.'; END IF;
  IF NOT (p_data->'consent'->>'participation')::boolean THEN RAISE EXCEPTION 'A person can be enrolled only after they agree to take part.'; END IF;
  IF (p_data->>'birthYear')::int>v_year-18 THEN RAISE EXCEPTION 'Participants must be 18 or older. Studies with children need guardian consent, which is not supported yet.'; END IF;
  UPDATE research.study SET next_participant=next_participant+1 WHERE id=v_study.id RETURNING next_participant-1 INTO v_n;
  v_code=v_study.code||'-'||lpad(v_n::text,4,'0');
  INSERT INTO research.participant(study_id,code,sex,birth_year,district,enrolled_by)
  VALUES(v_study.id,v_code,p_data->>'sex',(p_data->>'birthYear')::int,btrim(p_data->>'district'),p_actor) RETURNING id INTO v_id;
  INSERT INTO research.participant_identity(participant_id,full_name,phone,locality)
  VALUES(v_id,btrim(p_data->'identity'->>'fullName'),btrim(COALESCE(p_data->'identity'->>'phone','')),btrim(COALESCE(p_data->'identity'->>'locality','')));
  INSERT INTO research.consent(participant_id,consent_version,consent_text,recording,future_use,method,witness_name,recorded_by)
  VALUES(v_id,v_study.consent_version,v_study.consent_text,(p_data->'consent'->>'recording')::boolean,(p_data->'consent'->>'futureUse')::boolean,
   p_data->'consent'->>'method',btrim(COALESCE(p_data->'consent'->>'witness','')),p_actor);
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'RESEARCH_PARTICIPANT_ENROLLED','participant',v_id,'Research data collection');
  RETURN jsonb_build_object('id',v_id,'code',v_code);
 END IF;

 IF p_action='export' THEN
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'RESEARCH_EXPORT','study',v_study.id,'Research analysis');
  -- No names, phones or free-text notes. People who withdrew are left out.
  RETURN jsonb_build_object('study',v_study.code,'rows',COALESCE((SELECT jsonb_agg(jsonb_build_object('code',p.code,'sex',p.sex,'birthYear',p.birth_year,
     'district',p.district,'futureUse',c.future_use,'instrument',a.instrument,'score',a.score,'severity',a.severity,'flags',to_jsonb(a.flags),
     'answers',a.answers,'assessedOn',(a.assessed_at AT TIME ZONE 'Asia/Kathmandu')::date) ORDER BY p.code,a.assessed_at)
    FROM research.participant p JOIN research.consent c ON c.participant_id=p.id AND c.withdrawn_at IS NULL
    JOIN research.assessment a ON a.participant_id=p.id WHERE p.study_id=v_study.id),'[]'::jsonb));
 END IF;

 -- Participant-level actions
 IF v_part.id IS NULL THEN RAISE EXCEPTION 'Participant not found.'; END IF;

 IF p_action='participant_view' THEN
  RETURN jsonb_build_object('role',v_member,
   'study',jsonb_build_object('id',v_study.id,'code',v_study.code,'title',v_study.title,'status',v_study.status,'instruments',to_jsonb(v_study.instruments)),
   'participant',jsonb_build_object('id',v_part.id,'code',v_part.code,'sex',v_part.sex,'birthYear',v_part.birth_year,'district',v_part.district,
     'enrolledAt',v_part.enrolled_at,'canSeeIdentity',v_member='LEAD' OR v_part.enrolled_by=p_actor),
   'consent',(SELECT jsonb_build_object('version',c.consent_version,'recording',c.recording,'futureUse',c.future_use,'method',c.method,
     'witness',c.witness_name,'givenAt',c.given_at,'withdrawnAt',c.withdrawn_at) FROM research.consent c WHERE c.participant_id=v_part.id),
   'assessments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'instrument',a.instrument,'score',a.score,'severity',a.severity,
      'flags',to_jsonb(a.flags),'notes',a.notes,'by',u.display_name,'at',a.assessed_at) ORDER BY a.assessed_at DESC)
     FROM research.assessment a JOIN core.app_user u ON u.id=a.assessed_by WHERE a.participant_id=v_part.id),'[]'::jsonb),
   'referrals',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'profession',r.profession,'urgency',r.urgency,'note',r.note,
      'treatment',r.treatment,'status',r.status,'by',u.display_name,'at',r.created_at) ORDER BY r.created_at DESC)
     FROM research.referral r JOIN core.app_user u ON u.id=r.created_by WHERE r.participant_id=v_part.id),'[]'::jsonb));
 END IF;

 -- Contact details are shown only on request, to the lead or the person who enrolled, and every view is recorded.
 IF p_action='participant_identity' THEN
  IF NOT (v_member='LEAD' OR v_part.enrolled_by=p_actor) THEN RAISE EXCEPTION 'Only the study lead or the person who enrolled this participant can see contact details' USING ERRCODE='42501'; END IF;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'RESEARCH_IDENTITY_VIEWED','participant',v_part.id,'Participant follow-up');
  RETURN COALESCE((SELECT jsonb_build_object('fullName',i.full_name,'phone',i.phone,'locality',i.locality)
   FROM research.participant_identity i WHERE i.participant_id=v_part.id),jsonb_build_object('removed',true));
 END IF;

 IF p_action='consent_withdraw' THEN
  UPDATE research.consent SET withdrawn_at=now(),withdrawn_by=p_actor WHERE participant_id=v_part.id AND withdrawn_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consent was already withdrawn.'; END IF;
  DELETE FROM research.participant_identity WHERE participant_id=v_part.id;
  UPDATE research.referral SET status='CLOSED',updated_at=now() WHERE participant_id=v_part.id AND status<>'CLOSED';
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'RESEARCH_CONSENT_WITHDRAWN','participant',v_part.id,'Participant request');
  RETURN jsonb_build_object('id',v_part.id);
 END IF;

 IF p_action IN ('assessment_save','referral_save') THEN
  IF v_study.status<>'ACTIVE' THEN RAISE EXCEPTION 'This study is not open for data collection.'; END IF;
  IF EXISTS(SELECT 1 FROM research.consent WHERE participant_id=v_part.id AND withdrawn_at IS NOT NULL) THEN
   RAISE EXCEPTION 'This participant withdrew consent. Nothing more can be recorded.';
  END IF;
 END IF;

 IF p_action='assessment_save' THEN
  IF NOT (p_data->>'instrument')=ANY(v_study.instruments) THEN RAISE EXCEPTION 'This assessment is not part of the study.'; END IF;
  INSERT INTO research.assessment(participant_id,instrument,answers,score,severity,flags,notes,assessed_by)
  VALUES(v_part.id,p_data->>'instrument',p_data->'answers',(p_data->>'score')::numeric,p_data->>'severity',
   ARRAY(SELECT jsonb_array_elements_text(p_data->'flags')),COALESCE(p_data->>'notes',''),p_actor) RETURNING id INTO v_id;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'RESEARCH_ASSESSMENT_SAVED','assessment',v_id,'Research data collection');
  RETURN jsonb_build_object('id',v_id);
 END IF;

 IF p_action='referral_save' THEN
  IF p_data->>'id' IS NOT NULL THEN
   UPDATE research.referral SET status=p_data->>'status',updated_at=now() WHERE id=(p_data->>'id')::uuid AND participant_id=v_part.id RETURNING id INTO v_id;
   IF v_id IS NULL THEN RAISE EXCEPTION 'Referral not found.'; END IF;
   RETURN jsonb_build_object('id',v_id);
  END IF;
  v_text=btrim(COALESCE(p_data->>'treatment',''));
  -- Suggesting treatment is clinical practice; health workers screen and refer.
  IF v_text<>'' AND v_member<>'CLINICIAN' THEN RAISE EXCEPTION 'Only a clinician on the study can record a treatment suggestion' USING ERRCODE='42501'; END IF;
  INSERT INTO research.referral(participant_id,assessment_id,profession,urgency,note,treatment,created_by)
  VALUES(v_part.id,NULLIF(p_data->>'assessmentId','')::uuid,p_data->>'profession',p_data->>'urgency',COALESCE(p_data->>'note',''),v_text,p_actor)
  RETURNING id INTO v_id;
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'RESEARCH_REFERRAL_CREATED','referral',v_id,'Participant follow-up');
  RETURN jsonb_build_object('id',v_id);
 END IF;

 RAISE EXCEPTION 'Unsupported action';
END $body$;
REVOKE ALL ON FUNCTION public.chatbud_research(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chatbud_research(text,uuid,jsonb) TO service_role;
COMMIT;
