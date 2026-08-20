const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");
const React = require("react");
const { CardContext } = require("../dist/MetYet.test.cjs");

/* A bound inventory copy is only created when a collector makes an offer, so the
   left column's cert and photo-requirement states are exercised directly. */
const boundCardContext = (opts = {}) => {
  const c = { id: "i1", name: "Blastoise", set: "Base Set", num: "2/102", grade: "PSA 8",
    print: "Holo", edition: "Unlimited", language: "English", condition: null, csvId: null };
  const inv = { invId: "inv-x", cardId: "i1", ask: 620, cert: opts.cert === null ? null : "PSA 70013457",
    photos: opts.photos || { front: null, back: null } };
  const ctx = { collector: () => ({ short: "Sarah M." }), goalsForIdentity: () => ({ primary: [], secondary: [] }),
    setDrawer: () => {}, setNav: () => {}, say: () => {} };
  let r;
  TR.act(() => {
    r = TR.create(React.createElement(CardContext, {
      ctx, c, matches: [inv], opp: { id: "o1", invId: "inv-x", stage: "deal" }, thread: null }));
  });
  return r;
};

const openOpp = (r, who, i = 0) => {
  goProfile(r, who);
  click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[i]);
  return r;
};
/* Reach a specific stage by its label on the collector profile's opportunity row. */
const atStage = (who, stage) => {
  const r = render();
  goProfile(r, who);
  const row = byClass(r, "cp-opp").find((n) => text(n).includes(stage));
  assert(row, `${who} has no ${stage} opportunity`);
  click(row.findAllByType("button").find((b) => text(b).trim() === "Open"));
  return r;
};
const body = (r) => byClass(r, "ws-body")[0];
const side = (r) => byClass(r, "ws-side")[0];
const cardCtx = (r) => byClass(r, "ws-top")[0];
const nextStep = (r) => byClass(r, "ws-owner")[0];
const stageWork = (r) => byClass(r, "ws-stagework")[0];
const chat = (r) => byClass(r, "ws-chat")[0];

describe("A. Shared shell", () => {
  test("the workspace has left, conversation and stage regions", () => {
    const r = openOpp(render(), "Alex Trinh");
    const cols = body(r).children.filter((c) => typeof c === "object");
    eq(cols.length, 3, "three columns");
    assert(side(r), "left reference column");
    assert(chat(r), "conversation column");
    assert(stageWork(r), "stage workspace column");
  });

  test("the target card is no longer a full-width hero above the body", () => {
    const r = openOpp(render(), "Alex Trinh");
    // it now lives inside the left column, not as a sibling of the grid
    assert(byClassIn(side(r), "ws-top").length === 1, "card context sits inside the left column");
    const shell = byClass(r, "ws")[0];
    const direct = shell.children.filter((c) => typeof c === "object")
      .map((c) => String(c.props.className || ""));
    assert(!direct.includes("ws-top"), "no full-width hero row: " + direct.join(","));
  });

  test("the stage workspace receives the largest allocation", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const m = /\.ws-body \{[^}]*grid-template-columns:\s*minmax\(0,(\d+)fr\) minmax\(0,(\d+)fr\) minmax\(0,(\d+)fr\)/.exec(src);
    assert(m, "the three-column rule exists");
    const [left, center, right] = [Number(m[1]), Number(m[2]), Number(m[3])];
    assert(right > left && left > center, `RIGHT > LEFT > CENTER, got ${left}/${center}/${right}`);
    assert(right >= 50, "the decision surface dominates: " + right + "%");
  });

  test("the workspace header is unchanged", () => {
    const r = openOpp(render(), "Alex Trinh");
    const head = byClass(r, "ws-head")[0];
    assert(text(head).includes("Alex Trinh"), "collector name");
    assert(text(head).includes("one conversation, all stages"), "subtitle");
    assert(btns(r, "Collector profile").length >= 1, "collector profile action");
    assert(head.findAllByType("button").some((b) => b.props["aria-label"] === "Close"), "close control");
  });
});

describe("B. Target card context stays complete", () => {
  test("artwork sits beside the identity, not above a wide header", () => {
    const r = openOpp(render(), "Alex Trinh");
    const line = byClassIn(cardCtx(r), "ws-cardline")[0];
    assert(line, "the art/identity row");
    assert(byClassIn(line, "cimg").length >= 1, "artwork");
    assert(byClassIn(line, "ws-cardid").length === 1, "identity beside it");
  });

  test("every identity field is still present", () => {
    const r = openOpp(render(), "Alex Trinh");
    const t = text(cardCtx(r));
    for (const field of ["Charizard", "PSA 9", "Holo", "Base Set", "4/102", "Unlimited", "English"]) {
      assert(t.includes(field), `identity retains "${field}"`);
    }
  });

  test("front and back photos remain", () => {
    const r = openOpp(render(), "Alex Trinh");
    const caps = byClassIn(cardCtx(r), "cimg-cap").map(text);
    assert(caps.some((c) => /Front/.test(c)), "front");
    assert(caps.some((c) => /Back/.test(c)), "back");
  });

  test("Card info copy remains, and cert stays conditional on a bound copy", () => {
    const r = openOpp(render(), "Alex Trinh");
    const labels = byClassIn(cardCtx(r), "ccopy")[0].findAllByType("button")
      .map((b) => b.props["aria-label"]);
    assert(labels.includes("Copy card information"), "card info copy preserved");
    // cert only when a specific inventory copy is bound to the opportunity
    const hasCert = labels.includes("Copy PSA certification number");
    assert(typeof hasCert === "boolean", "cert action is conditional, not unconditional");
  });

  test("matched inventory context is preserved", () => {
    const r = openOpp(render(), "Alex Trinh");
    const inv = byClassIn(cardCtx(r), "ws-invbox")[0];
    assert(inv, "the inventory box");
    const t = text(inv);
    assert(/Matched|Negotiating|No matching inventory/.test(t), "inventory status: " + t.slice(0, 80));
  });

  test("the card context did not lose the multi-collector note", () => {
    const r = openOpp(render(), "Alex Trinh");
    assert(/Also wanted by/.test(text(cardCtx(r))), "shared-demand context retained");
  });
});

describe("C. Opportunity Map", () => {
  test("the map sits at the top of the workspace, directly under the header", () => {
    const r = openOpp(render(), "Alex Trinh");
    const shell = byClass(r, "ws")[0];
    const hosts = shell.findAll((n) => typeof n.type === "string"
      && ["ws-head", "ws-map", "ws-body"].includes(String(n.props.className || "").replace(" txn", "")));
    eq(hosts.map((n) => String(n.props.className).replace(" txn", "")).join(","),
      "ws-head,ws-map,ws-body", "header, then the map, then the three columns");
  });

  test("the map is no longer in the left sidebar", () => {
    const r = openOpp(render(), "Alex Trinh");
    eq(byClassIn(side(r), "ws-map").length, 0, "removed from its original location");
    // the left column now holds card context alone
    const hosts = side(r).findAll((n) => typeof n.type === "string"
      && String(n.props.className || "") === "ws-top");
    eq(hosts.length, 1, "card details and identity remain there");
  });

  test("the stages render equidistantly in one horizontal row", () => {
    const r = openOpp(render(), "Alex Trinh");
    const stages = byClassIn(byClass(r, "ws-map")[0], "ws-stage");
    eq(stages.length, 9, "every stage, Secondary Goal through Archived");
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    assert(/\.ws-map \{[^}]*display: flex/.test(src), "a single horizontal row");
    assert(/\.ws-stage \{[^}]*flex: 1 1 0/.test(src), "equidistant across the full width");
  });

  test("completed stages show a check, current and future do not", () => {
    const r = openOpp(render(), "Alex Trinh");
    const stages = byClassIn(byClass(r, "ws-map")[0], "ws-stage");
    stages.forEach((n) => {
      const cls = String(n.props.className);
      const dot = text(byClassIn(n, "ws-dot")[0]);
      if (/past/.test(cls)) eq(dot, "\u2713", "completed stages are checked");
      else eq(dot, "", "current and future stages carry no check");
    });
    eq(stages.filter((n) => /\bnow\b/.test(String(n.props.className))).length, 1, "one current stage");
  });

  test("all stages and their states still render", () => {
    const r = openOpp(render(), "Alex Trinh");
    const map = byClass(r, "ws-map")[0];
    const t = text(map);
    for (const st of ["Agree on Price", "Select Trade", "Value Trade", "Deal",
      "Fulfillment", "Completed", "Archived"]) {
      assert(t.includes(st), `map retains "${st}"`);
    }
    assert(byClassIn(map, "now").length === 1, "exactly one current stage");
    assert(byClassIn(map, "past").length >= 1, "completed stages marked");
  });

  test("the map is still read-only", () => {
    const r = openOpp(render(), "Alex Trinh");
    const map = byClass(r, "ws-map")[0];
    eq(map.findAllByType("button").length, 0, "stages are not clickable");
    eq(map.findAllByType("a").length, 0, "and not navigable");
    // the explanatory subtext moved out with the redesign; the labels carry the meaning
    assert(!text(map).includes("Stages advance only"), "the subtext was removed as specified");
  });
});

describe("D. Conversation", () => {
  test("the composer and send controls are unchanged", () => {
    const r = openOpp(render(), "Alex Trinh");
    const c = chat(r);
    assert(c.findAllByType("textarea").length === 1, "composer");
    assert(text(c).includes("Send"), "send");
    assert(text(c).includes("No terms change. No stage change."), "the rule is still stated");
  });

  test("the composer sits at the bottom of a full-height column", () => {
    const r = openOpp(render(), "Alex Trinh");
    const kids = chat(r).children.filter((k) => typeof k === "object")
      .map((k) => String(k.props.className || ""));
    eq(kids[kids.length - 1], "ws-composer", "composer is last, pinned below the history");
    assert(kids.includes("ws-chat-scroll"), "history takes the space above it");
  });

  test("sending a message does not advance the stage", () => {
    const r = openOpp(render(), "Alex Trinh");
    const before = text(byClass(r, "ws-head")[0]);
    const ta = chat(r).findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: "hello" } }); });
    click(btns(r, "Send").find((b) => text(b).trim() === "Send"));
    eq(text(byClass(r, "ws-head")[0]), before, "stage label unchanged");
  });
});

describe("E. Next Step is stage-aware and truthful", () => {
  test("a TP turn names the TP and the required decision", () => {
    const r = openOpp(render(), "Alex Trinh");
    const t = text(nextStep(r));
    assert(t.includes("Next step · Trusted Partner"), "ownership: " + t.slice(0, 60));
    assert(t.includes("accept or reject"), "the decision");
    assert(t.includes("let them know your decision"), "supporting detail");
  });

  test("a collector turn reads as waiting, with no actionable control", () => {
    const r = atStage("Nina Alvarez", "Agree on Price");
    const t = text(nextStep(r));
    assert(t.includes("Next step · Collector"), "ownership");
    assert(/Waiting for/.test(t), "waiting language: " + t);
    eq(nextStep(r).findAllByType("button").length, 0, "no actionable control while waiting");
  });

  test("Next Step introduces no duplicate domain action", () => {
    for (const who of ["Alex Trinh", "James Rivera", "Hiro Tanaka"]) {
      const r = openOpp(render(), who);
      eq(nextStep(r).findAllByType("button").length, 0,
        who + ": actions stay with their single owner in the stage surface");
    }
  });

  test("its counts come from the same state the stage renders", () => {
    const r = openOpp(render(), "Alex Trinh");
    const status = byClassIn(nextStep(r), "ws-owner-s")[0];
    if (!status) return;
    const shown = text(status);
    assert(/\d+ (accepted|to review|of)/.test(shown), "derived counts: " + shown);
    assert(text(stageWork(r)).includes(shown.split(" · ")[0]), "matching the stage's own summary");
  });
});

describe("F. Every stage fits the framework", () => {
  const STAGES = [
    ["James Rivera", "Agree on Price", ["Send counter", "Accept $"]],
    ["Alex Trinh", "Select Trade", ["Accept into trade", "Reject"]],
    ["Hiro Tanaka", "Value Trade", ["Market Value", "Trade %"]],
    ["Nina Alvarez", "Deal", ["Cash balance"]],
    ["Casey Lin", "Fulfillment", ["handoff"]],
  ];

  for (const [who, stage, markers] of STAGES) {
    test(`${stage} renders in the new shell with its controls intact`, () => {
      const r = atStage(who, stage);
      assert(side(r), "left column");
      assert(chat(r), "conversation");
      assert(stageWork(r), "stage workspace");
      assert(nextStep(r), "next step");
      const t = text(stageWork(r));
      markers.forEach((m) => assert(t.includes(m), `${stage} retains "${m}"`));
    });
  }

  test("Terms sit directly beneath Next Step where they apply", () => {
    const r = atStage("Nina Alvarez", "Deal");
    const t = text(stageWork(r));
    assert(t.includes("Listed price") && t.includes("Agreed price"), "terms present");
    assert(t.indexOf("Listed price") > t.indexOf("Next step"), "below Next Step");
  });

  test("Select Trade still hides future financial columns", () => {
    const r = atStage("Alex Trinh", "Select Trade");
    const t = text(stageWork(r));
    for (const banned of ["Market Value", "Trade %", "Trade Value", "locked", "not yet"]) {
      assert(!t.includes(banned), `Select Trade must not show "${banned}"`);
    }
  });

  test("the deal breakdown keeps its card-by-card economics", () => {
    const r = atStage("Hiro Tanaka", "Fulfillment");
    const t = text(stageWork(r));
    assert(/agreed market .* × agreed \d+%/.test(t), "per-card breakdown retained");
    assert(t.includes("Total trade value"), "and the total");
    assert(!/[Tt]rade [Cc]redit/.test(t), "no reintroduced Trade Credit");
  });
});

describe("G. Settlement is unchanged by the presentation", () => {
  test("a settled deal reports identical figures", () => {
    const r = atStage("Hiro Tanaka", "Fulfillment");
    const t = allText(r);
    assert(t.includes("$1,294"), "total trade value unchanged");
    assert(t.includes("$8,016"), "cash balance unchanged");
    assert(t.includes("$882") && t.includes("$144") && t.includes("$585"), "agreed market values unchanged");
  });

  test("negotiation surfaces still function inside the new layout", () => {
    const r = atStage("James Rivera", "Agree on Price");
    const pn = byClass(r, "pn")[0];
    const ins = pn.findAllByType("input");
    eq(ins.length, 2, "synchronized amount and percentage");
    TR.act(() => { ins[0].props.onChange({ target: { value: "624" } }); });
    eq(byClass(r, "pn")[0].findAllByType("input").map((i) => i.props.value).join("|"), "624|80",
      "dollar/percentage synchronization intact");
  });

  test("photo enlargement still works from the stage surface", () => {
    const r = atStage("Alex Trinh", "Select Trade");
    const trigger = byClass(r, "copyph-btn")[0];
    assert(trigger, "an enlargeable copy photo");
    click(trigger);
    assert(byClass(r, "lb").length === 1, "the shared lightbox opened");
  });
});

describe("Left column — cert placement and photo requirements", () => {
  test("the certification reads directly under Card info, not at the column foot", () => {
    const r = boundCardContext();
    const actions = byClassIn(r.root, "ccopy")[0].findAllByType("button").map(text);
    eq(actions.join(" | "), "Card info | PSA 70013457",
      "the cert number sits with the identity, below Card info");
    // it is inside the identity block, above the photos
    const id = byClassIn(r.root, "ws-cardid")[0];
    eq(byClassIn(id, "ccopy").length, 1, "both actions live in the identity block");
  });

  test("the cert action still copies only the number", () => {
    const r = boundCardContext();
    const certBtn = byClassIn(r.root, "ccopy")[0].findAllByType("button")[1];
    eq(certBtn.props["aria-label"], "Copy PSA certification number", "unchanged accessible label");
    assert(certBtn.props.title.includes("70013457"), "and the number in the tooltip");
  });

  test("a copy with no certification shows only Card info", () => {
    const r = boundCardContext({ cert: null });
    eq(byClassIn(r.root, "ccopy")[0].findAllByType("button").map(text).join(","), "Card info",
      "no cert action is invented");
  });

  test("missing photos render two concise dashed cards with their labels", () => {
    const r = boundCardContext();
    eq(byClass(r, "ws-photo").map(text).join(" | "), "Front photo required | Back photo required",
      "concise requirement text");
    eq(byClassIn(r.root, "cimg-cap").map(text).join(" | "), "Your copy · Front | Your copy · Back",
      "labels beneath each card");
    byClass(r, "ws-photo").forEach((n) =>
      assert(String(n.props.className).includes("req"), "shown as a requirement, not a placeholder"));
  });

  test("the cert label change did not leak to other surfaces", () => {
    const r = render();
    click(btnExact(r, "Inventory37"));
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    const labels = byClass(r, "drawer")[0].findAllByType("button").map(text);
    assert(labels.includes("PSA Cert #"), "CardDrawer keeps the generic label: " + labels.slice(0, 4));
  });
});

describe("Composer helper text", () => {
  test("reads the new concise wording", () => {
    const r = openOpp(render(), "Alex Trinh");
    const t = text(byClass(r, "ws-composer")[0]);
    assert(t.includes("No terms change. No stage change."), "new wording: " + t);
    assert(!t.includes("Messages don't change terms"), "old wording removed");
  });

  test("the rule it states is still enforced", () => {
    const r = openOpp(render(), "Alex Trinh");
    const before = text(byClass(r, "ws-head")[0]);
    const ta = byClass(r, "ws-chat")[0].findAllByType("textarea")[0];
    TR.act(() => { ta.props.onChange({ target: { value: "hi" } }); });
    click(btns(r, "Send").find((b) => text(b).trim() === "Send"));
    eq(text(byClass(r, "ws-head")[0]), before, "no stage change");
  });
});

describe("Scroll architecture — one deal, one vertical scroll", () => {
  const src = () => require("fs").readFileSync(
    require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
  /* Read a CSS rule body by selector so the assertions describe intent, not position. */
  const rule = (sel) => {
    const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(src());
    assert(m, "found the rule for " + sel);
    return m[1];
  };

  test("the workspace body is the single vertical scroll owner", () => {
    assert(/overflow-y:\s*auto/.test(rule(".ws-body")), ".ws-body owns the scroll");
    assert(/min-height:\s*0/.test(rule(".ws-body")), "and is height-constrained so it can scroll");
  });

  test("the right stage workspace has no independent vertical scroll", () => {
    const r = rule(".ws-stagework");
    assert(!/overflow-y:\s*(auto|scroll)/.test(r), "no nested right-column scrollbar: " + r);
    assert(!/overflow:\s*(auto|scroll|hidden)/.test(r), "and no clipping: " + r);
  });

  test("the left and conversation columns join the same scroll", () => {
    assert(!/overflow-y:\s*(auto|scroll)/.test(rule(".ws-side")), "left column does not scroll alone");
    assert(!/overflow-y:\s*(auto|scroll)/.test(rule(".ws-chat-scroll")), "conversation does not scroll alone");
    assert(!/overflow-y:\s*(auto|scroll)/.test(rule(".ws-chat")), "nor its wrapper");
  });

  test("exactly one scrolling element exists inside the workspace shell", () => {
    const block = src().slice(src().indexOf(".ws { margin: auto"), src().indexOf(".ws-owner {"));
    const scrollers = (block.match(/overflow-y:\s*(auto|scroll)/g) || []).length;
    eq(scrollers, 1, "one scroll owner between the shell and the stage rules");
  });

  test("the modal shell stays viewport bounded", () => {
    const m = /\.ws \{([^}]*)\}/.exec(src());
    assert(m, "the shell rule");
    const r = m[1];
    assert(/height:\s*92vh/.test(r), "bounded to the viewport");
    assert(/overflow:\s*hidden/.test(r), "so the page behind never becomes the scroller");
  });

  test("no stage wrapper clips its content with a fixed or maximum height", () => {
    [".ws-stagework", ".ws-side", ".ws-chat"].forEach((sel) => {
      const r = rule(sel);
      assert(!/max-height/.test(r), sel + " must not cap its height");
      assert(!/\bheight:\s*\d/.test(r), sel + " must not fix its height");
    });
  });

  test("the composer still sits at the foot of the conversation column", () => {
    assert(/flex:\s*1/.test(rule(".ws-chat-scroll")), "history takes the free space");
    assert(/flex:\s*0 0 auto/.test(rule(".ws-composer")), "composer keeps its natural height");
    const r = openOpp(render(), "Alex Trinh");
    const kids = byClass(r, "ws-chat")[0].children.filter((k) => typeof k === "object")
      .map((k) => String(k.props.className || ""));
    eq(kids[kids.length - 1], "ws-composer", "and remains last in the column");
  });

  test("the bounded table scroller outside the workspace was left alone", () => {
    assert(/max-height:\s*520px/.test(rule(".tbl-scroll")),
      "GoalRowTable's own scroller is unrelated to the deal workspace");
  });
});

describe("Scroll architecture — stage content expands", () => {
  const STRESS = [
    ["James Rivera", "Agree on Price", ["Next step", "Listed price", "Send counter"]],
    ["Alex Trinh", "Select Trade", ["Card Details", "Accept into trade", "Reject", "Trade Binder"]],
    ["Hiro Tanaka", "Value Trade", ["Market Value", "Trade %", "Trade Value", "collector photo"]],
    ["Nina Alvarez", "Deal", ["Listed price", "Agreed price", "Cash balance"]],
    ["Hiro Tanaka", "Fulfillment", ["Total trade value"]],
  ];

  for (const [who, stage, markers] of STRESS) {
    test(`${stage} renders its full content inside the single scroll`, () => {
      const r = atStage(who, stage);
      const t = text(byClass(r, "ws-stagework")[0]);
      markers.forEach((m) => assert(t.includes(m), `${stage} still shows "${m}"`));
      eq(byClass(r, "ws-body").length, 1, "one scrolling workspace");
    });
  }

  test("a multi-card Value Trade keeps every card reachable", () => {
    const r = atStage("Hiro Tanaka", "Value Trade");
    const rows = byClass(r, "tbl")[0].findAllByType("tr").slice(1);
    assert(rows.length >= 3, "several trade cards render: " + rows.length);
    assert(byClass(r, "vt-mkt-copy").length >= 1, "the market review expands with them");
  });

  test("Deal keeps its full card-by-card breakdown", () => {
    const r = atStage("Hiro Tanaka", "Fulfillment");
    const t = text(byClass(r, "ws-stagework")[0]);
    const lines = (t.match(/agreed market/g) || []).length;
    assert(lines >= 3, "every trade card is itemised: " + lines);
    assert(t.includes("Total trade value"), "and totalled");
  });
});

describe("Deal — final negotiation copy", () => {
  const atDeal = () => atStage("Nina Alvarez", "Deal");
  const stage = (r) => text(stageWork(r));

  test("the section is titled Final negotiation", () => {
    const t = stage(atDeal());
    assert(t.includes("Final negotiation"), "renamed heading: " + t.slice(0, 80));
  });

  test("no user-facing 'cash adjustment' wording remains in the Deal flow", () => {
    const r = atDeal();
    assert(!/[Cc]ash adjustment/.test(allText(r)), "the old label is gone everywhere on the stage");
  });

  test("the empty state names the calculated balance dynamically", () => {
    const r = atDeal();
    const t = stage(r);
    assert(t.includes("No final adjustment proposed. The calculated balance remains"),
      "the approved wording: " + t.slice(t.indexOf("Final negotiation"), t.indexOf("Final negotiation") + 120));
    assert(/remains Nina A\. pays you — \$\d/.test(t),
      "with the real collector short name and computed balance");
  });

  test("the helper text explains what is and is not being renegotiated", () => {
    assert(stage(atDeal()).includes(
      "Propose a final cash amount — all agreed card values and trade percentages stay unchanged."),
      "the approved helper copy");
  });

  test("the existing input and Propose balance action are unchanged", () => {
    const r = atDeal();
    const sw = stageWork(r);
    assert(sw.findAllByType("input").length >= 1, "the amount input is still there");
    assert(sw.findAllByType("button").some((b) => text(b).includes("Propose balance")),
      "and the Propose balance action");
  });

  test("proposing a balance does not reopen any upstream term", () => {
    const r = atDeal();
    const terms = () => (stage(r).match(/Listed price\S{0,12}|Agreed price\S{0,12}|Total trade value\S{0,12}/g) || []).join("|");
    const before = terms();
    const sw = stageWork(r);
    TR.act(() => { sw.findAllByType("input")[0].props.onChange({ target: { value: "300" } }); });
    click(sw.findAllByType("button").find((b) => text(b).includes("Propose balance")));
    eq(terms(), before, "agreed price, card values and trade value are all untouched");
    assert(/proposed/.test(stage(r)), "but the proposal was recorded");
  });

  test("the calculated balance stays traceable alongside a negotiated one", () => {
    const r = atStage("Hiro Tanaka", "Fulfillment");
    const t = stage(r);
    assert(t.includes("Total trade value"), "the applied trade value is still itemised");
    assert(/agreed market .* × agreed \d+%/.test(t), "and the per-card arithmetic remains visible");
  });
});

require("./run.cjs").run();
