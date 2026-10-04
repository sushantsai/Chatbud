BEGIN;
-- Goals a person sets for themselves, one area of care each.
CREATE TABLE IF NOT EXISTS care.goal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES core.app_user(id),
 domain text NOT NULL CHECK(domain IN ('mental','nutrition','fitness')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160), note text NOT NULL DEFAULT '',
 target_date date, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DONE','ARCHIVED')),
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS goal_owner ON care.goal(user_id,created_at DESC);

-- Plans a professional writes for a client, within the professional's approved area.
CREATE TABLE IF NOT EXISTS care.care_plan (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES core.app_user(id),
 provider_id uuid NOT NULL REFERENCES care.provider(id),
 domain text NOT NULL CHECK(domain IN ('mental','nutrition','fitness')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160), body text NOT NULL CHECK(length(body)<=8000),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(client_id<>provider_id)
);
CREATE INDEX IF NOT EXISTS care_plan_client ON care.care_plan(client_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS care_plan_author ON care.care_plan(provider_id,client_id);

-- A client's standing consent for one professional to see one area of care.
CREATE TABLE IF NOT EXISTS care.compartment_grant (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES core.app_user(id),
 provider_id uuid NOT NULL REFERENCES care.provider(id),
 domain text NOT NULL CHECK(domain IN ('mental','nutrition','fitness')),
 consent_acceptance_id uuid NOT NULL REFERENCES core.consent_acceptance(id),
 granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 CHECK(client_id<>provider_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS compartment_grant_active
 ON care.compartment_grant(client_id,provider_id,domain) WHERE revoked_at IS NULL;

ALTER TABLE care.goal ENABLE ROW LEVEL SECURITY;
ALTER TABLE care.care_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE care.compartment_grant ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON care.goal, care.care_plan, care.compartment_grant FROM PUBLIC, anon, authenticated;
-- Intentionally no RLS policies; access is through the server-only gateway below.

-- Wording shown to the client when sharing. Requires legal review before launch.
INSERT INTO core.consent_version(purpose,version,language_code,content,effective_at)
VALUES('compartment_share','v1','en',
 'I agree that this professional may see my goals and the plans other professionals have written for me in this area of care, until I stop sharing.',now())
ON CONFLICT (purpose,version,language_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.chatbud_health(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE v_id uuid; v_provider uuid; v_client uuid; v_domain text; v_acceptance uuid; v_status text;
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
      'targetDate',g.target_date,'status',g.status) ORDER BY g.status,g.created_at DESC)
     FROM care.goal g WHERE g.user_id=p_actor AND g.status<>'ARCHIVED'),'[]'::jsonb),
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
   INSERT INTO care.goal(user_id,domain,title,note,target_date)
   VALUES(p_actor,v_domain,btrim(p_data->>'title'),COALESCE(p_data->>'note',''),NULLIF(p_data->>'targetDate','')::date)
   RETURNING id INTO v_id;
  ELSE
   UPDATE care.goal SET status=v_status,
    completed_at=CASE WHEN v_status='DONE' THEN COALESCE(completed_at,now()) ELSE NULL END
   WHERE id=(p_data->>'id')::uuid AND user_id=p_actor RETURNING id INTO v_id;
   IF v_id IS NULL THEN RAISE EXCEPTION 'Goal not found.'; END IF;
  END IF;
  RETURN jsonb_build_object('id',v_id);
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
