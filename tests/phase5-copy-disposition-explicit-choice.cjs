/* ============================================================================
   A COPY IS KEPT OR IT IS ON OFFER, AND ITS OWNER CHOOSES WHICH

   Two of MetYet's four states live on a COPY rather than on a card, because
   somebody who owns two copies of one card may truthfully keep one and offer
   the other:

     Trade/Sell   I own this copy and would part with it    `offered: true`
     PC           I own this copy and intend to keep it     `keeping: true`

   WHAT BIRTH USED TO MEAN. `addCollectorCopy` wrote `offered: offered === true`
   and `keeping === true ? { keeping: true } : {}`, which is not a validation —
   it is an answer invented on the caller's behalf. `undefined`, `false`,
   `null`, `"yes"`, `1` and `{}` all produced a copy with NO disposition at
   all, stored, 200. `offered: "yes"` is somebody trying to offer a card, and
   what they got was a copy barred from every trade package and invisible to
   every partner, with nothing anywhere saying so. The same `"yes"` on
   `setCollectorCopyOffered` has always been refused — one field, two
   boundaries, opposite answers.

   AND WHAT A WITHDRAWAL USED TO MEAN. `setCollectorCopyOffered(false)` and
   `setCollectorCopyKept(false)` returned a copy to saying nothing. That is the
   same dead end reached from the other direction, and it was reachable from the
   production panel through a button labelled "Haven't decided".

   SO: BOTH ARE REFUSED, WITH ONE CODE. `invalid-disposition`, named for
   `invalid-tier` and through it for `invalid-amount` — the request named
   something the domain has no value for. Changing one's mind means choosing the
   other answer, which both setters already do in one step.

   WHAT IS DELIBERATELY UNCHANGED, AND SECTION D IS THE PROOF.

   Copies recorded before this rule say nothing, and that is a real state they
   are really in. They load, they validate, they render, they stay invisible to
   partners, their grade and cert stay editable, their binder filing is
   untouched, they stay barred from trade packages, and they are resolved only
   by their owner saying which. NOTHING infers a disposition for them, there is
   no migration, and the XOR rule is NOT in `validateWorld` — which runs on LOAD
   as well as before save, so a rule there would turn every one of them into a
   500 on the next read rather than a refusal. This repository has been caught by
   that three times.

   Also unchanged: no new requirement for grade, condition, cert, photographs or
   market value. A copy nobody has described is still a legitimate record, and
   `cert`-without-grade is still unchecked by the domain. Only the disposition
   became required, because only the disposition is what MetYet needs in order
   to act on the copy at all.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const D = require("../domain/metyet-domain.js");
const W = require("../domain/metyet-world.js");
const P = require("../domain/metyet-projection.js");
const C = require("../domain/metyet-commands.js");
const RT = require("../domain/metyet-runtime.js");
const { createStore } = require("./fixture-store.cjs");

const ROOT = path.join(__dirname, "..");
const AT = "2026-10-01";

const load = (rel) => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};
const SPEC = load("client/collector/CardSpecification.jsx");

const CASEY = { collectorId: "casey" };
const TP = { partnerId: "nl" };
const PHOTOS = { front: "f.jpg", back: "b.jpg" };

/* `legacy` is a copy stored saying nothing — the shape this batch stops
   CREATING and deliberately keeps WORKING. It is seeded directly, because the
   command that used to make one now refuses to. */
const world = (over = {}) => createStore({
  partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
  relationships: [{ partnerId: "nl", collectorId: "casey", status: "accepted", at: AT }],
  goals: [], inventory: [],
  collectorCopies: [{ id: "legacy", collectorId: "casey", canonicalCardId: "cc-x",
    offered: false, grade: "PSA 8", cert: "OLD-1", photos: PHOTOS }],
  binders: [], binderEntries: [], opportunities: [], catalog: [],
  copyReviews: [], photoRequests: [], conversations: [], interests: [],
  ...over,
});

const x = (st, actor, cmd, payload) => st.execute(actor, cmd, { ...(payload || {}), at: AT });
const code = (r) => {
  assert(r && typeof r === "object", "a command returned nothing at all");
  return r.ok !== false ? "OK" : r.refused;
};
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const snap = (st) => JSON.stringify(st.get());
const copyOf = (st, id) => st.get().collectorCopies.find((b) => b.id === id);
const valid = (st) => W.validateWorld(st.get()).ok;

/* A copy with everything a trade package could ask for EXCEPT a stated
   disposition — so `disposition` is the only variable in section A. */
const FACTS = { canonicalCardId: "cc-y", grade: "PSA 9", cert: "NEW-1", photos: PHOTOS };

/* The panel's own label for "record a copy I own", quoted so a rename of the
   button is a readable failure rather than a mystery. */
const ADD_COPY = "I own one of these";

/* The two disposition buttons, quoted from `DISPOSITIONS` so a relabelling is a
   readable failure here rather than a test that silently stops looking at
   anything — which is exactly what an earlier draft of this suite did. */
const TRADE_SELL = "I'd trade or sell this one";
const KEEP = "I'm keeping this one";

/* EVERY SHAPE THAT USED TO MEAN "SAYS NOTHING". `omit` leaves the key out
   entirely rather than sending it; both reach the command identically today and
   a reader should not have to check that only one is covered. */
const MALFORMED = [
  ["both omitted", {}, true],
  ["both undefined", { offered: undefined, keeping: undefined }, false],
  ["both false", { offered: false, keeping: false }, false],
  ["offered false alone", { offered: false }, false],
  ["keeping false alone", { keeping: false }, false],
  ["both null", { offered: null, keeping: null }, false],
  ['offered "yes"', { offered: "yes" }, false],
  ['keeping "yes"', { keeping: "yes" }, false],
  ['offered "true"', { offered: "true" }, false],
  ["offered 1", { offered: 1 }, false],
  ["keeping 1", { keeping: 1 }, false],
  ["offered []", { offered: [] }, false],
  ["keeping {}", { keeping: {} }, false],
  ["keeping true-ish object", { keeping: { keeping: true } }, false],
  /* AND MALFORMED BESIDE A REAL ANSWER, which is where the first draft of the
     gate still let the defect through. It refused only when BOTH flags failed
     to be `true`, so `{ offered: "yes", keeping: true }` was accepted, the
     `"yes"` was coerced to `false`, and somebody trying to offer a card got a
     PC copy with a 200 — the original defect in a narrower form. */
  ['offered "yes" beside a real keep', { offered: "yes", keeping: true }, false],
  ["offered 1 beside a real keep", { offered: 1, keeping: true }, false],
  ["offered null beside a real keep", { offered: null, keeping: true }, false],
  ['keeping "yes" beside a real offer', { offered: true, keeping: "yes" }, false],
  ["keeping 1 beside a real offer", { offered: true, keeping: 1 }, false],
  ["keeping null beside a real offer", { offered: true, keeping: null }, false],
];

/* ============================================== A. recording a copy one owns */
describe("A. A new copy says which, or it is not recorded", () => {

  test("[1] Trade/Sell is accepted and stored as exactly that", () => {
    const st = world();
    const id = okv(x(st, CASEY, "addCollectorCopy",
      { copy: { ...FACTS, offered: true } }), "offer");
    const row = copyOf(st, id);
    eq(D.copyDisposition(row), "offered", "it was not stored as Trade/Sell");
    eq(row.offered, true, "`offered` is not true");
    assert(!("keeping" in row), "a `keeping` key was written alongside the offer");
    assert(valid(st), "a Trade/Sell copy produced a world the validator rejects");
  });

  test("[2] PC is accepted and stored as exactly that", () => {
    const st = world();
    const id = okv(x(st, CASEY, "addCollectorCopy",
      { copy: { ...FACTS, keeping: true } }), "keep");
    const row = copyOf(st, id);
    eq(D.copyDisposition(row), "keeping", "it was not stored as PC");
    eq(row.keeping, true, "`keeping` is not true");
    eq(row.offered, false, "`offered` is not false");
    assert(valid(st), "a PC copy produced a world the validator rejects");
  });

  test("[3] every shape of saying nothing is refused, and none of them is stored", () => {
    for (const [label, disposition, omit] of MALFORMED) {
      const st = world();
      const before = snap(st);
      const copy = omit ? { ...FACTS } : { ...FACTS, ...disposition };
      const r = x(st, CASEY, "addCollectorCopy", { copy });
      /* The refusal has to be THIS one. `disposition-conflict` would be a lie —
         it names a contradiction, and nothing here contradicts anything. */
      eq(code(r), D.REFUSE.invalidDisposition, `${label}: was not refused as an invalid disposition`);
      eq(snap(st), before, `${label}: a refused copy changed the world`);
      eq(st.get().collectorCopies.length, 1, `${label}: a copy was written anyway`);
    }
  });

  test("[4] both at once is still the older refusal, and still means something else", () => {
    const st = world();
    const before = snap(st);
    eq(code(x(st, CASEY, "addCollectorCopy", { copy: { ...FACTS, offered: true, keeping: true } })),
      D.REFUSE.dispositionConflict, "the contradiction stopped answering for itself");
    eq(snap(st), before, "a refused contradiction wrote something");
    /* The two codes answer opposite failures and must not collapse into one:
       `disposition-conflict` means "you said both", `invalid-disposition` means
       "you said neither". A caller told the wrong one looks at the wrong half
       of its payload. */
    assert(D.REFUSE.dispositionConflict !== D.REFUSE.invalidDisposition,
      "the two disposition refusals became the same code");
  });

  test("[5] a request already wrong in an older way still gets its old answer", () => {
    /* THE GATE'S PLACEMENT, PINNED. It sits one line below the contradiction it
       mirrors, which is after every refusal this command already had. So a
       payload that was failing for another reason keeps the answer it had
       yesterday, and only a payload whose single fault is the disposition
       changes. */
    const st = world();
    eq(code(x(st, TP, "addCollectorCopy", { copy: { ...FACTS } })),
      D.REFUSE.notOwner, "the seat check stopped answering first");
    eq(code(x(st, CASEY, "addCollectorCopy", {})),
      D.REFUSE.notFound, "a missing copy object stopped answering first");
    eq(code(x(st, CASEY, "addCollectorCopy",
      { copy: { canonicalCardId: "cc-y", cardId: "k1" } })),
    D.REFUSE.notFound, "naming two cards stopped answering first");
    eq(code(x(st, CASEY, "addCollectorCopy", { copy: { canonicalCardId: "cc-y", grade: "Raw" } })),
      D.REFUSE.gradingIncoherent, "the grading check stopped answering first");
    eq(code(x(st, CASEY, "addCollectorCopy", { copy: { canonicalCardId: "cc-y", market: -3 } })),
      D.REFUSE.invalidAmount, "the amount check stopped answering first");
    eq(snap(st), snap(world()), "one of the refusals above wrote something");
  });

  test("[6] and a refused copy does not consume the id it would have been given", () => {
    /* WHY THE GATE IS ABOVE `ctx.id("b", askedId)`. `newId` advances a counter
       the moment it is called, so a gate placed after the mint would make this
       the one refusal in the command that leaves a mark — a gap in the id
       sequence caused by a request that was rejected. Every refusal ABOUT A
       DISPOSITION consumes nothing and this one must not be the exception.
       (`copy-in-use` sits after the mint and would consume one, but it answers
       a collision with an id the runtime has just minted, which is unreachable
       in practice. It is not what this test is about.) */
    let minted = 0;
    const rt = RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++minted}` });
    const base = world().get();
    const ask = (over) => C.execute(base, { ...CASEY, seat: "collector" },
      "addCollectorCopy", { copy: { ...FACTS, ...over }, at: AT }, rt);
    eq(code(ask({})), D.REFUSE.invalidDisposition, "not refused");
    eq(code(ask({ offered: "yes" })), D.REFUSE.invalidDisposition, "not refused");
    eq(code(ask({ offered: true, keeping: true })), D.REFUSE.dispositionConflict, "not refused");
    eq(minted, 0, "a refused copy consumed an id");
    const r = ask({ offered: true });
    assert(r && r.ok !== false, `the real copy was refused: ${r && r.refused}`);
    eq(r.value, "b1", "the refusals left a gap in the id sequence");
  });

  test("[6b] the pair the panel actually sends is accepted, and leaves no residue", () => {
    /* `planFrom` composes `{ offered: true, keeping: false }` for Trade/Sell and
       the mirror for PC — a complete answer with the other half stated as
       `false` — so those two exact payloads are what production sends on every
       new copy and they must both work.

       AND `keeping: false` MUST LEAVE NO KEY. Absence is what "no keep stated"
       looks like; writing `false` would make it a decision not to keep, which
       is the confusion migration 0012 exists to remember. The four-state suite
       used to pin this through a copy born with `keeping: false` alone — a
       payload the gate now refuses — so it is pinned here instead, on the pair
       that is actually sent. */
    const sell = world();
    const a = okv(x(sell, CASEY, "addCollectorCopy",
      { copy: { ...FACTS, offered: true, keeping: false } }), "trade/sell as the panel sends it");
    eq(D.copyDisposition(copyOf(sell, a)), "offered", "it was not stored as Trade/Sell");
    assert(!("keeping" in copyOf(sell, a)), "`keeping: false` was stored as a decision");
    const pc = world();
    const b = okv(x(pc, CASEY, "addCollectorCopy",
      { copy: { ...FACTS, offered: false, keeping: true } }), "PC as the panel sends it");
    eq(D.copyDisposition(copyOf(pc, b)), "keeping", "it was not stored as PC");
    eq(copyOf(pc, b).keeping, true, "the keep did not land");
    assert(valid(sell) && valid(pc), "one of them produced an invalid world");
  });

  test("[7] no new physical fact became required", () => {
    /* THE HALF OF THE BATCH THAT IS A REFUSAL TO ACT. A copy nobody has
       described is a legitimate record — ownership is often written down before
       the card is evaluated, and MetYet holds only Raw and PSA 1-10, so a real
       slab it cannot name must still be recordable. Only the disposition
       became required. */
    for (const [label, copy] of [
      ["nothing but a card and a decision", { canonicalCardId: "cc-y", offered: true }],
      ["no grade, with a cert", { canonicalCardId: "cc-y", cert: "C1", keeping: true }],
      ["a condition and no grade", { canonicalCardId: "cc-y", condition: "Near Mint", offered: true }],
      ["raw, with its condition", { canonicalCardId: "cc-y", grade: "Raw",
        condition: "Lightly Played", keeping: true }],
      ["graded, with no condition", { canonicalCardId: "cc-y", grade: "PSA 10", offered: true }],
      ["no photographs", { canonicalCardId: "cc-y", offered: true }],
    ]) {
      const st = world();
      const id = okv(x(st, CASEY, "addCollectorCopy", { copy }), label);
      assert(copyOf(st, id), `${label}: nothing was stored`);
      assert(valid(st), `${label}: the stored copy is invalid`);
    }
    /* And the coherence rules that did exist are exactly where they were. */
    const st = world();
    eq(code(x(st, CASEY, "addCollectorCopy",
      { copy: { canonicalCardId: "cc-y", grade: "Raw", offered: true } })),
    D.REFUSE.gradingIncoherent, "raw stopped needing a condition");
    eq(code(x(st, CASEY, "addCollectorCopy",
      { copy: { canonicalCardId: "cc-y", grade: "PSA 9", condition: "Damaged", offered: true } })),
    D.REFUSE.gradingIncoherent, "a graded copy stopped refusing a condition");
  });
});

/* ====================================================== B. changing one's mind */
describe("B. The two answers are a switch, not a pair of toggles", () => {

  const owned = (st, disposition) => okv(x(st, CASEY, "addCollectorCopy",
    { copy: { ...FACTS, [disposition]: true } }), disposition);

  test("[8] PC becomes Trade/Sell in one step, with no state in between", () => {
    const st = world();
    const id = owned(st, "keeping");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: id, offered: true }), "switch");
    const row = copyOf(st, id);
    eq(D.copyDisposition(row), "offered", "the switch did not land");
    assert(!("keeping" in row), "the old answer was left behind as a key");
    assert(valid(st), "the switch produced an invalid world");
  });

  test("[9] Trade/Sell becomes PC in one step", () => {
    const st = world();
    const id = owned(st, "offered");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: id, keeping: true }), "switch");
    const row = copyOf(st, id);
    eq(D.copyDisposition(row), "keeping", "the switch did not land");
    eq(row.offered, false, "the offer was not cleared");
    assert(valid(st), "the switch produced an invalid world");
  });

  test("[10] neither setter can return a copy to saying nothing", () => {
    for (const [label, cmd, field, start] of [
      ["withdrawing an offer", "setCollectorCopyOffered", "offered", "offered"],
      ["withdrawing a keep", "setCollectorCopyKept", "keeping", "keeping"],
      ["withdrawing an offer from a kept copy", "setCollectorCopyOffered", "offered", "keeping"],
      ["withdrawing a keep from an offered copy", "setCollectorCopyKept", "keeping", "offered"],
    ]) {
      const st = world();
      const id = owned(st, start);
      const before = snap(st);
      eq(code(x(st, CASEY, cmd, { copyId: id, [field]: false })),
        D.REFUSE.invalidDisposition, `${label}: was not refused`);
      eq(D.copyDisposition(copyOf(st, id)), start, `${label}: the copy lost its answer`);
      eq(snap(st), before, `${label}: a refused withdrawal moved something`);
    }
  });

  test("[11] and neither setter takes anything but `true`", () => {
    for (const bad of [undefined, null, "", "true", "yes", "false", 0, 1, false, [], {}]) {
      for (const [cmd, field] of [["setCollectorCopyOffered", "offered"],
        ["setCollectorCopyKept", "keeping"]]) {
        const st = world();
        const id = owned(st, "offered");
        const before = snap(st);
        eq(code(x(st, CASEY, cmd, { copyId: id, [field]: bad })),
          D.REFUSE.invalidDisposition,
          `${cmd}(${JSON.stringify(bad)}): was not refused as an invalid disposition`);
        eq(snap(st), before, `${cmd}(${JSON.stringify(bad)}): a refusal mutated something`);
      }
    }
  });

  test("[12] a copy that is not there still answers not-found, not invalid-disposition", () => {
    /* The non-boolean case used to answer `not-found`, which told a caller its
       copy did not exist when the copy was fine and the argument was not. The
       two are now distinguishable, and the real missing-copy answer is
       unchanged — including when BOTH are wrong, because whether this caller
       may address this copy at all is settled first. */
    const st = world();
    eq(code(x(st, CASEY, "setCollectorCopyOffered", { copyId: "nope", offered: true })),
      D.REFUSE.notFound, "a missing copy stopped answering not-found");
    eq(code(x(st, CASEY, "setCollectorCopyKept", { copyId: "nope", keeping: false })),
      D.REFUSE.notFound, "a missing copy answered for its argument instead");
    eq(code(x(st, { collectorId: "jordan" }, "setCollectorCopyOffered",
      { copyId: "legacy", offered: "yes" })), D.REFUSE.notOwner,
    "ownership stopped answering before the argument");
  });

  test("[13] re-stating the answer a copy already has stays a no-op", () => {
    /* Idempotency is load-bearing: the Card Specification panel re-sends its
       plan on retry, and a step that already landed must not churn
       `updatedAt`. */
    const st = world();
    const id = owned(st, "offered");
    const before = snap(st);
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: id, offered: true }), "again");
    eq(snap(st), before, "re-stating an offer rewrote the copy");
    const st2 = world();
    const id2 = owned(st2, "keeping");
    const before2 = snap(st2);
    okv(x(st2, CASEY, "setCollectorCopyKept", { copyId: id2, keeping: true }), "again");
    eq(snap(st2), before2, "re-stating a keep rewrote the copy");
  });

  test("[14] `keeping: false` is never stored, through any of it", () => {
    /* The guarantee test [31] of the four-state suite exists to protect, which
       this batch keeps and reaches differently: absence is what "no keep
       stated" looks like, and writing `false` would make "I have not decided"
       and "I decided not to" the same row — the confusion migration 0012
       exists to remember. */
    const st = world();
    const id = owned(st, "offered");
    const has = () => "keeping" in copyOf(st, id);
    assert(!has(), "a Trade/Sell copy was born with a keeping key");
    okv(x(st, CASEY, "setCollectorCopyKept", { copyId: id, keeping: true }), "keep");
    eq(copyOf(st, id).keeping, true, "the keep did not land");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: id, offered: true }), "offer again");
    assert(!has(), `switching away from PC wrote a keeping: false: ${JSON.stringify(copyOf(st, id))}`);
    eq(code(x(st, CASEY, "setCollectorCopyKept", { copyId: id, keeping: false })),
      D.REFUSE.invalidDisposition, "a withdrawal was accepted");
    assert(!has(), "a refused withdrawal wrote a keeping key");
  });
});

/* ========================================= C. the panel, draft versus durable */
describe("C. A draft may be unanswered; a recorded copy may not", () => {

  const seen = (st) => {
    const w = st.get();
    return { ...w, collectorCopies: w.collectorCopies.filter((c) => c.collectorId === "casey"),
      goals: w.goals.filter((g) => g.collectorId === "casey"), catalog: [], partners: [] };
  };

  /* The same switch `SignIn.jsx` uses, so these cases exercise the production
     path rather than an invented one. */
  const send = (st, step, canonicalCardId) => {
    switch (step.kind) {
      case "record-copy": return x(st, CASEY, "addCollectorCopy",
        { copy: { canonicalCardId, ...step.copy } });
      case "offering": return x(st, CASEY, "setCollectorCopyOffered",
        { copyId: step.copyId, offered: step.offered });
      case "keeping": return x(st, CASEY, "setCollectorCopyKept",
        { copyId: step.copyId, keeping: step.keeping });
      case "correct-copy": return x(st, CASEY, "updateCollectorCopy",
        { copyId: step.copyId, patch: step.patch });
      case "forget-copy": return x(st, CASEY, "removeCollectorCopy", { copyId: step.copyId });
      default: return { ok: false, refused: "command-unavailable" };
    }
  };

  const panel = (st, card = "cc-x") => {
    const attempted = [];
    const onCommit = async (step, canonicalCardId) => {
      attempted.push(step);
      return send(st, step, canonicalCardId);
    };
    let r;
    const element = () => React.createElement(SPEC.default, {
      card: { canonicalCardId: card, cardName: "Mudkip" },
      state: seen(st), onCommit, onClose: () => {},
    });
    TR.act(() => { r = TR.create(element()); });
    const refresh = () => { TR.act(() => { r.update(element()); }); };
    const all = (label) => r.root.findAll((n) => n.type === "button"
      && String(n.children).includes(label));
    const button = (label) => {
      const b = all(label)[0];
      assert(b, `no "${label}" button: `
        + r.root.findAll((n) => n.type === "button").map((n) => String(n.children)).join(" | "));
      return b;
    };
    return {
      attempted,
      labels: () => r.root.findAll((n) => n.type === "button").map((n) => String(n.children)),
      pressed: (label) => all(label).map((b) => b.props["aria-pressed"]),
      press: (label) => { TR.act(() => { button(label).props.onClick(); }); },
      pressNth: (label, n) => { TR.act(() => { all(label)[n].props.onClick(); }); },
      /* Each copy row carries its own controls, so a draft is addressed by
         position: the nth reference-value field belongs to the nth row. */
      typeMarket: (n, value) => {
        const fields = r.root.findAll((node) => node.type === "input"
          && node.props.inputMode === "decimal");
        assert(fields[n], `no reference-value field at row ${n} (${fields.length} found)`);
        TR.act(() => { fields[n].props.onChange({ target: { value } }); });
      },
      save: async () => {
        const b = button("Save");
        if (b.props.disabled) return "disabled";
        await TR.act(async () => { await b.props.onClick(); });
        refresh();
        return "pressed";
      },
      saveDisabled: () => !!button("Save").props.disabled,
      text: () => JSON.stringify(r.toJSON()),
    };
  };

  test("[15] there is no actionable \"Haven't decided\"", () => {
    const st = world();
    const p = panel(st);
    p.press(ADD_COPY);
    /* Matched loosely on the apostrophe: this file's own JSX uses `&rsquo;`
       elsewhere, so a straight-quote regex would miss the button coming back
       as "Haven&rsquo;t decided". */
    assert(!p.labels().some((l) => /haven.{0,2}t decided/i.test(l)),
      `the dead-end choice is still offered: ${p.labels().join(" | ")}`);
    eq(p.pressed(TRADE_SELL).length + p.pressed(KEEP).length, p.labels()
      .filter((l) => l === TRADE_SELL || l === KEEP).length,
    "a third disposition button appeared");
    assert(p.labels().includes(TRADE_SELL), "the Trade/Sell choice went missing");
    assert(p.labels().includes(KEEP), "the PC choice went missing");
  });

  test("[16] a new copy starts with neither choice selected", () => {
    const st = world();
    const p = panel(st);
    p.press(ADD_COPY);
    /* The existing stateless copy is row 0 and the new draft is row 1; both
       must show neither answer pressed. The counts are asserted first, because
       an empty list would make the loop below pass while looking at nothing —
       which an earlier draft of this test did. */
    for (const label of [TRADE_SELL, KEEP]) {
      const states = p.pressed(label);
      eq(states.length, 2, `${label}: expected one button per copy row, saw ${states.length}`);
      for (const [i, pressed] of states.entries()) {
        eq(pressed, false, `${label} row ${i}: a disposition was pre-selected`);
      }
    }
  });

  test("[17] Save cannot record a new copy with no disposition", async () => {
    const st = world();
    const p = panel(st);
    p.press(ADD_COPY);
    assert(p.saveDisabled(), "Save was offered over a guaranteed refusal");
    assert(/part with that copy or you're keeping it/.test(p.text()),
      `the reason was not shown: ${p.text().slice(0, 400)}`);
    eq(await p.save(), "disabled", "Save fired anyway");
    eq(st.get().collectorCopies.length, 1, "a copy was recorded");
    eq(p.attempted.length, 0, "the panel sent something");
  });

  test("[18] either answer unblocks it, and the copy is stored as chosen", async () => {
    for (const [label, disposition] of [[TRADE_SELL, "offered"], [KEEP, "keeping"]]) {
      const st = world();
      const p = panel(st);
      p.press(ADD_COPY);
      /* Row 0 is the stored stateless copy; row 1 is the new draft. */
      p.pressNth(label, 1);
      assert(!p.saveDisabled(), `${label}: Save stayed disabled after a choice`);
      eq(await p.save(), "pressed", `${label}: Save did not fire`);
      const added = st.get().collectorCopies.filter((b) => b.id !== "legacy");
      eq(added.length, 1, `${label}: the copy was not recorded`);
      eq(D.copyDisposition(added[0]), disposition, `${label}: it was stored as something else`);
      eq(p.attempted.filter((s) => s.kind === "record-copy").length, 1,
        `${label}: the panel sent the wrong number of writes`);
    }
  });

  test("[19] a switch is one positive command, and no step withdraws anything", async () => {
    /* RENAMED: an earlier draft called this "the panel never sends a `false`
       disposition", which it could not see. A SWITCH never does — that is what
       is asserted here. A `record-copy` step carries its disposition one level
       down, in `step.copy`, where `{ offered: true, keeping: false }` is the
       complete answer production sends; that pair is checked below and pinned
       in the domain by [6b]. */
    const st = world({ collectorCopies: [{ id: "mine", collectorId: "casey",
      canonicalCardId: "cc-x", offered: true, grade: "PSA 9", photos: PHOTOS }] });
    const p = panel(st);
    p.press(KEEP);
    eq(await p.save(), "pressed", "Save did not fire");
    const steps = p.attempted;
    eq(steps.length, 1, `a switch took ${steps.length} steps: ${JSON.stringify(steps)}`);
    eq(steps[0].kind, "keeping", "the switch was not sent as the positive command");
    eq(steps[0].keeping, true, "the switch sent something other than true");
    assert(!steps.some((s) => s.offered === false || s.keeping === false),
      `a withdrawal was sent: ${JSON.stringify(steps)}`);
    eq(D.copyDisposition(copyOf(st, "mine")), "keeping", "the switch did not land");

    /* AND A NEW COPY'S STEP NAMES EXACTLY ONE ANSWER AS TRUE. */
    const st2 = world();
    const q = panel(st2);
    q.press(ADD_COPY);
    q.pressNth(TRADE_SELL, 1);
    eq(await q.save(), "pressed", "Save did not fire for a new copy");
    const rec = q.attempted.filter((s) => s.kind === "record-copy");
    eq(rec.length, 1, `the panel sent ${JSON.stringify(q.attempted)}`);
    eq(rec[0].copy.offered, true, "the new copy did not state Trade/Sell");
    eq(rec[0].copy.keeping, false, "the other half was not stated as false");
    eq([rec[0].copy.offered, rec[0].copy.keeping].filter((v) => v === true).length, 1,
      "a record-copy step named more or less than one answer");
  });

  test("[19b] and an unanswered draft is not in the plan at all", () => {
    /* Save is already disabled while one exists, so this is belt and braces —
       but without it `planFrom` composes `{ offered: false, keeping: false }`,
       which the domain refuses, and the rule would live in one `if` in the view
       rather than in the thing that decides what gets sent. */
    const st = world();
    const state = { ...st.get(), catalog: [], partners: [] };
    const draft = (disposition) => ({ binders: new Set(), newBinders: [], want: "none",
      desired: { grade: "", condition: "" },
      copies: [{ id: null, key: "new-1", grade: "PSA 9", condition: "", cert: "",
        market: "", disposition, removed: false }] });
    eq(JSON.stringify(SPEC.planFrom(state, "cc-w", draft("unanswered")).steps), "[]",
      "an unanswered draft reached the plan");
    eq(SPEC.planFrom(state, "cc-w", draft("offered")).steps.length, 1,
      "an answered draft went missing from the plan");
  });

  test("[20] an unrelated edit to a stateless copy does not assign it one", async () => {
    /* THE LINE THIS BATCH MUST NOT CROSS. A copy recorded before the rule says
       nothing; correcting its reference value must not be the moment its owner
       is forced to decide, and must certainly not decide for them.

       Save is disabled on an UNTOUCHED panel because the plan is empty
       (`shown = plan.steps.length`), which is pre-existing and right — so this
       case makes a real edit and then presses it. */
    const st = world();
    const p = panel(st);
    eq(p.attempted.length, 0, "opening the panel sent a command");
    eq(D.copyDisposition(copyOf(st, "legacy")), "unstated",
      "looking at the copy gave it a disposition");
    p.typeMarket(0, "150");
    assert(!p.saveDisabled(),
      "correcting a stateless copy was blocked on an unrelated decision");
    eq(await p.save(), "pressed", "Save did not fire");
    eq(p.attempted.length, 1, `the panel sent ${JSON.stringify(p.attempted)}`);
    eq(p.attempted[0].kind, "correct-copy", "the edit was not sent as a correction");
    eq(copyOf(st, "legacy").market, 150, "the correction did not land");
    eq(D.copyDisposition(copyOf(st, "legacy")), "unstated", "the Save assigned a disposition");
    assert(!("keeping" in copyOf(st, "legacy")), "a keeping key was invented");
    assert(valid(st), "the world stopped being valid");
  });

  test("[21] and the plan it builds for that copy carries no disposition step", () => {
    /* Driven through the real `planFrom` with the real `initialAnswers`, so the
       assertion is about what the panel would send and not about a shape the
       test invented. */
    const st = world();
    const state = seen(st);
    const answers = SPEC.initialAnswers(state, "cc-x");
    const copy = answers.copies.find((c) => c.id === "legacy");
    assert(copy, `the stored copy did not reach the draft: ${JSON.stringify(answers.copies)}`);
    eq(copy.disposition, "unanswered", "the draft sentinel is not the renamed one");
    const plan = SPEC.planFrom(state, "cc-x", answers);
    eq(JSON.stringify(plan.steps), "[]", `an untouched copy produced steps: ${JSON.stringify(plan.steps)}`);
    /* And choosing one produces exactly the positive step. */
    const chosen = { ...answers, copies: answers.copies.map((c) => (c.id === "legacy"
      ? { ...c, disposition: "keeping" } : c)) };
    const next = SPEC.planFrom(state, "cc-x", chosen);
    eq(next.steps.length, 1, `choosing produced ${next.steps.length} steps`);
    eq(next.steps[0].kind, "keeping", "the wrong step");
    eq(next.steps[0].keeping, true, "the step did not state the choice positively");
  });

  test("[22] the refusal has a message a Collector can act on", () => {
    const got = SPEC.explain({ kind: "record-copy" }, D.REFUSE.invalidDisposition, []);
    assert(/part with it or you're keeping it/.test(got),
      `invalid-disposition has no Collector-facing explanation: ${got}`);
    assert(!/MetYet would not accept it/.test(got), "it fell through to the fallback sentence");
  });
});

/* ============================== D. the copies that were recorded before this */
describe("D. A copy already stored saying nothing keeps working", () => {

  test("[23] it loads, it validates, and the validator has NOT acquired the rule", () => {
    /* THE COMPATIBILITY PIN, AND THE MOST IMPORTANT TEST IN THIS FILE.

       `validateWorld` runs on LOAD as well as before save, so this rule living
       there would not refuse anything — it would make every world holding a
       pre-rule copy unloadable, which is a 500 on the next read rather than an
       answer to a caller. This repository has been caught by that three times.
       The rule belongs at the command boundary and this test fails the moment
       somebody moves it. */
    const st = world();
    assert(valid(st), "a stored stateless copy made the world invalid");
    eq(D.copyDisposition(copyOf(st, "legacy")), "unstated", "it was given an answer on load");
    const v = W.validateWorld(st.get());
    eq(JSON.stringify(v.errors || []), "[]", `the validator complained: ${JSON.stringify(v)}`);
    /* And every neighbouring shape the validator does police is untouched. */
    const both = createStore({ ...world().get(),
      collectorCopies: [{ id: "b", collectorId: "casey", canonicalCardId: "cc-x",
        offered: true, keeping: true }] });
    assert(!valid(both), "the validator stopped refusing a copy that is both");
  });

  test("[24] it renders, and it still does not reach a partner", () => {
    const st = world();
    const own = P.projectForActor(st.get(), CASEY);
    const mine = own.collectorCopies.find((b) => b.id === "legacy");
    assert(mine, "the owner stopped seeing their own copy");
    assert(!("keeping" in mine), "a keeping key appeared from nowhere");
    const theirs = P.projectForActor(st.get(), TP);
    assert(!(theirs.collectorCopies || []).some((b) => b.id === "legacy"),
      "a copy nobody has offered crossed to a partner");
  });

  test("[25] its physical facts are still editable, and its cert still locks the same way", () => {
    const st = world();
    okv(x(st, CASEY, "updateCollectorCopy",
      { copyId: "legacy", patch: { grade: "PSA 9", market: 120 } }), "correct it");
    eq(copyOf(st, "legacy").grade, "PSA 9", "the correction did not land");
    eq(D.copyDisposition(copyOf(st, "legacy")), "unstated", "a correction assigned a disposition");
    /* And the patch door is still shut to the disposition itself. */
    for (const patch of [{ offered: true }, { keeping: true }, { offered: false }]) {
      eq(code(x(st, CASEY, "updateCollectorCopy", { copyId: "legacy", patch })),
        D.REFUSE.identityImmutable, `${JSON.stringify(patch)} travelled inside a patch`);
    }
  });

  test("[26] its binder filing is untouched", () => {
    const st = world();
    const bd = okv(x(st, CASEY, "createBinder", { name: "Shoebox" }), "binder");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x" }), "file");
    eq(st.get().binderEntries.length, 1, "filing was refused");
    eq(D.copyDisposition(copyOf(st, "legacy")), "unstated", "filing assigned a disposition");
    okv(x(st, CASEY, "removeBinderEntry", { binderId: bd, canonicalCardId: "cc-x" }), "unfile");
    eq(st.get().binderEntries.length, 0, "unfiling was refused");
  });

  test("[27] it is still barred from a trade package by the rule that already barred it", () => {
    const st = world({
      goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-z", tier: "primary",
        desired: { grade: "PSA 9" } }],
      inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-z", ask: 30,
        grade: "PSA 9", cert: "SHOP-1", photos: PHOTOS, archived: false }],
    });
    const oppId = okv(x(st, CASEY, "startOpportunity",
      { goalId: "g1", invId: "i1", amount: 26 }), "start");
    okv(x(st, TP, "acceptPrice", { oppId }), "agree");
    eq(code(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: ["legacy"] })),
      D.REFUSE.copyNotOffered, "a copy nobody has offered entered a trade package");
    /* `setInterest` is the same answer from the other side, also unchanged. */
    eq(code(x(st, TP, "setInterest", { binderId: "legacy", on: true })),
      D.REFUSE.notFound, "a partner took an interest in a copy nobody has offered");
  });

  test("[28] it is removable, and it resolves either way without being guessed at", () => {
    for (const [cmd, field, want] of [["setCollectorCopyKept", "keeping", "keeping"],
      ["setCollectorCopyOffered", "offered", "offered"]]) {
      const st = world();
      okv(x(st, CASEY, cmd, { copyId: "legacy", [field]: true }), cmd);
      eq(D.copyDisposition(copyOf(st, "legacy")), want, `${cmd}: the resolution did not land`);
      assert(valid(st), `${cmd}: resolving produced an invalid world`);
    }
    const st = world();
    okv(x(st, CASEY, "removeCollectorCopy", { copyId: "legacy" }), "remove");
    eq(st.get().collectorCopies.length, 0, "it could not be removed");
  });

  test("[29] and nothing resolved one on its own", () => {
    /* Several of section D's surfaces in one pass — a binder, a correction, both
       projections and the validator — ending where it started. Not every
       surface: the panel is [20] and [21], the trade door is [27], and the
       setters are [28]. What this adds is that a SEQUENCE of them leaves the
       copy as silent as each one does alone. */
    const st = world();
    const bd = okv(x(st, CASEY, "createBinder", { name: "Shoebox" }), "binder");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-x" }), "file");
    okv(x(st, CASEY, "updateCollectorCopy", { copyId: "legacy", patch: { cert: "OLD-2" } }), "cert");
    P.projectForActor(st.get(), CASEY);
    P.projectForActor(st.get(), TP);
    W.validateWorld(st.get());
    eq(D.copyDisposition(copyOf(st, "legacy")), "unstated",
      `something assigned a disposition: ${JSON.stringify(copyOf(st, "legacy"))}`);
    assert(!("keeping" in copyOf(st, "legacy")), "a keeping key was invented");
    eq(copyOf(st, "legacy").offered, false, "`offered` was changed");
  });
});

/* ======================================== E. what this batch did not touch */
describe("E. The transaction rules and the vocabulary are where they were", () => {

  test("[30] the package door asks exactly what it asked before", () => {
    const st = world({
      goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-z", tier: "primary",
        desired: { grade: "PSA 9" } }],
      inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-z", ask: 30,
        grade: "PSA 9", cert: "SHOP-1", photos: PHOTOS, archived: false }],
      collectorCopies: [],
    });
    const kept = okv(x(st, CASEY, "addCollectorCopy",
      { copy: { canonicalCardId: "cc-x", grade: "PSA 9", cert: "K", photos: PHOTOS,
        keeping: true } }), "pc");
    const bare = okv(x(st, CASEY, "addCollectorCopy",
      { copy: { canonicalCardId: "cc-x", grade: "PSA 9", cert: "B", offered: true } }), "no photos");
    const ready = okv(x(st, CASEY, "addCollectorCopy",
      { copy: { canonicalCardId: "cc-x", grade: "PSA 9", cert: "R", photos: PHOTOS,
        offered: true } }), "ready");
    const oppId = okv(x(st, CASEY, "startOpportunity",
      { goalId: "g1", invId: "i1", amount: 26 }), "start");
    okv(x(st, TP, "acceptPrice", { oppId }), "agree");
    eq(code(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: [kept] })),
      D.REFUSE.copyNotOffered, "a PC copy entered a trade package");
    eq(code(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: [bare] })),
      D.REFUSE.photosRequired, "photographs stopped being required at the door");
    okv(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: [ready] }), "the real one");
  });

  test("[31] `copyDisposition` still has three answers, because worlds still do", () => {
    eq(D.copyDisposition({ offered: true }), "offered");
    eq(D.copyDisposition({ keeping: true }), "keeping");
    eq(D.copyDisposition({ offered: false }), "unstated",
      "the domain stopped being able to describe a copy recorded before the rule");
    eq(D.copyDisposition({}), "unstated");
    /* And the panel's draft word is NOT that word, which is the point of
       renaming it: three layers used to share one string. */
    const src = require("fs").readFileSync(
      path.join(ROOT, "client/collector/CardSpecification.jsx"), "utf8");
    assert(/const UNANSWERED = "unanswered";/.test(src),
      "the draft sentinel is not declared where this test can see it");
    assert(!/disposition: "unstated"/.test(src),
      "the panel still writes the domain's word into a draft");
  });

  test("[32] grading's own `unstated` is a different thing and is untouched", () => {
    eq(D.gradingOf({}).state, "unstated", "a copy nobody described became something");
    eq(D.gradingOf({ grade: "Raw", condition: "Near Mint" }).state, "raw");
    eq(D.gradingOf({ grade: "PSA 9" }).state, "graded");
    eq(D.gradingProblem({}), null, "an undescribed copy became an incoherent one");
    eq(D.gradingProblem({ condition: "Near Mint" }), null,
      "a condition with no grade stopped being legal");
    /* cert-without-grade is still unchecked by the domain, deliberately and on
       the record — the importer refuses it, this batch does not touch it. */
    eq(D.gradingProblem({ cert: "X" }), null, "this batch started checking certs");
  });

  test("[33] both writers of a disposition gate it, and neither defaults one", () => {
    const src = require("fs").readFileSync(
      path.join(ROOT, "domain/metyet-commands.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ");
    const bodyOf = (name) => {
      const from = src.indexOf(`${name}(state`);
      assert(from >= 0, `${name} is no longer in metyet-commands.js`);
      const rest = src.slice(from + 1);
      const next = rest.search(/\n {2}[A-Za-z]+\(state/);
      return next < 0 ? rest : rest.slice(0, next);
    };
    for (const writer of ["addCollectorCopy", "setCollectorCopyOffered", "setCollectorCopyKept"]) {
      assert(/R\.invalidDisposition/.test(bodyOf(writer)),
        `${writer} no longer refuses an invalid disposition`);
    }
    /* THE SETTERS TAKE `true`, NOT ANY BOOLEAN, and the check is scoped to their
       bodies rather than the file: `addCollectorCopy` legitimately contains
       `typeof offered !== "boolean"`, because at BIRTH the other flag may be a
       stated `false`. A whole-file regex read that as a regression — which is
       the shape of false positive this kind of source pin keeps producing, so
       it is named here rather than loosened. */
    for (const setter of ["setCollectorCopyOffered", "setCollectorCopyKept"]) {
      const body = bodyOf(setter);
      assert(!/typeof (offered|keeping) !== "boolean"/.test(body),
        `${setter} is back to accepting any boolean`);
      assert(/(offered|keeping) !== true/.test(body),
        `${setter} no longer requires exactly true`);
    }
    /* And the client sends no default of its own, which would be a default that
       cannot succeed. */
    const client = require("fs").readFileSync(path.join(ROOT, "client/commands.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ");
    assert(!/offered = false/.test(client) && !/keeping = false/.test(client),
      "addOwnedCopy is defaulting a disposition again");
  });
});

run();
