/* ============================================================================
   COLLECTOR NETWORK — WHO YOU'RE SERVING, AND WHAT YOU KNOW ABOUT THEM

   MetYet is a relationship network, not a marketplace, so this section is the
   one that says what the network IS. Every collector on it is in the
   projection's `collectors` collection, which the server filled by walking this
   Trusted Partner's own accepted Relationships. There is no other list, no
   directory and no search: a collector who is not related to you does not
   appear here because the server never sent them.

   THE JOIN IS BY IDENTIFIER, NEVER BY POSITION. A collector's relationship,
   goals and binder copies are found by matching `collectorId` — not by taking
   the row at the same index, and not by taking the first one. Row order is not
   a fact the server promised, and a screen that depends on it is a screen that
   silently shows one person's data against another's name.

   WHAT IS SHOWN, AND WHY EACH IS LEGITIMATE.

   Identity — `name`, `short`, `city` — is COLLECTOR_FOR_PARTNER: what a related
   partner may see. Preference tags are the same rule (D-2), and they are the
   matching profile this product runs on, so they belong on the card.

   The relationship's start, your own last contact, your own binder review time
   and your own note are RELATIONSHIP_PARTNER_PRIVATE: they are yours, about
   your relationship, and only you receive them. Another Trusted Partner's notes
   about the same collector are not in this projection and there is no code path
   here that could ask for them.

   Goals are GOAL_FOR_PARTNER, scoped by the server to collectors in your
   network. They are demand — the thing this product exists to serve — so each
   collector's own goals are listed under them with the tier the server set.

   NOTHING MISSING IS INVENTED. A relationship with no recorded last contact
   shows no last-contact line, rather than "never" or a date derived from
   something else. A collector with no goals shows no goals. Absence is
   rendered as absence.
   ========================================================================== */

import React from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, indexById, groupBy, text, day, plural, cardTitle, cardSetLine,
  gradeLine, tierLabel, byRecency } from "../present.js";

export default function CollectorNetwork({ state }) {
  const collectors = rows(state && state.collectors);
  const relationships = rows(state && state.relationships);
  const invitations = rows(state && state.invitations);
  const catalog = indexById(state && state.catalog);

  /* Explicit identifiers, every one of them. */
  const relationshipOf = new Map();
  for (const r of relationships) if (r.collectorId != null) relationshipOf.set(r.collectorId, r);
  const goalsOf = groupBy(state && state.goals, "collectorId");
  const binderOf = groupBy(state && state.binder, "collectorId");
  const oppsOf = groupBy(state && state.opportunities, "collectorId");

  /* Most recently in contact first, when that is known; the rest keep the
     order the server sent them in. */
  const ordered = byRecency(
    collectors.map((c) => ({ ...c, __at: (relationshipOf.get(c.id) || {}).last })),
    "__at",
  );

  const pending = invitations.filter((i) => !i.acceptedAt);

  return (
    <>
      <Panel
        title="Collectors"
        note={collectors.length ? plural(collectors.length, "collector", "collectors") : null}
        empty={collectors.length ? null
          : "No collectors in your network yet. A collector joins by accepting an invitation from "
            + "you — sending one isn't part of this release."}
      >
        {ordered.map((c) => {
          const rel = relationshipOf.get(c.id) || null;
          const goals = goalsOf.get(c.id) || [];
          const binder = binderOf.get(c.id) || [];
          const live = (oppsOf.get(c.id) || []).filter((o) => o.stage !== "completed");
          const prefs = rows(c.prefs).map(text).filter(Boolean);

          return (
            <Record
              key={c.id}
              title={text(c.name) || text(c.short) || "Collector"}
              subtitle={text(c.city)}
              tags={rel && text(rel.status) ? <Tag>{text(rel.status)}</Tag> : null}
              note={text(rel && rel.note)}
              noteLabel="Your note"
              facts={
                <>
                  <Fact label="In your network since" value={day(rel && rel.at)} mono />
                  <Fact label="Last contact" value={day(rel && rel.last)} mono />
                  <Fact label="Binder reviewed" value={day(rel && rel.binderReviewedAt)} mono />
                  <Fact label="Goals" value={goals.length ? String(goals.length) : null} mono />
                  <Fact label="Binder copies" value={binder.length ? String(binder.length) : null} mono />
                  <Fact label="In progress" value={live.length ? String(live.length) : null} mono />
                </>
              }
            >
              {prefs.length ? (
                <div className="tps-marks tps-prefs">
                  {prefs.map((t) => <span key={t} className="tps-mark">{t}</span>)}
                </div>
              ) : null}

              {goals.length ? (
                <ul className="tps-sub">
                  {goals.map((g) => {
                    const card = catalog.get(g.cardId) || null;
                    const grade = gradeLine(card);
                    const where = [cardSetLine(card), grade].filter(Boolean).join(" · ");
                    return (
                      <li key={g.id || `${g.collectorId}:${g.cardId}`}>
                        <span className="tps-sub-t">{cardTitle(card) || "A card you don't have listed"}</span>
                        {where ? <span className="tps-sub-s">{where}</span> : null}
                        <Tag tone={g.tier === "primary" ? "strong" : null}>{tierLabel(g.tier)}</Tag>
                        {text(g.note) ? <span className="tps-sub-n">{text(g.note)}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </Record>
          );
        })}
      </Panel>

      {pending.length ? (
        <Panel title="Invitations outstanding" note={plural(pending.length, "invitation", "invitations")}>
          {pending.map((i) => (
            <Record
              key={i.id || `${i.collectorId}:${i.at}`}
              title={text(i.name) || text(i.email) || "Invited collector"}
              facts={<Fact label="Sent" value={day(i.at || i.createdAt)} mono />}
            />
          ))}
        </Panel>
      ) : null}
    </>
  );
}
