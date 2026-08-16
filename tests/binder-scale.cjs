const { describe, test, assert, eq } = require("./run.cjs");
const React = require("react");
const TR = require("react-test-renderer");
const { TradeBinder } = require("../dist/MetYet.test.cjs");
const { text, byClass, byClassIn, click } = require("./util.cjs");

/* ---- fixtures -------------------------------------------------------------
   A synthetic binder of arbitrary size. Nothing here touches production seed
   data; it exercises the same component the Collector Profile renders. */
const SETS = ["Base Set", "Jungle", "Neo Discovery", "Team Rocket"];
const NAMES = ["Zapdos", "Poliwrath", "Espeon", "Vaporeon", "Machamp", "Chansey", "Scyther",
  "Electabuzz", "Alakazam", "Blastoise", "Venusaur", "Gyarados", "Lugia", "Umbreon", "Dragonite",
  "Snorlax", "Mewtwo", "Articuno", "Moltres", "Raichu", "Ninetales", "Clefairy", "Hitmonchan",
  "Magneton", "Nidoking", "Pidgeot", "Arcanine", "Jolteon", "Flareon", "Kangaskhan"];

function fixture(n, flagged = [], opts = {}) {
  const cards = [], binder = [];
  for (let i = 0; i < n; i++) {
    const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? " " + Math.floor(i / NAMES.length) : "");
    cards.push({
      id: "f" + i, name, set: SETS[i % SETS.length], num: (i + 1) + "/102", year: 1999,
      grade: i % 5 === 0 ? "Raw" : "PSA 9", condition: i % 5 === 0 ? "Lightly Played" : null,
      print: "Holo", edition: "Unlimited", language: "English", tags: [], csvId: null,
    });
    /* index 0 is the oldest addition, so a correct newest-first render reverses this. */
    const day = String((i % 28) + 1).padStart(2, "0");
    const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, "0");
    const market = opts.noValue ? null : (opts.zeroValue ? 0 : 100 + i);
    binder.push({ id: "cc" + i, cardId: "f" + i, collectorId: "cX", market,
      photos: { front: null, back: null }, cert: null,
      addedAt: `2025-${month}-${day}` });
  }
  return { cards, binder };
}

function mount(n, flagged, opts) {
  const { cards, binder } = fixture(n, flagged, opts);
  /* Interest is a relationship now, so the stub holds it as one rather than as a
     flag on the copy. */
  const state = { binder: binder.slice(),
    interests: (flagged || []).map((i) => ({ partnerId: "p-self", binderId: binder[i] && binder[i].id })).filter((x) => x.binderId) };
  const ctx = {
    card: (id) => cards.find((c) => c.id === id),
    get collectorCards() { return state.binder; },
    // the section carries a collector-side demo control; the stub supplies what it reads
    collector: () => ({ short: "Test C.", name: "Test Collector" }),
    setModal: () => {},
    setDrawer: () => {},
    interestedIn: (binderId, partnerId = "p-self") =>
      state.interests.some((i) => i.binderId === binderId && i.partnerId === partnerId),
    setTradeInterest: (ccId, on) => {
      state.interests = on
        ? [...state.interests, { partnerId: "p-self", binderId: ccId }]
        : state.interests.filter((i) => i.binderId !== ccId);
      TR.act(() => { r.update(el(ctx)); });
    },
  };
  const el = (c) => React.createElement(TradeBinder, { ctx: c, collectorId: "cX", sectionRef: { current: null } });
  let r;
  TR.act(() => { r = TR.create(el(ctx)); });
  return { r, ctx, state, original: binder };
}

const tiles = (r) => byClass(r, "cp-bind");
const names = (r) => tiles(r).map((n) => text(byClassIn(n, "cp-bind-t")[0]));
const toggles = (r) => byClass(r, "cp-bind-x");
const searchInput = (r) => r.root.findAllByType("input")[0] || null;
const hasSearch = (r) => r.root.findAllByType("input").length > 0;
const type = (r, v) => TR.act(() => { searchInput(r).props.onChange({ target: { value: v } }); });
const moreBtn = (r) => byClass(r, "cp-bind-more")[0];
const all = (r) => text(r.root);

describe("Binder scales — progressive disclosure", () => {
  test("0 cards: the true empty state, and nothing else", () => {
    const { r } = mount(0);
    assert(all(r).includes("No cards shared in their trade binder."), "true empty state");
    assert(!all(r).includes("No cards match"), "not the search empty state");
    eq(r.root.findAllByType("input").length, 0, "no search field on an empty binder");
    assert(!moreBtn(r), "no view-all control");
    assert(!all(r).includes("open to trade"), "no open count on an empty binder");
  });

  test("2 cards: both render, no View all", () => {
    const { r } = mount(2, [0]);
    eq(tiles(r).length, 2, "both render");
    assert(!moreBtn(r), "no view-all control below the limit");
  });

  test("10 cards: all render, no View all", () => {
    const { r } = mount(10, [3]);
    eq(tiles(r).length, 10, "all ten render");
    assert(!moreBtn(r), "ten is exactly the limit, so no control");
  });

  test("11 cards: ten render and View all 11 cards appears", () => {
    const { r } = mount(11);
    eq(tiles(r).length, 10, "capped at ten");
    eq(text(moreBtn(r)), "View all 11 cards", "control names the true total");
  });

  test("28 cards: expand shows all, Show fewer collapses back to ten", () => {
    const { r } = mount(28, [0, 5, 17]);
    eq(tiles(r).length, 10, "collapsed by default");
    eq(text(moreBtn(r)), "View all 28 cards", "control label");
    click(moreBtn(r));
    eq(tiles(r).length, 28, "expanded shows every card");
    eq(text(moreBtn(r)), "Show fewer", "control flips");
    click(moreBtn(r));
    eq(tiles(r).length, 10, "collapsed back to ten");
    eq(text(moreBtn(r)), "View all 28 cards", "control flips back");
  });

  test("the expand control is a real keyboard-reachable button with state", () => {
    const { r } = mount(28);
    eq(moreBtn(r).type, "button", "is a button");
    eq(moreBtn(r).props["aria-expanded"], false, "collapsed state exposed");
    click(moreBtn(r));
    eq(moreBtn(r).props["aria-expanded"], true, "expanded state exposed");
  });
});

/* The default visible limit is the only threshold: a binder you can already see
   whole gets no search field, because there is nothing to search for. */
describe("Search appears only when the binder outgrows one page", () => {
  for (const n of [0, 1, 2, 5, 10]) {
    test(n + " cards: no search field", () => {
      const { r } = mount(n, n > 0 ? [0] : []);
      assert(!hasSearch(r), "search must not render at " + n + " cards");
      assert(!moreBtn(r), "no view-all control either");
      if (n > 0) eq(tiles(r).length, n, "every card is already visible");
    });
  }

  for (const n of [11, 28, 40]) {
    test(n + " cards: search field appears", () => {
      const { r } = mount(n);
      assert(hasSearch(r), "search must render at " + n + " cards");
      eq(tiles(r).length, 10, "still collapsed to the same limit");
      eq(text(moreBtn(r)), `View all ${n} cards`, "view-all control present");
    });
  }

  test("the search and paging thresholds are the same number", () => {
    assert(!hasSearch(mount(10).r) && !moreBtn(mount(10).r), "10 gets neither");
    assert(hasSearch(mount(11).r) && moreBtn(mount(11).r), "11 gets both");
  });

  test("card behaviour below the limit is otherwise untouched", () => {
    const { r } = mount(6, [0, 1]);               // the two OLDEST cards are flagged
    eq(tiles(r).length, 6, "all render");
    eq(toggles(r).map((b) => b.props["aria-pressed"]).join(","),
      "false,false,false,false,true,true", "flagged cards sit last because they are oldest");
    const head = byClass(r, "cp-sec-h")[0];
    eq(Number(text(byClassIn(head, "mono")[0])), 6, "total count");
    eq(text(byClassIn(head, "cp-bind-open")[0]), "2 open to trade", "open count");
    assert(!hasSearch(r), "still no search below the limit");
  });
});


describe("Binder heading counts", () => {
  test("total counts every shared card, open counts only flagged ones", () => {
    const { r } = mount(28, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const head = byClass(r, "cp-sec-h")[0];
    eq(Number(text(byClassIn(head, "mono")[0])), 28, "total is all shared cards");
    eq(text(byClassIn(head, "cp-bind-open")[0]), "12 open to trade", "secondary count is flagged only");
  });

  test("the total is unaffected by collapsing, expanding or searching", () => {
    const { r } = mount(28, [0]);
    const total = () => Number(text(byClassIn(byClass(r, "cp-sec-h")[0], "mono")[0]));
    eq(total(), 28, "collapsed");
    click(moreBtn(r));
    eq(total(), 28, "expanded");
    type(r, "zapdos");
    eq(total(), 28, "searching");
  });

  test("the open count follows partner interest as it is toggled", () => {
    const { r } = mount(6, [0]);
    const open = () => text(byClassIn(byClass(r, "cp-sec-h")[0], "cp-bind-open")[0]);
    eq(open(), "1 open to trade", "starting count");
    click(toggles(r).find((b) => b.props["aria-pressed"] === "false"));
    eq(open(), "2 open to trade", "count rose with the flag");
  });
});

describe("Newest additions come first", () => {
  test("the newest card renders first and the oldest last", () => {
    const { r } = mount(6, [0]);
    // fixture index 0 is oldest, so the render should be exactly reversed
    eq(names(r).join(","), "Chansey,Machamp,Vaporeon,Espeon,Poliwrath,Zapdos", "unexpected order: " + names(r));
  });

  test("ordering ignores partner interest entirely", () => {
    const flaggedFirst = mount(6, [0]).r;          // oldest card is the flagged one
    const noneFlagged = mount(6, []).r;
    eq(names(flaggedFirst).join(","), names(noneFlagged).join(","),
      "flagging must not move a card in the order");
    eq(toggles(flaggedFirst)[5].props["aria-pressed"], "true", "the flagged card is still last, and still flagged");
  });

  test("toggling Open to trade does not reorder the binder", () => {
    const { r } = mount(6);
    const before = names(r).join(",");
    click(toggles(r)[4]);
    eq(names(r).join(","), before, "order held steady through a toggle");
    eq(toggles(r)[4].props["aria-pressed"], "true", "but the flag took effect");
  });

  test("newest-first holds when collapsed, expanded and while searching", () => {
    const { r } = mount(28, [1, 20]);
    const newestOverall = names(r)[0];
    eq(tiles(r).length, 10, "collapsed");
    click(moreBtn(r));
    eq(names(r)[0], newestOverall, "expanded still leads with the newest");
    eq(tiles(r).length, 28, "all shown");
    type(r, "/10");                                 // matches many cards across the binder
    const found = names(r);
    assert(found.length > 10, "a broad search returns more than one page");
    const { r: r2 } = mount(28);
    const fullOrder = (click(moreBtn(r2)), names(r2));
    const expected = fullOrder.filter((n) => found.includes(n));
    eq(found.join(","), expected.join(","), "search results keep newest-first order");
  });

  test("ordering does not mutate the underlying binder array", () => {
    const { state, original } = mount(6, [4, 5]);
    eq(state.binder.map((cc) => cc.id).join(","), original.map((cc) => cc.id).join(","),
      "collectorCards order is untouched by presentation ordering");
  });
});

describe("Binder search", () => {
  test("finds a card by name, case-insensitively", () => {
    const { r } = mount(28);
    type(r, "ESPEON");
    assert(names(r).every((n) => n.toLowerCase().includes("espeon")), "only matches render: " + names(r));
    assert(names(r).length >= 1, "found something");
  });

  test("finds cards by set name", () => {
    const { r } = mount(28);
    type(r, "neo discovery");
    assert(tiles(r).length >= 1, "matched by set");
    assert(tiles(r).length < 28, "and it actually filtered");
  });

  test("finds cards by printed number", () => {
    const { r } = mount(28);
    type(r, "27/102");
    eq(tiles(r).length, 1, "printed number narrows to one card");
  });

  test("searches the whole binder, not just the visible ten", () => {
    const { r } = mount(28);
    eq(tiles(r).length, 10, "collapsed first");
    const hidden = "Kangaskhan";                    // index 29 territory — beyond the first ten
    type(r, "moltres");                             // index 18, hidden while collapsed
    eq(tiles(r).length, 1, "found a card that was not rendered before the search");
    eq(names(r)[0], "Moltres", "the right card");
    assert(hidden, "fixture sanity");
  });

  test("results are never capped at ten", () => {
    const { r } = mount(28);
    type(r, "/10");                                 // every printed number contains /10
    assert(tiles(r).length > 10, "search results ignore the collapsed limit, got " + tiles(r).length);
  });

  test("no matches shows the search empty state, not the true empty state", () => {
    const { r } = mount(28);
    type(r, "zzzznotacard");
    assert(all(r).includes("No cards match your search."), "search empty state");
    assert(!all(r).includes("No cards shared in their trade binder."), "not the true empty state");
    eq(tiles(r).length, 0, "no tiles");
  });

  test("clearing the search restores the collapsed view and its control", () => {
    const { r } = mount(28);
    type(r, "espeon");
    assert(!moreBtn(r), "no expand control while searching");
    type(r, "");
    eq(tiles(r).length, 10, "back to the collapsed ten");
    eq(text(moreBtn(r)), "View all 28 cards", "control returns");
  });

  test("clearing the search preserves an expanded view", () => {
    const { r } = mount(28);
    click(moreBtn(r));
    eq(tiles(r).length, 28, "expanded");
    type(r, "espeon");
    type(r, "");
    eq(tiles(r).length, 28, "still expanded after the search is cleared");
  });

  test("the search field is labelled for assistive tech", () => {
    const { r } = mount(28);
    const input = searchInput(r);
    assert(input.props["aria-label"], "has an accessible label");
    eq(input.props.placeholder, "Search trade binder...", "placeholder copy");
  });
});

describe("Card face stays quiet", () => {
  test("each tile shows artwork, name, grade and its action stack", () => {
    const { r } = mount(4, [0]);
    const t = tiles(r)[0];
    assert(byClassIn(t, "cp-bind-art").length === 1, "artwork slot");
    assert(text(byClassIn(t, "cp-bind-t")[0]).length > 0, "name");
    assert(/ · #/.test(text(byClassIn(t, "cp-bind-id")[0])), "set and printed number");
    assert(/^(Raw|PSA )/.test(text(byClassIn(t, "cp-bind-g")[0])), "grade or condition leads the variant line");

    eq(byClassIn(t, "cp-bind-view").length, 1, "one inspect control");
  });

  test("no set, number, cert or opportunity data competes on the card face", () => {
    const { r } = mount(4, [0]);
    const t = text(tiles(r)[0]);
    for (const banned of ["Trade %", "Trade Credit", "Agreed", "Counter", "Accept", "Reject",
      "Stage", "Cash", "cert", "Market value", "Estimated", "Their $"]) {
      assert(!t.includes(banned), `card face must not show "${banned}" — got: ${t}`);
    }
  });

  test("the tile itself is not a misleading click target", () => {
    const { r } = mount(4);
    tiles(r).forEach((t) => {
      assert(!t.props.onClick, "tile has no click handler");
      assert(t.props.role !== "button", "tile is not announced as a button");
    });
  });

  test("Open to trade keeps aria-pressed in both states", () => {
    const { r } = mount(4, [0]);
    const on = toggles(r).filter((b) => b.props["aria-pressed"] === "true");
    const off = toggles(r).filter((b) => b.props["aria-pressed"] === "false");
    eq(on.length, 1, "one pressed");
    eq(off.length, 3, "three unpressed");
    toggles(r).forEach((b) => assert(text(b).includes("Open to trade"), "label unchanged"));
    click(off[0]);
    eq(toggles(r).filter((b) => b.props["aria-pressed"] === "true").length, 2, "aria-pressed follows state");
  });

  test("long card names do not break the tile", () => {
    const { r } = mount(40);
    tiles(r).forEach((t) => {
      const n = byClassIn(t, "cp-bind-t")[0];
      assert(n.props.title, "name carries a full-identity tooltip when clamped");
    });
  });
});

describe("The collector's private value stays private", () => {
  test("no value renders on a tile, whatever the record holds", () => {
    [{}, { noValue: true }, { zeroValue: true }].forEach((opts) => {
      const { r } = mount(3, [], opts);
      tiles(r).forEach((t) => {
        eq(byClassIn(t, "cp-bind-v").length, 0, "no value line");
        assert(!/\$/.test(text(t)), "and no currency at all: " + text(t));
      });
    });
  });

  test("no empty placeholder is left where the value used to be", () => {
    const { r } = mount(3);
    tiles(r).forEach((t) => {
      const empties = t.findAll((n) => typeof n.type === "string"
        && String(n.props.className || "").startsWith("cp-bind")
        && n.children.length === 0);
      eq(empties.length, 0, "no blank rows padding the tile");
    });
  });

  test("the record still carries the value for the collector's own use", () => {
    const { state } = mount(3);
    assert(state.binder.every((cc) => cc.market != null), "the private reference is preserved in state");
  });
});

describe("Tile action layout is identical across cards", () => {
  test("every tile uses the same bottom-aligned action stack", () => {
    const { r } = mount(6, [0, 3]);
    tiles(r).forEach((t) => {
      const act = byClassIn(t, "cp-bind-act")[0];
      assert(act, "one action wrapper");
      const labels = act.findAllByType("button").map((b) => text(b).trim());
      eq(labels.join(" > "), "View copy > Open to trade", "same order in every tile");
    });
  });

  test("the wrapper is the last child of the tile", () => {
    const { r } = mount(4);
    tiles(r).forEach((t) => {
      const kids = t.children.filter((k) => typeof k === "object")
        .map((k) => String(k.props.className || "").split(" ")[0]);
      eq(kids[kids.length - 1], "cp-bind-act", "actions sit at the foot: " + kids.join(","));
    });
  });

  test("alignment comes from shared layout, not per-card spacing", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const rule = /\.cp-bind-act \{([^}]*)\}/.exec(src)[1];
    assert(/margin-top:\s*auto/.test(rule), "pushed down by flex, not a spacer");
    assert(!/height/.test(rule), "no hardcoded height");
    const tile = /\.cp-bind \{([^}]*)\}/.exec(src)[1];
    assert(/flex-direction:\s*column/.test(tile), "the tile is a column so auto margin works");
  });

  test("short and long metadata produce the same action structure", () => {
    const { r } = mount(40);                       // fixture names vary in length
    const shapes = tiles(r).map((t) => byClassIn(t, "cp-bind-act")[0]
      .findAllByType("button").map((b) => String(b.props.className).replace(" on", "")).join("|"));
    eq(new Set(shapes).size, 1, "one action shape across every card: " + [...new Set(shapes)].join(" / "));
  });

  test("raw and graded copies share the same stack", () => {
    const { r } = mount(6);
    const kinds = tiles(r).map((t) => text(byClassIn(t, "cp-bind-g")[0]).slice(0, 3));
    assert(new Set(kinds).size > 1, "the fixture mixes raw and graded");
    const shapes = tiles(r).map((t) => byClassIn(t, "cp-bind-act")[0].findAllByType("button").length);
    eq(new Set(shapes).size, 1, "identical action counts regardless of grade");
  });

  test("the toggle keeps its active and inactive treatment", () => {
    const { r } = mount(4, [0]);
    const on = toggles(r).filter((b) => String(b.props.className).includes(" on"));
    eq(on.length, 1, "the flagged card is visually distinct");
    toggles(r).forEach((b) => assert(!String(b.props.className).includes("pri"),
      "and View copy stays secondary — neither action is primary"));
  });
});

describe("Card identity on the tile", () => {
  test("set and printed number render together on one line", () => {
    const { r } = mount(3);
    const id = text(byClassIn(tiles(r)[0], "cp-bind-id")[0]);
    assert(/^[A-Za-z ]+ · #\d+\/102$/.test(id), "set · #number, got: " + id);
  });

  test("no dangling separator when a field is missing", () => {
    const { r } = mount(6);
    tiles(r).forEach((t) => {
      [byClassIn(t, "cp-bind-id")[0], byClassIn(t, "cp-bind-g")[0]].forEach((line) => {
        if (!line) return;
        const v = text(line);
        assert(!/^ ·|· $|··/.test(v), "dangling separator in: " + v);
        assert(!v.trim().endsWith("·"), "trailing separator in: " + v);
      });
    });
  });

  test("graded copies lead with the grade, raw copies with Raw plus condition", () => {
    const { r } = mount(6);
    const specs = tiles(r).map((t) => text(byClassIn(t, "cp-bind-g")[0]));
    const raw = specs.filter((v) => v.startsWith("Raw"));
    const graded = specs.filter((v) => v.startsWith("PSA "));
    eq(raw.length + graded.length, specs.length, "every tile leads with grade or Raw");
    raw.forEach((v) => assert(v.includes("Lightly Played"), "raw shows its condition: " + v));
    graded.forEach((v) => assert(!v.includes("Raw"), "graded never says Raw: " + v));
  });

  test("the tile keeps identity to two compact lines plus name", () => {
    const { r } = mount(3);
    const t = tiles(r)[0];
    eq(byClassIn(t, "cp-bind-id").length, 1, "one origin line");
    eq(byClassIn(t, "cp-bind-g").length, 1, "one variant line");
    eq(byClassIn(t, "cp-bind-v").length, 0, "no value line");
    eq(byClassIn(t, "cp-bind-t").length, 1, "one name");
    eq(t.findAllByType("button").length, 2, "still just view copy and the toggle");
  });

  test("long identity text stays inside the tile and keeps a tooltip", () => {
    const { r } = mount(40);
    tiles(r).forEach((t) => {
      assert(byClassIn(t, "cp-bind-t")[0].props.title, "name carries full identity on hover");
      const spec = byClassIn(t, "cp-bind-g")[0];
      if (spec) assert(spec.props.title, "variant line carries its full text on hover");
    });
  });
});

require("./run.cjs").run();
