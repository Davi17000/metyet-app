/* ============================================================================
   POST–OPTION B — WHAT A PARTNER MAY REWRITE, AND WHAT A STRANGER MAY LEARN

   Two holes Option B left behind, closed together because they are the same
   shape: something true of a copy escaping to somebody who should not have it.

   PART A — INTEGRITY. Option B moved AVAILABILITY to final agreement and
   deliberately left MUTATION SAFETY on the older, wider window. It then
   protected only the certificate inside that window. But the reason written on
   the certificate lock — a collector is pricing a trade package against this
   exact slab — is a reason about what the object is UNDERSTOOD TO BE, and cert
   is only one of the facts carrying that. A shop could agree a deal on a PSA 9
   and restate it as Damaged, or restage the photographs the deal was agreed on.

     protected   cert, grade, condition, and rewriting a filled photo slot
     open        ask, cost, acquired, note, and FILLING AN EMPTY photo slot

   The photo rule is not a new subsystem; it is what the existing model already
   says. `copyPhotographed` is `front && back`, so a copy has two named slots,
   and `requestPhotos` will not create a request once both are filled. A photo
   request can therefore only exist for an empty slot, so fulfilling one always
   means filling an empty slot and never means changing a filled one.

   PART B — PRIVACY. The projection had always refused to tell a collector
   whether somebody else's deal held a copy. The command layer answered it in
   three distinct words, to anyone entitled to send the command — and opening a
   new pursuit requires no connection to the card at all. Three answers polled
   at will are a rival negotiation's timeline.

   The states are NOT flattened. `inventoryCopyStatus` still returns pending,
   committed and sold, the partner who owns the card is still told which, and
   the collector whose own deal holds it never received these reasons in the
   first place. Only what crosses to somebody else's seat changed.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");

const AT = "2026-09-28";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });

const PH = { front: "f.jpg", back: "b.jpg" };
const TP = { partnerId: "nl" };
const OTHER_TP = { partnerId: "sv" };
const A = { collectorId: "casey" };
const B = { collectorId: "jordan" };
const STRANGER = { collectorId: "riley" };

/* One shop, one card, three collectors: the one whose deal holds it, a rival
   who knows the shop, and a stranger who does not. */
const world = (over = {}) => createStore({
  partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 },
    { id: "sv", name: "Silver Vale", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" },
    { id: "riley", name: "Riley" }],
  relationships: [
    { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT },
    { partnerId: "sv", collectorId: "riley", status: "accepted", at: AT }],
  goals: [
    { id: "gA", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
    { id: "gB", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
    { id: "gR", collectorId: "riley", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } }],
  inventory: [
    { invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", cert: "C1", photos: PH },
    { invId: "i2", partnerId: "nl", canonicalCardId: "cc-x", ask: 32, grade: "PSA 9", cert: "C2", photos: PH }],
  collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [],
  copyReviews: [], photoRequests: [], conversations: [], interests: [],
  ...over,
}, runtime());

const x = (st, actor, cmd, payload) => st.execute(actor, cmd, payload || {});
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const nov = (r, code, why) => { eq(r && r.refused, code, why); };
const code = (r) => (r && r.ok !== false ? "OK" : r.refused);
const status = (st, invId = "i1") =>
  D.inventoryCopyStatus(invId, st.get().opportunities, st.get().inventory);
const copyOf = (st, invId = "i1") => st.get().inventory.find((i) => i.invId === invId);
const tpRow = (st, invId = "i1") =>
  (P.projectForActor(st.get(), TP).inventory || []).find((i) => i.invId === invId) || null;

const valued = (st, actor, goalId, amount) => {
  const id = okv(x(st, actor, "startOpportunity", { goalId, invId: "i1", amount, at: AT }), "open");
  okv(x(st, TP, "acceptPrice", { oppId: id, at: AT }), "value agreed");
  return id;
};
const promised = (st, actor, oppId) => {
  okv(x(st, actor, "proposeTradeSelection", { oppId, binderIds: [], at: AT }), "package");
  okv(x(st, TP, "acceptDeal", { oppId, at: AT }), "partner yes");
  okv(x(st, actor, "acceptDeal", { oppId, at: AT }), "collector yes");
  return oppId;
};
const completed = (st, actor, oppId) => {
  okv(x(st, TP, "proposeFulfillment", { oppId, plan: { method: "show", show: "Leeds", date: "2026-10-04" }, at: AT }), "plan");
  okv(x(st, actor, "confirmFulfillmentPlan", { oppId, at: AT }), "plan ok");
  okv(x(st, TP, "confirmHandoff", { oppId, at: AT }), "handed over");
  okv(x(st, actor, "confirmHandoff", { oppId, at: AT }), "received");
  return oppId;
};

/* The four states of one copy, each built through real commands, with Casey
   controlling. Used by both halves of the suite. */
const SITUATIONS = {
  available: (st) => null,
  pending: (st) => {
    const a = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "open");
    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT }), "pend");
    return a;
  },
  committed: (st) => promised(st, A, valued(st, A, "gA", 26)),
  sold: (st) => completed(st, A, promised(st, A, valued(st, A, "gA", 26))),
};
const situation = (name, over) => {
  const st = world(over);
  const oppId = SITUATIONS[name](st);
  return { st, oppId };
};

/* ==================================================== A. mutation integrity */
describe("A. What a partner may still restate about a card in a live deal", () => {
  test("[A1] the certificate is still protected, in both halves of the window", () => {
    for (const name of ["committed", "sold"]) {
      const { st } = situation(name);
      nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { cert: "FORGED" }, at: AT }),
        D.REFUSE.copyCommitted, `${name}: the certificate cannot be rewritten`);
      eq(copyOf(st).cert, "C1", `${name}: and it did not change`);
    }
  });

  test("[A2] the grade cannot be rewritten inside the protected window", () => {
    /* The window opens at a SETTLED VALUE, not at final agreement — the point
       Option B made when it kept the two boundaries apart. */
    const st = world();
    valued(st, A, "gA", 26);
    eq(status(st), "available", "nobody has been promised anything yet");
    nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { grade: "PSA 10" }, at: AT }),
      D.REFUSE.copyCommitted, "yet the grade is already being priced against");
    eq(copyOf(st).grade, "PSA 9", "and it did not change");
  });

  test("[A3] the condition cannot be rewritten inside the protected window", () => {
    const st = world({ inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x",
      ask: 30, grade: "Raw", condition: "Near Mint", cert: null, photos: PH }] });
    valued(st, A, "gA", 26);
    nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { condition: "Damaged" }, at: AT }),
      D.REFUSE.copyCommitted, "a Raw copy's condition is what it is being priced on");
    eq(copyOf(st).condition, "Near Mint", "and it did not change");
  });

  test("[A4] the shop's own bookkeeping stays editable throughout", () => {
    /* Deliberately NOT frozen. None of these changes what the object IS, and
       stopping a partner correcting a price would be a cost with no integrity
       behind it. */
    for (const name of ["committed", "sold"]) {
      const { st } = situation(name);
      for (const patch of [{ ask: 99 }, { cost: 12 }, { note: "back room" }, { acquired: "2026-01-02" }]) {
        okv(x(st, TP, "updateInventoryCopy", { invId: "i1", patch, at: AT }),
          `${name}: ${Object.keys(patch)[0]} is the shop's own business`);
      }
    }
  });

  test("[A5] restating a fact as exactly what it already says is not a rewrite", () => {
    const { st } = situation("committed");
    okv(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { grade: "PSA 9", cert: "C1" }, at: AT }),
      "an idempotent write changes nothing and is not an attack");
  });

  test("[A6] a filled photo slot cannot be replaced or emptied, by either door", () => {
    for (const name of ["committed", "sold"]) {
      const { st } = situation(name);
      nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { photos: { front: "staged.jpg", back: "b.jpg" } }, at: AT }),
        D.REFUSE.copyCommitted, `${name}: the front cannot be restaged`);
      nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { photos: { front: null, back: null } }, at: AT }),
        D.REFUSE.copyCommitted, `${name}: nor cleared`);
      nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { photos: null }, at: AT }),
        D.REFUSE.copyCommitted, `${name}: nor dropped wholesale`);
      /* addCopyPhotos is the other door and carried NO deal guard at all. */
      nov(x(st, TP, "addCopyPhotos", { invId: "i1", front: "staged.jpg", at: AT }),
        D.REFUSE.copyCommitted, `${name}: and the add path is not a way round it`);
      nov(x(st, TP, "addCopyPhotos", { invId: "i1", front: null, at: AT }),
        D.REFUSE.copyCommitted, `${name}: including by erasing one`);
      eq(JSON.stringify(copyOf(st).photos), JSON.stringify(PH), `${name}: the evidence is untouched`);
    }
  });

  test("[A7] filling an EMPTY photo slot is still allowed inside the window", () => {
    const { st } = situation("committed", { inventory: [{ invId: "i1", partnerId: "nl",
      canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", cert: "C1", photos: { front: "f.jpg", back: null } }] });
    eq(status(st), "committed", "the copy is promised");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", back: "b.jpg", at: AT }),
      "evidence arriving is not evidence rewritten");
    eq(copyOf(st).photos.back, "b.jpg", "and it landed");
    nov(x(st, TP, "addCopyPhotos", { invId: "i1", back: "other.jpg", at: AT }),
      D.REFUSE.copyCommitted, "but now that slot is filled, it is closed like the rest");
  });

  test("[A8] a Collector's photo request can still be fulfilled in the live deal", () => {
    /* The whole reason the enrichment case has to stay open. */
    const { st } = situation("committed", { inventory: [{ invId: "i1", partnerId: "nl",
      canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", cert: "C1", photos: { front: "f.jpg", back: null } }] });
    okv(x(st, A, "requestPhotos", { invId: "i1", at: AT }), "Casey asks to see the back");
    const req = st.get().photoRequests.find((r) => r.invId === "i1");
    assert(req && !req.fulfilledAt, "the request is open");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", back: "b.jpg", at: AT }), "the shop photographs it");
    const after = st.get().photoRequests.find((r) => r.id === req.id);
    eq(after.fulfilledAt, AT, "and the request is fulfilled, exactly as before");
  });

  test("[A9] a mutation refusal changes neither availability nor the deal", () => {
    const { st, oppId } = situation("committed");
    const invBefore = JSON.stringify(st.get().inventory);
    const oppBefore = JSON.stringify(st.get().opportunities);
    nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { grade: "PSA 1" }, at: AT }),
      D.REFUSE.copyCommitted, "refused");
    eq(status(st), "committed", "the copy's availability is untouched");
    eq(JSON.stringify(st.get().inventory), invBefore, "no inventory was written");
    eq(JSON.stringify(st.get().opportunities), oppBefore, "and no opportunity was touched");
    assert(oppId, "the deal is still there");
  });

  test("[A10] ending the deal reopens editing, because the window is the deal", () => {
    const st = world();
    const a = valued(st, A, "gA", 26);
    nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { grade: "PSA 10" }, at: AT }),
      D.REFUSE.copyCommitted, "closed while somebody is pricing against it");
    okv(x(st, A, "cancelOpportunity", { oppId: a, at: AT }), "the deal ends");
    okv(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { grade: "PSA 10" }, at: AT }),
      "and the shop owns its own card again");
    eq(copyOf(st).grade, "PSA 10", "the correction landed");
  });

  test("[A11] completed history cannot be materially rewritten, ever", () => {
    const { st } = situation("sold");
    eq(status(st), "sold", "the card has been handed over");
    for (const patch of [{ grade: "PSA 1" }, { condition: "Damaged" }, { cert: "OTHER" }]) {
      nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch, at: AT }),
        D.REFUSE.copyCommitted, `a sold copy keeps its ${Object.keys(patch)[0]}`);
    }
    /* Archiving remains allowed — tidying the shelf is not rewriting history. */
    okv(x(st, TP, "removeInventoryCopy", { invId: "i1", at: AT }),
      "though the shop may still take it off the shelf");
  });

  test("[A12] no new persisted lock, flag or state was introduced", () => {
    const { st } = situation("committed");
    const copy = copyOf(st);
    for (const k of ["locked", "frozen", "immutable", "protected", "mutable", "sealed"]) {
      assert(!(k in copy), `nothing called ${k} was written to the card`);
    }
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "domain", "metyet-commands.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert(!/\b(locked|frozen|sealed)\b\s*[:=]/.test(src), "and no such field is assigned anywhere");
  });
});

/* ==================================================== B. competing privacy */
describe("B. What a collector may learn about somebody else's deal", () => {
  /* The oracle, as one function: what does this actor get back when they try
     to act on this copy? Every privacy test below is a statement about which
     of these answers can be told apart. */
  const probeNewPursuit = (st, actor, goalId) =>
    code(x(st, actor, "startOpportunity", { goalId, invId: "i1", amount: 28, at: AT }));

  test("[B1] a rival cannot tell pending, promised and sold apart", () => {
    const seen = {};
    for (const name of ["pending", "committed", "sold"]) {
      const { st } = situation(name);
      seen[name] = probeNewPursuit(st, B, "gB");
      eq(seen[name], D.REFUSE.copyUnavailable, `${name}: one public answer`);
    }
    eq(new Set(Object.values(seen)).size, 1, "all three states are indistinguishable");
  });

  test("[B2] and the answer is the same one an ordinary absent card gives", () => {
    /* If "unavailable" were reserved for gone-ness, it would itself be a
       signal. Archived and sold must answer alike. */
    const { st } = situation("available");
    okv(x(st, TP, "removeInventoryCopy", { invId: "i1", at: AT }), "archive it");
    eq(probeNewPursuit(st, B, "gB"), D.REFUSE.copyUnavailable, "an archived copy answers the same");
  });

  test("[B3] available is still distinguishable, because that is the point", () => {
    const { st } = situation("available");
    eq(probeNewPursuit(st, B, "gB"), "OK", "a copy nobody holds may be pursued");
  });

  test("[B4] a stranger never reaches the availability answer at all", () => {
    /* The gate used to run before the identity and relationship checks, so a
       collector with no connection to the shop read any copy's stage out of an
       arbitrary id. Riley knows a different shop entirely. */
    for (const name of ["available", "pending", "committed", "sold"]) {
      const { st } = situation(name);
      eq(probeNewPursuit(st, STRANGER, "gR"), D.REFUSE.noRelationship,
        `${name}: Riley is told only that this is not his shop`);
    }
  });

  test("[B5] nor through inspecting or asking for photographs", () => {
    for (const name of ["available", "pending", "committed", "sold"]) {
      const { st } = situation(name);
      eq(code(x(st, STRANGER, "reviewCopy", { invId: "i1", at: AT })), D.REFUSE.noRelationship,
        `${name}: reviewCopy tells a stranger nothing about the copy`);
      eq(code(x(st, STRANGER, "requestPhotos", { invId: "i1", at: AT })), D.REFUSE.noRelationship,
        `${name}: nor does requestPhotos`);
    }
  });

  test("[B6] a rival holding a LIVE deal on the copy learns no more", () => {
    /* The second channel: Jordan opened his own pursuit while the copy was
       available, which Option B permits, and can act on it at every stage. */
    const seen = new Set();
    for (const name of ["pending", "committed", "sold"]) {
      const st = world();
      const b = valued(st, B, "gB", 27);
      const a = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "Casey opens");
      if (name === "pending") okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT }), "pend");
      else {
        okv(x(st, TP, "acceptPrice", { oppId: a, at: AT }), "value");
        promised(st, A, a);
        if (name === "sold") completed(st, A, a);
      }
      const answer = code(x(st, B, "proposeTradeSelection", { oppId: b, binderIds: [], at: AT }));
      eq(answer, D.REFUSE.copyUnavailable, `${name}: his own deal is blocked, without saying by what`);
      seen.add(answer);
    }
    eq(seen.size, 1, "the three states are indistinguishable from inside a rival deal too");
  });

  test("[B7] no refusal carries an id, a price, a stage or any other payload", () => {
    for (const name of ["pending", "committed", "sold"]) {
      const { st, oppId } = situation(name);
      const r = x(st, B, "startOpportunity", { goalId: "gB", invId: "i1", amount: 28, at: AT });
      eq(Object.keys(r).sort().join(","), "ok,refused", `${name}: the whole shape of a refusal`);
      const serialised = JSON.stringify(r);
      assert(!serialised.includes(oppId), `${name}: no opportunity id`);
      assert(!serialised.includes("casey"), `${name}: no rival collector id`);
      assert(!/26|27|30/.test(serialised.replace(/copy-\w+/g, "")), `${name}: no price`);
      assert(!/agree-price|select-trade|deal|fulfillment|completed/.test(serialised),
        `${name}: no stage`);
    }
  });

  test("[B8] the projection did not start leaking to make up for it", () => {
    for (const name of ["pending", "committed", "sold"]) {
      const { st, oppId } = situation(name);
      const view = P.projectForActor(st.get(), B);
      const serialised = JSON.stringify(view);
      assert(!serialised.includes(oppId), `${name}: Jordan's view names no rival opportunity`);
      assert(!serialised.includes("pendingFor"), `${name}: and never the raw pending field`);
      const row = (view.inventory || []).find((i) => i.invId === "i1");
      assert(!row || row.status === "unavailable",
        `${name}: a rival-held copy is absent or plainly unavailable`);
    }
  });

  test("[B9] the collector whose own deal holds the copy still proceeds", () => {
    /* The case that looks risky and is not: Casey never received these reasons
       in the first place, so nothing was taken from her. */
    const st = world();
    const a = okv(x(st, A, "startOpportunity", { goalId: "gA", invId: "i1", amount: 26, at: AT }), "open");
    okv(x(st, TP, "setCopyPending", { invId: "i1", oppId: a, at: AT }), "pended for HER deal");
    eq(status(st), "pending", "the copy is pending");
    okv(x(st, TP, "acceptPrice", { oppId: a, at: AT }), "and her deal carries on");
    okv(x(st, A, "proposeTradeSelection", { oppId: a, binderIds: [], at: AT }), "through the package");
    okv(x(st, TP, "acceptDeal", { oppId: a, at: AT }), "to the partner's yes");
    okv(x(st, A, "acceptDeal", { oppId: a, at: AT }), "and her own");
    eq(status(st), "committed", "pending for you never blocked you");
  });

  test("[B10] and is never told 'unavailable' about the card she is buying", () => {
    for (const name of ["pending", "committed"]) {
      const { st, oppId } = situation(name);
      const answer = code(x(st, A, "proposePrice", { oppId, amount: 25, at: AT }));
      assert(answer !== D.REFUSE.copyUnavailable && answer !== D.REFUSE.copyPending
        && answer !== D.REFUSE.copyCommitted,
        `${name}: whatever she is told (${answer}) is about turn and stage, not the copy`);
      const row = (P.projectForActor(st.get(), A).inventory || []).find((i) => i.invId === "i1");
      eq(row && row.status, name, `${name}: and her own row still tells her the truth`);
    }
  });

  test("[B11] the partner who owns the card keeps every distinction", () => {
    /* Flattening for the owner would make Option B's own mechanism unreadable
       at the one command that manages it: "you already promised this" and "you
       already pencilled it in" are different instructions. */
    const answers = {};
    for (const name of ["pending", "committed", "sold"]) {
      const { st } = situation(name);
      const b = okv(x(st, B, "startOpportunity", { goalId: "gB", invId: "i2", amount: 28, at: AT }),
        "a second live opportunity to aim at") ;
      answers[name] = code(x(st, TP, "setCopyPending", { invId: "i1", oppId: b, at: AT }));
      eq(tpRow(st).status, name, `${name}: and the owner's own row says so outright`);
    }
    eq(answers.pending, D.REFUSE.copyPending, "pending is pending to its owner");
    eq(answers.committed, D.REFUSE.copyCommitted, "committed is committed");
    eq(answers.sold, D.REFUSE.copyUnavailable, "and a sold card is gone");
    eq(new Set(Object.values(answers)).size, 3, "three states, three answers, to the one who owns it");
  });

  test("[B-OPEN] inspection still separates SOLD, and this is left open deliberately", () => {
    /* THE ONE PRIVACY EDGE THIS BATCH DID NOT CLOSE, pinned so it is a decision
       and not a drift. `reviewCopy` and `requestPhotos` do not consult the
       availability question at all: pending and committed pass, sold refuses.
       For a collector who is not in the controlling deal that is a
       success-vs-refusal oracle on the most valuable bit there is — the moment
       a rival deal completed.

       Every way of closing it contradicts something already agreed:

         refuse pending/committed too   Option B says Pending "stops new
                                        pursuits but erases no existing work",
                                        and its invariant [1] says inspecting
                                        and asking for photographs reserve
                                        nothing. This would make Pending govern
                                        inspection, which is a redesign of it.
         allow sold through             Option B Item 0 closed exactly this:
                                        requestPhotos had to stop accepting a
                                        card the shop no longer owns.
         participant-aware inspection   still blocks a bystander on pending and
                                        committed, so it carries the first
                                        objection unchanged.

       Neither command is on the production surface (`exposed-commands.js`), so
       nothing reachable today turns on it. Recorded in the hand-back for a
       decision rather than guessed at here. */
    const seen = {};
    for (const name of ["available", "pending", "committed", "sold"]) {
      const { st } = situation(name);
      seen[name] = code(x(st, B, "reviewCopy", { invId: "i1", at: AT }));
    }
    eq(seen.pending, "OK", "pending: a bystander may still look");
    eq(seen.committed, "OK", "committed: and still may");
    eq(seen.sold, D.REFUSE.copyUnavailable, "sold: but not once it is gone");
    assert(seen.sold !== seen.committed, "which is the open oracle, stated plainly");
    const fs = require("fs");
    const path = require("path");
    const exposed = fs.readFileSync(path.join(__dirname, "..", "server", "exposed-commands.js"), "utf8");
    for (const cmd of ["reviewCopy", "requestPhotos"]) {
      assert(!new RegExp(`"${cmd}"`).test(exposed),
        `${cmd} is still off the production surface, which is what bounds this`);
    }
  });

  test("[B12] the domain itself was not flattened", () => {
    /* The distinctions had to survive; only what crosses a seat boundary
       changed. If these ever collapse, the privacy fix has eaten the model. */
    for (const name of ["available", "pending", "committed", "sold"]) {
      const { st } = situation(name);
      eq(status(st), name, `${name}: inventoryCopyStatus still names it`);
    }
    const { st } = situation("pending");
    assert(D.INVARIANTS.copyPendingFor("i1", st.get().inventory, st.get().opportunities),
      "and copyPendingFor still answers");
  });

  test("[B13] normalising the words did not weaken the double-sale rule", () => {
    /* The one rule that must survive every refactor of how refusals are worded. */
    const st = world();
    const b = valued(st, B, "gB", 27);
    okv(x(st, B, "proposeTradeSelection", { oppId: b, binderIds: [], at: AT }), "Jordan assembles first");
    promised(st, A, valued(st, A, "gA", 26));
    /* The partner is the OWNER here, so they get the precise word — that is the
       whole of the shaping rule, and the refusal itself is what matters. */
    nov(x(st, TP, "acceptDeal", { oppId: b, at: AT }), D.REFUSE.copyCommitted,
      "the second promise is still refused");
    /* Jordan is answered by the turn rule before the copy rule even runs, which
       is leak-free for a different reason — `not-your-turn` says nothing about
       the copy. What must never come back is a distinguishing word. */
    const toJordan = code(x(st, B, "acceptDeal", { oppId: b, at: AT }));
    assert(toJordan !== D.REFUSE.copyPending && toJordan !== D.REFUSE.copyCommitted,
      `Jordan learns nothing about the rival deal's stage (got ${toJordan})`);
    const { validateWorld } = require("../domain/metyet-world.js");
    assert(validateWorld(st.get()).ok, "and the world is still valid");
    completed(st, A, st.get().opportunities.find((o) => o.collectorId === "casey").id);
    eq(status(st), "sold", "one copy, one sale");
    eq(st.get().opportunities.filter((o) => D.isCompleted(o)).length, 1, "and exactly one completion");
  });
});

/* =========================================== C. the guards are asked everywhere */
describe("C. Neither fix rests on a single helper", () => {
  test("[C1] every command that can refuse about a copy shapes its answer", () => {
    /* A structural guard, not a list: any command reaching copyBlockedFor must
       hand it the actor, or the refusal is unshaped and the leak is back. */
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "domain", "metyet-commands.js"), "utf8");
    const calls = src.match(/copyBlockedFor\([^)]*\)/g) || [];
    assert(calls.length >= 8, `expected the helper to be widely asked, saw ${calls.length}`);
    for (const c of calls) {
      assert(/copyBlockedFor\(state, o, a\)|function copyBlockedFor/.test(c),
        `an unshaped call site: ${c}`);
    }
  });

  test("[C3] no patch shape can describe a photo edit the guard does not see", () => {
    /* THE BUG THIS EXISTS FOR. The guard first read the patch slot by slot and
       treated an unmentioned slot as unchanged; `updateInventoryCopy` ASSIGNS
       `photos` wholesale, so an unmentioned slot is deleted. `{photos: {}}`
       therefore mentioned nothing, passed the guard, and emptied both — after
       which refilling them was the allowed empty-slot case. Two calls on the
       exposed command and the evidence on a sold card was somebody else's. */
    for (const name of ["committed", "sold"]) {
      for (const photos of [{}, "", 0, false, [], "gotcha", { front: "f.jpg" },
        { FRONT: "new.jpg" }, null, { back: "staged.jpg" }, { front: "x", back: "y" }]) {
        const { st } = situation(name);
        nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { photos }, at: AT }),
          D.REFUSE.copyCommitted, `${name}: photos=${JSON.stringify(photos)} is a rewrite`);
        eq(JSON.stringify(copyOf(st).photos), JSON.stringify(PH),
          `${name}: and both faces are untouched`);
      }
    }
  });

  test("[C4] the empty-then-refill route is closed in one step", () => {
    const { st } = situation("sold");
    nov(x(st, TP, "updateInventoryCopy", { invId: "i1", patch: { photos: {} }, at: AT }),
      D.REFUSE.copyCommitted, "emptying is refused, so there is no second step");
    eq(JSON.stringify(copyOf(st).photos), JSON.stringify(PH), "the evidence stands");
  });

  test("[C5] a malformed patch is refused, not thrown", () => {
    /* It reached `"cardId" in p` and raised a TypeError — a 500 on an exposed
       command where a refusal was meant. */
    const { st } = situation("committed");
    for (const patch of ["grade", 42, true, ["grade"]]) {
      const r = x(st, TP, "updateInventoryCopy", { invId: "i1", patch, at: AT });
      assert(r && r.ok === false, `patch=${JSON.stringify(patch)} refuses rather than throwing`);
    }
  });

  test("[C6] archiving a copy tells an unconnected collector nothing", () => {
    /* The availability gate used to carry `archived`, so a stranger watched a
       copy flip the moment the partner tidied the shelf. */
    const { st } = situation("available");
    eq(code(x(st, STRANGER, "startOpportunity", { goalId: "gR", invId: "i1", amount: 28, at: AT })),
      D.REFUSE.noRelationship, "on the shelf: not your shop");
    okv(x(st, TP, "removeInventoryCopy", { invId: "i1", at: AT }), "the partner archives it");
    eq(code(x(st, STRANGER, "startOpportunity", { goalId: "gR", invId: "i1", amount: 28, at: AT })),
      D.REFUSE.noRelationship, "off the shelf: still just not your shop");
  });

  test("[C2] both photo doors ask the same question", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "domain", "metyet-commands.js"), "utf8");
    /* Bounded at each command's real extent — the next command in the table —
       rather than a guessed byte window, which is the failure mode C7.1
       documented and Option B hit twice more. */
    const extent = (name) => {
      const from = src.indexOf(name);
      assert(from > -1, `${name} exists`);
      const next = src.slice(from + name.length).search(/\n  [a-zA-Z]+\(state,/);
      return src.slice(from, next === -1 ? undefined : from + name.length + next);
    };
    for (const cmd of ["updateInventoryCopy(state", "addCopyPhotos(state"]) {
      assert(/protectedCopyEdit\(/.test(extent(cmd)), `${cmd} asks the shared mutation guard`);
    }
  });
});

if (require.main === module) run();
module.exports = {};
