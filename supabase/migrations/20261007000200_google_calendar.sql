BEGIN;
-- A professional's own Google Calendar connection. Confirmed sessions are added to it with a Meet link.
ALTER TABLE care.appointment ADD COLUMN IF NOT EXISTS calendar_event_id text;
CREATE TABLE IF NOT EXISTS care.provider_calendar (
 provider_id uuid PRIMARY KEY REFERENCES care.provider(id),
 google_email text NOT NULL CHECK(length(google_email) BETWEEN 3 AND 200),
 -- The Google refresh token, encrypted by the API server before it reaches the database.
 token_cipher text NOT NULL,
 connected_at timestamptz NOT NULL DEFAULT now(), last_error text
);
ALTER TABLE care.provider_calendar ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON care.provider_calendar FROM PUBLIC, anon, authenticated;
-- Intentionally no RLS policies; access is through the server-only gateway below.

CREATE OR REPLACE FUNCTION public.chatbud_calendar(p_action text, p_actor uuid DEFAULT NULL, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE v_appt care.appointment%ROWTYPE; v_cal care.provider_calendar%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE='42501'; END IF;

 -- Used when offering times: the calendar of the professional behind a service. No sign-in is involved.
 IF p_action='for_service' THEN
  RETURN COALESCE((SELECT jsonb_build_object('cipher',c.token_cipher,'providerId',c.provider_id,'durationMinutes',s.duration_minutes)
   FROM care.service s JOIN care.provider_calendar c ON c.provider_id=s.provider_id WHERE s.id=(p_data->>'serviceId')::uuid),'{}'::jsonb);
 END IF;

 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM core.app_user WHERE id=p_actor AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;

 -- The professional's own connection.
 IF p_action IN ('status','save','disconnect') THEN
  IF NOT EXISTS(SELECT 1 FROM care.provider WHERE id=p_actor AND status='APPROVED') THEN
   RAISE EXCEPTION 'An approved professional profile is required' USING ERRCODE='42501';
  END IF;
  IF p_action='save' THEN
   INSERT INTO care.provider_calendar(provider_id,google_email,token_cipher) VALUES(p_actor,p_data->>'email',p_data->>'cipher')
   ON CONFLICT (provider_id) DO UPDATE SET google_email=EXCLUDED.google_email,token_cipher=EXCLUDED.token_cipher,connected_at=now(),last_error=NULL;
   INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'CALENDAR_CONNECTED','provider',p_actor,'Calendar connection');
  ELSIF p_action='disconnect' THEN
   DELETE FROM care.provider_calendar WHERE provider_id=p_actor;
   INSERT INTO ops.audit_event(actor_id,action,target_type,target_id,purpose) VALUES(p_actor,'CALENDAR_DISCONNECTED','provider',p_actor,'Calendar connection');
  END IF;
  SELECT * INTO v_cal FROM care.provider_calendar WHERE provider_id=p_actor;
  RETURN jsonb_build_object('connected',v_cal.provider_id IS NOT NULL,'email',v_cal.google_email,'connectedAt',v_cal.connected_at,'lastError',v_cal.last_error);
 END IF;

 SELECT * INTO v_appt FROM care.appointment WHERE id=(p_data->>'id')::uuid;
 IF v_appt.id IS NULL THEN RAISE EXCEPTION 'Appointment not found.'; END IF;
 IF NOT (p_actor IN (v_appt.client_id,v_appt.provider_id)
  OR EXISTS(SELECT 1 FROM core.role_assignment WHERE user_id=p_actor AND role IN ('SUPPORT','SECURITY_ADMIN'))) THEN
  RAISE EXCEPTION 'Appointment not found.';
 END IF;
 SELECT * INTO v_cal FROM care.provider_calendar WHERE provider_id=v_appt.provider_id;

 -- What the server needs to put this appointment on the professional's calendar, or take it off.
 IF p_action='event_state' THEN
  RETURN jsonb_build_object('cipher',v_cal.token_cipher,'providerId',v_appt.provider_id,'eventId',v_appt.calendar_event_id,
   'status',v_appt.status,'paymentStatus',v_appt.payment_status,'holdOpen',v_appt.hold_expires_at>now(),
   'startsAt',v_appt.starts_at,'endsAt',v_appt.ends_at,'meetingUrl',v_appt.meeting_url,
   'isProvider',p_actor=v_appt.provider_id,
   'clientEmail',(SELECT email FROM core.app_user WHERE id=v_appt.client_id));
 END IF;
 IF p_action='event_saved' THEN
  UPDATE care.appointment SET calendar_event_id=NULLIF(p_data->>'eventId','') WHERE id=v_appt.id;
  RETURN jsonb_build_object('id',v_appt.id);
 END IF;
 -- A failed Google call is noted so the professional can see their calendar needs reconnecting.
 IF p_action='error_note' THEN
  UPDATE care.provider_calendar SET last_error=left(p_data->>'message',200) WHERE provider_id=v_appt.provider_id;
  RETURN jsonb_build_object('id',v_appt.id);
 END IF;

 RAISE EXCEPTION 'Unsupported action';
END $body$;
REVOKE ALL ON FUNCTION public.chatbud_calendar(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chatbud_calendar(text,uuid,jsonb) TO service_role;
COMMIT;
