"use client";
import { useState } from "react";
import { useApp } from "./app";
import { Dialog } from "./ui";
export function OrderReturn({ id }: { id: string }) {
  const { api, run, busy, setNotice } = useApp();
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState("CHANGE_OF_MIND"),
    [note, setNote] = useState(""),
    [sealed, setSealed] = useState(false);
  return (
    <>
      <button className="text-button" onClick={() => setOpen(true)}>
        Request return
      </button>
      {open && (
        <Dialog title="Request a product return" close={() => setOpen(false)}>
          <p>
            Use this form for a whole-order return. For selected items or
            another issue, contact Chatbud support.
          </p>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("workflow", "POST", {
                  action: "return_request",
                  data: { orderId: id, reason, note, unopenedUnused: sealed },
                });
                setOpen(false);
                setNotice("Return case created. Track progress in Help.");
              });
            }}
          >
            <label>
              Reason
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="CHANGE_OF_MIND">
                  Change of mind · within 7 days
                </option>
                <option value="DAMAGED">Damaged product</option>
                <option value="INCORRECT">Incorrect product</option>
                <option value="FAULTY">Faulty product</option>
              </select>
            </label>
            {reason === "CHANGE_OF_MIND" && (
              <label>
                <input
                  type="checkbox"
                  required
                  checked={sealed}
                  onChange={(e) => setSealed(e.target.checked)}
                />{" "}
                All items are unopened, unused and have intact seals where
                applicable.
              </label>
            )}
            <label>
              Details
              <textarea
                required
                minLength={3}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p className="workflow-note">
              Chatbud pays shipping for approved returns. Refund eligibility
              follows receipt and inspection, or an authorized waiver. Original
              delivery fees are refunded for damaged, incorrect or faulty items;
              they are retained for change-of-mind returns.
            </p>
            <button className="button" disabled={busy}>
              Submit return request
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
