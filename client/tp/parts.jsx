/* ============================================================================
   THE FOUR SHAPES EVERY TRUSTED PARTNER SECTION IS MADE OF

     <Panel>    a titled group, or one sentence when the group is empty
     <Record>   one projected record: what it is, then what is known about it
     <Fact>     one labelled value — and NOTHING when there is no value
     <Tag>      a short state word the server chose

   Three sections built from the same four shapes read as one product rather
   than three screens, and there is one place to fix how a record looks.

   `<Fact>` is the load-bearing one. It renders `null` when its value is null,
   so "this Trusted Partner has never recorded a last contact" is the ABSENCE
   of a line rather than a line reading "—" or "never". A projection that did
   not carry a fact cannot be made to look like one that carried an empty one.

   A record's layout is a title, then facts that WRAP. At laptop width they sit
   on one line and scan like a table; on a phone they fall onto two or three.
   No table means no horizontal scrolling and no column that collapses to
   nothing, which is what the pilot needs on a shop counter.
   ========================================================================== */

import React from "react";

export function Tag({ children, tone = null }) {
  if (children === null || children === undefined || children === "") return null;
  return <span className={"tps-tag" + (tone ? ` tps-tag-${tone}` : "")}>{children}</span>;
}

export function Fact({ label, value, mono = false }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <span className="tps-fact">
      <span className="tps-fact-l">{label}</span>
      <span className={"tps-fact-v" + (mono ? " mono" : "")}>{value}</span>
    </span>
  );
}

/* `note` is a fact about the group — how many rows, whether anything is saving.
   `action` is a control. They are separate props because they are separate
   things, and a panel that needs both should not have to choose. */
export function Panel({ title, note = null, action = null, empty = null, children }) {
  return (
    <section className="tps-panel">
      <header className="tps-ph">
        <h2>{title}</h2>
        {note ? <span className="tps-note">{note}</span> : null}
        {action ? <span className={"tps-act" + (note ? "" : " tps-act-lead")}>{action}</span> : null}
      </header>
      {empty ? <p className="tps-empty">{empty}</p> : <div className="tps-list">{children}</div>}
    </section>
  );
}

export function Record({ title, subtitle = null, marks = [], tags = null, facts = null,
  note = null, noteLabel = null, children = null }) {
  return (
    <article className="tps-rec">
      <div className="tps-rec-head">
        <div className="tps-rec-id">
          <div className="tps-rec-t">{title}</div>
          {subtitle ? <div className="tps-rec-s">{subtitle}</div> : null}
          {marks.length ? (
            <div className="tps-marks">{marks.map((m) => <span key={m} className="tps-mark">{m}</span>)}</div>
          ) : null}
        </div>
        {tags ? <div className="tps-rec-tags">{tags}</div> : null}
      </div>
      {facts ? <div className="tps-facts">{facts}</div> : null}
      {note ? (
        <p className="tps-rec-note">
          {noteLabel ? <span className="tps-fact-l">{noteLabel}</span> : null}
          {note}
        </p>
      ) : null}
      {children}
    </article>
  );
}
