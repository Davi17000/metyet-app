/* ============================================================================
   THE UNIFIED RUNTIME

   The A–O suite proves the domain. The cross-persona suite proves the two
   components read it. This proves the SHELL: one store instance, two
   perspectives, and switching that changes who is looking rather than what
   exists.

   The failure this suite exists to catch is a shell that quietly rebuilds the
   universe when you change persona — everything would still render, every other
   suite would still pass, and "one runtime" would be false.
   ========================================================================= */
const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const App = require("../dist/Prototype.cjs").default;
const D = require("../domain/metyet-domain.js");

const txt = (n) => {
  const o = []; const w = (x) => { for (const c of x.children || []) {
    if (typeof c === "string" || typeof c === "number") o.push(String(c)); else w(c); } };
  w(n); return o.join("");
};
const cls = (x, c) => (x.root || x).findAll((n) => typeof n.type === "string"
  && String(n.props.className || "").split(/\s+/).includes(c));
const click = (b) => TR.act(() => b.props.onClick({ stopPropagation() {}, preventDefault() {} }));
const mk = () => { let r; TR.act(() => { r = TR.create(React.createElement(App)); }); return r; };
const enter = (r, which) => click(cls(r, "myp-card")[which === "tp" ? 0 : 1]);
const switchTo = (r, label) => {
  click(cls(r, "myp-btn")[0]);
  click(cls(r, "myp-item").find((b) => txt(b).startsWith(label)));
};
const reset = (r) => click(cls(r, "myp-btn")[1]);
const nav = (r, l) => click(cls(r, "nav-i").find((b) => txt(b).includes(l)));

/* Reach the ONE store the shell owns, through the mounted persona's props. */
const storeOf = (r) => {
  const host = r.root.findAll((n) => n.props && n.props.store)[0];
  return host && host.props.store;
};
const state = (r) => storeOf(r).get();

describe("1–3. Startup chooser", () => {
  test("it renders the question and both personas", () => {
    const r = mk();
    eq(txt(cls(r, "myp-h")[0]), "How would you like to explore MetYet?", "the primary decision");
    const cards = cls(r, "myp-card");
    eq(cards.length, 2, "two choices");
    eq(txt(cls(cards[0], "myp-role")[0]), "Trusted Partner", "TP first");
    eq(txt(cls(cards[1], "myp-role")[0]), "Collector", "then Collector");
    assert(txt(cards[0]).includes("Manage your collector network, inventory, opportunities and sourcing."),
      "TP supporting copy");
    assert(txt(cards[1]).includes("Manage your collecting goals, Trade Binder and Trusted Partner relationships."),
      "Collector supporting copy");
    assert(txt(cards[0]).includes("Continue as Trusted Partner"), "TP CTA");
    assert(txt(cards[1]).includes("Continue as Collector"), "Collector CTA");
  });

  test("it names the canonical identities, not new demo ones", () => {
    const r = mk();
    assert(txt(r.root).includes("Northline Cards"), "p-self");
    assert(txt(r.root).includes("Casey Lin"), "c12");
  });

  test("no persona experience is mounted until one is chosen", () => {
    const r = mk();
    eq(cls(r, "sb-item").length, 0, "no TP sidebar");
    eq(cls(r, "nav-i").length, 0, "no Collector tabs");
  });
});

describe("4. Choosing a persona mounts that experience", () => {
  test("Trusted Partner mounts the TP workspace, unchanged", () => {
    const r = mk();
    enter(r, "tp");
    eq(cls(r, "sb-item").map(txt).join(","),
      "Collector Network13,Inventory37,Opportunities22", "the frozen TP, with its own counts");
    eq(cls(r, "nav-i").length, 0, "and no Collector navigation");
  });

  test("Collector mounts the Collector experience, unchanged", () => {
    const r = mk();
    enter(r, "collector");
    const tabs = cls(r, "nav-i").map(txt);
    eq(tabs.length, 3, "three destinations");
    assert(tabs[0].includes("Goals"), "Goals is home");
    eq(cls(r, "sb-item").length, 0, "and no TP sidebar");
  });

  test("persona selection lives outside both information architectures", () => {
    const r = mk();
    enter(r, "tp");
    const side = cls(r, "sb-item").map(txt).join(" ");
    assert(!/Collector Lin|Casey|Switch persona/.test(side), "nothing added to the TP sidebar");
    enter(mk(), "collector");
    const r2 = mk(); enter(r2, "collector");
    const tabs = cls(r2, "nav-i").map(txt).join(" ");
    /* "Trusted Partners" is the Collector's own third destination and predates
       the shell; what must not appear is a persona switch. */
    eq(cls(r2, "nav-i").length, 3, "still exactly three destinations");
    assert(!/Switch|persona/i.test(tabs), "no persona control in the Collector tabs");
    assert(cls(r2, "myp-bar").length === 1, "switching lives in the prototype strip");
  });
});

describe("5. One store instance, shared", () => {
  test("both personas receive the very same object", () => {
    const r = mk();
    enter(r, "tp");
    const a = storeOf(r);
    switchTo(r, "Collector");
    const b = storeOf(r);
    assert(a && b, "both mounts got a store");
    assert(a === b, "IDENTICAL instance — not a copy, not a clone");
  });

  test("neither app falls back to its own store inside the shell", () => {
    const r = mk();
    enter(r, "collector");
    const s = storeOf(r);
    switchTo(r, "Trusted Partner");
    assert(storeOf(r) === s, "the injected store wins on both sides");
  });

  test("the shell creates it once, in a ref", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "shell", "MetYetPrototype.jsx"), "utf8");
    /* Matched across the line break the explanatory comment introduced; the
       property is that the store is created lazily in a ref, exactly once. */
    assert(/storeRef\.current === null\)[\s\S]{0,80}?storeRef\.current = createStore/.test(src),
      "lazily, exactly once");
    assert(!/useState\(\(\) => createStore/.test(src), "not in state that a re-render could replace");
  });
});

describe("6. Switching preserves state and never reseeds", () => {
  const addGoalAsCollector = (r) => {
    nav(r, "Trusted Partners");
    click(cls(r, "pt")[0].findAllByType("button").find((b) => txt(b) === "View collection"));
    click(cls(r, "tabb").find((b) => txt(b).startsWith("All Inventory")));
    const add = r.root.findAllByType("button").find((b) => txt(b).trim() === "Add to my goals");
    assert(add, "a card can become a goal");
    click(add);
    click(r.root.findAllByType("button").find((b) => txt(b).includes("Primary — actively")));
  };

  test("a Collector mutation survives a round trip", () => {
    const r = mk();
    enter(r, "collector");
    const before = state(r).goals.length;
    addGoalAsCollector(r);
    eq(state(r).goals.length, before + 1, "the goal was created");
    switchTo(r, "Trusted Partner");
    switchTo(r, "Collector");
    eq(state(r).goals.length, before + 1, "and is still there after switching twice");
  });

  test("the Trusted Partner sees that same Goal as demand", () => {
    const r = mk();
    enter(r, "collector");
    const before = state(r).goals.length;
    addGoalAsCollector(r);
    switchTo(r, "Trusted Partner");
    eq(state(r).goals.length, before + 1, "one Goal record, visible from the TP side");
  });

  test("switching does not reseed any canonical collection", () => {
    const r = mk();
    enter(r, "tp");
    const snap = () => {
      const s = state(r);
      return ["goals", "inventory", "binder", "interests", "opportunities",
        "conversations", "collectors", "catalog"].map((k) => k + ":" + s[k].length).join("|");
    };
    const before = snap();
    switchTo(r, "Collector");
    eq(snap(), before, "nothing was rebuilt on the way in");
    switchTo(r, "Trusted Partner");
    eq(snap(), before, "nor on the way back");
  });

  test("the state object itself is not replaced by switching", () => {
    const r = mk();
    enter(r, "tp");
    const goalsRef = state(r).goals;
    switchTo(r, "Collector");
    assert(state(r).goals === goalsRef, "the same array, untouched");
  });

  test("a TP mutation is visible to the Collector", () => {
    const r = mk();
    enter(r, "tp");
    const st = storeOf(r);
    const copy = st.get().binder.find((b) => b.collectorId === "c12");
    assert(copy, "Casey has a binder copy");
    TR.act(() => { st.actions.setInterest("p-self", copy.id, true, "2026-08-14"); });
    switchTo(r, "Collector");
    assert(state(r).interests.some((i) => i.partnerId === "p-self" && i.binderId === copy.id),
      "the Collector reads the same interest relationship");
  });
});

describe("7. Development reset", () => {
  test("it restores the one shared universe", () => {
    const r = mk();
    enter(r, "collector");
    const before = state(r).goals.length;
    nav(r, "Trusted Partners");
    click(cls(r, "pt")[0].findAllByType("button").find((b) => txt(b) === "View collection"));
    click(cls(r, "tabb").find((b) => txt(b).startsWith("All Inventory")));
    click(r.root.findAllByType("button").find((b) => txt(b).trim() === "Add to my goals"));
    click(r.root.findAllByType("button").find((b) => txt(b).includes("Primary — actively")));
    eq(state(r).goals.length, before + 1, "mutated");

    reset(r);
    eq(state(r).goals.length, before, "the universe is restored");
  });

  test("resetting does not replace the store instance", () => {
    const r = mk();
    enter(r, "tp");
    const s = storeOf(r);
    reset(r);
    assert(storeOf(r) === s, "same instance — the contents were restored, not the runtime");
  });

  test("there is one reset, not one per persona", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "shell", "MetYetPrototype.jsx"), "utf8");
    eq((src.match(/Reset demo/g) || []).length, 1, "a single control");
    assert(!/resetTP|resetCollector/i.test(src), "no persona-specific reset");
  });

  test("the reset lives outside product navigation", () => {
    const r = mk();
    enter(r, "tp");
    const bar = cls(r, "myp-bar")[0];
    assert(txt(bar).includes("Reset demo"), "it is in the prototype strip");
    assert(!cls(r, "sb-item").some((n) => txt(n).includes("Reset")), "not in the TP sidebar");
  });
});

describe("8. The shell holds no domain logic", () => {
  test("it owns lifetime, persona and identity — nothing else", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "shell", "MetYetPrototype.jsx"), "utf8");
    for (const rule of ["identityKey", "goalState", "tradeValue", "calculatedBalance",
      "nextActor", "oneNegotiationPerGoal", "partnersHolding"]) {
      assert(!src.includes(rule), rule + " stays in the domain");
    }
  });

  test("it introduces no synchronisation", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "shell", "MetYetPrototype.jsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    ["sync", "mirror", "propagate", "copyState"].forEach((bad) =>
      assert(!new RegExp(bad, "i").test(src), "no " + bad));
  });

  test("privacy still holds through the shell", () => {
    const r = mk();
    enter(r, "tp");
    const priv = state(r).binder.find((b) => b.collectorId === "c12" && b.market != null);
    assert(priv, "Casey has a private reference value");
    /* The TP is looking at the whole store, but its surfaces must never show it. */
    assert(!txt(r.root).includes(String(priv.market)),
      "it does not appear anywhere on the TP experience");
  });

  test("Collector artwork still resolves from canonical csvId", () => {
    const r = mk();
    enter(r, "collector");
    const imgs = r.root.findAllByType("img").filter((i) => /\bart\b/.test(String(i.props.className || "")));
    assert(imgs.length > 0, "real artwork renders");
    imgs.forEach((i) => {
      const m = /images\.pokemontcg\.io\/([^/]+)\/([^_]+)_/.exec(i.props.src);
      assert(m, "canonical url: " + i.props.src);
      assert(state(r).catalog.some((c) => c.csvId === m[1] + "-" + m[2]),
        "traceable to a canonical csvId");
    });
  });
});

require("./run.cjs").run();
