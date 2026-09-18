-- ============================================================================
-- 0005 — WHERE MetYet SENT AN INVITATION, WHICH IS NOT WHO IT BELONGS TO
-- (Phase 5 Batch 3B-2)
--
-- Batch 2 created invitations and handed the credential to a Trusted Partner to
-- pass on. Batch 3B-1 made the link work. This batch lets MetYet send that link
-- by email, and these four columns are the whole of what it has to remember.
--
-- THE ADDRESS IS A DESTINATION, NOT AN IDENTITY. Nothing in redemption reads
-- it. A Collector signs in with whatever address they can receive mail at, and
-- possession of the credential plus an authenticated identity is what makes
-- them the right person — which is the decision Batch 2 was redesigned around
-- and the one these columns must never quietly undo. That is why they live in
-- metyet_auth beside the credential rather than in the canonical world: the
-- world is product state, and a delivery address is infrastructure.
--
-- WHY THIS IS FOUR COLUMNS AND NOT A TABLE. A delivery belongs to a credential,
-- one to one, and it stays one to one because a failed send is recovered by
-- REPLACING the invitation rather than retrying it — a new invitation, a new
-- credential, a new row. So there is no attempt history to keep and nothing to
-- join. The shape follows from the recovery model rather than being chosen
-- alongside it.
--
-- AND WHY THERE IS NO STATE COLUMN. The state is derivable and is derived, the
-- way metyet_auth.partner_invitations already derives accepted/revoked/expired
-- /pending in server/auth/invitations.js rather than storing a word that can
-- disagree with the timestamps beside it:
--
--   delivery_requested_at is null   nobody asked MetYet to send anything
--   delivered_at is set             the provider accepted it
--   delivery_error is set           the provider refused it
--   neither, but requested          MetYet does not know, and says so
--
-- The last of those is the honest one. A send whose outcome never came back —
-- a timeout, or a process that died between the provider answering and this row
-- being written — must not read as success. It reads as "we cannot tell", and
-- the partner's remedy is to replace the invitation.
--
-- delivery_error holds a CATEGORY OF OURS — rejected, unavailable, unexpected —
-- and never the provider's own words. A provider's error body can quote back
-- what was sent to it, and what was sent to it contained a credential.
--
-- RETENTION. `delivered_to` and `delivery_error` are cleared when an invitation
-- becomes terminal: claimed (server/auth/collector-invitations.js `claim`) or
-- withdrawn. An address has no purpose once the door it pointed at is closed,
-- and the partner still has their own recipient label in the world. The
-- timestamps stay, because "this one was emailed" outlives the address.
--
-- Forward-only and additive. 0004 is applied and is not touched.
-- ============================================================================

alter table metyet_auth.collector_invitation_credentials
  add column delivery_requested_at timestamptz,
  add column delivered_to          text,
  add column delivered_at          timestamptz,
  add column delivery_error        text;

-- A send cannot have both succeeded and failed. Either outcome may be absent —
-- that is the unconfirmed case, and it is a real state rather than a gap.
alter table metyet_auth.collector_invitation_credentials
  add constraint collector_credentials_delivery_check
  check (delivered_at is null or delivery_error is null);
