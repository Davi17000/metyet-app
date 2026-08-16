import React, { useState, useMemo } from "react";
import * as D from "../domain/metyet-domain.js";

/* ============================================================================
   THE SHARED CARD IDENTITY PICKER

   How MetYet decides WHICH card someone means — the same for both personas.

   A Trusted Partner adding an inventory copy and a collector stating a goal are
   describing the same thing, so they answer the same questions in the same
   order: find the printed card, then say which printing and which copy.

   The persona changes what happens AFTER the identity is known — an
   InventoryCopy on one side, a Goal on the other. It must never change how the
   card is defined. Nothing about cost, asking price, acquisition or
   certification belongs here: those describe a partner's own physical copy, not
   which card it is.

   `renderChrome` lets each persona supply its own container, so this component
   carries no layout opinion beyond the questions themselves.
   ========================================================================== */

export default function CardIdentityPicker({
  catalog,            // canonical card records
  onResolved,         // (identity, printed, copy) => void  — called on confirm
  onCancel,
  confirmLabel = "Continue",
  searchPlaceholder = "Search by card name, set, or number...",
  Art,                // persona's artwork component
  extra,              // optional: persona-specific fields shown after identity
  canConfirm = true,  // persona may add its own gating on top of identity
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);
  const [copy, setCopy] = useState({ edition: "", grade: "", condition: "" });
  const set = (k, v) => setCopy((c) => ({ ...c, [k]: v }));

  /* Search runs over PRINTED cards, so choosing a grade later never splits one
     printing into several rows. */
  const printed = useMemo(() => D.printedCards(catalog), [catalog]);
  const results = useMemo(() => D.searchCards(printed, q), [printed, q]);
  const gaps = D.identityGaps(picked, copy);
  const identity = gaps.resolved ? D.identityFrom(picked, copy, gaps.edition) : null;

  const choose = (c) => {
    setPicked(c);
    const eds = [...new Set(c.variants.map((v) => v.edition))];
    /* Edition is prefilled only when the printing leaves no choice. */
    setCopy({ edition: eds.length === 1 ? eds[0] : "", grade: "", condition: "" });
  };

  if (!picked) {
    return (
      <div className="cip">
        <input className="inp cip-q" value={q} autoFocus type="search"
          aria-label="Search cards by name, set, or number"
          placeholder={searchPlaceholder}
          onChange={(e) => setQ(e.target.value)} />
        {q.trim() === "" ? null : results.length === 0 ? (
          <div className="cip-none">
            <div style={{ fontWeight: 600 }}>No cards found</div>
            <div className="faint" style={{ fontSize: 13 }}>Try a card name, set, or number.</div>
          </div>
        ) : (
          <div className="cip-results">
            {results.slice(0, 40).map((c) => (
              <button key={D.printKey(c)} className="cip-row" onClick={() => choose(c)}>
                {Art ? <Art card={c} size="sm" /> : null}
                <span className="cip-main">
                  <span className="cip-name">{c.name}</span>
                  <span className="cip-sub">
                    {[c.set, c.num !== "—" ? "#" + c.num : null, c.year].filter(Boolean).join(" · ")}
                  </span>
                  <span className="cip-var">{[c.print, c.language].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            ))}
            {results.length > 40 && (
              <div className="faint cip-hint">
                Showing 40 of {results.length}. Add another term to narrow.
              </div>
            )}
          </div>
        )}
        {onCancel && (
          <button className="btn wide" style={{ marginTop: 14 }} onClick={onCancel}>Cancel</button>
        )}
      </div>
    );
  }

  return (
    <div className="cip">
      <div className="cip-picked">
        {Art ? <Art card={picked} size="md" /> : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="cip-name" style={{ fontSize: 16 }}>{picked.name}</div>
          <div className="cip-sub">
            {[picked.set, picked.num !== "—" ? "#" + picked.num : null, picked.print]
              .filter(Boolean).join(" · ")}
          </div>
          <button className="link" style={{ fontSize: 12.5, marginTop: 6 }}
            onClick={() => setPicked(null)}>Change card</button>
        </div>
      </div>

      {/* Edition is asked only when this printing genuinely spans editions. */}
      {gaps.editions.length > 1 && (
        <div className="cip-fld">
          <span className="cip-lbl">Edition <b className="req">*</b></span>
          <div className="cip-seg">
            {gaps.editions.map((e) => (
              <button key={e} className={"cip-opt" + (copy.edition === e ? " on" : "")}
                onClick={() => set("edition", e)}>{e}</button>
            ))}
          </div>
        </div>
      )}

      <div className="cip-fld">
        <span className="cip-lbl">PSA Grade <b className="req">*</b></span>
        <div className="cip-seg">
          {D.GRADED_VALUES.map((g) => (
            <button key={g} className={"cip-opt" + (copy.grade === g ? " on" : "") + (g === "Raw" ? " wide" : "")}
              onClick={() => set("grade", g)}>{g === "Raw" ? "Raw" : g.replace("PSA ", "")}</button>
          ))}
        </div>
      </div>

      {gaps.raw && (
        <div className="cip-fld">
          <span className="cip-lbl">Condition <b className="req">*</b></span>
          <div className="cip-seg">
            {D.CONDITION_VALUES.map((c) => (
              <button key={c} className={"cip-opt" + (copy.condition === c ? " on" : "")}
                onClick={() => set("condition", c)}>{c}</button>
            ))}
          </div>
        </div>
      )}

      {/* Persona-specific fields, if any, come after the identity is settled. */}
      {extra ? extra(identity) : null}

      <div className="act-2" style={{ marginTop: 16 }}>
        {onCancel && <button className="btn" onClick={onCancel}>Cancel</button>}
        <button className="btn pri" disabled={!gaps.resolved || !canConfirm}
          onClick={() => onResolved(identity, picked, { ...copy, edition: gaps.edition })}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
