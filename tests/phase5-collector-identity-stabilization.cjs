/* ============================================================================
   THREE THINGS THE OBJECT-IDENTITY AUDIT FOUND, AND NOTHING ELSE

   The audit that preceded this suite asked whether a Collector's actionable
   objects — a specific sought copy (a Goal) and a specific owned physical copy
   (a CollectorCopy) — keep their identity all the way through the product. The
   answer was mostly yes, and the Binder is where it is not. That correction is
   a later batch.

   These are the three integrity holes the audit found ON THE WAY, none of which
   should wait for it, and all three are about the same thing: a record that can
   no longer be trusted to say what was actually decided.

   A. A COPY ITS OWNER IS KEEPING COULD BE PUT IN A TRADE PACKAGE.
      `proposeTradeSelection` read ownership, photographs and reservation and
      never the disposition. The kept copy then crossed to the shop through
      `referencedCopies` — grade, cert and both photographs — labelled
      "reserved", and could be accepted to "traded". The field-level rule held
      (`keeping` is off the partner allow-list); the ROW the projection says
      never reaches a partner did reach them. The previous hand-back called that
      protection DOUBLED. It was single.

   B. A GOAL'S CRITERIA COULD BE REWRITTEN UNDERNEATH A LIVE DEAL.
      `startOpportunity` admits a copy by asking `meetsGoalCriteria`, and
      nothing snapshots the answer. `removeGoal` and `updateGoalTier` both
      refuse while a deal holds the Goal; `updateGoalCriteria` did not. So a
      completed record could describe a negotiation over a copy that, read back,
      never qualified.

   C. A RETRY COULD RECORD A SECOND PHYSICAL COPY.
      The panel promises "pressing Save again sends only what is left", and for
      every step but one it is true. A new copy was the exception: the draft
      carried `id: null`, the server's minted id was discarded, and the
      step's draft id was written and read by nothing. This is the only one of the
      three reachable through the production door today.

   WHAT THIS SUITE DELIBERATELY DOES NOT DO. It adds no dependency on
   `cardHasState`, on card-level Binder membership, on the Binder state guard,
   on `pruneOrphanedMemberships`, or on the command-plan ordering that exists to
   serve them. All of those are scheduled for reassessment, and a test written
   against them now is a test that has to be deleted later.

   AND SECTION C IS DRIVEN THROUGH THE REAL PANEL. The previous batch shipped a
   defect that every domain test missed because the domain was exercised one
   command at a time and the panel sends a sequence. So the retry cases here run
   the real `planFrom`, the real binding switch as `SignIn.jsx` writes it, and —
   for the last one — the mounted component with Save actually pressed.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const W = require("../domain/metyet-world.js");
const { createStore } = require("./fixture-store.cjs");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");

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
const JORDAN = { collectorId: "jordan" };
const TP = { partnerId: "nl" };
const SV = { partnerId: "sv" };

const PHOTOS = { front: "front.jpg", back: "back.jpg" };

const world = (over = {}) => createStore({
  partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 },
    { id: "sv", name: "Silver Vale", tradeRate: 0.7 }],
  collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" }],
  relationships: [{ partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
    { partnerId: "sv", collectorId: "jordan", status: "accepted", at: AT }],
  goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary",
    desired: { grade: "PSA 9" } }],
  inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30,
    grade: "PSA 9", cert: "SHOP-1", photos: { front: "f", back: "b" }, archived: false }],
  collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [],
  copyReviews: [], photoRequests: [], conversations: [], interests: [],
  ...over,
});

const x = (st, actor, cmd, payload) => st.execute(actor, cmd, { ...(payload || {}), at: AT });
const code = (r) => (r && r.ok !== false ? "OK" : r.refused);
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const copies = (st) => st.get().collectorCopies;
const valid = (st) => {
  const v = W.validateWorld(st.get());
  return v && "ok" in v ? v.ok : ((v || []).length === 0);
};

/* A copy Casey owns, with photographs, so nothing below is refused for the
   wrong reason. `disposition` is the thing under test. */
const own = (st, disposition, over = {}) => okv(x(st, CASEY, "addCollectorCopy", {
  copy: { canonicalCardId: "cc-y", grade: "PSA 8", cert: "MINE-1", photos: PHOTOS,
    offered: disposition === "offered", keeping: disposition === "keeping", ...over },
}), `own ${disposition}`);

/* Casey's deal on the shop's copy, driven to the point where a package is
   asked for. Nothing here is under test; it is the only way to reach the door. */
const toSelectTrade = (st) => {
  const oppId = okv(x(st, CASEY, "startOpportunity",
    { goalId: "g1", invId: "i1", amount: 26 }), "start");
  okv(x(st, TP, "acceptPrice", { oppId }), "agree the price");
  eq(st.get().opportunities[0].stage, "select-trade", "the fixture is not at the door");
  return oppId;
};

/* ==================================== A. PC is a hard bar to a trade package */
describe("A. What may go into a trade package", () => {
  test("[1] a copy its owner is keeping is refused", () => {
    const st = world();
    const kept = own(st, "keeping");
    const oppId = toSelectTrade(st);
    eq(code(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: [kept] })),
      D.REFUSE.copyNotOffered, "a PC copy went into a package");
    const o = st.get().opportunities[0];
    assert(!(o.trade && o.trade.cards && o.trade.cards.length),
      "a row was written anyway: " + JSON.stringify(o.trade));
    assert(!(o.trade && o.trade.submitted), "the package was submitted");
    eq(D.collectorCopyStatus(kept, st.get().opportunities), "available",
      "the kept copy was reserved by a refusal");
    eq(D.copyDisposition(copies(st)[0]), "keeping", "the refusal changed the copy");
    assert(valid(st), "the world became invalid");
  });

  test("[2] a copy its owner has offered is accepted, when everything else passes", () => {
    const st = world();
    const offered = own(st, "offered");
    const oppId = toSelectTrade(st);
    okv(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: [offered] }), "offer it");
    const o = st.get().opportunities[0];
    eq(o.trade.cards.length, 1, "the row did not land");
    eq(o.trade.cards[0].binderId, offered, "the wrong copy landed");
    eq(D.collectorCopyStatus(offered, st.get().opportunities), "reserved",
      "an accepted copy was not reserved");
    assert(valid(st), "the world became invalid");
  });

  test("[3] a copy nobody has said anything about cannot enter a package", () => {
    /* SILENCE IS NOT CONSENT, and this is the case that matters most in
       practice: every copy written before PC existed is in exactly this state,
       so refusing only `keeping` would have left them all reservable against
       their owners' silence. */
    /* RE-PINNED: THE COPY IS NOW SEEDED, BECAUSE THE COMMAND WILL NOT MAKE ONE.

       This case is about the copies that ALREADY say nothing — every copy
       written before PC existed, and every copy recorded between then and the
       disposition batch. It used to create one through `addCollectorCopy`; that
       command now refuses a copy with no disposition, so the fixture seeds the
       row directly. That is the honest way to test a state the product holds
       but no longer creates, and the guarantee is untouched: silence is not
       consent, and a copy nobody has spoken for cannot be reserved. */
    const st = world({ collectorCopies: [{ id: "quiet", collectorId: "casey",
      canonicalCardId: "cc-y", grade: "PSA 8", cert: "MINE-1", photos: PHOTOS,
      offered: false }] });
    const quiet = "quiet";
    /* Asserted through the domain's own reader rather than by re-reading the
       literal two lines above: what matters is that the DOMAIN still calls this
       shape silence, not that `createStore` copied the seed faithfully. */
    eq(D.copyDisposition(copies(st)[0]), "unstated", "the fixture is not actually silent");
    assert(!D.copyKept(copies(st)[0]), "the fixture reads as kept");
    assert(valid(st), "a world holding a copy that says nothing stopped loading");
    const oppId = toSelectTrade(st);
    eq(code(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: [quiet] })),
      D.REFUSE.copyNotOffered, "an undeclared copy went into a package");
    eq(D.collectorCopyStatus(quiet, st.get().opportunities), "available", "it was reserved");
  });

  test("[4] and the domain itself is where the rule lives", () => {
    /* Not the panel, not the server, not the shape of a payload. The command
       refuses it when called directly, with no surface anywhere near it — and
       one bad id refuses the WHOLE package rather than quietly dropping a row,
       so a person cannot be told "submitted" about a set they did not choose. */
    const st = world();
    const kept = own(st, "keeping");
    const offered = own(st, "offered", { cert: "MINE-2" });
    const oppId = toSelectTrade(st);
    for (const set of [[kept], [kept, offered], [offered, kept]]) {
      eq(code(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: set })),
        D.REFUSE.copyNotOffered, `${JSON.stringify(set)} got through`);
      const o = st.get().opportunities[0];
      assert(!(o.trade && o.trade.submitted), "a partial package was submitted");
    }
    eq(D.collectorCopyStatus(offered, st.get().opportunities), "available",
      "the good copy in a refused set was reserved anyway");
    /* And the command is not reachable from production at all. */
    assert(!EXPOSED_COMMANDS.includes("proposeTradeSelection"),
      "the trade command was exposed by this batch");
  });

  test("[5] a refused PC copy never becomes partner-visible", () => {
    /* THE HARM THE RULE EXISTS TO STOP. A submitted row puts the copy in
       `referencedCopies`, which is a second door into the partner's projection
       beside `offered` — so before this, a kept copy reached the shop with its
       grade, cert and both photographs, labelled "reserved". */
    const st = world();
    const kept = own(st, "keeping");
    const oppId = toSelectTrade(st);
    eq(code(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: [kept] })),
      D.REFUSE.copyNotOffered, "it was accepted");
    const seen = P.projectForActor(st.get(), TP);
    eq((seen.collectorCopies || []).length, 0,
      "the kept copy reached the shop: " + JSON.stringify(seen.collectorCopies));
    const blob = JSON.stringify(seen);
    for (const secret of ["MINE-1", "front.jpg", "back.jpg", "keeping"]) {
      assert(!blob.includes(secret), `${secret} crossed to the partner`);
    }
    /* THE POSITIVE CONTROL, so the scan above is not passing because the
       projection is empty for some unrelated reason. The same world with the
       copy OFFERED puts every one of those strings in front of the shop. */
    const st2 = world();
    const offered = own(st2, "offered");
    const opp2 = toSelectTrade(st2);
    okv(x(st2, CASEY, "proposeTradeSelection", { oppId: opp2, binderIds: [offered] }), "package");
    const open = JSON.stringify(P.projectForActor(st2.get(), TP));
    for (const shown of ["MINE-1", "front.jpg", "back.jpg"]) {
      assert(open.includes(shown), `${shown} never reaches a partner at all, so the scan proves nothing`);
    }
    assert(!open.includes("keeping"), "the allow-list leaked the disposition");
    /* Nor to anybody else. */
    eq((P.projectForActor(st.get(), SV).collectorCopies || []).length, 0,
      "an unrelated shop saw it");
  });

  test("[6] and saying yes makes the same copy eligible, on the existing rules", () => {
    const st = world();
    const copy = own(st, "keeping");
    const oppId = toSelectTrade(st);
    eq(code(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: [copy] })),
      D.REFUSE.copyNotOffered, "refused for the wrong reason at the start");
    okv(x(st, CASEY, "setCollectorCopyOffered", { copyId: copy, offered: true }), "change of mind");
    okv(x(st, CASEY, "proposeTradeSelection", { oppId, binderIds: [copy] }), "now it should pass");
    eq(st.get().opportunities[0].trade.cards[0].binderId, copy, "the row did not land");
    /* And the OTHER requirements are untouched — an offered copy with no
       photographs is still refused, for its own reason. */
    const st2 = world();
    const bare = own(st2, "offered", { photos: { front: null, back: null }, cert: "MINE-3" });
    const opp2 = toSelectTrade(st2);
    eq(code(x(st2, CASEY, "proposeTradeSelection", { oppId: opp2, binderIds: [bare] })),
      D.REFUSE.photosRequired, "the photograph requirement was lost");
    /* …as is ownership: Casey cannot put somebody else's copy in her package,
       and the refusal is about the COPY rather than about the deal. */
    const theirs = okv(x(st2, JORDAN, "addCollectorCopy", {
      copy: { canonicalCardId: "cc-y", grade: "PSA 8", cert: "THEIRS-1",
        photos: PHOTOS, offered: true } }), "their copy");
    eq(code(x(st2, CASEY, "proposeTradeSelection", { oppId: opp2, binderIds: [theirs] })),
      D.REFUSE.notOwner, "Casey could package somebody else's copy");
    /* And somebody outside the deal cannot touch it at all, which is the
       older rule and is untouched by this batch. */
    eq(code(x(st2, JORDAN, "proposeTradeSelection", { oppId: opp2, binderIds: [theirs] })),
      D.REFUSE.notParticipant, "a stranger reached into the deal");
  });
});

/* ============================== B. a live deal holds the criteria still */
describe("B. What a live deal holds still", () => {
  const withDeal = () => {
    const st = world();
    const oppId = okv(x(st, CASEY, "startOpportunity",
      { goalId: "g1", invId: "i1", amount: 26 }), "start");
    return { st, oppId };
  };

  test("[7] criteria cannot be rewritten while a deal names the Goal", () => {
    const { st } = withDeal();
    eq(code(x(st, CASEY, "updateGoalCriteria", { goalId: "g1", desired: { grade: "PSA 4" } })),
      D.REFUSE.goalLocked, "the criteria were rewritten underneath a live deal");
    eq(st.get().goals[0].desired.grade, "PSA 9", "they changed anyway");
    /* Every shape of the same act. */
    for (const desired of [{ grade: "PSA 10" }, { grade: "Raw", condition: "Near Mint" },
      null, {}]) {
      eq(code(x(st, CASEY, "updateGoalCriteria", { goalId: "g1", desired })),
        D.REFUSE.goalLocked, `${JSON.stringify(desired)} got through`);
    }
    /* THE POINT OF THE RULE: the deal's own admission gate still answers yes. */
    const copy = st.get().inventory.find((i) => i.invId === "i1");
    assert(D.meetsGoalCriteria(st.get().goals[0].desired, copy),
      "the record can no longer justify its own deal");
  });

  test("[8] and the neighbouring Goal mutations behave exactly as before", () => {
    const { st } = withDeal();
    /* `updateGoalTier` refuses a DEMOTION and always did. */
    eq(code(x(st, CASEY, "updateGoalTier", { goalId: "g1", tier: "secondary" })),
      D.REFUSE.goalLocked, "demotion stopped being refused");
    eq(st.get().goals[0].tier, "primary", "the tier moved");
    /* And a PROMOTION is still allowed under a live deal, which is the half a
       no-op assertion would have missed entirely: `goalLocked` is about losing
       Primary, not about the Goal being untouchable. A second Goal, on a second
       card, demoted first so the promotion is real work rather than a
       short-circuit. */
    okv(x(st, CASEY, "addGoal",
      { canonicalCardId: "cc-w", tier: "secondary", desired: { grade: "PSA 9" } }), "second goal");
    const g2 = st.get().goals.find((g) => g.canonicalCardId === "cc-w").id;
    okv(x(st, CASEY, "updateGoalTier", { goalId: g2, tier: "primary" }), "promotion");
    eq(st.get().goals.find((g) => g.id === g2).tier, "primary", "the promotion did not land");
  });

  test("[9] removeGoal behaves exactly as before", () => {
    const { st } = withDeal();
    eq(code(x(st, CASEY, "removeGoal", { goalId: "g1" })), D.REFUSE.goalLocked,
      "removal stopped being refused");
    eq(st.get().goals.length, 1, "the goal went");
  });

  test("[10] and once the deal is over, editing is what it was", () => {
    const { st, oppId } = withDeal();
    eq(code(x(st, CASEY, "updateGoalCriteria", { goalId: "g1", desired: { grade: "PSA 10" } })),
      D.REFUSE.goalLocked, "locked check failed at the start");
    okv(x(st, CASEY, "cancelOpportunity", { oppId, reason: "changed my mind" }), "end it");
    assert(!D.goalNamedByActive("g1", st.get().opportunities), "the deal is still active");
    okv(x(st, CASEY, "updateGoalCriteria", { goalId: "g1", desired: { grade: "PSA 10" } }),
      "editing did not come back");
    eq(st.get().goals[0].desired.grade, "PSA 10", "the edit did not land");
    /* And with no deal at all it never was locked. */
    const fresh = world();
    okv(x(fresh, CASEY, "updateGoalCriteria", { goalId: "g1", desired: { grade: "PSA 10" } }),
      "a goal with no deal was locked");
    /* The other refusals still come first-class, not swallowed by the lock. */
    eq(code(x(fresh, CASEY, "updateGoalCriteria", { goalId: "g1", desired: {} })),
      D.REFUSE.criteriaRequired, "an empty specification was accepted");
    eq(code(x(fresh, CASEY, "updateGoalCriteria",
      { goalId: "g1", desired: { grade: "PSA 9", condition: "Near Mint" } })),
      D.REFUSE.gradingIncoherent, "a contradictory pair was accepted");
  });

  test("[11] True Match is exactly what it was", () => {
    /* Stated criteria are exact string equality; unstated dimensions are
       unrestricted; no bands, no floors, no "or better". */
    const hit = world();
    eq((P.projectForActor(hit.get(), CASEY).discoveries || []).length, 1, "the match was lost");

    const miss = world({ goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-x",
      tier: "primary", desired: { grade: "PSA 10" } }] });
    eq((P.projectForActor(miss.get(), CASEY).discoveries || []).length, 0,
      "a PSA 10 goal matched a PSA 9 copy");

    const open = world({ goals: [{ id: "g1", collectorId: "casey", canonicalCardId: "cc-x",
      tier: "primary", desired: { condition: "Near Mint" } }] });
    eq((P.projectForActor(open.get(), CASEY).discoveries || []).length, 0,
      "an unstated grade became a wildcard over a stated condition mismatch");

    const copy = hit.get().inventory[0];
    assert(D.meetsGoalCriteria({ grade: "PSA 9" }, copy), "exact stated grade");
    assert(!D.meetsGoalCriteria({ grade: "PSA 8" }, copy), "a lower grade matched");
    assert(D.meetsGoalCriteria({}, copy), "an unstated criterion restricted something");
  });
});

/* ======================== C. a retry sends only what is left, copies included */
describe("C. What a second press of Save does", () => {
  /* THE BINDING SWITCH, verbatim as `client/sign-in/SignIn.jsx` writes it, so
     these cases exercise the production path rather than an invented one. */
  const send = (st, step, canonicalCardId) => {
    switch (step.kind) {
      case "make-binder": return x(st, CASEY, "createBinder", { name: step.name });
      case "file": return x(st, CASEY, "addBinderEntry", { binderId: step.binderId, canonicalCardId });
      case "unfile": return x(st, CASEY, "removeBinderEntry", { binderId: step.binderId, canonicalCardId });
      case "wanted-copy": return x(st, CASEY, "updateGoalCriteria", { goalId: step.goalId, desired: step.desired });
      case "how-hard": return x(st, CASEY, "updateGoalTier", { goalId: step.goalId, tier: step.tier });
      case "stop-looking": return x(st, CASEY, "removeGoal", { goalId: step.goalId });
      case "start-looking": return x(st, CASEY, "addGoal",
        { canonicalCardId, tier: step.tier, desired: step.desired });
      case "correct-copy": return x(st, CASEY, "updateCollectorCopy", { copyId: step.copyId, patch: step.patch });
      case "offering": return x(st, CASEY, "setCollectorCopyOffered", { copyId: step.copyId, offered: step.offered });
      case "keeping": return x(st, CASEY, "setCollectorCopyKept", { copyId: step.copyId, keeping: step.keeping });
      case "forget-copy": return x(st, CASEY, "removeCollectorCopy", { copyId: step.copyId });
      case "record-copy": return x(st, CASEY, "addCollectorCopy", { copy: { canonicalCardId, ...step.copy } });
      default: return { ok: false, refused: "command-unavailable" };
    }
  };

  const draft = (key, over = {}) => ({ id: null, key, grade: "PSA 9", condition: "",
    cert: "", market: "", disposition: "offered", removed: false, ...over });
  const answersFor = (over = {}) => ({ binders: new Set(), newBinders: [], want: "none",
    desired: { grade: "", condition: "" }, copies: [], ...over });

  /* THE REAL PANEL, MOUNTED, WITH ITS OWN SAVE BUTTON PRESSED.

     An earlier draft of this suite re-implemented the panel's binding inside the
     test and then asserted the re-implementation — which passes whether or not
     the product does it, and is exactly the shape of mistake the previous batch
     shipped. So the retry cases below mount the component, wire `onCommit` to
     the real domain through the same switch `SignIn.jsx` uses, and press Save.

     `failOnce` refuses one write and then stops refusing. Where a real refusal
     can be arranged it is used instead (a binder that is not this Collector's
     is refused `not-owner` by the domain); `failOnce` exists for the one case
     that needs a failure BETWEEN two writes of the same kind, where the honest
     statement is "the server refused one write" and which one is the fixture's
     choice. */
  const panel = (st, { preselectBinder = null, failOnce = null, card = "cc-y" } = {}) => {
    let pending = failOnce ? { ...failOnce, seen: 0 } : null;
    const attempted = [];
    const onCommit = async (step, canonicalCardId) => {
      attempted.push(step.kind);
      if (pending && step.kind === pending.kind) {
        pending.seen += 1;
        if (pending.nth == null || pending.seen === pending.nth) {
          pending = null;
          return { ok: false, refused: "not-found" };
        }
      }
      return send(st, step, canonicalCardId);
    };
    const seen = () => {
      const w = st.get();
      return { ...w, goals: w.goals.filter((g) => g.collectorId === "casey"),
        collectorCopies: w.collectorCopies.filter((c) => c.collectorId === "casey"),
        catalog: [], partners: [] };
    };
    let r;
    const element = () => React.createElement(SPEC.default, {
      card: { canonicalCardId: card, cardName: "Mudkip" },
      state: seen(), onCommit, onClose: () => {}, preselectBinder,
    });
    TR.act(() => { r = TR.create(element()); });
    /* THE PANEL IS HANDED A FRESH PROJECTION AFTER EVERY COMMAND, exactly as
       production does — `execute` returns the new state and the store pushes it
       down. Without this the retry cases pass through `planFrom`'s
       "already gone; nothing to do" branch instead of the real diff, and would
       certify a path the product never takes. */
    const refresh = () => { TR.act(() => { r.update(element()); }); };
    const button = (label) => {
      const b = r.root.findAll((n) => n.type === "button"
        && String(n.children).includes(label))[0];
      assert(b, `no "${label}" button: `
        + r.root.findAll((n) => n.type === "button").map((n) => String(n.children)).join(" | "));
      return b;
    };
    const buttons = (label) => r.root.findAll((n) => n.type === "button"
      && String(n.children).includes(label));
    return {
      press: (label) => { TR.act(() => { button(label).props.onClick(); }); },
      /* Each copy row carries its own controls, so a draft is addressed by
         position: the nth grade control and the nth disposition button belong
         to the nth row. */
      pressNth: (label, nth) => {
        const all = buttons(label);
        assert(all[nth], `no "${label}" #${nth} — found ${all.length}`);
        TR.act(() => { all[nth].props.onClick(); });
      },
      selects: () => r.root.findAll((n) => n.type === "select").length,
      grade: (value, nth = 0) => {
        const sel = r.root.findAll((n) => n.type === "select")[nth];
        assert(sel, `no grade control #${nth}`);
        TR.act(() => { sel.props.onChange({ target: { value } }); });
      },
      /* What the panel ACTUALLY SENT on this press. The retry cases assert on
         this rather than only on the world, because "no duplicate exists" is
         also true of a panel that sent nothing at all for the wrong reason. */
      save: async () => {
        attempted.length = 0;
        await TR.act(async () => { button("Save").props.onClick(); });
        refresh();
        return [...attempted];
      },
      text: () => {
        const out = [];
        const walk = (n) => {
          if (Array.isArray(n)) return n.forEach(walk);
          if (!n || typeof n !== "object") return;
          for (const c of n.children || []) { if (typeof c === "string") out.push(c); else walk(c); }
        };
        walk(r.toJSON());
        return out.join(" ");
      },
      unmount: () => r.unmount(),
    };
  };

  /* N new copies, each described and offered. The rows are filled AFTER they
     all exist, because every row carries its own controls and addressing them
     by position is only meaningful once the list has stopped growing. */
  const addOffered = (p, grades) => {
    for (let i = 0; i < grades.length; i += 1) p.press("I own one of these");
    /* The panel is opened on a card with no Goal, so every grade control on
       screen belongs to a copy row. If that ever stops being true the rows are
       being addressed by the wrong index and this says so rather than quietly
       describing the wrong copy — which is how two of these cases first failed. */
    eq(p.selects(), grades.length, "the panel is showing a control this helper cannot address");
    grades.forEach((g, i) => p.grade(g, i));
    grades.forEach((_, i) => p.pressNth("I'd trade or sell this one", i));
  };

  /* A binder that is NOT Casey's, so the `file` step is refused by the domain
     for a real reason and the save stops after the copy has been recorded. */
  const borrowedBinder = (st) => {
    okv(x(st, JORDAN, "createBinder", { name: "Theirs" }), "their binder");
    return st.get().binders.find((b) => b.collectorId === "jordan").id;
  };

  /* The pure plan, for the two cases that are about plan SHAPE rather than
     about the panel keeping a binding. */
  const runPlan = (st, canonicalCardId, answers) => {
    const steps = SPEC.planFrom(st.get(), canonicalCardId, answers).steps;
    for (const step of steps) {
      const answer = send(st, step, canonicalCardId);
      if (answer && answer.ok === false) break;
    }
    return { steps: steps.map((s) => s.kind) };
  };

  test("[12] a copy created, a later step refused, and a retry adds nothing", async () => {
    /* THE DEFECT, THROUGH THE REAL PANEL. Record a copy, leave a binder ticked
       that the domain will refuse, press Save, then press it again — which is
       exactly what the panel's own sentence tells a person to do. */
    const st = world();
    const p = panel(st, { preselectBinder: borrowedBinder(st) });
    addOffered(p, ["PSA 9"]);

    const first = await p.save();
    eq(first.join(","), "record-copy,file", "the fixture did not exercise a partial save");
    eq(copies(st).length, 1, "the first press did not record the copy");
    const minted = copies(st)[0].id;
    assert(/could not be filed|Nothing was saved|But /.test(p.text()),
      "the fixture did not actually fail partway: " + p.text().slice(-300));

    const second = await p.save();
    eq(second.join(","), "file",
      "the retry sent something other than the one step that is left: " + second.join(","));
    eq(copies(st).length, 1, "the retry recorded a second physical copy: "
      + JSON.stringify(copies(st).map((c) => c.id)));
    eq(copies(st)[0].id, minted, "the copy was replaced rather than kept");
    eq((await p.save()).join(","), "file", "a third press sent more than the remainder");
    eq(copies(st).length, 1, "a third press duplicated it");
    assert(valid(st), "the world became invalid");
    p.unmount();
  });

  test("[13] two genuinely identical copies can still be created on purpose", () => {
    /* NOTHING HERE DE-DUPLICATES BY CONTENT. Two Raw copies with no certificate
       are an ordinary thing to own, and the fix must not have quietly made the
       second one unrecordable. Plan-level, because the claim is about what the
       domain accepts rather than about a binding. */
    const st = world();
    const same = { grade: "Raw", condition: "Near Mint", cert: "", market: "" };
    runPlan(st, "cc-x", answersFor({ copies: [draft("n1", same)] }));
    runPlan(st, "cc-x", answersFor({ copies: [draft("n2", same)] }));
    eq(copies(st).length, 2, "the second identical copy was refused or swallowed");
    eq([...new Set(copies(st).map((c) => c.id))].length, 2, "they share one id");
    assert(valid(st), "the world became invalid");
  });

  test("[14] two new drafts in one Save keep two distinct durable ids", async () => {
    const st = world();
    const p = panel(st, { preselectBinder: borrowedBinder(st) });
    addOffered(p, ["PSA 9", "PSA 10"]);

    const first = await p.save();
    eq(first.join(","), "record-copy,record-copy,file", "the fixture is not two drafts");
    eq(copies(st).length, 2, "both copies were not recorded");
    const ids = copies(st).map((c) => c.id);
    eq([...new Set(ids)].length, 2, "one id was minted twice");

    /* Both drafts must now be bound, or the retry duplicates one of them. */
    eq((await p.save()).join(","), "file", "the retry re-sent a copy that exists");
    eq(copies(st).length, 2, "the retry duplicated a copy: "
      + JSON.stringify(copies(st).map((c) => `${c.grade}:${c.id}`)));
    eq(copies(st).map((c) => c.grade).sort().join(","), "PSA 10,PSA 9",
      "the copies are not the two that were described");
    p.unmount();
  });

  test("[15] and if only one of two was created, the retry creates only the other", async () => {
    /* The failure has to fall BETWEEN two writes of the same kind, which no
       real refusal arranges, so the server refuses the second one once. */
    const st = world();
    const p = panel(st, { failOnce: { kind: "record-copy", nth: 2 } });
    addOffered(p, ["PSA 9", "PSA 10"]);

    eq((await p.save()).join(","), "record-copy,record-copy", "the fixture is wrong");
    eq(copies(st).length, 1, "the fixture did not stop after exactly one copy");
    eq(copies(st)[0].grade, "PSA 9", "the wrong copy landed first");

    eq((await p.save()).join(","), "record-copy",
      "the retry re-sent the copy that already existed");
    eq(copies(st).length, 2, "the retry did not create the missing copy, or created too many: "
      + JSON.stringify(copies(st).map((c) => c.grade)));
    eq(copies(st).map((c) => c.grade).sort().join(","), "PSA 10,PSA 9",
      "the retry re-created the one that already existed");
    p.unmount();
  });

  test("[16] an edit to an existing copy never falls back to recording a new one", () => {
    /* A card with no Goal, so the plan is the copy edit and nothing else. */
    const st = world();
    const id = own(st, "offered");
    const existing = { id, grade: "PSA 10", condition: "", cert: "MINE-1", market: "",
      disposition: "offered", removed: false };
    const r = runPlan(st, "cc-y", answersFor({ copies: [existing] }));
    eq(r.steps.join(","), "correct-copy", "an edit did not send exactly one correction");
    eq(copies(st).length, 1, "an edit created a copy");
    eq(copies(st)[0].grade, "PSA 10", "the correction did not land");
    /* Even when the panel is handed a draft whose id the server no longer
       knows, it does nothing rather than re-creating it — the safe direction. */
    const gone = runPlan(st, "cc-y",
      answersFor({ copies: [{ ...existing, id: "no-such-copy" }] }));
    eq(gone.steps.length, 0, "a vanished copy was re-created: " + gone.steps.join(","));
    eq(copies(st).length, 1, "a copy appeared");
  });

  test("[17] the panel's promise is kept for every other step too", () => {
    /* "Pressing Save again sends only what is left" was already true of goals,
       binder entries and corrections; the copy was the one exception. This pins
       the rest so a future change cannot break them in the same way. */
    const st = world();
    const bd = okv(x(st, CASEY, "createBinder", { name: "Shoebox" }), "binder");
    const answers = answersFor({ binders: new Set([bd]), want: "secondary",
      desired: { grade: "PSA 9", condition: "" },
      copies: [draft("n1")] });
    const first = runPlan(st, "cc-z", answers);
    assert(first.steps.includes("start-looking") && first.steps.includes("record-copy")
      && first.steps.includes("file"), "the fixture is thin: " + first.steps.join(","));
    const before = JSON.stringify(st.get());
    /* Everything already done, so a replay of the SAME answers — minus the copy,
       which [12] covers — must send nothing that changes anything. */
    const bound = { ...answers, copies: answers.copies.map((d) => ({ ...d, id: copies(st)[0].id })) };
    const again = runPlan(st, "cc-z", bound);
    eq(again.steps.length, 0, "a replay sent work: " + again.steps.join(","));
    eq(JSON.stringify(st.get()), before, "a replay changed the world");
  });
});

/* =============================================== D. what did not move */
describe("D. What this batch did not touch", () => {
  test("[18] no transaction command became exposed, and the count is what it was", () => {
    eq(EXPOSED_COMMANDS.length, 23, "the production surface changed size");
    const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
    const known = (n) => [...COMMAND_NAMES].includes(n);
    for (const shut of ["startOpportunity", "proposePrice", "acceptPrice",
      "proposeTradeSelection", "reviewTradeCard", "proposeMarketValue",
      "acceptMarketValue", "acceptDeal", "proposeFinalBalance", "confirmHandoff",
      "cancelOpportunity", "setCopyPending", "setInterest", "sendMessage"]) {
      assert(known(shut), `${shut} is not a command, so this asserts nothing`);
      assert(!EXPOSED_COMMANDS.includes(shut), `${shut} was exposed`);
    }
  });

  test("[19] the card-level Binder entry is exactly what it was", () => {
    const fs = require("fs");
    const migrations = fs.readdirSync(path.join(ROOT, "persistence/migrations"))
      .filter((f) => f.endsWith(".sql")).sort();
    /* RE-PINNED, AND THE TITLE WITH IT. This test used to claim "no migration,
       and no Binder architecture change", which was true of the batch that
       wrote it and is deliberately not true now: Batch 3A added 0014 and began
       exactly the object-level transition the old comment said it was not
       beginning. Superseding that claim is the decision; the rest of this test
       is NOT superseded, and is in fact the proof 3A owes — `binder_entries`
       keeps its exact shape, the archive still works, and the legacy row is
       still a fact about a CARD. */
    eq(migrations.length, 14, migrations.join(","));
    eq(migrations[migrations.length - 1], "0014_binder_memberships.sql", "a migration was added");
    const st = world();
    const bd = okv(x(st, CASEY, "createBinder", { name: "Shoebox" }), "binder");
    okv(x(st, CASEY, "addGoal",
      { canonicalCardId: "cc-z", tier: "secondary", desired: { grade: "PSA 9" } }), "want");
    okv(x(st, CASEY, "addBinderEntry", { binderId: bd, canonicalCardId: "cc-z" }), "file");
    eq(Object.keys(st.get().binderEntries[0]).sort().join(","), "addedAt,binderId,canonicalCardId",
      "a binder entry changed shape");
    /* AND IT STAYED A FACT ABOUT A CARD. Filing the card did not quietly give
       the Goal a home as well — no inference, no conversion, not even where
       there is exactly one Goal for the card and it could only have meant that
       one. 3A's legacy rows and its memberships are separate on purpose. */
    eq((st.get().binderMemberships || []).length, 0,
      "filing a card invented an object-level membership");
    okv(x(st, CASEY, "setBinderArchived", { binderId: bd, archived: true }), "archive is still there");
  });

  test("[20] Goal cardinality is unchanged", () => {
    const st = world();
    eq(code(x(st, CASEY, "addGoal",
      { canonicalCardId: "cc-x", tier: "secondary", desired: { grade: "PSA 10" } })),
      D.REFUSE.duplicateGoal, "a second Goal for one card was allowed");
    eq(st.get().goals.length, 1, "a second Goal landed");
  });
});

if (require.main === module) run();
module.exports = {};
