BEGIN;
-- Goals become small repeatable actions, marked once a day.
ALTER TABLE care.goal
 ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT '' CHECK(length(action)<=160),
 ADD COLUMN IF NOT EXISTS weekly_target smallint NOT NULL DEFAULT 7 CHECK(weekly_target BETWEEN 1 AND 7),
 ADD COLUMN IF NOT EXISTS template_code text CHECK(template_code ~ '^[a-z0-9-]{2,40}$');

CREATE TABLE IF NOT EXISTS care.goal_checkin (
 goal_id uuid NOT NULL REFERENCES care.goal(id) ON DELETE CASCADE, day date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(goal_id,day)
);

-- How a week felt, on a 1 to 5 scale. Seen only by the person who wrote it.
CREATE TABLE IF NOT EXISTS care.wellbeing_checkin (
 user_id uuid NOT NULL REFERENCES core.app_user(id), week_start date NOT NULL,
 mood smallint NOT NULL CHECK(mood BETWEEN 1 AND 5), sleep smallint NOT NULL CHECK(sleep BETWEEN 1 AND 5),
 energy smallint NOT NULL CHECK(energy BETWEEN 1 AND 5),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,week_start)
);

ALTER TABLE care.goal_checkin ENABLE ROW LEVEL SECURITY;
ALTER TABLE care.wellbeing_checkin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON care.goal_checkin, care.wellbeing_checkin FROM PUBLIC, anon, authenticated;
-- Intentionally no RLS policies; access is through the server-only gateway below.

CREATE OR REPLACE FUNCTION public.chatbud_health(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE v_id uuid; v_provider uuid; v_client uuid; v_domain text; v_acceptance uuid; v_status text;
 v_today date := (now() AT TIME ZONE 'Asia/Kathmandu')::date; v_day date; v_week date;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;
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
REVOKE ALL ON FUNCTION public.chatbud_health(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chatbud_health(text,uuid,jsonb) TO service_role;
COMMIT;
