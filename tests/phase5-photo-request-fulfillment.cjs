/* ============================================================================
   CLOSING THE QUALIFICATION LOOP — THE SHOP'S HALF OF REQUEST PHOTOS

   The qualification batch gave a Collector two verbs about one physical copy:
   Inspect it, and ask to be shown it. It shipped the asking and not the
   answering. `addCopyPhotos` is the only command that closes a photo request,
   it belongs to the Trusted Partner who owns the card, and it had no surface —
   so a Collector could ask and nobody could answer. That was recorded as a gap
   rather than a decision. This is the gap closed.

   THE WHOLE LOOP, AND NOTHING PAST IT:

     Collector asks  →  the owning shop sees the request  →  the shop supplies
     the evidence  →  the request is fulfilled  →  the Collector sees it

   Nobody negotiated, reserved the card, agreed a value or began a transaction
   because a photograph was asked for or supplied. Section F is the proof.

   WHAT THE DOMAIN ALREADY DID, AND WHAT IT DID NOT

   Almost all of this was already true and is pinned here rather than built:
   one set of photographs closes EVERY outstanding request on that copy, and
   only once both faces exist; a request made while the copy was available can
   still be answered after somebody else's deal takes it; and the requester sees
   the evidence through the participant-aware visibility the last batch added.

   Two things were not true, and Section E is where they failed first. The
   command did not normalise its input, so `front: {}` — which
   `copyPhotographed` reads as present — let a shop mark every request FULFILLED
   while the copy held no photograph at all. And it answered `not-found` for a
   missing copy BEFORE checking ownership, so a shop could tell an id that
   exists somewhere from one that exists nowhere. Both were harmless while the
   command had no door and both are reachable the moment it has one.

   A PHOTOGRAPH IS A REFERENCE, AND THAT IS A LIMITATION THIS BATCH INHERITED.
   MetYet stores one string per face and has no upload path anywhere: no
   storage, no media service, nothing to upload to. Building one is a different
   project from closing this loop, so the shop supplies a link and the screen
   says so plainly.
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const D = require("../domain/metyet-domain.js");
const P = require("../domain/metyet-projection.js");
const W = require("../domain/metyet-world.js");
const { createStore } = require("./fixture-store.cjs");
const RT = require("../domain/metyet-runtime.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");

const ROOT = path.join(__dirname, "..");
const AT = "2026-09-29";
let seq = 0;
const runtime = () => RT.createRuntime({ now: () => AT, newId: (p = "") => `${p}${++seq}` });
const codeOf = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const TP = { partnerId: "nl" };          // owns the copy
const SV = { partnerId: "sv" };          // another shop
const CASEY = { collectorId: "casey" };
const JORDAN = { collectorId: "jordan" };
const RILEY = { collectorId: "riley" };  // knows sv, not nl

const world = (over = {}) => {
  seq = 0;
  return createStore({
    partners: [{ id: "nl", name: "Northline", tradeRate: 0.7 },
      { id: "sv", name: "Silver Vale", tradeRate: 0.7 }],
    collectors: [{ id: "casey", name: "Casey" }, { id: "jordan", name: "Jordan" },
      { id: "riley", name: "Riley" }],
    relationships: [
      { partnerId: "nl", collectorId: "casey", status: "accepted", at: AT },
      { partnerId: "nl", collectorId: "jordan", status: "accepted", at: AT },
      { partnerId: "sv", collectorId: "riley", status: "accepted", at: AT }],
    goals: [
      { id: "gC", collectorId: "casey", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } },
      { id: "gJ", collectorId: "jordan", canonicalCardId: "cc-x", tier: "primary", desired: { grade: "PSA 9" } }],
    inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x", ask: 30,
      grade: "PSA 9", cert: "C1", photos: { front: null, back: null }, archived: false }],
    collectorCopies: [], binders: [], binderEntries: [], opportunities: [], catalog: [],
    copyReviews: [], photoRequests: [], conversations: [], interests: [],
    ...over,
  }, runtime());
};

const x = (st, actor, cmd, payload) => st.execute(actor, cmd, payload || {});
const code = (r) => (r && r.ok !== false ? "OK" : r.refused);
const okv = (r, why) => { assert(r && r.ok !== false, `${why}: ${r && r.refused}`); return r.value; };
const view = (st, actor) => P.projectForActor(st.get(), actor);
const photosOf = (st, invId = "i1") =>
  st.get().inventory.find((i) => i.invId === invId).photos;
const openFor = (st, cid) => st.get().photoRequests
  .filter((r) => r.collectorId === cid && !r.fulfilledAt).length;
const statusOf = (st) => D.inventoryCopyStatus("i1", st.get().opportunities, st.get().inventory);

/* JORDAN's deal is what takes the copy away from everybody else. */
const closeCopy = (st) => {
  const id = okv(x(st, JORDAN, "startOpportunity",
    { goalId: "gJ", invId: "i1", amount: 26, at: AT }), "open");
  okv(x(st, TP, "acceptPrice", { oppId: id, at: AT }), "value");
  okv(x(st, JORDAN, "proposeTradeSelection", { oppId: id, binderIds: [], at: AT }), "package");
  okv(x(st, TP, "acceptDeal", { oppId: id, at: AT }), "shop yes");
  okv(x(st, JORDAN, "acceptDeal", { oppId: id, at: AT }), "collector yes");
  return id;
};

/* ============================================ A. who may answer a request */
describe("A. Only the shop that owns the card may answer", () => {
  test("[1] the owning shop may, and nobody else may", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "Casey asks");
    eq(code(x(st, CASEY, "addCopyPhotos", { invId: "i1", front: "f.jpg", at: AT })),
      D.REFUSE.notOwner, "the Collector supplied their own evidence");
    eq(code(x(st, JORDAN, "addCopyPhotos", { invId: "i1", front: "f.jpg", at: AT })),
      D.REFUSE.notOwner, "another Collector supplied it");
    eq(code(x(st, SV, "addCopyPhotos", { invId: "i1", front: "f.jpg", at: AT })),
      D.REFUSE.notOwner, "another shop supplied it");
    eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", at: AT })), "OK",
      "the owning shop could not answer");
  });

  test("[2] the caller cannot say which shop they are", () => {
    const st = world();
    const r = x(st, SV, "addCopyPhotos",
      { invId: "i1", front: "f.jpg", partnerId: "nl", actor: "nl", at: AT });
    eq(code(r), D.REFUSE.notOwner, "a browser chose its own shop");
    eq(photosOf(st).front, null, "and it wrote anyway");
  });

  test("[3] a copy that is not yours and a copy that does not exist answer alike", () => {
    /* This check used to come first and answer `not-found`, so a shop could
       tell an id that exists somewhere from one that exists nowhere. */
    const st = world();
    eq(code(x(st, SV, "addCopyPhotos", { invId: "i1", front: "f.jpg", at: AT })),
      code(x(st, SV, "addCopyPhotos", { invId: "nope", front: "f.jpg", at: AT })),
      "existence leaked through the refusal");
  });

  test("[4] answering needs no relationship with the requester", () => {
    /* The shop owns the card. Who asked is the relationship's business and the
       request's; supplying a photograph of one's own stock is not. */
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    const s = st.get();
    const ended = { ...s, relationships: s.relationships.map((r) => (r.collectorId === "casey"
      ? { ...r, status: "ended" } : r)) };
    const after = createStore(ended, runtime());
    eq(code(x(after, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT })), "OK",
      "the shop could not photograph its own card");
  });
});

/* ====================================== B. one object, one set of evidence */
describe("B. One set of photographs answers everybody who asked", () => {
  test("[5] two Collectors, one submission, both requests closed", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "Casey asks");
    okv(x(st, JORDAN, "requestPhotos", { invId: "i1", at: AT }), "Jordan asks");
    eq(st.get().photoRequests.length, 2, "two requests");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }), "answer");
    eq(openFor(st, "casey"), 0, "Casey's request is still outstanding");
    eq(openFor(st, "jordan"), 0, "Jordan's request is still outstanding");
    eq(st.get().photoRequests.length, 2, "a request row was destroyed rather than closed");
  });

  test("[6] one face is not an answer", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", at: AT }), "front");
    eq(openFor(st, "casey"), 1, "a single face closed the request");
    eq(photosOf(st).front, "f.jpg", "and the face did not land");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", back: "b.jpg", at: AT }), "back");
    eq(openFor(st, "casey"), 0, "both faces did not close it");
  });

  test("[7] an unmentioned face is left exactly as it was", () => {
    const st = world({ inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x",
      ask: 30, grade: "PSA 9", cert: "C1", photos: { front: "keep.jpg", back: null } }] });
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", back: "b.jpg", at: AT }), "back only");
    eq(photosOf(st).front, "keep.jpg", "the front was disturbed by a write that did not mention it");
  });

  test("[8] answering twice does not reopen or double-close anything", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }), "one");
    const after = JSON.stringify(st.get().photoRequests);
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", at: AT }), "two");
    eq(JSON.stringify(st.get().photoRequests), after, "a second answer changed the requests");
  });

  test("[9] a Collector who ends their inspection keeps their outstanding request", () => {
    const st = world();
    const rv = okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "look");
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    okv(x(st, CASEY, "endReview", { reviewId: rv, at: AT }), "stop looking");
    eq(openFor(st, "casey"), 1, "ending an inspection cancelled a request nobody cancelled");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }), "answer");
    eq(openFor(st, "casey"), 0, "and the answer did not reach it");
    /* An open request is participation in its own right, so she can still see
       the evidence she asked for. */
    const row = (view(st, CASEY).inventory || []).find((i) => i.invId === "i1");
    assert(row, "she cannot see the copy she asked about");
  });
});

/* ================================== C. a copy that closed after the asking */
describe("C. A request outlives the copy's availability", () => {
  test("[10] the shop can still answer, and the answer changes nothing else", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "Casey asks while it is free");
    closeCopy(st);
    eq(statusOf(st), "committed", "the rival's deal did not take the copy");
    const before = JSON.stringify(st.get().opportunities);
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }),
      "the shop answers an outstanding request");
    eq(statusOf(st), "committed", "answering reopened the copy");
    eq(JSON.stringify(st.get().opportunities), before, "answering touched a deal");
    eq(openFor(st, "casey"), 0, "her request was not closed");
  });

  test("[11] and she sees the evidence, at the flat unavailable", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    closeCopy(st);
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }), "answer");
    const row = (view(st, CASEY).inventory || []).find((i) => i.invId === "i1");
    assert(row, "the evidence arrived into a hole");
    eq(row.photos.front, "f.jpg", "she cannot see what she asked for");
    eq(row.status, "unavailable", "she was told which kind of unavailable");
  });

  test("[12] answering grants nobody new access", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "Casey asked");
    closeCopy(st);
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }), "answer");
    /* Riley never asked and does not know this shop. */
    eq((view(st, RILEY).inventory || []).length, 0, "a stranger gained a copy");
    eq(code(x(st, RILEY, "requestPhotos", { invId: "i1", at: AT })), D.REFUSE.noRelationship,
      "a stranger gained a door");
    /* And a Collector who knows the shop but never asked still cannot start. */
    const st2 = world();
    closeCopy(st2);
    okv(x(st2, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }), "answer");
    eq(code(x(st2, CASEY, "requestPhotos", { invId: "i1", at: AT })), D.REFUSE.copyUnavailable,
      "photographs reopened a closed copy to a new entrant");
  });
});

/* ========================================= D. the evidence stays protected */
describe("D. Supplying evidence is not rewriting it", () => {
  const filled = () => world({ inventory: [{ invId: "i1", partnerId: "nl",
    canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", cert: "C1",
    photos: { front: "f.jpg", back: "b.jpg" } }] });
  const str = (st) => JSON.stringify(photosOf(st));

  test("[13] an empty face can be filled inside a live deal", () => {
    const st = world({ inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x",
      ask: 30, grade: "PSA 9", cert: "C1", photos: { front: "f.jpg", back: null } }] });
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    closeCopy(st);
    eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", back: "b.jpg", at: AT })), "OK",
      "evidence arriving was treated as evidence rewritten");
  });

  test("[14] a filled face cannot be rewritten or erased inside one", () => {
    for (const faces of [{ front: "OTHER.jpg" }, { back: "OTHER.jpg" }, { front: null },
      { back: null }, { front: "A.jpg", back: "B.jpg" }]) {
      const st = filled(); closeCopy(st);
      const before = str(st);
      eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", ...faces, at: AT })),
        D.REFUSE.copyCommitted, `${JSON.stringify(faces)} was allowed`);
      eq(str(st), before, `${JSON.stringify(faces)} moved the evidence`);
    }
  });

  test("[15] and fulfilment does not weaken that guard", () => {
    /* Answering a request is the allowed direction; it must not leave the copy
       open to a rewrite afterwards. */
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    closeCopy(st);
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }), "answer");
    eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", front: "FAKE.jpg", at: AT })),
      D.REFUSE.copyCommitted, "the answer left the door open behind it");
    eq(code(x(st, TP, "updateInventoryCopy",
      { invId: "i1", patch: { photos: { front: "FAKE.jpg", back: "F2.jpg" } }, at: AT })),
      D.REFUSE.copyCommitted, "the other door was left open");
  });

  test("[16] it states nothing about the card but its photographs", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    const before = st.get().inventory.find((i) => i.invId === "i1");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }), "answer");
    const after = st.get().inventory.find((i) => i.invId === "i1");
    for (const k of ["grade", "condition", "cert", "ask", "cost", "archived",
      "canonicalCardId", "partnerId", "invId", "pendingFor"]) {
      eq(JSON.stringify(after[k]), JSON.stringify(before[k]), `${k} changed`);
    }
    eq(st.get().opportunities.length, 0, "an opportunity appeared");
  });
});

/* ============================== E. what the adversarial pass would have hit */
describe("E. The two things that were not true", () => {
  test("[17] a junk face cannot pass as evidence, and cannot close a request", () => {
    /* RE-PINNED. This asserted that junk was ACCEPTED and normalised away,
       which was the first fix and the wrong one: coercing a malformed face to
       null wrote it as an erase, so `front: {}` destroyed a real photograph on
       a success. It is refused now — see [34], which is the test that caught
       it, and note that this one missed the defect because it only ever ran the
       junk shapes against an EMPTY copy. */
    for (const junk of [{}, 42, true, ["f.jpg"], { url: "f.jpg" }]) {
      const st = world();
      okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
      eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", front: junk, back: junk, at: AT })),
        D.REFUSE.photoUnusable, `${JSON.stringify(junk)} was accepted`);
      eq(openFor(st, "casey"), 1,
        `${JSON.stringify(junk)} closed a request with no photograph`);
      assert(!D.INVARIANTS.copyPhotographed(photosOf(st)),
        `${JSON.stringify(junk)} read as a photographed copy`);
      eq(JSON.stringify(photosOf(st)), JSON.stringify({ front: null, back: null }),
        `${JSON.stringify(junk)} was stored`);
    }
  });

  test("[18] and a real reference still works right after a refused one", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", front: {}, at: AT })),
      D.REFUSE.photoUnusable, "the junk attempt");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }), "real");
    eq(openFor(st, "casey"), 0, "a refusal left the command unusable afterwards");
  });

  test("[19] each door onto the photographs field states its own rule", () => {
    /* RE-PINNED, AND THE OLD TITLE WAS THE PROBLEM. It claimed photographs are
       "stored in one shape at all three doors" and passed by finding
       `photographs(` in each body — while `addCopyPhotos` had stopped storing a
       normalised value on purpose, because normalising the MERGED value
       destroyed a stored face the caller never mentioned ([37]). A test that
       passes on a substring while its sentence has become false is worse than
       no test, so it now asserts what each door actually does.

       The two that ASSIGN wholesale normalise, because the patch IS the new
       value and nothing is being carried across. The one that MERGES validates
       what it is given and leaves what it was not given alone. */
    const src = codeOf("domain/metyet-commands.js");
    for (const door of ["updateInventoryCopy(state", "addInventoryCopy(state"]) {
      const at = src.indexOf(door);
      assert(at > -1, `${door} is gone`);
      assert(/photographs\(/.test(src.slice(at, at + 2600)),
        `${door} assigns wholesale and does not normalise`);
    }
    const at = src.indexOf("addCopyPhotos(state");
    const body = src.slice(at, at + 2600);
    assert(/unusableFace\(/.test(body), "addCopyPhotos does not validate what it is given");
    assert(/front !== undefined \? front : \(copy\.photos \|\| \{\}\)\.front/.test(body),
      "addCopyPhotos no longer carries an unmentioned face across untouched");
  });

  test("[20] the guard and the completeness test both read the normalised view", () => {
    /* RE-PINNED with the design. The guard must still reason about what the
       write produces — but BOTH sides of its comparison are normalised, so a
       legacy non-string face does not read as a rewrite of itself and freeze
       the copy ([38]); and `copyPhotographed` is asked of the normalised value
       so junk never closes a request by passing as evidence. */
    const src = codeOf("domain/metyet-commands.js");
    const at = src.indexOf("addCopyPhotos(state");
    const body = src.slice(at, at + 2600);
    assert(body.indexOf("const photos =") < body.indexOf("protectedCopyEdit("),
      "the guard is asked before the final photographs exist");
    assert(/protectedCopyEdit\(state, invId, \{ \.\.\.copy, photos: photographs\(copy\.photos\) \},\s*\{\}, photographs\(photos\)\)/.test(body),
      "the guard compares a raw side against a normalised one");
    assert(/copyPhotographed\(photographs\(photos\)\)/.test(body),
      "completeness is judged on the raw value");
  });
});

/* ================================================= F. nothing else moved */
describe("F. The transaction did not start", () => {
  test("[21] the whole loop creates no deal, no price, no Pending", () => {
    const st = world();
    const before = JSON.stringify({ opps: st.get().opportunities,
      inv: st.get().inventory.map((i) => ({ ...i, photos: null })) });
    okv(x(st, CASEY, "reviewCopy", { invId: "i1", at: AT }), "inspect");
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }), "answer");
    const after = JSON.stringify({ opps: st.get().opportunities,
      inv: st.get().inventory.map((i) => ({ ...i, photos: null })) });
    eq(after, before, "the loop changed the deal or the card");
    eq(statusOf(st), "available", "the loop changed availability");
    eq(D.goalState("gC", st.get().opportunities), "seeking", "the loop locked the Goal");
  });

  test("[22] the allow-list grew by exactly one, and the transaction is shut", () => {
    eq(EXPOSED_COMMANDS.length, 25, "the production surface is not the size this batch declared");
    assert(EXPOSED_COMMANDS.includes("addCopyPhotos"), "the shop has no way to answer");
    /* EVERY NAME HERE IS A REAL COMMAND, checked the way `phase5-c5` checks it:
       an adversarial run found `reviewCopy2` in this list — not a command
       anywhere in the repository, so that line asserted nothing at all. */
    const { COMMAND_NAMES } = require("../domain/metyet-commands.js");
    const known = COMMAND_NAMES.has ? (n) => COMMAND_NAMES.has(n)
      : (n) => [...COMMAND_NAMES].includes(n);
    for (const shut of ["startOpportunity", "proposePrice", "acceptPrice", "acceptMarketValue",
      "acceptDeal", "proposeTradeSelection", "setCopyPending", "cancelOpportunity",
      "proposeFulfillment", "confirmHandoff", "sendMessage", "setInterest",
      "markBinderReviewed"]) {
      assert(known(shut), `${shut} is not a command, so this line asserts nothing`);
      assert(!EXPOSED_COMMANDS.includes(shut), `${shut} was exposed`);
    }
    eq(new Set(EXPOSED_COMMANDS).size, EXPOSED_COMMANDS.length, "a command is listed twice");
  });

  test("[23] no migration, and no new durable fact", () => {
    const migrations = fs.readdirSync(path.join(ROOT, "persistence/migrations"))
      .filter((f) => f.endsWith(".sql")).sort();
    eq(migrations[migrations.length - 1], "0014_binder_memberships.sql", migrations.join(","));
    const src = codeOf("domain/metyet-domain.js") + codeOf("domain/metyet-commands.js")
      + codeOf("domain/metyet-projection.js");
    for (const invented of ["acknowledged", "fulfilment", "photoTask", "notified",
      "requestStatus", "photoUpload"]) {
      for (const shape of [`${invented}:`, `.${invented}`, `"${invented}"`]) {
        assert(!src.includes(shape), `a durable concept called ${invented} appeared as ${shape}`);
      }
    }
    /* The request still has exactly two states and one closing field. */
    const rows = ["at", "fulfilledAt", "collectorId", "partnerId", "invId", "id"];
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    eq(Object.keys(st.get().photoRequests[0]).sort().join(","), rows.sort().join(","),
      "the request row grew a field");
  });

  test("[24] and the world stays storable throughout", () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    okv(x(st, JORDAN, "requestPhotos", { invId: "i1", at: AT }), "and again");
    closeCopy(st);
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT }), "answer");
    const verdict = W.validateWorld(st.get());
    const errors = (verdict && verdict.errors) || (Array.isArray(verdict) ? verdict : []);
    eq(JSON.stringify(errors), "[]", "the world stopped being storable");
  });

  test("[25] True Match and the four Collector tabs are untouched", () => {
    const st = world({ goals: [{ id: "gC", collectorId: "casey", canonicalCardId: "cc-x",
      tier: "primary", desired: { grade: "PSA 10" } }] });
    eq(code(x(st, CASEY, "startOpportunity", { goalId: "gC", invId: "i1", amount: 25, at: AT })),
      D.REFUSE.criteriaMismatch, "a PSA 9 copy satisfied a PSA 10 goal");
    const SHELL = build("client/collector/CollectorShell.jsx");
    eq(SHELL.SECTIONS.map((s) => s.label).join(" · "),
      "Browse · Binders · Trusted Partners · Deal Flow", "the Collector navigation moved");
  });
});

/* ================================================== G. the shop's screen */
const build = (rel) => {
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
const Inventory = build("client/tp/sections/Inventory.jsx").default;
const CARDS = { "cc-x": { canonicalCardId: "cc-x", cardName: "Charizard",
  expansionName: "Base Set", collectorNumber: "4", imageSmall: null } };
const door = { describe: async (ids) => ({ cards: ids.map((id) => CARDS[id]).filter(Boolean) }) };
const texts = (r) => {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (!n || n.type === "style") return;
    for (const c of n.children || []) walk(c);
  };
  walk(r.toJSON());
  return out.join(" ").replace(/\s+/g, " ");
};
const instText = (node) => {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "string" || typeof v === "number") { out.push(String(v)); return; }
    if (v && v.props) walk(v.props.children);
  };
  walk(node.props.children);
  return out.join(" ").trim();
};
const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  }
};
const showInventory = async (st, props = {}) => {
  const state = P.projectForActor(st.get(), TP);
  let r;
  await TR.act(async () => {
    r = TR.create(React.createElement(Inventory, { state, onBrowseCards: door, ...props }));
  });
  await settle();
  return r;
};
const button = (r, label) => r.root.findAllByType("button").find((n) => instText(n) === label);
const inputs = (r) => r.root.findAllByType("input");

describe("G. The shop's screen", () => {
  test("[26] a copy nobody asked about offers no way to answer", async () => {
    const st = world();
    const r = await showInventory(st, { onProvidePhotos: async () => ({ ok: true }) });
    assert(!button(r, "Add requested photos"),
      "a control appeared for a request that does not exist");
    assert(!/Photos requested/.test(texts(r)), "the screen invented a request");
  });

  test("[27] an outstanding request is said on the copy, and names who asked", async () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    const r = await showInventory(st, { onProvidePhotos: async () => ({ ok: true }) });
    const shown = texts(r);
    assert(/Photos requested/.test(shown), "the request is not visible: " + shown.slice(0, 200));
    assert(button(r, "Add requested photos"), "there is no way to answer it");
    await TR.act(async () => { button(r, "Add requested photos").props.onClick(); });
    /* The shop already sees its own Collectors by name; saying so adds nothing
       it could not read on the Collector Network screen. */
    assert(/Casey asked to see this copy/.test(texts(r)),
      "the form does not say who asked: " + texts(r).slice(0, 300));
  });

  test("[28] it asks only for the faces that are missing", async () => {
    const st = world({ inventory: [{ invId: "i1", partnerId: "nl", canonicalCardId: "cc-x",
      ask: 30, grade: "PSA 9", cert: "C1", photos: { front: "f.jpg", back: null } }] });
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    const r = await showInventory(st, { onProvidePhotos: async () => ({ ok: true }) });
    await TR.act(async () => { button(r, "Add requested photos").props.onClick(); });
    const shown = texts(r);
    assert(/The front is already on this copy/.test(shown),
      "it offered to replace evidence that is already there: " + shown.slice(0, 300));
    eq(inputs(r).length, 1, "it asked for more faces than are missing");
  });

  test("[29] supplying a face sends the copy and that face, and nothing else", async () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    const sent = [];
    const r = await showInventory(st,
      { onProvidePhotos: async (invId, faces) => { sent.push([invId, faces]); return { ok: true }; } });
    await TR.act(async () => { button(r, "Add requested photos").props.onClick(); });
    const [front, back] = inputs(r);
    await TR.act(async () => { front.props.onChange({ target: { value: "f.jpg" } }); });
    await TR.act(async () => { back.props.onChange({ target: { value: "b.jpg" } }); });
    await TR.act(async () => { await button(r, "Provide photos").props.onClick(); });
    eq(sent.length, 1, "the press sent nothing");
    eq(sent[0][0], "i1", "it did not name the physical copy");
    eq(JSON.stringify(sent[0][1]), JSON.stringify({ front: "f.jpg", back: "b.jpg" }),
      "it sent something other than the two faces");
  });

  test("[30] it will not send an empty answer when a face is still missing", async () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    const sent = [];
    const r = await showInventory(st,
      { onProvidePhotos: async (...a) => { sent.push(a); return { ok: true }; } });
    await TR.act(async () => { button(r, "Add requested photos").props.onClick(); });
    const go = button(r, "Provide photos");
    eq(go.props.disabled, true, "it offered to answer with nothing");
    await TR.act(async () => { await go.props.onClick(); });
    eq(sent.length, 0, "it sent an empty answer anyway");
  });

  test("[31] a refusal is reported, and does not pretend to have saved", async () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    const r = await showInventory(st,
      { onProvidePhotos: async () => ({ ok: false, refused: "copy-committed" }) });
    await TR.act(async () => { button(r, "Add requested photos").props.onClick(); });
    await TR.act(async () => { inputs(r)[0].props.onChange({ target: { value: "f.jpg" } }); });
    await TR.act(async () => { inputs(r)[1].props.onChange({ target: { value: "b.jpg" } }); });
    await TR.act(async () => { await button(r, "Provide photos").props.onClick(); });
    await settle();
    assert(/committed to a live deal/.test(texts(r)),
      "the refusal was swallowed: " + texts(r).slice(0, 300));
    assert(button(r, "Provide photos"), "the form closed on a refusal");
  });

  test("[32] the screen says a photograph is a link, because it is", async () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    const r = await showInventory(st, { onProvidePhotos: async () => ({ ok: true }) });
    await TR.act(async () => { button(r, "Add requested photos").props.onClick(); });
    assert(/stores a link to each photo/.test(texts(r)),
      "it implies it can take a file");
  });

  test("[33] and the shop's screen grew nothing else", () => {
    const src = codeOf("client/tp/sections/Inventory.jsx");
    for (const gone of ["startOpportunity", "acceptPrice", "setCopyPending", "sendMessage",
      "Market Value", "Lead", "Buyer intent", "Offer", "Negotiation", "Conversion"]) {
      assert(!src.includes(gone), `Inventory grew ${gone}`);
    }
    /* One new control, one new prop. */
    assert(src.includes("onProvidePhotos"), "the prop is gone");
    eq((src.match(/tps-edit" type="button"/g) || []).length > 0, true, "controls vanished");
  });
});

/* =========================================================================
   H — WHAT THE ADVERSARIAL PASS FOUND, AND THE DOOR IT WENT THROUGH

   The first three failed when written. The first is the one I got wrong in
   kind: the fix for "junk masquerading as evidence" was a coercion, which
   turned it into "junk deleting evidence".
   ========================================================================= */
describe("H. The adversarial pass", () => {
  const filledWorld = (photos) => world({ inventory: [{ invId: "i1", partnerId: "nl",
    canonicalCardId: "cc-x", ask: 30, grade: "PSA 9", cert: "C1", photos }] });

  test("[34] a junk face is REFUSED, not quietly turned into a deletion", () => {
    /* The first fix normalised the merged value, so `front: {}` coerced to null
       and was written as an erase: a shop's only record of a card's condition
       destroyed on a success. Test [17] above missed it because it only ever
       ran the junk shapes against an EMPTY copy — it proved junk cannot fake
       evidence and never that junk cannot destroy it. */
    for (const junk of [{}, 42, true, ["f.jpg"], { url: "f.jpg" }, ""]) {
      const st = filledWorld({ front: "REAL.jpg", back: "b.jpg" });
      eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", front: junk, at: AT })),
        D.REFUSE.photoUnusable, `${JSON.stringify(junk)} was accepted`);
      eq(photosOf(st).front, "REAL.jpg", `${JSON.stringify(junk)} destroyed the evidence`);
    }
  });

  test("[35] an explicit null is still a real thing to say", () => {
    /* Refusing junk must not refuse the one non-string a shop may legitimately
       send: `null`, meaning there is no photograph. The mutation guard decides
       whether that erase is allowed, exactly as before. */
    const free = filledWorld({ front: "f.jpg", back: "b.jpg" });
    eq(code(x(free, TP, "addCopyPhotos", { invId: "i1", front: null, at: AT })), "OK",
      "a shop cannot say a face is absent");
    eq(photosOf(free).front, null, "and the erase did not land");
    const held = filledWorld({ front: "f.jpg", back: "b.jpg" });
    closeCopy(held);
    eq(code(x(held, TP, "addCopyPhotos", { invId: "i1", front: null, at: AT })),
      D.REFUSE.copyCommitted, "an erase got through inside a live deal");
  });

  test("[36] a reference has a bound, because it is an address", () => {
    const st = world();
    eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", front: "x".repeat(200000), at: AT })),
      D.REFUSE.photoUnusable, "200,000 characters were persisted as a photo reference");
  });

  test("[37] a legacy non-string photograph is left alone, not tidied away", () => {
    /* Normalising the MERGED value deleted a stored value the caller never
       mentioned. `photos` lives in a jsonb column and nothing validates it on
       load, so rows written before the qualification batch can hold one. */
    const st = filledWorld({ front: { url: "front.jpg" }, back: null });
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    okv(x(st, TP, "addCopyPhotos", { invId: "i1", back: "b.jpg", at: AT }), "fill the empty face");
    eq(JSON.stringify(photosOf(st).front), JSON.stringify({ url: "front.jpg" }),
      "a stored value the call never mentioned was destroyed");
    eq(photosOf(st).back, "b.jpg", "and the face that was asked for did not land");
  });

  test("[38] and it does not freeze the copy either", () => {
    /* The guard compared the RAW stored value against the NORMALISED next one,
       so a non-string face always read as a rewrite of itself: the exact
       fulfilment case — filling a genuinely empty face — was refused, and the
       request could never be answered at all. */
    const st = filledWorld({ front: { url: "front.jpg" }, back: null });
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    closeCopy(st);
    eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", back: "b.jpg", at: AT })), "OK",
      "a legacy value froze the copy against the one write it needed");
    /* And junk never counts as evidence, so the request honestly stays open. */
    eq(openFor(st, "casey"), 1, "a junk face closed a request by passing as a photograph");
  });

  test("[39] a card off the shelf cannot be answered about", () => {
    /* Every other copy verb refuses an archived copy and this did not, so a
       shop could mark every request FULFILLED on a card it had withdrawn —
       while an archived copy is not visible to the requester at all, so the
       record claimed evidence arrived that nobody could ever see. */
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    okv(x(st, TP, "removeInventoryCopy", { invId: "i1", at: AT }), "withdraw");
    eq(code(x(st, TP, "addCopyPhotos", { invId: "i1", front: "f.jpg", back: "b.jpg", at: AT })),
      D.REFUSE.copyUnavailable, "a withdrawn card was answered about");
    eq(openFor(st, "casey"), 1,
      "the request was closed on a card the requester cannot see");
  });

  test("[40] the screen names a requester whose relationship has ended", async () => {
    /* `collectors` is the network; somebody whose relationship ended is not in
       it, and the screen then called them "A Collector you work with" — a false
       sentence about somebody whose name it already had in `counterparties`. */
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    const s = st.get();
    const ended = createStore({ ...s, relationships: s.relationships
      .map((r) => (r.collectorId === "casey" ? { ...r, status: "ended" } : r)) }, runtime());
    const r = await showInventory(ended, { onProvidePhotos: async () => ({ ok: true }) });
    await TR.act(async () => { button(r, "Add requested photos").props.onClick(); });
    const shown = texts(r);
    assert(!/A Collector you work with/.test(shown),
      "it called somebody it can name a stranger: " + shown.slice(0, 300));
    assert(/Casey/.test(shown), "it lost the name it already had");
  });

  test("[41] two clicks in one tick send one write", async () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    let release;
    const held = new Promise((done) => { release = done; });
    const sent = [];
    const r = await showInventory(st, { onProvidePhotos: async (...a) => {
      sent.push(a); await held; return { ok: true }; } });
    await TR.act(async () => { button(r, "Add requested photos").props.onClick(); });
    await TR.act(async () => { inputs(r)[0].props.onChange({ target: { value: "f.jpg" } }); });
    await TR.act(async () => { inputs(r)[1].props.onChange({ target: { value: "b.jpg" } }); });
    const go = button(r, "Provide photos");
    await TR.act(async () => { go.props.onClick(); go.props.onClick(); go.props.onClick(); });
    eq(sent.length, 1, `three clicks in one tick sent ${sent.length} writes`);
    await TR.act(async () => { release(); await held; });
  });

  test("[42] a partial answer says the request is still open", async () => {
    /* One face is not an answer — the domain leaves the request open, and the
       form closed on success saying nothing at all. */
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    const r = await showInventory(st, { onProvidePhotos: async () => ({ ok: true }) });
    await TR.act(async () => { button(r, "Add requested photos").props.onClick(); });
    await TR.act(async () => { inputs(r)[0].props.onChange({ target: { value: "f.jpg" } }); });
    await TR.act(async () => { await button(r, "Provide photos").props.onClick(); });
    await settle();
    assert(/stays open until the other one/.test(texts(r)),
      "a partial answer reported nothing: " + texts(r).slice(0, 300));
  });

  test("[43] and a refusal is worded for what the shop was doing", async () => {
    const st = world();
    okv(x(st, CASEY, "requestPhotos", { invId: "i1", at: AT }), "ask");
    const r = await showInventory(st,
      { onProvidePhotos: async () => ({ ok: false, refused: "photo-unusable" }) });
    await TR.act(async () => { button(r, "Add requested photos").props.onClick(); });
    await TR.act(async () => { inputs(r)[0].props.onChange({ target: { value: "nonsense" } }); });
    await TR.act(async () => { inputs(r)[1].props.onChange({ target: { value: "also" } }); });
    await TR.act(async () => { await button(r, "Provide photos").props.onClick(); });
    await settle();
    const shown = texts(r);
    assert(/link to a photo/.test(shown), "it said nothing useful: " + shown.slice(0, 300));
    assert(!/correction/.test(shown), "it called supplying photos a correction");
  });
});

/* =========================================================================
   I — THROUGH THE REAL DOOR

   Exposing `addCopyPhotos` is the act of this batch, and an adversarial run
   pointed out that re-pinning the old "closed over HTTP" loops removed the
   only assertion that a NON-OWNER is refused over HTTP, with nothing put in
   its place. That is the same shape of mistake as narrowing a test to fit the
   code, one step later, so the coverage is replaced here rather than argued
   away.
   ========================================================================= */
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));
const SUBJECT = { north: "sub-north", silver: "sub-silver",
  casey: "sub-casey", dana: "sub-dana" };

async function served() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const rt = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: rt.newId });
  const { expansionId } = await catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const { cardContextId } = await catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita", rarity: "Rare Holo" });
  const { canonicalCardId } = await catalog.putCanonicalCard(
    { cardContextId, printRun: "unlimited", finish: "holofoil" });
  await repository.saveWorld({
    catalog: [],
    collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }],
    partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Silver Vale" }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], collectorCopies: [], binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
    goals: [{ id: "g1", collectorId: "c1", canonicalCardId, tier: "primary",
      desired: { grade: "PSA 9" } }],
    inventory: [{ invId: "iv1", partnerId: "p1", canonicalCardId, ask: 30,
      grade: "PSA 9", cert: "C1", photos: { front: null, back: null }, archived: false }],
  });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.silver, role: "tp", partnerId: "p2" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  await accounts.linkAccount({ subject: SUBJECT.dana, role: "collector", collectorId: "c2" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  return { app: createApp({ repository, catalog, accounts, verifier, runtime: rt }) };
}
const send = (app, token, command, payload) => app.inject({ method: "POST",
  url: "/api/commands", headers: { authorization: `Bearer ${token}` },
  payload: { command, payload } });
const refusalOf = (res) => (res.statusCode === 200 ? null : res.json().error.refused);
const seen = async (app, token) => (await app.inject({ method: "GET", url: "/api/view",
  headers: { authorization: `Bearer ${token}` } })).json().state;

describe("I. Over HTTP, against the real server", () => {
  test("[44] the owning shop can answer a request, end to end", async () => {
    const { app } = await served();
    eq((await send(app, "casey", "requestPhotos", { invId: "iv1" })).statusCode, 200, "she asks");
    const before = await seen(app, "north");
    assert(before.photoRequests.some((r) => r.invId === "iv1" && !r.fulfilledAt),
      "the shop cannot see the request");
    eq((await send(app, "north", "addCopyPhotos",
      { invId: "iv1", front: "f.jpg", back: "b.jpg" })).statusCode, 200, "the shop answers");
    const hers = await seen(app, "casey");
    const row = hers.inventory.find((i) => i.invId === "iv1");
    assert(row && row.photos.front === "f.jpg", "she cannot see the evidence");
    assert(hers.photoRequests.every((r) => r.fulfilledAt), "her request still reads outstanding");
  });

  test("[45] and nobody else can, over the wire", async () => {
    const { app } = await served();
    eq((await send(app, "casey", "requestPhotos", { invId: "iv1" })).statusCode, 200, "she asks");
    for (const [who, why] of [["casey", "the requester"], ["dana", "another Collector"],
      ["silver", "another shop"]]) {
      const res = await send(app, who, "addCopyPhotos", { invId: "iv1", front: "f.jpg" });
      eq(res.statusCode, 409, `${why} reached the domain`);
      eq(refusalOf(res), "not-owner", `${why} got a revealing answer`);
    }
    const shop = await seen(app, "north");
    assert(shop.inventory.find((i) => i.invId === "iv1").photos.front === null,
      "somebody else wrote a photograph");
  });

  test("[46] an unauthenticated caller reaches none of it", async () => {
    const { app } = await served();
    const bare = await app.inject({ method: "POST", url: "/api/commands",
      payload: { command: "addCopyPhotos", payload: { invId: "iv1", front: "f.jpg" } } });
    assert(bare.statusCode === 401 || bare.statusCode === 403, `got ${bare.statusCode}`);
  });

  test("[47] a shop cannot say which shop it is", async () => {
    const { app } = await served();
    const res = await send(app, "silver", "addCopyPhotos",
      { invId: "iv1", front: "f.jpg", partnerId: "p1" });
    assert(res.statusCode !== 200, "a browser chose its own shop");
    const shop = await seen(app, "north");
    assert(shop.inventory.find((i) => i.invId === "iv1").photos.front === null, "and it wrote");
  });

  test("[48] a junk face is refused over the wire, and destroys nothing", async () => {
    const { app } = await served();
    eq((await send(app, "north", "addCopyPhotos",
      { invId: "iv1", front: "real.jpg", back: "b.jpg" })).statusCode, 200, "real evidence first");
    for (const junk of [{}, 42, true, ["f.jpg"], "x".repeat(200000)]) {
      const res = await send(app, "north", "addCopyPhotos", { invId: "iv1", front: junk });
      eq(refusalOf(res), "photo-unusable", `${JSON.stringify(junk).slice(0, 20)} was accepted`);
    }
    const shop = await seen(app, "north");
    eq(shop.inventory.find((i) => i.invId === "iv1").photos.front, "real.jpg",
      "the real photograph was destroyed");
  });

  test("[49] the transaction is still unreachable from a browser", async () => {
    const { app } = await served();
    for (const shut of ["startOpportunity", "proposePrice", "acceptPrice", "acceptDeal",
      "setCopyPending", "proposeTradeSelection", "confirmHandoff", "sendMessage"]) {
      const res = await send(app, "north", shut, {});
      eq(res.statusCode, 409, `${shut} reached the domain`);
      eq(refusalOf(res), "command-unavailable", `${shut} answered something revealing`);
    }
  });

  test("[50] a malformed payload refuses cleanly and never 500s", async () => {
    const { app } = await served();
    for (const payload of [{}, null, [], 7, { invId: null }, { invId: {} },
      { invId: "iv1", front: [] }, { invId: "nope", front: "f.jpg" }]) {
      const res = await send(app, "north", "addCopyPhotos", payload);
      assert(res.statusCode < 500, `${JSON.stringify(payload)} -> ${res.statusCode}`);
    }
  });
});

if (require.main === module) run();
module.exports = {};
