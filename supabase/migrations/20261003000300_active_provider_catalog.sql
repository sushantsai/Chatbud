BEGIN;
-- Narrow, server-only RPC interface. Never accepts SQL or exposes private rows generically.
CREATE OR REPLACE FUNCTION public.chatbud_api(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE result jsonb; provider_row care.provider; profession text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;
 IF p_action='catalog' THEN
  RETURN jsonb_build_object(
   'providers',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',u.display_name,'bio',p.biography,'languages',p.languages,'profession',s.profession_code,'serviceId',s.id,'service',s.title,'price',s.price_minor/100.0,'duration',s.duration_minutes))
    FROM care.provider p JOIN core.app_user u ON u.id=p.id JOIN care.service s ON s.provider_id=p.id JOIN care.provider_scope sc ON sc.provider_id=p.id AND sc.profession_code=s.profession_code
    WHERE u.status='ACTIVE' AND p.status='APPROVED' AND s.active AND sc.status='APPROVED' AND (sc.valid_until IS NULL OR sc.valid_until>now())), '[]'::jsonb),
   'products',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',p.title,'description',p.description,'kind',p.kind,'price',s.price_minor/100.0,'stock',COALESCE((SELECT sum(b.on_hand-b.reserved) FROM shop.stock_batch b WHERE b.sku_id=s.id AND b.status='AVAILABLE' AND (b.expires_on IS NULL OR b.expires_on>current_date)),0)))
    FROM shop.product p JOIN shop.sku s ON s.product_id=p.id JOIN shop.supplier sp ON sp.id=p.supplier_id WHERE p.status='PUBLISHED' AND s.active AND sp.status='APPROVED'),'[]'::jsonb));
 END IF;
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor required' USING ERRCODE='42501'; END IF;
 IF p_action='account' THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Verified account required' USING ERRCODE='42501'; END IF;
  INSERT INTO core.app_user(id,auth_subject,email,display_name) VALUES(p_actor,p_actor::text,p_data->>'email',COALESCE(NULLIF(p_data->>'name',''),'Chatbud member'))
  ON CONFLICT(id) DO UPDATE SET email=excluded.email;
  INSERT INTO core.role_assignment(user_id,role) VALUES(p_actor,'CONSUMER') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('id',p_actor);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 IF p_action='dashboard' THEN
  RETURN jsonb_build_object(
   'appointments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'provider',u.display_name,'service',s.title,'startsAt',a.starts_at,'status',a.status,'price',a.price_minor/100.0) ORDER BY a.starts_at DESC) FROM care.appointment a JOIN care.service s ON s.id=a.service_id JOIN core.app_user u ON u.id=a.provider_id WHERE a.client_id=p_actor),'[]'::jsonb),
   'orders',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'status',o.status,'total',o.total_minor/100.0,'createdAt',o.created_at) ORDER BY o.created_at DESC) FROM shop.product_order o WHERE o.user_id=p_actor),'[]'::jsonb),
   'providerApplication',(SELECT jsonb_build_object('status',p.status,'bio',p.biography,'profession',(SELECT sc.profession_code FROM care.provider_scope sc WHERE sc.provider_id=p.id LIMIT 1)) FROM care.provider p WHERE p.id=p_actor),
   'roles',COALESCE((SELECT jsonb_agg(role) FROM core.role_assignment WHERE user_id=p_actor),'[]'::jsonb));
 END IF;
 IF p_action='provider_apply' THEN
  profession=p_data->>'profession';
  IF NOT EXISTS(SELECT 1 FROM care.profession WHERE code=profession) THEN RAISE EXCEPTION 'Invalid profession'; END IF;
  INSERT INTO care.provider(id,public_slug,biography,status) VALUES(p_actor,'provider-'||p_actor::text,p_data->>'bio','APPLIED')
  ON CONFLICT(id) DO NOTHING;
  SELECT * INTO provider_row FROM care.provider WHERE id=p_actor FOR UPDATE;
  IF provider_row.status NOT IN ('APPLIED','REJECTED') THEN RAISE EXCEPTION 'Application is already being reviewed'; END IF;
  UPDATE care.provider SET biography=p_data->>'bio',status='UNDER_REVIEW',revision=revision+1 WHERE id=p_actor;
  INSERT INTO care.provider_scope(provider_id,profession_code,status,scope_description,policy_version)
   VALUES(p_actor,profession,'PENDING',p_data->>'experience','pending-review-v1') ON CONFLICT(provider_id,profession_code) DO UPDATE SET scope_description=excluded.scope_description;
  INSERT INTO care.verification_case(provider_id,status,submitted_at) VALUES(p_actor,'SUBMITTED',now());
  INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'PROVIDER_APPLICATION_SUBMITTED','provider',p_actor,'Provider onboarding');
  RETURN jsonb_build_object('status','UNDER_REVIEW');
 END IF;
 IF p_action='admin_overview' THEN
  IF NOT EXISTS(SELECT 1 FROM core.role_assignment WHERE user_id=p_actor AND role IN ('VERIFICATION','CLINICAL_REVIEW')) THEN RAISE EXCEPTION 'Reviewer access required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('applications',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'providerId',p.id,'name',u.display_name,'status',v.status,'submittedAt',v.submitted_at,'bio',p.biography)) FROM care.verification_case v JOIN care.provider p ON p.id=v.provider_id JOIN core.app_user u ON u.id=p.id WHERE v.status IN ('SUBMITTED','UNDER_REVIEW','NEEDS_INFORMATION')),'[]'::jsonb));
 END IF;
 RAISE EXCEPTION 'Unsupported action';
END $body$;
REVOKE ALL ON FUNCTION public.chatbud_api(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chatbud_api(text,uuid,jsonb) TO service_role;
COMMIT;
