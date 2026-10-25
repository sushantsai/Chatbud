BEGIN;
-- This server-only gateway authorizes resource creation before the Google API
-- call. The booking gateways still validate the final update transaction.
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
 IF p_action<>'appointment' OR v_intent IS NULL OR v_intent NOT IN ('provider_confirm','client_reschedule','team_confirm') THEN
  RAISE EXCEPTION 'Unknown meeting action';
 END IF;
 SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found.'; END IF;
 IF v_intent='provider_confirm' THEN
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
 IF NOT (v_appt.status='CONFIRMED' OR (v_appt.status='HELD' AND v_appt.hold_expires_at>now())) THEN
  RAISE EXCEPTION 'This request has expired or was cancelled.';
 END IF;
 RETURN jsonb_build_object('meetingUrl',v_appt.meeting_url);
END;
$body$;
REVOKE ALL ON FUNCTION public.chatbud_meet(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chatbud_meet(text,uuid,jsonb) TO service_role;
COMMIT;
