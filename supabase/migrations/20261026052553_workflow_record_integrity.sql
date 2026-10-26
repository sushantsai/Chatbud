BEGIN;
ALTER TABLE care.intake_submission ADD COLUMN question_snapshot jsonb NOT NULL DEFAULT '[]';
CREATE FUNCTION care.snapshot_intake_questions() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.parent_id IS NOT NULL THEN SELECT question_snapshot INTO NEW.question_snapshot FROM care.intake_submission WHERE id=NEW.parent_id;ELSE SELECT intake_questions INTO NEW.question_snapshot FROM care.service WHERE id=NEW.service_id; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION care.snapshot_intake_questions() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER intake_question_snapshot BEFORE INSERT ON care.intake_submission FOR EACH ROW EXECUTE FUNCTION care.snapshot_intake_questions();
DO $patch$
DECLARE f text;
BEGIN
 f=pg_get_functiondef('public.chatbud_workflow(text,uuid,jsonb)'::regprocedure);
 IF position('''answers'',i.answers,''parentId''' IN f)=0 THEN RAISE EXCEPTION 'Unexpected intake read definition';END IF;
 f=replace(f,'''answers'',i.answers,''parentId''','''answers'',i.answers,''questions'',i.question_snapshot,''parentId''');
 f=replace(f,'reason=''Payment retained for client-approved replacement; no payout.''','idempotency_key=''transferred-''||id,reason=''Payment retained for client-approved replacement; no payout.''');
 -- Client decisions after professional cancellation cannot silently switch after a payout choice.
 f=replace(f,'IF refund_row.id IS NULL THEN RAISE EXCEPTION ''Refund or replacement has already been handled.''; END IF;','IF refund_row.id IS NULL OR refund_row.eligibility=''ELIGIBLE'' OR EXISTS(SELECT 1 FROM ops.workflow_case WHERE dedupe_key=''pro-cancel-reschedule-''||a.id) THEN RAISE EXCEPTION ''A choice was already recorded. Contact Chatbud to change it.''; END IF;');
 f=replace(f,'IF refund_row.id IS NULL THEN RAISE EXCEPTION ''Refund is not awaiting exception review.''; END IF;','IF refund_row.id IS NULL THEN RAISE EXCEPTION ''Refund is not awaiting exception review.''; END IF; IF refund_row.reason ILIKE ''Professional cancelled%'' THEN RAISE EXCEPTION ''Await the client refund or rescheduling choice.''; END IF;');
 -- Show finance the verified capture needed to operate the external gateway.
 f=replace(f,'''reason'',r.reason) FROM finance.refund r WHERE r.id=c.refund_id)', '''reason'',r.reason,''payment'',(SELECT jsonb_build_object(''gateway'',pa.gateway,''reference'',pa.gateway_reference,''receivedAmount'',pa.amount_minor/100.0) FROM finance.payment_attempt pa WHERE pa.id=r.payment_attempt_id)) FROM finance.refund r WHERE r.id=c.refund_id)');
 f=replace(f,' IF p_action=''preferences'' THEN', $branch$
 IF p_action='client_tasks' THEN
  RETURN jsonb_build_object('tasks',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t->>'id','title',t->>'title','plan',p.title)) FROM care.plan_record p JOIN care.plan_revision v ON v.id=p.current_version_id CROSS JOIN LATERAL jsonb_array_elements(v.tasks)t WHERE p.client_id=p_actor AND (t->>'schedule'='DAILY' OR t->'weekdays' @> jsonb_build_array(extract(dow FROM (now() AT TIME ZONE 'Asia/Kathmandu'))::int)) AND NOT EXISTS(SELECT 1 FROM care.task_progress g WHERE g.client_id=p_actor AND g.task_key=(t->>'id')::uuid AND g.completed AND (g.created_at AT TIME ZONE 'Asia/Kathmandu')::date=(now() AT TIME ZONE 'Asia/Kathmandu')::date)),'[]'));
 END IF;
 IF p_action='preferences' THEN
 $branch$);
 EXECUTE f;
 -- Capture the same transfer audit change in the actual rescheduling function.
 f=pg_get_functiondef('public.chatbud_care(text,uuid,jsonb)'::regprocedure);
 f=replace(f,'reason=''Payment retained for client-approved replacement; no payout.''','idempotency_key=''transferred-''||id,reason=''Payment retained for client-approved replacement; no payout.''');
 EXECUTE f;
 f=pg_get_functiondef('public.chatbud_api(text,uuid,jsonb)'::regprocedure);
 f=replace(f,'''startsAt'',a.starts_at,''status'',a.status,''price''','''startsAt'',a.starts_at,''status'',a.status,''paymentStatus'',a.payment_status,''intakeStage'',a.policy_snapshot->>''intakeStage'',''intakeComplete'',EXISTS(SELECT 1 FROM care.intake_submission ins WHERE ins.client_id=a.client_id AND ins.service_id=a.service_id AND (ins.appointment_id IS NULL OR ins.appointment_id=a.id)),''approvalDueAt'',a.approval_due_at,''expiresAt'',a.hold_expires_at,''price''');
 EXECUTE f;
END $patch$;
COMMIT;
BEGIN;
CREATE FUNCTION ops.sync_support_case() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_id uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  v_id=ops.open_case('support-'||NEW.id,NEW.raised_by,NEW.appointment_id,'SUPPORT','Support: '||NEW.subject,NULL,NEW.priority='URGENT');
  UPDATE ops.workflow_case SET context=jsonb_build_object('supportTicketId',NEW.id,'reference',NEW.reference) WHERE id=v_id;
  UPDATE ops.support_ticket SET assigned_to=(SELECT owner_id FROM ops.workflow_case WHERE id=v_id) WHERE id=NEW.id;
 ELSE
  UPDATE ops.workflow_case SET status=CASE WHEN NEW.status='ESCALATED' THEN 'REVIEW' ELSE NEW.status END,owner_id=NEW.assigned_to,updated_at=now() WHERE dedupe_key='support-'||NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION ops.sync_support_case() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER support_workflow_case AFTER INSERT OR UPDATE OF status,assigned_to ON ops.support_ticket FOR EACH ROW EXECUTE FUNCTION ops.sync_support_case();
COMMIT;
