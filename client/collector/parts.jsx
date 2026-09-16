/* ============================================================================
   THE FOUR SHAPES EVERY COLLECTOR SECTION IS MADE OF

     <Panel>    a titled group, or one sentence when the group is empty
     <Record>   one projected record: what it is, then what is known about it
     <Fact>     one labelled value — and NOTHING when there is no value
     <Tag>      a short state word the server chose

   `<Fact>` is the load-bearing one. It renders `null` when its value is null,
   so "the server sent no date for this" is the ABSENCE of a line rather than a
   line reading "—". A projection that did not carry a fact cannot be made to
   look like one that carried an empty one.

   A record is a title and then facts that WRAP, which is what makes this work
   on a phone: nothing scrolls sideways and no column collapses to nothing.
   ========================================================================== */

import React from "react";

export function Tag({ children, tone = null }) {
  if (children === null || children === undefined || children === "") return null;
  return <span className={"mcs-tag" + (tone ? ` mcs-tag-${tone}` : "")}>{children}</span>;
}

export function Fact({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <span className="mcs-fact">
      <span className="mcs-fact-l">{label}</span>
      <span className="mcs-fact-v">{value}</span>
    </span>
  );
}

export function Panel({ title, note = null, empty = null, children }) {
  return (
    <section className="mcs-panel">
      <header className="mcs-ph">
        <h2>{title}</h2>
        {note ? <span className="mcs-pnote">{note}</span> : null}
      </header>
      {empty ? <p className="mcs-empty">{empty}</p> : <div className="mcs-list">{children}</div>}
    </section>
  );
}

export function Record({ title, subtitle = null, marks = [], tags = null, facts = null,
  note = null, noteLabel = null, children = null }) {
  return (
    <article className="mcs-rec">
      <div className="mcs-rec-head">
        <div className="mcs-rec-id">
          <div className="mcs-rec-t">{title}</div>
          {subtitle ? <div className="mcs-rec-s">{subtitle}</div> : null}
          {marks.length ? (
            <div className="mcs-marks">{marks.map((m) => <span key={m} className="mcs-mark">{m}</span>)}</div>
          ) : null}
        </div>
        {tags ? <div className="mcs-rec-tags">{tags}</div> : null}
      </div>
      {facts ? <div className="mcs-facts">{facts}</div> : null}
      {note ? (
        <p className="mcs-rec-note">
          {noteLabel ? <span className="mcs-fact-l">{noteLabel}</span> : null}
          {note}
        </p>
      ) : null}
      {children}
    </article>
  );
}
