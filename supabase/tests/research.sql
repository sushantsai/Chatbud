-- Transactional checks for studies, consent, pseudonymised participants, assessments, referrals and export. All synthetic records are rolled back.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $test$
DECLARE admin uuid := gen_random_uuid(); lead uuid := gen_random_uuid(); clinician uuid := gen_random_uuid(); worker uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
 who uuid; result jsonb; failed boolean; study uuid; person uuid; other uuid; assessment uuid; setup jsonb; enrol jsonb;
 mail text;
BEGIN
 IF has_function_privilege('anon','public.chatbud_research(text,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.chatbud_research(text,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser roles must not execute the research gateway';
 END IF;
 FOREACH who IN ARRAY ARRAY[admin,lead,clinician,worker,outsider] LOOP
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(who,'chatbud-test-'||who||'@example.invalid',now());
  PERFORM public.chatbud_api('account',who,jsonb_build_object('email','chatbud-test-'||who||'@example.invalid','name','Transactional test'));
 END LOOP;
 INSERT INTO core.role_assignment(user_id,role) VALUES(admin,'SECURITY_ADMIN');

 -- Only an administrator names research leads; only a lead sets up a study.
 mail := 'chatbud-test-'||lead||'@example.invalid';
 failed := false;
 BEGIN PERFORM public.chatbud_research('lead_set',lead,jsonb_build_object('email',mail,'grant',true)); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A non-administrator named a research lead'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_research('study_save',lead,'{"code":"TST","title":"Test study"}'::jsonb); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A study was created without the research lead role'; END IF;
 PERFORM public.chatbud_research('lead_set',admin,jsonb_build_object('email',mail,'grant',true));
 study := (public.chatbud_research('study_save',lead,'{"code":"tst","title":"Test study"}'::jsonb)->>'id')::uuid;

 -- A study cannot open without ethics approval and consent wording.
 setup := jsonb_build_object('id',study,'title','Test study','summary','','partner','Test Institute','ethicsReference','','ethicsApprovedOn','',
  'instruments','["PHQ9"]'::jsonb,'consentText','','status','ACTIVE');
 failed := false;
 BEGIN PERFORM public.chatbud_research('study_save',lead,setup); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A study opened without ethics approval'; END IF;
 enrol := jsonb_build_object('studyId',study,'sex','FEMALE','birthYear',1990,'district','Lalitpur',
  'identity',jsonb_build_object('fullName','Synthetic Person','phone','9800000000','locality','Ward 4'),
  'consent',jsonb_build_object('participation',true,'recording',false,'futureUse',true,'method','SIGNED','witness',''));
 failed := false;
 BEGIN PERFORM public.chatbud_research('participant_enroll',lead,enrol); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A participant was enrolled in a draft study'; END IF;
 setup := setup || jsonb_build_object('ethicsReference','NHRC-TEST-001','ethicsApprovedOn','2026-09-01',
  'consentText','I understand the purpose of this study, that taking part is my choice, and that I can stop at any time.');
 PERFORM public.chatbud_research('study_save',lead,setup);

 PERFORM public.chatbud_research('member_set',lead,jsonb_build_object('studyId',study,'email','chatbud-test-'||clinician||'@example.invalid','role','CLINICIAN','grant',true));
 PERFORM public.chatbud_research('member_set',lead,jsonb_build_object('studyId',study,'email','chatbud-test-'||worker||'@example.invalid','role','HEALTH_WORKER','grant',true));
 failed := false;
 BEGIN PERFORM public.chatbud_research('member_set',worker,jsonb_build_object('studyId',study,'email','chatbud-test-'||outsider||'@example.invalid','role','LEAD','grant',true));
 EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A health worker changed the study team'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_research('study_view',outsider,jsonb_build_object('studyId',study)); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'An outsider opened a study'; END IF;

 -- Enrolment needs agreement, an adult, and a witness when consent is not signed.
 failed := false;
 BEGIN PERFORM public.chatbud_research('participant_enroll',worker,jsonb_set(enrol,'{consent,participation}','false')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Enrolled without agreement'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_research('participant_enroll',worker,jsonb_set(enrol,'{birthYear}','2015')); EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A child was enrolled'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_research('participant_enroll',worker,jsonb_set(enrol,'{consent,method}','"THUMBPRINT"')); EXCEPTION WHEN check_violation THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Thumbprint consent was accepted without a witness'; END IF;
 result := public.chatbud_research('participant_enroll',worker,enrol);
 person := (result->>'id')::uuid;
 IF result->>'code'<>'TST-0001' THEN RAISE EXCEPTION 'Wrong study code: %',result; END IF;
 other := (public.chatbud_research('participant_enroll',clinician,enrol)->>'id')::uuid;
 IF (SELECT code FROM research.participant WHERE id=other)<>'TST-0002' THEN RAISE EXCEPTION 'Study codes are not sequential'; END IF;

 -- Lists and records never carry a name; contact details are a separate, recorded request.
 result := public.chatbud_research('study_view',clinician,jsonb_build_object('studyId',study));
 IF jsonb_array_length(result->'participants')<>2 OR result::text LIKE '%Synthetic Person%' OR result::text LIKE '%9800000000%'
  OR jsonb_array_length(result->'members')<>0 THEN RAISE EXCEPTION 'Study view leaked identity or team: %',result; END IF;
 IF public.chatbud_research('participant_view',clinician,jsonb_build_object('participantId',person))::text LIKE '%Synthetic Person%' THEN RAISE EXCEPTION 'Participant view leaked a name'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_research('participant_identity',clinician,jsonb_build_object('participantId',person)); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Someone who did not enrol the participant saw contact details'; END IF;
 IF public.chatbud_research('participant_identity',worker,jsonb_build_object('participantId',person))->>'fullName'<>'Synthetic Person' THEN RAISE EXCEPTION 'Enroller could not see contact details'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ops.audit_event WHERE actor_id=worker AND action='RESEARCH_IDENTITY_VIEWED' AND target_id=person) THEN RAISE EXCEPTION 'Identity view was not recorded'; END IF;

 -- Assessments belong to the study's chosen instruments.
 failed := false;
 BEGIN PERFORM public.chatbud_research('assessment_save',worker,jsonb_build_object('participantId',person,'instrument','GAD7','answers','[1,1,1,1,1,1,1]'::jsonb,'score',7,'severity','Mild','flags','[]'::jsonb,'notes',''));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'An assessment outside the study was saved'; END IF;
 assessment := (public.chatbud_research('assessment_save',worker,jsonb_build_object('participantId',person,'instrument','PHQ9',
  'answers','[2,2,1,1,2,1,1,1,1]'::jsonb,'score',12,'severity','Moderate','flags','["SELF_HARM"]'::jsonb,'notes','Spoke at home.'))->>'id')::uuid;

 -- Health workers refer; only clinicians suggest treatment.
 failed := false;
 BEGIN PERFORM public.chatbud_research('referral_save',worker,jsonb_build_object('participantId',person,'assessmentId',assessment,'profession','psychiatrist','urgency','URGENT','note','','treatment','Start medication'));
 EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A health worker recorded a treatment suggestion'; END IF;
 PERFORM public.chatbud_research('referral_save',worker,jsonb_build_object('participantId',person,'assessmentId',assessment,'profession','psychiatrist','urgency','URGENT','note','Item 9 positive.','treatment',''));
 result := public.chatbud_research('referral_save',clinician,jsonb_build_object('participantId',person,'profession','clinical_psychologist','urgency','SOON','note','','treatment','Consider talking therapy.'));
 PERFORM public.chatbud_research('referral_save',clinician,jsonb_build_object('participantId',person,'id',result->>'id','status','CONTACTED'));
 result := public.chatbud_research('participant_view',lead,jsonb_build_object('participantId',person));
 IF jsonb_array_length(result->'assessments')<>1 OR jsonb_array_length(result->'referrals')<>2 OR NOT (result->'participant'->>'canSeeIdentity')::boolean THEN RAISE EXCEPTION 'Participant record is wrong: %',result; END IF;
 result := public.chatbud_research('workspace',worker);
 IF (result->'studies'->0->>'participants')::int<>2 OR (result->'studies'->0->>'openReferrals')::int<>2 OR (result->>'canCreate')::boolean THEN RAISE EXCEPTION 'Workspace is wrong: %',result; END IF;

 -- Export is for the lead, de-identified, and leaves out anyone who withdrew.
 failed := false;
 BEGIN PERFORM public.chatbud_research('export',clinician,jsonb_build_object('studyId',study)); EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'A non-lead exported study data'; END IF;
 result := public.chatbud_research('export',lead,jsonb_build_object('studyId',study));
 IF jsonb_array_length(result->'rows')<>1 OR result::text LIKE '%Synthetic%' OR result::text LIKE '%Spoke at home%' THEN RAISE EXCEPTION 'Export is wrong or leaks: %',result; END IF;

 PERFORM public.chatbud_research('consent_withdraw',worker,jsonb_build_object('participantId',person));
 IF EXISTS(SELECT 1 FROM research.participant_identity WHERE participant_id=person) THEN RAISE EXCEPTION 'Contact details kept after withdrawal'; END IF;
 IF EXISTS(SELECT 1 FROM research.referral WHERE participant_id=person AND status<>'CLOSED') THEN RAISE EXCEPTION 'Referrals left open after withdrawal'; END IF;
 failed := false;
 BEGIN PERFORM public.chatbud_research('assessment_save',worker,jsonb_build_object('participantId',person,'instrument','PHQ9','answers','[0,0,0,0,0,0,0,0,0]'::jsonb,'score',0,'severity','Minimal','flags','[]'::jsonb,'notes',''));
 EXCEPTION WHEN raise_exception THEN failed := true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Data recorded after consent was withdrawn'; END IF;
 IF jsonb_array_length(public.chatbud_research('export',lead,jsonb_build_object('studyId',study))->'rows')<>0 THEN RAISE EXCEPTION 'Withdrawn participant still exported'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: research leads, ethics gate, consent rules, study codes, identity separation and audit, instrument scope, clinician-only treatment, de-identified export, withdrawal; test records rolled back.' AS result;
