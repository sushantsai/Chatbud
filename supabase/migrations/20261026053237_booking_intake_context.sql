BEGIN;
ALTER TABLE care.intake_submission ADD COLUMN booking_key uuid;
CREATE INDEX intake_booking_context ON care.intake_submission(client_id,service_id,booking_key);
DO $patch$
DECLARE f text;
BEGIN
 f=pg_get_functiondef('public.chatbud_workflow(text,uuid,jsonb)'::regprocedure);
 f=replace(f,$find$WHERE id=(p_data->>'serviceId')::uuid AND (active OR EXISTS(SELECT 1 FROM care.intake_submission WHERE client_id=p_actor AND service_id=care.service.id));$find$, $with$WHERE id=(p_data->>'serviceId')::uuid AND (active OR EXISTS(SELECT 1 FROM care.intake_submission WHERE client_id=p_actor AND service_id=care.service.id) OR EXISTS(SELECT 1 FROM care.appointment ap WHERE ap.client_id=p_actor AND ap.service_id=care.service.id AND ap.id=(p_data->>'appointmentId')::uuid AND ap.status='CONFIRMED'));$with$);
 f=replace(f,'  IF p_action=''intake_form'' THEN RETURN', $context$
  IF p_data->>'appointmentId' IS NOT NULL THEN
   SELECT * INTO a FROM care.appointment WHERE id=(p_data->>'appointmentId')::uuid AND client_id=p_actor AND service_id=s.id;
   IF a.id IS NULL THEN RAISE EXCEPTION 'Appointment not found.' USING ERRCODE='42501'; END IF;
   s.intake_questions=COALESCE(a.service_snapshot->'intakeQuestions',s.intake_questions);
   s.intake_stage=COALESCE(a.policy_snapshot->>'intakeStage',s.intake_stage);
  END IF;
  IF p_action='intake_form' THEN RETURN
 $context$);
 f=replace(f,$find$'submitted',EXISTS(SELECT 1 FROM care.intake_submission WHERE client_id=p_actor AND service_id=s.id AND parent_id IS NULL)$find$,$with$'submitted',EXISTS(SELECT 1 FROM care.intake_submission WHERE client_id=p_actor AND service_id=s.id AND parent_id IS NULL AND question_snapshot=s.intake_questions AND ((a.id IS NOT NULL AND appointment_id=a.id) OR (a.id IS NULL AND booking_key=(p_data->>'bookingKey')::uuid)))$with$);
 f=replace(f,$find$  IF s.intake_stage='NONE' THEN$find$, $with$  IF s.intake_stage='BEFORE_PAYMENT' AND p_data->>'parentId' IS NULL AND p_data->>'bookingKey' IS NULL THEN RAISE EXCEPTION 'Booking context is required before payment.'; END IF; IF s.intake_stage='NONE' THEN$with$);
 f=replace(f,$find$AND (appointment_id IS NULL OR appointment_id=a.id)) THEN RAISE EXCEPTION 'Preserve the original submission; add a dated update.';$find$, $with$AND question_snapshot=s.intake_questions AND ((a.id IS NOT NULL AND appointment_id=a.id) OR (a.id IS NULL AND booking_key=(p_data->>'bookingKey')::uuid))) THEN RAISE EXCEPTION 'Preserve the original submission; add a dated update.';$with$);
 f=replace(f,'appointment_id,answers,parent_id) VALUES(p_actor,s.provider_id,s.id,COALESCE(a.id,entry.appointment_id),p_data->''answers'',entry.id)', 'appointment_id,answers,parent_id,booking_key) VALUES(p_actor,s.provider_id,s.id,COALESCE(a.id,entry.appointment_id),p_data->''answers'',entry.id,COALESCE((p_data->>''bookingKey'')::uuid,entry.booking_key))');
 EXECUTE f;
 f=pg_get_functiondef('public.chatbud_care(text,uuid,jsonb)'::regprocedure);
 f=replace(f,$find$WHERE client_id=p_actor AND service_id=v_service.id AND parent_id IS NULL)$find$,$with$WHERE client_id=p_actor AND service_id=v_service.id AND parent_id IS NULL AND booking_key=(p_data->>'idempotencyKey')::uuid AND question_snapshot=v_service.intake_questions)$with$);
 f=replace(f,'WHERE client_id=p_actor AND service_id=v_service.id AND appointment_id IS NULL;', 'WHERE client_id=p_actor AND service_id=v_service.id AND appointment_id IS NULL AND booking_key=(p_data->>''idempotencyKey'')::uuid;');
 EXECUTE f;
END $patch$;
COMMIT;
BEGIN;
CREATE OR REPLACE FUNCTION care.snapshot_intake_questions() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.parent_id IS NOT NULL THEN SELECT question_snapshot INTO NEW.question_snapshot FROM care.intake_submission WHERE id=NEW.parent_id;
 ELSIF NEW.appointment_id IS NOT NULL THEN SELECT service_snapshot->'intakeQuestions' INTO NEW.question_snapshot FROM care.appointment WHERE id=NEW.appointment_id;
 ELSE SELECT intake_questions INTO NEW.question_snapshot FROM care.service WHERE id=NEW.service_id;END IF;
 NEW.question_snapshot=COALESCE(NEW.question_snapshot,'[]');RETURN NEW;
END $$;
DO $patch$
DECLARE f text;
BEGIN
 f=pg_get_functiondef('public.chatbud_workflow(text,uuid,jsonb)'::regprocedure);
 f=replace(f,'IF s.intake_stage=''AFTER_CONFIRMATION'' THEN','IF s.intake_stage=''AFTER_CONFIRMATION'' AND p_data->>''parentId'' IS NULL THEN');
 f=replace(f,'IF s.intake_stage=''NONE'' THEN','IF s.intake_stage=''NONE'' AND p_data->>''parentId'' IS NULL THEN');
 EXECUTE f;
 f=pg_get_functiondef('public.chatbud_care(text,uuid,jsonb)'::regprocedure);
 f=replace(f,'''status'',status,''expiresAt'',hold_expires_at)', '''status'',status,''expiresAt'',hold_expires_at,''price'',price_minor/100.0,''service'',service_snapshot->>''title'',''policy'',policy_snapshot)');
 f=replace(f,'''status'',v_appt.status,''expiresAt'',v_appt.hold_expires_at)', '''status'',v_appt.status,''expiresAt'',v_appt.hold_expires_at,''price'',v_appt.price_minor/100.0,''service'',v_appt.service_snapshot->>''title'',''policy'',v_appt.policy_snapshot)');
 EXECUTE f;
 f=pg_get_functiondef('public.chatbud_shop(text,uuid,jsonb)'::regprocedure);
 f=replace(f,'  IF p_data->>''promoCode''<>'''' AND v_quote->>''promoCode'' IS NULL', '  IF p_data->>''expectedTotal'' IS NOT NULL AND round((p_data->>''expectedTotal'')::numeric*100)::bigint<>round((v_quote->>''total'')::numeric*100)::bigint THEN RAISE EXCEPTION ''The order total changed. Review the updated price before placing the order.''; END IF; IF p_data->>''promoCode''<>'''' AND v_quote->>''promoCode'' IS NULL');
 EXECUTE f;
END $patch$;
COMMIT;
