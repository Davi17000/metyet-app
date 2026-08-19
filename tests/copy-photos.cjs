/* ============================================================================
   ACTUAL CARD PHOTOS — DEMAND-GATED, BEFORE ANY DEAL

   A stock image says WHICH CARD this is. Front and back photos say what THIS
   COPY looks like — and for collectibles, condition is most of the price. So
   discovery runs on the stock image and negotiation does not.

   The photos already lived on the inventory copy, so nothing new stores an
   image. What was added is the rule (`copyPhotographed`), the refusal, and a
   small copy-specific request relationship — deliberately copy-specific, since
   conversations are keyed on card IDENTITY and a partner holding three of the
   same Charizard must know which one was asked about.

   Photographing is real work. It happens when demand asks for it, and once done
   it stays on the copy, so every later collector benefits from it.
   ========================================================================= */

process.env.METYET_DEV = "1";

const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const D = require("../domain/metyet-domain.js");
const { createStore } = require("../domain/metyet-store.js");
const { collectorView } = require("../domain/collector-view.js");
const App = require("../dist/Collector.cjs").default;
const { __store } = require("../dist/Collector.cjs");
const { buildCanonicalSeed } = require("../dist/MetYet.cjs");

const readSrc = (rel) => require("fs").readFileSync(require("path").join(__dirname, "..", rel), "utf8");
const txt = (n) => {
  if (!n) return "";
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join(" ");
};
const flat = (n) => txt(n).replace(/\s+/g, " ").trim();
const cls = (r, c) => (r.root || r).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c), { deep: true });
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));
const AT = "2026-08-18";

/* Two copies of ONE card identity: one photographed, one not. This is the
   fixture that proves photos never travel by card identity. */
const CARD = { id: "k1", name: "Charizard", set: "Base Set", number: "4",
  variant: "Holo", edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
const world = () => createStore({
  catalog: [CARD],
  collectors: [{ id: "c1", name: "Casey", prefs: [] }, { id: "c2", name: "Dana", prefs: [] }],
  partners: [{ id: "p2", name: "Northline Cards" }],
  goals: [], binder: [], interests: [], conversations: [], opportunities: [],
  preferences: [], photoRequests: [],
  inventory: [
    { invId: "shot", partnerId: "p2", cardId: "k1", ask: 4200, archived: false,
      photos: { front: "copy:shot:front", back: "copy:shot:back" } },
    { invId: "stock", partnerId: "p2", cardId: "k1", ask: 3950, archived: false,
      photos: { front: null, back: null } },
    { invId: "half", partnerId: "p2", cardId: "k1", ask: 4000, archived: false,
      photos: { front: "copy:half:front", back: null } },
    { invId: "gone", partnerId: "p2", cardId: "k1", ask: 3000, archived: true,
      photos: { front: "copy:gone:front", back: "copy:gone:back" } },
  ],
});
const copyOf = (st, id) => st.get().inventory.find((i) => i.invId === id);
const primaryGoal = (st, collectorId = "c1") =>
  st.actions.addGoal({ collectorId, cardId: "k1", tier: "primary", at: AT });
const offer = (st, invId, collectorId = "c1") => {
  const gid = primaryGoal(st, collectorId);
  return st.actions.startOpportunity({ goalId: gid, collectorId, partnerId: "p2",
    cardId: "k1", invId, listedPrice: 4200, amount: 3700, at: AT });
};

describe("A. The rule itself", () => {
  test("a stock-only copy is a legitimate thing to own", () => {
    const st = world();
    const c = copyOf(st, "stock");
    assert(c, "it exists in inventory");
    eq(c.archived, false, "and is available");
    eq(D.INVARIANTS.copyPhotographed(c.photos), false, "just not photographed");
  });

  test("both faces, or the copy is not ready", () => {
    eq(D.INVARIANTS.copyPhotographed({ front: "f", back: "b" }), true, "front and back");
    eq(D.INVARIANTS.copyPhotographed({ front: "f", back: null }), false, "front alone is not enough");
    eq(D.INVARIANTS.copyPhotographed({ front: null, back: "b" }), false, "nor back alone");
    eq(D.INVARIANTS.copyPhotographed(null), false, "nor nothing at all");
  });

  test("only a photographed copy can be negotiated over", () => {
    const st = world();
    const refused = offer(st, "stock");
    eq(refused.refused, D.REFUSE.photosNeeded, "a stock-only copy is refused");
    eq(st.get().opportunities.length, 0, "and no opportunity exists");
  });

  test("one face is not quietly treated as enough", () => {
    const st = world();
    eq(offer(st, "half").refused, D.REFUSE.photosNeeded, "front-only is still refused");
  });

  test("an unavailable copy is refused however well photographed", () => {
    const st = world();
    eq(offer(st, "gone").refused, D.REFUSE.copyUnavailable, "archived copies cannot be offered on");
  });

  test("the rule lives in the domain, so no surface can route around it", () => {
    const store = readSrc("domain/metyet-store.js");
    const guard = store.slice(store.indexOf("startOpportunity({"), store.indexOf("const id = \"o\""));
    assert(/copyPhotographed/.test(guard), "startOpportunity itself checks the copy");
    assert(/REFUSE\.photosNeeded/.test(guard), "and refuses with a reason");
  });
});

describe("B. Photos belong to the exact physical copy", () => {
  test("two copies of one card identity do not share photographs", () => {
    const st = world();
    const shot = copyOf(st, "shot"), stock = copyOf(st, "stock");
    eq(shot.cardId, stock.cardId, "same card identity");
    assert(D.INVARIANTS.copyPhotographed(shot.photos), "one is photographed");
    assert(!D.INVARIANTS.copyPhotographed(stock.photos), "the other is not");
    assert(shot.photos.front !== stock.photos.front, "and their images are not shared");
  });

  test("photographing one copy leaves its siblings alone", () => {
    const st = world();
    st.actions.addCopyPhotos({ invId: "stock", front: "f", back: "b", at: AT });
    assert(D.INVARIANTS.copyPhotographed(copyOf(st, "stock").photos), "that copy is ready");
    assert(!D.INVARIANTS.copyPhotographed(copyOf(st, "half").photos),
      "its identical sibling is untouched");
  });

  test("photos live on the inventory record, with no second store", () => {
    const st = world();
    st.actions.addCopyPhotos({ invId: "stock", front: "f", back: "b", at: AT });
    const keys = Object.keys(st.get());
    eq(keys.filter((k) => /photo/i.test(k)).join(","), "photoRequests",
      "the only photo-named collection is the request relationship");
    assert(copyOf(st, "stock").photos.front, "the images sit on the copy itself");
  });
});

describe("C. Requesting photos is not a deal", () => {
  test("it creates no opportunity and no goal change", () => {
    const st = world();
    const gid = primaryGoal(st);
    const before = JSON.stringify({ o: st.get().opportunities, g: st.get().goals });
    const id = st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "stock", at: AT });
    assert(id, "the request was made");
    eq(st.get().opportunities.length, 0, "no opportunity");
    eq(JSON.stringify({ o: st.get().opportunities, g: st.get().goals }), before,
      "and nothing about the goal or any deal moved");
    eq(D.goalState(gid, st.get().opportunities), "seeking", "the goal is still simply sought");
  });

  test("it names the exact collector, partner and copy", () => {
    const st = world();
    st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "stock", at: AT });
    const r = st.get().photoRequests[0];
    eq(r.collectorId, "c1", "the collector who asked");
    eq(r.partnerId, "p2", "the partner who holds it");
    eq(r.invId, "stock", "and the exact copy");
    eq(r.fulfilledAt, null, "still open");
  });

  test("asking twice does not pile up", () => {
    const st = world();
    st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "stock", at: AT });
    eq(st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "stock", at: AT }), null,
      "the second click is a no-op");
    eq(st.get().photoRequests.length, 1, "one request, not two");
  });

  test("there is nothing to ask for on a photographed copy", () => {
    const st = world();
    eq(st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "shot", at: AT }), null,
      "no request is created");
    eq(st.get().photoRequests.length, 0, "and none is stored");
  });

  test("an unavailable copy cannot be asked about", () => {
    const st = world();
    eq(st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "gone", at: AT }).refused,
      D.REFUSE.copyUnavailable, "refused");
  });
});

describe("D. The partner photographs the copy", () => {
  test("uploading creates no opportunity and changes no price", () => {
    const st = world();
    const before = { ask: copyOf(st, "stock").ask, archived: copyOf(st, "stock").archived };
    st.actions.addCopyPhotos({ invId: "stock", front: "f", back: "b", at: AT });
    eq(st.get().opportunities.length, 0, "no opportunity");
    eq(copyOf(st, "stock").ask, before.ask, "the price is untouched");
    eq(copyOf(st, "stock").archived, before.archived, "and so is availability");
  });

  test("faces may be added separately, but one does not resolve the ask", () => {
    const st = world();
    st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "stock", at: AT });
    eq(st.actions.addCopyPhotos({ invId: "stock", front: "f", at: AT }), false, "front alone: not ready");
    eq(st.get().photoRequests[0].fulfilledAt, null, "the request stays open");
    eq(offer(st, "stock").refused, D.REFUSE.photosNeeded, "and no offer is possible yet");

    eq(st.actions.addCopyPhotos({ invId: "stock", back: "b", at: AT }), true, "with the back: ready");
    assert(st.get().photoRequests[0].fulfilledAt, "and the request is fulfilled");
  });

  test("one photo set fulfils every collector who asked", () => {
    const st = world();
    st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "stock", at: AT });
    st.actions.requestPhotos({ collectorId: "c2", partnerId: "p2", invId: "stock", at: AT });
    eq(st.get().photoRequests.length, 2, "two collectors asked");
    st.actions.addCopyPhotos({ invId: "stock", front: "f", back: "b", at: AT });
    eq(st.get().photoRequests.filter((r) => r.fulfilledAt).length, 2,
      "one upload resolves both — the work is not duplicated per collector");
  });

  test("photos persist on the copy for collectors who never asked", () => {
    const st = world();
    st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "stock", at: AT });
    st.actions.addCopyPhotos({ invId: "stock", front: "f", back: "b", at: AT });
    /* A different collector, arriving later, needs no request of their own. */
    const v = collectorView(st.get(), "c2");
    eq(v.photoState(copyOf(st, "stock")), "ready", "they see a ready copy immediately");
    eq(v.photoRequestFor("stock"), null, "with nothing to ask for");
    assert(typeof offer(st, "stock", "c2") === "string", "and can offer straight away");
  });
});

describe("E. Make an offer remains the only thing that starts a deal", () => {
  test("the full sequence creates exactly one opportunity, at the end", () => {
    const st = world();
    const gid = primaryGoal(st);
    eq(st.get().opportunities.length, 0, "matching inventory alone creates nothing");

    st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "stock", at: AT });
    eq(st.get().opportunities.length, 0, "requesting photos creates nothing");

    st.actions.addCopyPhotos({ invId: "stock", front: "f", back: "b", at: AT });
    eq(st.get().opportunities.length, 0, "photographing creates nothing");

    const oid = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", invId: "stock", listedPrice: 3950, amount: 3600, at: AT });
    assert(typeof oid === "string", "only the offer creates the deal");
    eq(st.get().opportunities.length, 1, "exactly one");
  });

  test("it opens at Agree on Price, and the five stages are unchanged", () => {
    const st = world();
    const oid = offer(st, "shot");
    const o = st.get().opportunities.find((x) => x.id === oid);
    eq(o.stage, "agree-price", "stage one");
    eq(o.invId, "shot", "against the exact copy that was photographed");
    /* The five DEAL stages, unchanged — no sixth stage was added for photos. */
    const deal = D.STAGES.filter((x) => x.group === "deal");
    eq(deal.length, 5, "still five deal stages");
    assert(!D.STAGES.some((x) => /photo/i.test(x.id)), "and none of them is about photos");
  });

  test("one active negotiation per goal still holds", () => {
    const st = world();
    const gid = primaryGoal(st);
    const first = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", invId: "shot", listedPrice: 4200, amount: 3700, at: AT });
    assert(typeof first === "string", "the first opens");
    st.actions.addCopyPhotos({ invId: "stock", front: "f", back: "b", at: AT });
    const second = st.actions.startOpportunity({ goalId: gid, collectorId: "c1", partnerId: "p2",
      cardId: "k1", invId: "stock", listedPrice: 3950, amount: 3600, at: AT });
    eq(second.refused, D.REFUSE.alreadyNegotiating, "the second is refused as before");
  });

  test("a stale request cannot revive an unavailable copy", () => {
    const st = world();
    st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "stock", at: AT });
    st.actions.addCopyPhotos({ invId: "stock", front: "f", back: "b", at: AT });
    st.actions.removeInventoryCopy("stock");            // sold or withdrawn
    eq(offer(st, "stock").refused, D.REFUSE.copyUnavailable,
      "photographed and requested, but no longer available");
  });
});

describe("F. What the collector sees", () => {
  const v = (st, who = "c1") => collectorView(st.get(), who);

  test("a stock-only copy reads as stock, and can be asked about", () => {
    const st = world();
    eq(v(st).photoState(copyOf(st, "stock")), "stock", "stock image only");
    eq(v(st).copyPhotos(copyOf(st, "stock")).actual, false, "no actual photos to show");
  });

  test("an outstanding request shows as waiting, not as another ask", () => {
    const st = world();
    st.actions.requestPhotos({ collectorId: "c1", partnerId: "p2", invId: "stock", at: AT });
    eq(v(st).photoState(copyOf(st, "stock")), "requested", "the collector is waiting");
    /* And that waiting belongs to them, not to everyone. */
    eq(v(st, "c2").photoState(copyOf(st, "stock")), "stock", "another collector has not asked");
  });

  test("a photographed copy exposes both faces and is offerable", () => {
    const st = world();
    const p = v(st).copyPhotos(copyOf(st, "shot"));
    eq(p.actual, true, "actual photos");
    assert(p.front && p.back, "front and back are both available to inspect");
    eq(v(st).photoState(copyOf(st, "shot")), "ready", "and the copy is ready to offer on");
  });

  test("the actual front photo replaces the stock image as the primary", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const art = src.slice(src.indexOf("function Art("), src.indexOf("function Art(") + 900);
    assert(/copy\.photos\.front && copy\.photos\.back/.test(art),
      "only a complete pair is used as the primary image");
    assert(/const src = actual \|\| artUrl/.test(art),
      "actual photo first, stock image as the fallback");
  });

  test("the collector UI offers the right action for each state", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const comp = src.slice(src.indexOf("function CopyAction("), src.indexOf("function PhotoNote("));
    assert(/phase === "ready"/.test(comp) && /Make an offer/.test(comp),
      "offer only when the copy is ready");
    assert(/phase === "requested"/.test(comp) && /Photos requested/.test(comp),
      "waiting once asked");
    assert(/Request photos/.test(comp), "and an ask when it is stock-only");
    /* Product language, not implementation vocabulary. */
    assert(!/gate|prerequisite|invariant/i.test(comp), "no internal words in the UI");
  });

  test("the reason is explained plainly", () => {
    const src = readSrc("collector/MetYetCollector.jsx");
    const note = src.slice(src.indexOf("function PhotoNote("), src.indexOf("function PhotoNote(") + 1200);
    assert(/Stock image/.test(note), "it names what the image is");
    assert(/See the actual card before negotiating price/.test(note), "and why it matters");
    assert(/Photos of actual card/.test(note), "and says when actual photos are present");
  });
});

describe("G. What the partner sees", () => {
  const SRC = readSrc("src/MetYet.jsx");
  const comp = SRC.slice(SRC.indexOf("function PhotoDemand("), SRC.indexOf("function InventoryRow("));

  test("demand appears on the copy-specific inventory row", () => {
    assert(comp.length > 100, "the surface exists");
    assert(/requestsFor\(inv\.invId\)/.test(comp), "asking about this exact copy");
    assert(/requested photos of this card/.test(comp), "and naming who asked");
  });

  test("the partner is offered the photography, not a deal", () => {
    assert(/Add front &amp; back photos/.test(comp), "the primary action is to photograph");
    assert(!/offer|deal|negotiat/i.test(comp.replace(/offered on/g, "")),
      "nothing suggests a commitment");
  });

  test("a partially photographed copy says which face is missing", () => {
    assert(/Back photo still needed/.test(comp), "back missing is stated");
    assert(/Front photo still needed/.test(comp), "and front missing too");
  });

  test("a finished copy simply reads as done", () => {
    assert(/Photos of actual card · Front &amp; Back/.test(comp), "labelled as actual photos");
  });

  test("inventory can still be added without photographs", () => {
    const st = world();
    st.actions.addInventoryCopy({ invId: "fresh", partnerId: "p2", cardId: "k1", ask: 4100 });
    assert(copyOf(st, "fresh"), "the copy was added");
    eq(D.INVARIANTS.copyPhotographed(copyOf(st, "fresh").photos), false,
      "with no photography required at ingestion");
  });
});

describe("H. The seeded world supports every state", () => {
  const seed = () => buildCanonicalSeed({ review: true });

  test("it contains photographed, stock-only and part-photographed copies", () => {
    const inv = seed().inventory.filter((i) => !i.archived);
    const ready = inv.filter((i) => D.INVARIANTS.copyPhotographed(i.photos));
    const half = inv.filter((i) => i.photos && ((i.photos.front && !i.photos.back)
      || (i.photos.back && !i.photos.front)));
    const stock = inv.filter((i) => i.photos && !i.photos.front && !i.photos.back);
    assert(ready.length > 0, "photographed copies exist: " + ready.length);
    assert(stock.length > 0, "stock-only copies exist: " + stock.length);
    assert(half.length > 0, "and a part-photographed copy exists: " + half.length);
  });

  test("two seeded copies of one identity differ in photography", () => {
    const inv = seed().inventory;
    const a = inv.find((i) => i.invId === "inv-c2");
    const b = inv.find((i) => i.invId === "inv-c3");
    eq(a.cardId, b.cardId, "the same card identity");
    assert(D.INVARIANTS.copyPhotographed(a.photos), "one photographed");
    assert(!D.INVARIANTS.copyPhotographed(b.photos), "one not — proof photos follow the copy");
  });

  test("every seeded active deal is against a copy that could be judged", () => {
    const s = seed();
    s.opportunities.filter((o) => D.isActive(o) && o.invId).forEach((o) => {
      const copy = s.inventory.find((i) => i.invId === o.invId);
      if (!copy) return;                     // synthetic fixture ids
      assert(D.INVARIANTS.copyPhotographed(copy.photos),
        o.id + " negotiates a photographed copy");
    });
  });
});

require("./run.cjs").run();
