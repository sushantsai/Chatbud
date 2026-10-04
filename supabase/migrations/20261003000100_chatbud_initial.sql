-- Chatbud initial database design, v1, 2026-10-02.
-- PostgreSQL 16+. Apply to a FRESH disposable database before implementation.
-- Monetary amounts are NPR minor units (paisa). This is NOT an authorization policy.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
CREATE SCHEMA core;
CREATE SCHEMA care;
CREATE SCHEMA shop;
CREATE SCHEMA finance;
CREATE SCHEMA ops;

CREATE TABLE core.app_user (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 auth_subject text NOT NULL UNIQUE,
 email text, phone_e164 text,
 display_name text NOT NULL,
 language_code text NOT NULL DEFAULT 'en' CHECK (language_code IN ('en','ne')),
 date_of_birth date,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DEACTIVATED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
);
CREATE UNIQUE INDEX user_email_unique ON core.app_user(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX user_phone_unique ON core.app_user(phone_e164) WHERE phone_e164 IS NOT NULL;

CREATE TABLE core.role_assignment (
 user_id uuid NOT NULL REFERENCES core.app_user(id),
 role text NOT NULL CHECK (role IN ('CONSUMER','PROVIDER','VERIFICATION','CLINICAL_REVIEW','SUPPORT','FINANCE','CATALOG','FULFILLMENT','CONTENT','SECURITY_ADMIN')),
 granted_by uuid REFERENCES core.app_user(id), granted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,role)
);
CREATE TABLE core.consent_version (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purpose text NOT NULL, version text NOT NULL,
 language_code text NOT NULL CHECK (language_code IN ('en','ne')),
 content text NOT NULL, effective_at timestamptz NOT NULL,
 UNIQUE(purpose,version,language_code)
);
CREATE TABLE core.consent_acceptance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES core.app_user(id),
 consent_version_id uuid NOT NULL REFERENCES core.consent_version(id),
 accepted_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz,
 CHECK (withdrawn_at IS NULL OR withdrawn_at >= accepted_at)
);
CREATE TABLE core.file_asset (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL REFERENCES core.app_user(id),
 storage_key text NOT NULL UNIQUE, media_type text NOT NULL, byte_size bigint NOT NULL CHECK(byte_size>=0),
 classification text NOT NULL CHECK(classification IN ('PUBLIC_PRODUCT','PUBLIC_PROFILE','CREDENTIAL','CARE_PRIVATE','INCIDENT_PRIVATE')),
 scan_status text NOT NULL DEFAULT 'PENDING' CHECK(scan_status IN ('PENDING','CLEAN','REJECTED')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,owner_user_id)
);
CREATE TABLE core.privacy_request (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES core.app_user(id),
 kind text NOT NULL CHECK(kind IN ('ACCESS','EXPORT','DELETE','RECTIFY')),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','REVIEW','COMPLETED','DECLINED')),
 requested_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
 outcome_reason text
);

CREATE TABLE care.profession (
 code text PRIMARY KEY, display_name text NOT NULL, scope_policy_version text NOT NULL
);
-- Eligibility is reviewed per profession; names do not assert Nepal licensing entitlement.
INSERT INTO care.profession VALUES
 ('psychiatrist','Psychiatrist','pending-review-v1'),
 ('clinical_psychologist','Clinical psychologist','pending-review-v1'),
 ('counselor','Counselor','pending-review-v1'),
 ('nutritionist','Nutritionist','pending-review-v1'),
 ('dietitian','Dietitian','pending-review-v1');
CREATE TABLE care.provider (
 id uuid PRIMARY KEY REFERENCES core.app_user(id), public_slug text NOT NULL UNIQUE,
 biography text NOT NULL DEFAULT '', languages text[] NOT NULL DEFAULT ARRAY['en'],
 status text NOT NULL DEFAULT 'APPLIED' CHECK(status IN ('APPLIED','UNDER_REVIEW','APPROVED','REJECTED','SUSPENDED')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE care.verification_case (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES care.provider(id),
 reviewer_id uuid REFERENCES core.app_user(id),
 status text NOT NULL CHECK(status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_INFORMATION','APPROVED','REJECTED')),
 submitted_at timestamptz, decided_at timestamptz, rationale text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,provider_id)
);
CREATE TABLE care.credential (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES care.provider(id),
 case_id uuid NOT NULL,
 profession_code text REFERENCES care.profession(code),
 kind text NOT NULL CHECK(kind IN ('IDENTITY','QUALIFICATION','REGISTRATION','EXPERIENCE')),
 issuer text NOT NULL, reference_number text,
 evidence_file_id uuid NOT NULL, expires_at timestamptz,
 status text NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','VERIFIED','REJECTED','EXPIRED')),
 FOREIGN KEY(case_id,provider_id) REFERENCES care.verification_case(id,provider_id),
 FOREIGN KEY(evidence_file_id,provider_id) REFERENCES core.file_asset(id,owner_user_id)
);
CREATE TABLE care.provider_scope (
 provider_id uuid NOT NULL REFERENCES care.provider(id), profession_code text NOT NULL REFERENCES care.profession(code),
 status text NOT NULL CHECK(status IN ('PENDING','APPROVED','SUSPENDED','EXPIRED')),
 reviewed_by uuid REFERENCES core.app_user(id), approved_at timestamptz, valid_until timestamptz,
 scope_description text NOT NULL, policy_version text NOT NULL,
 PRIMARY KEY(provider_id,profession_code)
);
CREATE TABLE care.service (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL,
 profession_code text NOT NULL, title text NOT NULL,
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 5 AND 240),
 buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_before_minutes BETWEEN 0 AND 120),
 buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_after_minutes BETWEEN 0 AND 120),
 price_minor bigint NOT NULL CHECK(price_minor>=0), currency text NOT NULL DEFAULT 'NPR' CHECK(currency='NPR'),
 active boolean NOT NULL DEFAULT false,
 FOREIGN KEY(provider_id,profession_code) REFERENCES care.provider_scope(provider_id,profession_code),
 UNIQUE(id,provider_id)
);
CREATE TABLE care.availability_rule (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES care.provider(id),
 weekday smallint NOT NULL CHECK(weekday BETWEEN 0 AND 6),
 local_start time NOT NULL, local_end time NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Kathmandu',
 valid_from date NOT NULL, valid_until date,
 CHECK(local_end>local_start), CHECK(valid_until IS NULL OR valid_until>=valid_from)
);
CREATE TABLE care.availability_exception (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES care.provider(id),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 kind text NOT NULL CHECK(kind IN ('UNAVAILABLE','EXTRA_AVAILABILITY')), CHECK(ends_at>starts_at)
);
CREATE TABLE care.calendar_connection (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES care.provider(id),
 external_calendar_id text NOT NULL, token_secret_reference text NOT NULL,
 status text NOT NULL CHECK(status IN ('ACTIVE','REAUTH_REQUIRED','DISCONNECTED')),
 last_synced_at timestamptz, UNIQUE(provider_id,external_calendar_id)
);
CREATE TABLE care.external_busy_interval (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES care.calendar_connection(id),
 external_event_id text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at),
 UNIQUE(connection_id,external_event_id)
);
CREATE TABLE care.appointment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES core.app_user(id),
 provider_id uuid NOT NULL, service_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'HELD' CHECK(status IN ('HELD','EXPIRED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW')),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 reserved_start_at timestamptz NOT NULL, reserved_end_at timestamptz NOT NULL,
 reserved_range tstzrange GENERATED ALWAYS AS (tstzrange(reserved_start_at,reserved_end_at,'[)')) STORED,
 hold_expires_at timestamptz,
 price_minor bigint NOT NULL CHECK(price_minor>=0), currency text NOT NULL DEFAULT 'NPR' CHECK(currency='NPR'),
 commission_bps integer NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000),
 policy_snapshot jsonb NOT NULL, service_snapshot jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(service_id,provider_id) REFERENCES care.service(id,provider_id),
 CHECK(client_id<>provider_id), CHECK(ends_at>starts_at),
 CHECK(reserved_start_at<=starts_at AND reserved_end_at>=ends_at),
 CHECK(status<>'HELD' OR hold_expires_at IS NOT NULL),
 UNIQUE(id,client_id,provider_id),
 EXCLUDE USING gist(provider_id WITH =, reserved_range WITH &&)
 WHERE(status IN ('HELD','CONFIRMED','IN_PROGRESS'))
);
CREATE INDEX appointment_client_history ON care.appointment(client_id,starts_at DESC);
CREATE INDEX appointment_provider_history ON care.appointment(provider_id,starts_at DESC);
CREATE INDEX appointment_hold_cleanup ON care.appointment(hold_expires_at) WHERE status='HELD';
CREATE TABLE care.appointment_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL REFERENCES care.appointment(id),
 actor_id uuid REFERENCES core.app_user(id), event_type text NOT NULL,
 redacted_payload jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE care.video_session (
 appointment_id uuid PRIMARY KEY REFERENCES care.appointment(id), vendor text NOT NULL,
 external_room_id text NOT NULL UNIQUE, status text NOT NULL CHECK(status IN ('PENDING','READY','ENDED','FAILED')),
 recording_enabled boolean NOT NULL DEFAULT false CHECK(recording_enabled=false),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE care.nutrition_intake (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES core.app_user(id),
 provider_id uuid NOT NULL REFERENCES care.provider(id), appointment_id uuid,
 consent_acceptance_id uuid NOT NULL REFERENCES core.consent_acceptance(id),
 encrypted_payload bytea NOT NULL, encryption_key_reference text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(appointment_id,client_id,provider_id) REFERENCES care.appointment(id,client_id,provider_id)
);
CREATE TABLE care.nutrition_plan (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES core.app_user(id),
 provider_id uuid NOT NULL REFERENCES care.provider(id), appointment_id uuid,
 status text NOT NULL CHECK(status IN ('ACTIVE','ARCHIVED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(appointment_id,client_id,provider_id) REFERENCES care.appointment(id,client_id,provider_id),
 UNIQUE(id,client_id,provider_id)
);
CREATE TABLE care.nutrition_plan_version (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL,
 client_id uuid NOT NULL, provider_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 encrypted_payload bytea NOT NULL, encryption_key_reference text NOT NULL,
 private_file_id uuid, issued_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(plan_id,client_id,provider_id) REFERENCES care.nutrition_plan(id,client_id,provider_id),
 FOREIGN KEY(private_file_id,client_id) REFERENCES core.file_asset(id,owner_user_id),
 UNIQUE(plan_id,version)
);
CREATE TABLE care.care_share_grant (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES core.app_user(id),
 nutrition_plan_id uuid NOT NULL, author_provider_id uuid NOT NULL,
 receiving_provider_id uuid NOT NULL REFERENCES care.provider(id),
 consent_acceptance_id uuid NOT NULL REFERENCES core.consent_acceptance(id),
 granted_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, revoked_at timestamptz,
 FOREIGN KEY(nutrition_plan_id,client_id,author_provider_id) REFERENCES care.nutrition_plan(id,client_id,provider_id),
 CHECK(receiving_provider_id<>author_provider_id)
);

CREATE TABLE shop.supplier (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_name text NOT NULL,
 status text NOT NULL CHECK(status IN ('PENDING','APPROVED','SUSPENDED')),
 evidence_file_id uuid REFERENCES core.file_asset(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shop.product (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, title text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('WELLNESS','SUPPLEMENT')),
 description text NOT NULL, supplier_id uuid NOT NULL REFERENCES shop.supplier(id),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','UNDER_REVIEW','APPROVED','PUBLISHED','SUSPENDED','RECALLED')),
 ingredients text, allergens text, warnings text, storage_instructions text,
 label_file_id uuid REFERENCES core.file_asset(id), evidence_file_id uuid REFERENCES core.file_asset(id),
 approval_reason text, approved_by uuid REFERENCES core.app_user(id), approved_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status NOT IN ('APPROVED','PUBLISHED') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
 CHECK(kind<>'SUPPLEMENT' OR status NOT IN ('APPROVED','PUBLISHED') OR
   (NULLIF(btrim(ingredients),'') IS NOT NULL AND NULLIF(btrim(allergens),'') IS NOT NULL
    AND NULLIF(btrim(warnings),'') IS NOT NULL AND NULLIF(btrim(storage_instructions),'') IS NOT NULL
    AND label_file_id IS NOT NULL AND evidence_file_id IS NOT NULL))
);
CREATE TABLE shop.product_review (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES shop.product(id),
 reviewer_id uuid NOT NULL REFERENCES core.app_user(id), revision integer NOT NULL CHECK(revision>0),
 decision text NOT NULL CHECK(decision IN ('APPROVE','REQUEST_CHANGES','REJECT','RECALL')),
 rationale text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shop.sku (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES shop.product(id),
 code text NOT NULL UNIQUE, attributes jsonb NOT NULL DEFAULT '{}',
 price_minor bigint NOT NULL CHECK(price_minor>=0), currency text NOT NULL DEFAULT 'NPR' CHECK(currency='NPR'),
 active boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 UNIQUE(id,product_id)
);
CREATE TABLE shop.warehouse (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 address_payload jsonb NOT NULL, active boolean NOT NULL DEFAULT true
);
CREATE TABLE shop.stock_batch (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku_id uuid NOT NULL REFERENCES shop.sku(id),
 warehouse_id uuid NOT NULL REFERENCES shop.warehouse(id), lot_code text NOT NULL,
 expires_on date, received_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','QUARANTINED','RECALLED','EXPIRED')),
 on_hand integer NOT NULL DEFAULT 0 CHECK(on_hand>=0), reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0),
 unit_cost_minor bigint NOT NULL CHECK(unit_cost_minor>=0),
 CHECK(reserved<=on_hand), UNIQUE(sku_id,warehouse_id,lot_code), UNIQUE(id,sku_id)
);
CREATE FUNCTION shop.check_supplement_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM shop.sku s JOIN shop.product p ON p.id=s.product_id
           WHERE s.id=NEW.sku_id AND p.kind='SUPPLEMENT')
    AND (NEW.expires_on IS NULL OR NULLIF(btrim(NEW.lot_code),'') IS NULL) THEN
  RAISE EXCEPTION 'Supplement inventory requires lot code and expiry';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER supplement_batch_guard BEFORE INSERT OR UPDATE ON shop.stock_batch
 FOR EACH ROW EXECUTE FUNCTION shop.check_supplement_batch();
CREATE INDEX stock_pick_index ON shop.stock_batch(sku_id,warehouse_id,expires_on) WHERE status='AVAILABLE';
CREATE TABLE shop.stock_movement (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES shop.stock_batch(id),
 on_hand_delta integer NOT NULL DEFAULT 0, reserved_delta integer NOT NULL DEFAULT 0,
 kind text NOT NULL CHECK(kind IN ('RECEIVE','RESERVE','RELEASE','DISPATCH','RETURN','ADJUST','DISPOSE')),
 reference_type text NOT NULL, reference_id uuid NOT NULL, dedupe_key text NOT NULL UNIQUE,
 actor_id uuid REFERENCES core.app_user(id), occurred_at timestamptz NOT NULL DEFAULT now(),
 CHECK(on_hand_delta<>0 OR reserved_delta<>0)
);
CREATE TABLE shop.cart (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES core.app_user(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shop.cart_item (
 cart_id uuid NOT NULL REFERENCES shop.cart(id), sku_id uuid NOT NULL REFERENCES shop.sku(id),
 quantity integer NOT NULL CHECK(quantity>0), PRIMARY KEY(cart_id,sku_id)
);
CREATE TABLE shop.product_order (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES core.app_user(id),
 status text NOT NULL DEFAULT 'AWAITING_PAYMENT' CHECK(status IN ('AWAITING_PAYMENT','EXPIRED','PAID','PROCESSING','FULFILLED','CANCELLED')),
 items_subtotal_minor bigint NOT NULL CHECK(items_subtotal_minor>=0),
 tax_minor bigint NOT NULL DEFAULT 0 CHECK(tax_minor>=0),
 shipping_minor bigint NOT NULL DEFAULT 0 CHECK(shipping_minor>=0),
 discount_minor bigint NOT NULL DEFAULT 0 CHECK(discount_minor>=0),
 total_minor bigint NOT NULL CHECK(total_minor>=0), currency text NOT NULL DEFAULT 'NPR' CHECK(currency='NPR'),
 encrypted_shipping_address bytea NOT NULL, encryption_key_reference text NOT NULL,
 policy_snapshot jsonb NOT NULL, checkout_expires_at timestamptz NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(total_minor=items_subtotal_minor+tax_minor+shipping_minor-discount_minor)
);
CREATE INDEX order_customer_history ON shop.product_order(user_id,created_at DESC);
CREATE TABLE shop.order_item (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES shop.product_order(id),
 sku_id uuid NOT NULL REFERENCES shop.sku(id), title_snapshot text NOT NULL, sku_snapshot jsonb NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),
 tax_minor bigint NOT NULL DEFAULT 0 CHECK(tax_minor>=0), discount_minor bigint NOT NULL DEFAULT 0 CHECK(discount_minor>=0),
 line_total_minor bigint NOT NULL CHECK(line_total_minor>=0),
 CHECK(line_total_minor=quantity::bigint*unit_price_minor+tax_minor-discount_minor),
 UNIQUE(id,sku_id), UNIQUE(id,order_id)
);
CREATE TABLE shop.stock_reservation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_item_id uuid NOT NULL, sku_id uuid NOT NULL,
 batch_id uuid NOT NULL, quantity integer NOT NULL CHECK(quantity>0),
 status text NOT NULL CHECK(status IN ('HELD','ALLOCATED','DISPATCHED','RELEASED')),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(order_item_id,sku_id) REFERENCES shop.order_item(id,sku_id),
 FOREIGN KEY(batch_id,sku_id) REFERENCES shop.stock_batch(id,sku_id)
);
CREATE INDEX reservation_cleanup ON shop.stock_reservation(expires_at) WHERE status='HELD';
CREATE TABLE shop.shipment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES shop.product_order(id),
 courier text NOT NULL, tracking_reference text,
 status text NOT NULL CHECK(status IN ('READY','DISPATCHED','DELIVERED','DELIVERY_FAILED','RETURNED')),
 dispatched_at timestamptz, delivered_at timestamptz, delivery_evidence_reference text,
 UNIQUE(id,order_id)
);
CREATE TABLE shop.shipment_item (
 shipment_id uuid NOT NULL, order_id uuid NOT NULL, order_item_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),
 FOREIGN KEY(shipment_id,order_id) REFERENCES shop.shipment(id,order_id),
 FOREIGN KEY(order_item_id,order_id) REFERENCES shop.order_item(id,order_id),
 PRIMARY KEY(shipment_id,order_item_id)
);
CREATE TABLE shop.return_request (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES shop.product_order(id),
 status text NOT NULL CHECK(status IN ('REQUESTED','APPROVED','REJECTED','RECEIVED','INSPECTED','CLOSED')),
 reason text NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,order_id)
);
CREATE TABLE shop.return_item (
 return_id uuid NOT NULL, order_id uuid NOT NULL, order_item_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),
 disposition text CHECK(disposition IN ('RESTOCK','QUARANTINE','DISPOSE','NOT_RECEIVED')),
 FOREIGN KEY(return_id,order_id) REFERENCES shop.return_request(id,order_id),
 FOREIGN KEY(order_item_id,order_id) REFERENCES shop.order_item(id,order_id),
 PRIMARY KEY(return_id,order_item_id)
);

CREATE TABLE finance.payment_attempt (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid REFERENCES care.appointment(id),
 order_id uuid REFERENCES shop.product_order(id), gateway text NOT NULL,
 idempotency_key text NOT NULL UNIQUE, gateway_reference text,
 amount_minor bigint NOT NULL CHECK(amount_minor>0), currency text NOT NULL DEFAULT 'NPR' CHECK(currency='NPR'),
 status text NOT NULL CHECK(status IN ('CREATED','PENDING','SUCCEEDED','FAILED','EXPIRED')),
 verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(appointment_id,order_id)=1),
 CHECK(status<>'SUCCEEDED' OR (verified_at IS NOT NULL AND gateway_reference IS NOT NULL)),
 UNIQUE(gateway,gateway_reference)
);
CREATE UNIQUE INDEX one_booking_capture ON finance.payment_attempt(appointment_id) WHERE status='SUCCEEDED';
CREATE UNIQUE INDEX one_order_capture ON finance.payment_attempt(order_id) WHERE status='SUCCEEDED';
CREATE TABLE finance.refund (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_attempt_id uuid NOT NULL REFERENCES finance.payment_attempt(id),
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 status text NOT NULL CHECK(status IN ('REQUESTED','APPROVED','PENDING','SUCCEEDED','FAILED','REJECTED')),
 idempotency_key text NOT NULL UNIQUE, gateway_refund_reference text,
 reason text NOT NULL, approved_by uuid REFERENCES core.app_user(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(payment_attempt_id,gateway_refund_reference)
);
CREATE TABLE finance.ledger_account (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN ('ASSET','LIABILITY','REVENUE','EXPENSE','EQUITY')),
 provider_id uuid REFERENCES care.provider(id), currency text NOT NULL DEFAULT 'NPR' CHECK(currency='NPR')
);
CREATE TABLE finance.ledger_transaction (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED')),
 currency text NOT NULL DEFAULT 'NPR' CHECK(currency='NPR'),
 source_type text NOT NULL, source_id uuid NOT NULL,
 reversal_of uuid REFERENCES finance.ledger_transaction(id),
 created_at timestamptz NOT NULL DEFAULT now(), posted_at timestamptz,
 CHECK(status<>'POSTED' OR posted_at IS NOT NULL), CHECK(reversal_of IS NULL OR reversal_of<>id)
);
CREATE TABLE finance.ledger_posting (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES finance.ledger_transaction(id),
 account_id uuid NOT NULL REFERENCES finance.ledger_account(id),
 signed_amount_minor bigint NOT NULL CHECK(signed_amount_minor<>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_account_history ON finance.ledger_posting(account_id,created_at);
CREATE FUNCTION finance.guard_posted_header() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='POSTED' THEN RAISE EXCEPTION 'Posted ledger transactions are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ledger_header_immutable BEFORE UPDATE OR DELETE ON finance.ledger_transaction
 FOR EACH ROW EXECUTE FUNCTION finance.guard_posted_header();
CREATE FUNCTION finance.guard_posted_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_state text; new_state text;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
  SELECT status INTO old_state FROM finance.ledger_transaction WHERE id=OLD.transaction_id FOR UPDATE;
  IF old_state='POSTED' THEN RAISE EXCEPTION 'Posted ledger postings are immutable'; END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  SELECT status INTO new_state FROM finance.ledger_transaction WHERE id=NEW.transaction_id FOR UPDATE;
  IF new_state='POSTED' THEN RAISE EXCEPTION 'Cannot add/change a posted ledger posting'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ledger_posting_immutable BEFORE INSERT OR UPDATE OR DELETE ON finance.ledger_posting
 FOR EACH ROW EXECUTE FUNCTION finance.guard_posted_posting();
CREATE FUNCTION finance.check_ledger_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE posting_count bigint; total numeric; current_state text;
BEGIN
 SELECT status INTO current_state FROM finance.ledger_transaction WHERE id=NEW.id;
 IF current_state='POSTED' THEN
  SELECT count(*),COALESCE(sum(signed_amount_minor),0) INTO posting_count,total
   FROM finance.ledger_posting WHERE transaction_id=NEW.id;
  IF posting_count<2 OR total<>0 THEN RAISE EXCEPTION 'Posted ledger must have at least two balanced postings'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_balanced AFTER INSERT OR UPDATE ON finance.ledger_transaction
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.check_ledger_balance();
CREATE TABLE finance.settlement_batch (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), gateway text NOT NULL, external_reference text NOT NULL,
 gross_minor bigint NOT NULL CHECK(gross_minor>=0), fees_minor bigint NOT NULL CHECK(fees_minor>=0),
 net_minor bigint NOT NULL CHECK(net_minor>=0), settled_at timestamptz NOT NULL,
 CHECK(net_minor=gross_minor-fees_minor), UNIQUE(gateway,external_reference)
);
CREATE TABLE finance.reconciliation_exception (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_attempt_id uuid REFERENCES finance.payment_attempt(id),
 settlement_batch_id uuid REFERENCES finance.settlement_batch(id),
 kind text NOT NULL, status text NOT NULL CHECK(status IN ('OPEN','INVESTIGATING','RESOLVED')),
 expected_minor bigint, observed_minor bigint, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE finance.provider_payout (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid NOT NULL REFERENCES care.provider(id),
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 status text NOT NULL CHECK(status IN ('REQUESTED','APPROVED','PROCESSING','PAID','FAILED','CANCELLED')),
 destination_secret_reference text NOT NULL, approved_by uuid REFERENCES core.app_user(id),
 external_reference text UNIQUE, idempotency_key text NOT NULL UNIQUE,
 ledger_transaction_id uuid REFERENCES finance.ledger_transaction(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ops.audit_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES core.app_user(id),
 action text NOT NULL, target_type text NOT NULL, target_id uuid,
 purpose text NOT NULL, request_id text, redacted_metadata jsonb NOT NULL DEFAULT '{}',
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ops.webhook_inbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor text NOT NULL, external_event_id text NOT NULL,
 verified boolean NOT NULL DEFAULT false, redacted_payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','PROCESSED','FAILED')),
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 UNIQUE(vendor,external_event_id)
);
CREATE TABLE ops.outbox_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text NOT NULL, aggregate_type text NOT NULL,
 aggregate_id uuid NOT NULL, dedupe_key text NOT NULL UNIQUE, redacted_payload jsonb NOT NULL,
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 processed_at timestamptz, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_ready ON ops.outbox_event(available_at) WHERE processed_at IS NULL;
CREATE TABLE ops.background_job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, dedupe_key text NOT NULL UNIQUE,
 target_type text NOT NULL, target_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('READY','RUNNING','SUCCEEDED','FAILED','DEAD')),
 run_at timestamptz NOT NULL, lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), last_error_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_ready ON ops.background_job(run_at) WHERE status IN ('READY','FAILED');
CREATE TABLE ops.content_item (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL, language_code text NOT NULL CHECK(language_code IN ('en','ne')),
 title text NOT NULL, body text NOT NULL, version integer NOT NULL CHECK(version>0),
 author_id uuid NOT NULL REFERENCES core.app_user(id), reviewer_id uuid REFERENCES core.app_user(id),
 status text NOT NULL CHECK(status IN ('DRAFT','UNDER_REVIEW','APPROVED','PUBLISHED','ARCHIVED')),
 reviewed_at timestamptz, published_at timestamptz,
 CHECK(status NOT IN ('APPROVED','PUBLISHED') OR (reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)),
 UNIQUE(slug,language_code,version)
);
CREATE TABLE ops.resource_share (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL,
 client_id uuid NOT NULL, provider_id uuid NOT NULL,
 content_item_id uuid NOT NULL REFERENCES ops.content_item(id), shared_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(appointment_id,client_id,provider_id) REFERENCES care.appointment(id,client_id,provider_id)
);
CREATE TABLE ops.incident (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reported_by uuid REFERENCES core.app_user(id),
 appointment_id uuid REFERENCES care.appointment(id), order_id uuid REFERENCES shop.product_order(id),
 severity text NOT NULL CHECK(severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
 status text NOT NULL CHECK(status IN ('OPEN','TRIAGED','INVESTIGATING','RESOLVED')),
 assigned_to uuid REFERENCES core.app_user(id), encrypted_narrative bytea NOT NULL,
 encryption_key_reference text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

-- Search taxonomy and product imagery are independent of sensitive care records.
CREATE TABLE care.specialty (
 code text PRIMARY KEY, label_en text NOT NULL, label_ne text,
 status text NOT NULL CHECK(status IN ('DRAFT','APPROVED','ARCHIVED'))
);
CREATE TABLE care.service_specialty (
 service_id uuid NOT NULL REFERENCES care.service(id),
 specialty_code text NOT NULL REFERENCES care.specialty(code),
 PRIMARY KEY(service_id,specialty_code)
);
CREATE TABLE shop.product_image (
 product_id uuid NOT NULL REFERENCES shop.product(id),
 file_id uuid NOT NULL REFERENCES core.file_asset(id),
 sort_order integer NOT NULL CHECK(sort_order>=0), alt_text text NOT NULL,
 PRIMARY KEY(product_id,file_id), UNIQUE(product_id,sort_order)
);
ALTER TABLE finance.refund ADD COLUMN return_request_id uuid REFERENCES shop.return_request(id);
CREATE TABLE finance.refund_allocation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), refund_id uuid NOT NULL REFERENCES finance.refund(id),
 order_item_id uuid REFERENCES shop.order_item(id),
 kind text NOT NULL CHECK(kind IN ('CONSULTATION','PRODUCT_LINE','SHIPPING','ORDER_TAX','GOODWILL')),
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 CHECK((kind='PRODUCT_LINE')=(order_item_id IS NOT NULL))
);
CREATE INDEX scope_directory_lookup ON care.provider_scope(profession_code,status,provider_id);
CREATE INDEX public_provider_lookup ON care.provider(status) WHERE status='APPROVED';
CREATE INDEX product_public_lookup ON shop.product(kind,status) WHERE status='PUBLISHED';
CREATE INDEX order_operations_lookup ON shop.product_order(status,created_at);
CREATE INDEX payment_booking_lookup ON finance.payment_attempt(appointment_id,created_at);
CREATE INDEX payment_order_lookup ON finance.payment_attempt(order_id,created_at);
CREATE INDEX incident_worklist ON ops.incident(status,severity,created_at);
CREATE INDEX privacy_worklist ON core.privacy_request(status,requested_at);


-- Initial deny-by-default boundary: no browser roles access these schemas.
REVOKE ALL ON SCHEMA core, care, shop, finance, ops FROM PUBLIC, anon, authenticated;
DO $security$
DECLARE schema_name text; table_row record;
BEGIN
 FOREACH schema_name IN ARRAY ARRAY['core','care','shop','finance','ops'] LOOP
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC, anon, authenticated', schema_name);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC, anon, authenticated', schema_name);
  EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM PUBLIC, anon, authenticated', schema_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated', schema_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated', schema_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated', schema_name);
 END LOOP;
 FOR table_row IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('core','care','shop','finance','ops') LOOP
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',table_row.schemaname,table_row.tablename);
 END LOOP;
END $security$;
-- Intentionally no RLS policies; browser access is denied until separately designed.

COMMIT;
