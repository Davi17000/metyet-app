/* ============================================================================
   ONE DEAL'S CONVERSATION, AS BOTH SIDES SEE IT (Milestone 2D.2)

   The Collector's Deal Workspace and the Trusted Partner's opportunity record
   show the same thread through this one module, so the two seats cannot drift
   into describing the same conversation differently. Each styles it with its
   own prefix (`mcs` for a Collector, `tps` for a Trusted Partner); the class
   names are otherwise the same — the convention negotiation.jsx set.

   THE THREAD IS THE SERVER'S. It is found in the viewer's own projection,
   `state.conversations`, by the deal's own key (`opp::<oppId>`, Milestone
   2D.1) — the server sends each participant only their own threads, so a
   thread that is not there is not shown and is never asked for. Nothing here
   keeps a copy of a message, and NOTHING IS OPTIMISTIC: a message appears in
   the list only once the server's projection holds it. While one is on its
   way, its text stays in the box, marked as sending — never drawn as sent.

   CHAT PROVIDES CONTINUITY; STRUCTURED ACTIONS MOVE THE DEAL. A message is
   sent through `onSendMessage(oppId, text, nonce)`, the one messaging command,
   and nothing else. No text is ever read for intent: "I accept $11" is a
   message, and the price is only ever agreed by the Accept button above it.

   ONE NONCE PER COMPOSED MESSAGE. A message is given a nonce when it is first
   sent, and a retry of the same text sends the same nonce, so a send whose
   answer was lost cannot become two messages — the server recognises it and
   answers with the original. Changing the text makes it a new message with a
   new nonce. The nonce comes back only to its sender (2D.1), which is how an
   unconfirmed send is recognised as delivered after a re-read.

   READ-ONLY WHEN THE DEAL IS OVER. The composer is drawn only while the
   server says the deal is active (`turn.active`); an ended or completed deal
   keeps its history and has no box to type in.
   ========================================================================== */

import React, { useEffect, useRef, useState } from "react";

/* The server's rule, said once on this side (domain DEAL_MESSAGE_MAX). The
   length is counted in characters as a person sees them (code points), the
   way the server counts it — so an emoji is one, not two. */
export const MESSAGE_MAX = 2000;
const NEAR = 1800;

const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

/* This deal's thread in this viewer's projection, or null before the first
   message. Matched on the deal's own key AND its id, never on a card. */
export const dealThread = (state, oppId) => (oppId == null ? null
  : list(state && state.conversations)
    .find((t) => t.key === `opp::${oppId}` && t.oppId === oppId) || null);

export const messagesOf = (thread) => list(thread && thread.entries)
  .filter((e) => e.kind === "message" && typeof e.text === "string");

/* What a draft would send: trimmed, counted, and whether it may be sent. */
export function readDraft(raw) {
  const clean = String(raw == null ? "" : raw).trim();
  const length = [...clean].length;
  if (!clean) return { clean, length, ready: false, problem: null };
  if (length > MESSAGE_MAX) {
    return { clean, length, ready: false,
      problem: `Messages can be up to ${MESSAGE_MAX.toLocaleString("en-US")} characters. This one is ${length.toLocaleString("en-US")}.` };
  }
  return { clean, length, ready: true, problem: null };
}

/* A fresh nonce: random, opaque, well under the server's 128 characters. */
export function newNonce() {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/* "Nov 4, 2:31 PM" — with the year when it is not this one. */
export function when(at, now = new Date()) {
  const d = new Date(at);
  if (!at || Number.isNaN(d.getTime())) return null;
  const opts = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleString("en-US", opts);
}

/* The server's refusals of a message, in a sentence a person can act on. A
   code this build has never seen gets the honest general answer. */
const REFUSAL = Object.freeze({
  "message-empty": "Write a message before sending.",
  "message-too-long": `Messages can be up to ${MESSAGE_MAX.toLocaleString("en-US")} characters.`,
  "nonce-required": "That message couldn't be sent. Try again.",
  "nonce-conflict": "That message couldn't be sent. Try again.",
  terminal: "This deal has ended, so new messages can't be sent. The conversation is kept here.",
  "not-participant": "That deal isn't one you're part of.",
  "not-found": "This deal couldn't be found. The latest is shown here.",
  "command-unavailable": "Messaging isn't available in this version of MetYet.",
});
const refusal = (code) => REFUSAL[code] || "That message wasn't sent. Your text is still here.";
/* Refusals that mean the screen is out of date: re-read what is true. */
const STALE = new Set(["terminal", "not-found", "not-participant"]);

/* --------------------------------------------------------------- SENDING
   One message at a time. `attempt` is the message being sent or last sent
   unsuccessfully: its trimmed text and its nonce. Sending the same text again
   reuses that nonce; different text is a new message with a new one. The
   guard is a ref, set before anything is awaited, so two presses in the same
   instant are one send. */
function useMessageSender({ oppId, me, thread, onSendMessage, onRefresh }) {
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState("idle");     // idle | sending | failed | unconfirmed
  const [trouble, setTrouble] = useState(null);
  const [said, setSaid] = useState(null);         // a quiet confirmation, for screen readers
  const attempt = useRef(null);
  const flight = useRef(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const delivered = () => {
    attempt.current = null;
    setDraft("");
    setPhase("idle");
    setTrouble(null);
    setSaid("Message sent.");
  };

  /* AN UNCONFIRMED SEND, CONFIRMED BY THE SERVER. After a send whose answer
     was lost, a re-read may show the message did arrive: the sender's own
     nonce is on it. Then it is delivered — not sent again, not shown twice. */
  const pendingNonce = phase === "unconfirmed" && attempt.current ? attempt.current.nonce : null;
  const arrived = !!pendingNonce && messagesOf(thread).some((m) => m.by === me && m.nonce === pendingNonce);
  useEffect(() => { if (arrived) delivered(); }, [arrived]);

  const send = async () => {
    const read = readDraft(draft);
    if (flight.current || !read.ready || typeof onSendMessage !== "function") return false;
    flight.current = true;
    if (!attempt.current || attempt.current.clean !== read.clean) {
      attempt.current = { clean: read.clean, nonce: newNonce() };
    }
    const { nonce } = attempt.current;
    setPhase("sending");
    setTrouble(null);
    setSaid(null);
    try {
      const answer = await onSendMessage(oppId, read.clean, nonce);
      if (!live.current) return false;
      if (answer && answer.ok === false) {
        setPhase("failed");
        setTrouble(refusal(answer.refused));
        if (STALE.has(answer.refused) && onRefresh) {
          try { await onRefresh(); } catch (error) { /* the sentence already says enough */ }
        }
        return false;
      }
      delivered();
      return true;
    } catch (error) {
      if (!live.current) return false;
      const failure = error && (error.failure || error.code);
      /* Some failures are known not to have sent anything: the world moved
         first and the save rolled back, or another action was still on its
         way. Everything else is unknown — the message may have arrived. */
      if (failure === "conflict" || failure === "store.command-in-flight") {
        setPhase("failed");
        setTrouble("Your message wasn't sent. Your text is still here — try again.");
      } else if (failure === "unauthenticated") {
        setPhase("unconfirmed");
        setTrouble("Your session has ended. Sign in again to send this message.");
      } else {
        setPhase("unconfirmed");
        setTrouble("MetYet couldn't confirm your message was sent. Your text is still here — Retry won't send it twice.");
        if (onRefresh) { try { await onRefresh(); } catch (e) { /* the sentence already says enough */ } }
      }
      return false;
    } finally {
      flight.current = false;
    }
  };

  const edit = (value) => {
    setDraft(value);
    setSaid(null);
  };
  const read = readDraft(draft);
  const retrying = (phase === "failed" || phase === "unconfirmed")
    && !!attempt.current && attempt.current.clean === read.clean;
  return { draft, edit, send, phase, trouble, said, read, retrying, sending: phase === "sending" };
}

/* --------------------------------------------------------------- THE THREAD
   `cls`        the seat's class prefix
   `deal`       the viewer's own projected deal
   `state`      the viewer's projection, where the thread is
   `me`         the viewer's seat (`collector` or `tp`)
   `other`      the other participant's name
   `headingId`  so the section can be labelled by its own heading
   `title`      the heading; the seat says it in its own words */
export function DealConversation({ cls, deal, state, me, other, title = null, onSendMessage = null,
  onRefresh = null, hint = null }) {
  const oppId = deal ? deal.id : null;
  const thread = dealThread(state, oppId);
  const messages = messagesOf(thread);
  const active = !!(deal && deal.turn && deal.turn.active === true);
  const sender = useMessageSender({ oppId, me, thread, onSendMessage, onRefresh });
  const [checking, setChecking] = useState(false);
  const [checkTrouble, setCheckTrouble] = useState(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const who = other || "them";
  const headingId = `${cls}-msg-h-${oppId}`;
  const boxId = `${cls}-msg-in-${oppId}`;
  const helpId = `${cls}-msg-help-${oppId}`;

  const check = async () => {
    if (!onRefresh || checking) return;
    setChecking(true);
    setCheckTrouble(null);
    try { await onRefresh(); } catch (error) {
      if (live.current) setCheckTrouble("MetYet couldn't refresh messages just now.");
    } finally { if (live.current) setChecking(false); }
  };

  const composing = active && typeof onSendMessage === "function";
  const { read } = sender;
  const verb = sender.sending ? "Sending…" : sender.retrying ? "Retry" : "Send";

  return (
    <section className={`${cls}-msg`} aria-labelledby={headingId} data-thread={oppId}
      data-messaging={composing ? "open" : "read-only"}>
      <div className={`${cls}-msg-hd`}>
        <h2 className={`${cls}-msg-h`} id={headingId}>{title || `Conversation with ${who}`}</h2>
        {onRefresh ? (
          <button type="button" className={`${cls}-msg-check`} onClick={check} disabled={checking}>
            {checking ? "Refreshing…" : "Refresh messages"}
          </button>
        ) : null}
      </div>
      {checkTrouble ? <p className={`${cls}-msg-trouble`} role="status">{checkTrouble}</p> : null}

      {messages.length ? (
        <ol className={`${cls}-msg-list`} aria-label={`Messages with ${who}`}>
          {messages.map((m) => {
            const mine = !!me && m.by === me;
            const at = when(m.at);
            return (
              <li key={m.id} className={`${cls}-msg-item${mine ? " mine" : ""}`}>
                <p className={`${cls}-msg-meta`}>
                  <span className={`${cls}-msg-who`}>{mine ? "You" : who}</span>
                  {at ? <time dateTime={m.at}>{at}</time> : null}
                </p>
                <p className={`${cls}-msg-text`}>{m.text}</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={`${cls}-msg-empty`}>
          {active
            ? "No messages yet."
            : "No messages were sent on this deal."}
        </p>
      )}

      {composing ? (
        <form className={`${cls}-msg-form`} aria-label={`Message ${who}`}
          onSubmit={(e) => { if (e && e.preventDefault) e.preventDefault(); sender.send(); }}>
          {/* Short on screen; the full name for a screen reader. */}
          <label className={`${cls}-msg-label`} htmlFor={boxId}>
            Message<span className={`${cls}-msg-vh`}>{` ${who}`}</span>
          </label>
          <textarea id={boxId} className={`${cls}-msg-in`} rows={3} value={sender.draft}
            aria-describedby={helpId} aria-invalid={read.problem ? true : undefined}
            readOnly={sender.sending} onChange={(e) => sender.edit(e.target.value)} />
          {read.problem ? <p className={`${cls}-msg-problem`} role="status">{read.problem}</p>
            : read.length > NEAR ? (
              <p className={`${cls}-msg-count`}>{`${read.length.toLocaleString("en-US")} / ${MESSAGE_MAX.toLocaleString("en-US")}`}</p>
            ) : null}
          {sender.trouble ? <p className={`${cls}-msg-trouble`} role="status">{sender.trouble}</p> : null}
          <div className={`${cls}-msg-do`}>
            <p className={`${cls}-msg-help`} id={helpId}>
              {hint || "Chat doesn't confirm a deal. Offers and acceptance use the price buttons."}
            </p>
            <button type="submit" className={`${cls}-msg-send`} disabled={!read.ready || sender.sending}>{verb}</button>
          </div>
          <span className={`${cls}-msg-sr`} role="status">{sender.said || ""}</span>
        </form>
      ) : active ? null : (
        <p className={`${cls}-msg-closed`}>
          {deal && deal.stage === "completed"
            ? "This deal is complete. Messages are read-only."
            : "This deal has ended. Messages are read-only."}
        </p>
      )}
    </section>
  );
}
