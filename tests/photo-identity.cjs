const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

const openOpp = (r, who) => {
  goProfile(r, who);
  click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
  return r;
};
const binderDrawer = (r, who, i = 0) => {
  goProfile(r, who);
  click(byClass(r, "cp-bind-view")[i]);
  return byClass(r, "drawer")[0];
};
const triggers = (r) => byClass(r, "copyph-btn");
const lightbox = (r) => byClass(r, "modal")[0];
const shownSide = (r) => text(byClass(r, "lb-side")[0]);
const faceBtn = (r, side) => btns(r, side).find((b) => text(b).trim() === side);
const closeBtn = (r) => btns(r, "Close").find((b) => text(b).trim() === "Close");
const party = (node) => byClassIn(node, "np")[0];
/* Trade % also renders as a .pn block now, so market blocks are chosen by vocabulary. */
const mktBlocks = (r) => byClass(r, "pn").filter((n) =>
  /market value|Opening market/.test(text(n)) && !/trade %/i.test(text(n)));
// the component guards for a non-DOM environment; give it a real event target to test against
if (typeof globalThis.window === "undefined") globalThis.window = new EventTarget();

describe("Photo enlargement — opening on the clicked face", () => {
  test("clicking Front opens the viewer on Front", () => {
    const r = render();
    binderDrawer(r, "Alex Trinh");
    click(triggers(r)[0]);
    assert(lightbox(r), "the viewer opened");
    eq(shownSide(r), "front", "on the face that was clicked");
  });

  test("clicking Back opens the viewer on Back", () => {
    const r = render();
    binderDrawer(r, "Alex Trinh");
    click(triggers(r)[1]);
    eq(shownSide(r), "back", "on the face that was clicked");
  });

  test("the viewer names the exact card identity", () => {
    const r = render();
    binderDrawer(r, "Alex Trinh");
    click(triggers(r)[0]);
    const t = text(lightbox(r));
    assert(t.includes("Espeon"), "card name: " + t.slice(0, 100));
    assert(/PSA |Raw/.test(t), "grade or condition");
    assert(t.includes("Neo Discovery"), "set");
  });

  test("Front/Back navigation switches faces", () => {
    const r = render();
    binderDrawer(r, "Alex Trinh");
    click(triggers(r)[0]);
    eq(shownSide(r), "front", "starts on front");
    click(faceBtn(r, "back"));
    eq(shownSide(r), "back", "switched to back");
    click(faceBtn(r, "front"));
    eq(shownSide(r), "front", "and back again");
  });

  test("the active face is exposed to assistive tech", () => {
    const r = render();
    binderDrawer(r, "Alex Trinh");
    click(triggers(r)[1]);
    eq(faceBtn(r, "back").props["aria-pressed"], true, "back is pressed");
    eq(faceBtn(r, "front").props["aria-pressed"], false, "front is not");
  });

  test("close returns to the surface underneath", () => {
    const r = render();
    binderDrawer(r, "Alex Trinh");
    click(triggers(r)[0]);
    click(closeBtn(r));
    eq(byClass(r, "modal").length, 0, "viewer closed");
    eq(byClass(r, "drawer").length, 1, "the copy drawer is still open behind it");
  });

  test("Escape closes the viewer", () => {
    const r = render();
    binderDrawer(r, "Alex Trinh");
    click(triggers(r)[0]);
    assert(lightbox(r), "open");
    const ev = new Event("keydown");
    ev.key = "Escape";
    TR.act(() => { globalThis.window.dispatchEvent(ev); });
    eq(byClass(r, "modal").length, 0, "Escape closed it");
  });

  test("the trigger is a real button with a descriptive label", () => {
    const r = render();
    binderDrawer(r, "Alex Trinh");
    triggers(r).forEach((b) => {
      eq(b.type, "button", "keyboard reachable");
      assert(/View larger (front|back) photo/.test(b.props["aria-label"]),
        "descriptive label: " + b.props["aria-label"]);
    });
    assert(triggers(r)[0].props.title, "and a quiet tooltip");
  });
});

describe("Photo enlargement — available wherever a copy is shown", () => {
  test("both faces are independently clickable in Value Trade", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    const copy = byClass(r, "vt-mkt-copy")[0];
    const t = byClassIn(copy, "copyph-btn");
    eq(t.length, 2, "front and back each clickable");
    click(t[1]);
    eq(shownSide(r), "back", "opens on the clicked face");
    click(faceBtn(r, "front"));
    eq(shownSide(r), "front", "and navigates");
  });

  test("Trade Binder and Value Trade use the same viewer", () => {
    const a = render();
    binderDrawer(a, "Alex Trinh");
    click(triggers(a)[0]);
    const fromBinder = byClass(a, "lb").length;
    const b = openOpp(render(), "Hiro Tanaka");
    click(byClassIn(byClass(b, "vt-mkt-copy")[0], "copyph-btn")[0]);
    eq(byClass(b, "lb").length, fromBinder, "one lightbox implementation, both surfaces");
  });

  test("the expanded evidence row also enlarges the actual copy", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    const expand = byClass(r, "tbl")[0].findAllByType("button").find((x) => text(x).trim() === "+");
    click(expand);
    const ev = byClass(r, "vt-evidence")[0];
    assert(byClassIn(ev, "copyph-btn").length >= 2, "evidence photos are enlargeable too");
  });

  test("the viewer shows the actual copy, never the stock image", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    click(byClassIn(byClass(r, "vt-mkt-copy")[0], "copyph-btn")[0]);
    const lb = byClass(r, "lb")[0];
    assert(text(lb).includes("collector photo"), "the collector's own photograph");
    eq(lb.findAll((n) => typeof n.type === "string" && String(n.props.className || "").split(/\s+/).includes("cimg")).length,
      0, "no catalog artwork substituted into the viewer");
  });

  test("the viewer carries no decision controls", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    click(byClassIn(byClass(r, "vt-mkt-copy")[0], "copyph-btn")[0]);
    const t = text(lightbox(r));
    for (const banned of ["Accept", "Counter", "Trade %", "Trade Value", "Open to trade",
      "Send", "Reject", "Rotate", "Crop"]) {
      assert(!t.includes(banned), `viewer must not offer "${banned}"`);
    }
  });
});

describe("Photo enlargement — negotiation state survives", () => {
  test("a typed market counter survives opening, switching and closing", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    const mkt = () => mktBlocks(r)[0];
    const ins = () => mkt().findAllByType("input");
    // get to the TP's turn with their proposal on the table
    TR.act(() => { ins()[0].props.onChange({ target: { value: "123" } }); });
    click(byClassIn(mkt(), "pn-send")[0]);
    TR.act(() => { ins()[0].props.onChange({ target: { value: "98" } }); });
    const before = ins().map((i) => i.props.value).join("|");
    eq(before, "98", "market counter entered as dollars");

    click(byClassIn(byClass(r, "vt-mkt-copy")[0], "copyph-btn")[0]);
    click(faceBtn(r, "back"));
    click(closeBtn(r));

    eq(ins().map((i) => i.props.value).join("|"), before, "the amount is intact");
  });

  test("opening the viewer advances nothing", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    const ins = () => byClass(r, "pn")[0].findAllByType("input");
    TR.act(() => { ins()[0].props.onChange({ target: { value: "123" } }); });
    click(byClass(r, "pn-send")[0]);
    const rowBefore = text(byClass(r, "tbl")[0]);
    click(byClassIn(byClass(r, "vt-mkt-copy")[0], "copyph-btn")[0]);
    click(closeBtn(r));
    eq(text(byClass(r, "tbl")[0]), rowBefore, "no stage, owner or market change");
  });

  test("opening a binder photo does not touch tpInterest", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const before = byClass(r, "cp-bind-x").map((b) => b.props["aria-pressed"]).join(",");
    click(byClass(r, "cp-bind-view")[0]);
    click(triggers(r)[0]);
    click(closeBtn(r));
    click(btns(r, "").find((b) => b.props["aria-label"] === "Close"));
    eq(byClass(r, "cp-bind-x").map((b) => b.props["aria-pressed"]).join(","), before,
      "standing interest unchanged by looking");
  });

  test("Agree on Price counters are unaffected by the shared modal", () => {
    const r = openOpp(render(), "James Rivera");
    const ins = () => byClass(r, "pn")[0].findAllByType("input");
    TR.act(() => { ins()[0].props.onChange({ target: { value: "600" } }); });
    const before = ins().map((i) => i.props.value).join("|");
    assert(before.startsWith("600|"), "counter entered: " + before);
    eq(ins().map((i) => i.props.value).join("|"), before, "still intact");
  });
});

describe("Collector identity in negotiation", () => {
  test("Agree on Price shows the collector beside their offer", () => {
    const r = openOpp(render(), "James Rivera");
    const p = party(byClass(r, "pn")[0]);
    assert(p, "the collector is present");
    eq(text(byClassIn(p, "np-n")[0]), "James R.", "short name, the existing convention");
    eq(text(byClassIn(p, "av")[0]), "JR", "initials avatar from the collector record");
  });

  test("Value Trade market shows the collector beside their proposal", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    const ins = mktBlocks(r)[0].findAllByType("input");
    TR.act(() => { ins[0].props.onChange({ target: { value: "123" } }); });
    click(byClassIn(mktBlocks(r)[0], "pn-send")[0]);
    const p = party(mktBlocks(r)[0]);
    assert(p, "the collector is present on the market decision");
    eq(text(byClassIn(p, "np-n")[0]), "Hiro T.", "named once");
  });

  test("the waiting state keeps the person visible", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    const ins = () => mktBlocks(r)[0].findAllByType("input");
    TR.act(() => { ins()[0].props.onChange({ target: { value: "123" } }); });
    click(byClassIn(mktBlocks(r)[0], "pn-send")[0]);
    TR.act(() => { ins()[0].props.onChange({ target: { value: "98" } }); });
    click(byClassIn(mktBlocks(r)[0], "pn-send")[0]);
    const wait = mktBlocks(r).find((n) => String(n.props.className).includes("wait"));
    assert(party(wait), "the collector stays present while waiting");
    assert(text(wait).includes("Waiting on Hiro T."), "and it is clear who we wait on");
  });

  test("the avatar is compact and uses the existing avatar treatment", () => {
    const r = openOpp(render(), "James Rivera");
    const av = byClassIn(party(byClass(r, "pn")[0]), "av")[0];
    assert(String(av.props.className).split(/\s+/).includes("av"), "existing avatar class");
    assert(!String(av.props.className).includes("lg"), "not the large profile variant");
  });

  test("no collector metadata leaks into the negotiation", () => {
    const r = openOpp(render(), "James Rivera");
    const p = text(party(byClass(r, "pn")[0]));
    for (const banned of ["Austin", "Member since", "Completed deals", "lifetime", "@"]) {
      assert(!p.includes(banned), `identity context must stay to name and photo, saw "${banned}"`);
    }
  });

  test("the collector is not shown their own avatar on the demo side", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    const ins = () => mktBlocks(r)[0].findAllByType("input");
    TR.act(() => { ins()[0].props.onChange({ target: { value: "123" } }); });
    click(byClassIn(mktBlocks(r)[0], "pn-send")[0]);
    TR.act(() => { ins()[0].props.onChange({ target: { value: "98" } }); });
    click(byClassIn(mktBlocks(r)[0], "pn-send")[0]);       // now it is the collector's turn
    const sim = mktBlocks(r).find((n) => !String(n.props.className).includes("wait"));
    assert(sim, "the collector-side block renders");
    eq(byClassIn(sim, "np").length, 0, "they are not shown to themselves as a counterparty");
  });

  test("avatars are not scattered across passive surfaces", () => {
    const r = render();
    click(btnExact(r, "Collector Network13"));
    eq(byClass(r, "np").length, 0, "no negotiation identity blocks on the network table");
  });
});

describe("Collector identity — no duplicated name", () => {
  test("Agree on Price says 'Their offer', not 'James R.'s offer'", () => {
    const r = openOpp(render(), "James Rivera");
    const p = byClass(r, "pn")[0];
    eq(text(byClassIn(p, "pn-h")[0]), "Their offer", "term label carries no name");
    eq((text(p).match(/James R\./g) || []).length, 1, "the name appears exactly once");
  });

  test("Value Trade says 'Their market value', not 'Hiro T.'s market value'", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    const mkt = () => mktBlocks(r)[0];
    const ins = mkt().findAllByType("input");
    TR.act(() => { ins[0].props.onChange({ target: { value: "123" } }); });
    click(byClassIn(mkt(), "pn-send")[0]);
    const p = mkt();
    const heads = byClassIn(p, "pn-h").map(text);
    assert(heads.includes("Their market value"), "perspective label: " + heads.join(","));
    assert(!heads.some((h) => h.includes("Hiro T.'s")), "no possessive duplication");
  });
});

describe("Terminology holds", () => {
  test("no user-facing Trade Credit wording anywhere in the workspace", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    assert(!/[Tt]rade [Cc]redit/.test(allText(r)), "no trade credit wording");
    assert(!/— credit /.test(allText(r)), "and no bare 'credit' in the trade % action");
  });
});

require("./run.cjs").run();
