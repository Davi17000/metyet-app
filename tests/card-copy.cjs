/* The clipboard mock must be installed before the app module loads, and Node's
   `navigator` is a getter-only global, so it has to be redefined rather than assigned. */
const writes = [];
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { clipboard: { writeText: (t) => { writes.push(t); return Promise.resolve(); } } },
});
const failing = { clipboard: { writeText: () => Promise.reject(new Error("denied")) } };
const noClipboard = {};
const setClipboard = (v) => Object.defineProperty(globalThis, "navigator", { configurable: true, value: v });
const working = { clipboard: { writeText: (t) => { writes.push(t); return Promise.resolve(); } } };

/* A minimal DOM stand-in so the legacy execCommand path can be exercised. Every
   created element is tracked, so "nothing is left behind" is observable. */
const dom = { created: [], attached: [], execResult: true, execCalls: 0, selected: [] };
const makeTextarea = () => {
  const el = {
    tagName: "TEXTAREA", value: "", style: {}, parentNode: null,
    attrs: {}, focused: false, selectedAll: false, range: null,
    setAttribute(k, v) { this.attrs[k] = v; },
    focus() { this.focused = true; },
    select() { this.selectedAll = true; dom.selected.push(this.value); },
    setSelectionRange(a, b) { this.range = [a, b]; },
  };
  dom.created.push(el);
  return el;
};
const installDom = () => {
  dom.created = []; dom.attached = []; dom.execCalls = 0; dom.selected = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        appendChild(el) { el.parentNode = this; dom.attached.push(el); return el; },
        removeChild(el) {
          const i = dom.attached.indexOf(el);
          if (i >= 0) dom.attached.splice(i, 1);
          el.parentNode = null;
          return el;
        },
      },
      createElement: (tag) => (tag === "textarea" ? makeTextarea() : { style: {}, setAttribute() {} }),
      execCommand: (cmd) => { if (cmd === "copy") dom.execCalls++; return dom.execResult; },
    },
  });
};
const removeDom = () => Object.defineProperty(globalThis, "document", { configurable: true, value: undefined });

const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn, goProfile } = require("./util.cjs");

const groups = (r) => byClass(r, "ccopy");
const copyBtns = (r) => groups(r).flatMap((n) => n.findAllByType("button"));
const infoBtn = (r) => copyBtns(r).find((b) => b.props["aria-label"] === "Copy card information");
const certBtn = (r) => copyBtns(r).find((b) => b.props["aria-label"] === "Copy PSA certification number");
const press = (b) => { writes.length = 0; TR.act(() => { b.props.onClick(); }); };
const lastWrite = () => writes[writes.length - 1];

const openOpp = (r, who, i = 0) => {
  goProfile(r, who);
  click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[i]);
  return r;
};

describe("Card info formatter", () => {
  /* Driven through the real UI so the assertions cover the string a user actually gets. */
  test("a graded English card reads name · set · number · finish · edition · language · grade", () => {
    setClipboard(working);
    const r = openOpp(render(), "Alex Trinh");
    press(infoBtn(r));
    eq(lastWrite(), "Charizard · Base Set · 4/102 · Holo · Unlimited · English · PSA 9",
      "the canonical identity string");
  });

  test("a Japanese card carries its language and omits absent fields", () => {
    setClipboard(working);
    const r = openOpp(render(), "Alex Trinh");
    // the Select Trade Card Details block, which holds the Japanese proposed card
    const b = byClassIn(byClass(r, "st-details")[0], "ccopy")[0].findAllByType("button")[0];
    press(b);
    const out = lastWrite();
    assert(out.includes("Espeon"), "name");
    assert(out.includes("Japanese Neo Discovery"), "set");
    assert(out.includes("Japanese"), "language");
    assert(out.includes("PSA 9"), "grade");
    assert(!out.includes("—"), "an absent printed number is dropped, not shown as a dash: " + out);
  });

  test("a raw card reads Raw plus its condition, never a grade", () => {
    setClipboard(working);
    const r = render();
    goProfile(r, "James Rivera");
    const i = byClass(r, "cp-bind").findIndex((n) => text(n).includes("Poliwrath"));
    click(byClass(r, "cp-bind-view")[i]);
    const d = byClass(r, "drawer")[0];
    press(byClassIn(d, "ccopy")[0].findAllByType("button")[0]);
    const out = lastWrite();
    eq(out, "Poliwrath · Base Set · 13/102 · Holo · Unlimited · English · Raw · Lightly Played",
      "raw identity");
  });

  test("no empty values, doubled separators or dangling separators anywhere", () => {
    setClipboard(working);
    const seen = [];
    for (const who of ["Alex Trinh", "James Rivera", "Hiro Tanaka", "Ellen Fisher"]) {
      const r = render();
      goProfile(r, who);
      byClass(r, "cp-bind-view").forEach((_, i) => {
        const rr = render();
        goProfile(rr, who);
        click(byClass(rr, "cp-bind-view")[i]);
        const b = infoBtn(rr);
        if (!b) return;
        press(b);
        seen.push(lastWrite());
      });
    }
    assert(seen.length > 5, "exercised a real spread of cards: " + seen.length);
    seen.forEach((out) => {
      assert(!/undefined|null|NaN/.test(out), "no placeholder values: " + out);
      assert(!/ · · | ·$|^· /.test(out), "no doubled or dangling separators: " + out);
      assert(!out.includes("—"), "no em-dash placeholders: " + out);
      const parts = out.split(" · ");
      eq(new Set(parts).size, parts.length, "no duplicated fields: " + out);
    });
  });

  test("the string carries no transaction or MetYet context", () => {
    setClipboard(working);
    const r = openOpp(render(), "Hiro Tanaka");
    copyBtns(r).filter((b) => b.props["aria-label"] === "Copy card information").forEach((b) => {
      press(b);
      const out = lastWrite();
      for (const banned of ["$", "%", "Market", "Trade", "Open to", "Value", "Accept",
        "listed", "agreed", "cost", "ask"]) {
        assert(!out.includes(banned), `identity only — "${banned}" must not appear: ${out}`);
      }
    });
  });

  test("no UI labels appear in the copied text", () => {
    setClipboard(working);
    const r = openOpp(render(), "Alex Trinh");
    press(infoBtn(r));
    for (const label of ["Card:", "Set:", "Grade:", "Number:", "Language:"]) {
      assert(!lastWrite().includes(label), `no "${label}" label`);
    }
  });
});

describe("Certification is a separate action", () => {
  test("the cert copy writes only the number", () => {
    setClipboard(working);
    const r = openOpp(render(), "Alex Trinh");
    press(certBtn(r));
    assert(/^\d+$/.test(lastWrite()), "digits only, got: " + lastWrite());
    assert(!lastWrite().includes("PSA"), "no grader prefix");
    assert(!/Cert|Certification|#/.test(lastWrite()), "no label");
  });

  test("the card-info string never contains the cert number", () => {
    setClipboard(working);
    const r = openOpp(render(), "Alex Trinh");
    press(certBtn(r));
    const cert = lastWrite();
    press(infoBtn(r));
    assert(!lastWrite().includes(cert), "cert must stay out of the identity string: " + lastWrite());
  });

  test("a graded copy with a cert offers the action", () => {
    const r = render();
    goProfile(r, "Alex Trinh");
    click(byClass(r, "cp-bind-view")[0]);
    assert(certBtn(r), "cert action present for a certified copy");
  });

  test("a raw copy offers no cert action", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const i = byClass(r, "cp-bind").findIndex((n) => text(n).includes("Poliwrath"));
    click(byClass(r, "cp-bind-view")[i]);
    assert(infoBtn(r), "card info is still available");
    assert(!certBtn(r), "but no cert action for a raw card");
  });

  test("a copy without a stored cert offers no cert action", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const idx = byClass(r, "cp-bind").findIndex((n) => text(n).includes("Poliwrath"));
    click(byClass(r, "cp-bind-view")[idx]);
    const d = byClass(r, "drawer")[0];
    eq(byClassIn(d, "ccopy")[0].findAllByType("button").length, 1,
      "one action only — no disabled cert button");
  });

  test("no cert action is ever rendered disabled", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    copyBtns(r).forEach((b) => assert(!b.props.disabled, "copy actions are never disabled placeholders"));
  });
});

describe("Clipboard behaviour", () => {
  test("a successful copy confirms through the existing toast", async () => {
    setClipboard(working);
    const r = openOpp(render(), "Alex Trinh");
    // the toast follows the clipboard promise, so let it settle
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    assert(allText(r).includes("Card information copied"), "identity toast");
    await TR.act(async () => { certBtn(r).props.onClick(); });
    assert(allText(r).includes("PSA certification copied"), "cert toast");
  });

  test("a rejected clipboard write fails gracefully", async () => {
    setClipboard(failing);
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    assert(allText(r).includes("Couldn't copy"), "a quiet error toast, not a crash");
    assert(byClass(r, "vt-wrap").length > 0, "the workspace is still rendered");
  });

  test("an unavailable clipboard API does not throw", async () => {
    setClipboard(noClipboard);
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    assert(allText(r).includes("Couldn't copy"), "handled gracefully");
    setClipboard(working);
  });
});

describe("Accessibility and restraint", () => {
  test("every copy action is a real button with an accessible label", () => {
    const r = openOpp(render(), "Alex Trinh");
    copyBtns(r).forEach((b) => {
      eq(b.type, "button", "a real button, not a clickable span");
      assert(b.props["aria-label"], "accessible label");
      assert(b.props.title, "and a tooltip");
    });
  });

  test("the labels are the specified wording", () => {
    const r = openOpp(render(), "Alex Trinh");
    const labels = copyBtns(r).map((b) => b.props["aria-label"]);
    assert(labels.includes("Copy card information"), "identity label");
    assert(labels.includes("Copy PSA certification number"), "cert label");
  });

  test("the actions stay visually quiet", () => {
    const r = openOpp(render(), "Alex Trinh");
    copyBtns(r).forEach((b) => {
      const cn = String(b.props.className);
      assert(cn.includes("sm"), "small treatment");
      assert(!cn.includes("pri"), "never a primary action");
      assert(!cn.includes("dgr"), "never a destructive one");
    });
  });

  test("no external search or integration affordances were added", () => {
    // scoped to the workspace: the app's font import legitimately contains a URL
    const t = text(byClass(openOpp(render(), "Hiro Tanaka"), "vt-wrap")[0]);
    for (const banned of ["eBay", "Card Ladder", "Search PSA", "Open Google", "http"]) {
      assert(!t.includes(banned), `MetYet stays tool-agnostic — "${banned}" must not appear`);
    }
  });
});

describe("Surface coverage", () => {
  test("Select Trade Card Details carries the actions", () => {
    const r = openOpp(render(), "Alex Trinh");
    const details = byClass(r, "st-details")[0];
    assert(details, "the Card Details area");
    assert(byClassIn(details, "ccopy").length === 1, "copy actions sit with the identity");
    const t = text(details);
    for (const banned of ["Market Value", "Trade %", "Trade Value"]) {
      assert(!t.includes(banned), `no financial data reintroduced: ${banned}`);
    }
  });

  test("Value Trade market review carries the actions", () => {
    const r = openOpp(render(), "Hiro Tanaka");
    const copy = byClass(r, "vt-mkt-copy")[0];
    assert(copy, "the copy panel");
    eq(byClassIn(copy, "ccopy").length, 1, "available while negotiating market value");
  });

  test("Trade Binder copy inspection carries the actions", () => {
    const r = render();
    goProfile(r, "Alex Trinh");
    click(byClass(r, "cp-bind-view")[0]);
    const d = byClass(r, "drawer")[0];
    eq(byClassIn(d, "ccopy").length, 1, "available where the copy is inspected");
  });

  test("the photo lightbox carries the actions", () => {
    const r = render();
    goProfile(r, "Alex Trinh");
    click(byClass(r, "cp-bind-view")[0]);
    click(byClass(r, "copyph-btn")[0]);
    eq(byClassIn(byClass(r, "modal")[0], "ccopy").length, 1, "available while inspecting the slab");
  });

  test("the opportunity target card carries the actions", () => {
    const r = openOpp(render(), "Alex Trinh");
    const top = byClass(r, "ws-top")[0];
    assert(top, "the workspace header");
    eq(byClassIn(top, "ccopy").length, 1, "available for the target card");
  });

  test("Inventory card detail carries the actions", () => {
    const r = render();
    click(btnExact(r, "Inventory37"));
    const link = byClass(r, "link").find((b) => /#\d/.test(text(b)));
    assert(link, "an inventory row opens a detail surface");
    click(link);
    const d = byClass(r, "drawer")[0] || byClass(r, "modal")[0];
    assert(d, "the detail surface opened");
    assert(byClassIn(d, "ccopy").length >= 1, "copy actions are available there");
  });

  test("compact rows are not cluttered with duplicate actions", () => {
    const r = render();
    goProfile(r, "Ellen Fisher");
    eq(byClassIn(byClass(r, "cp-bind-grid")[0], "ccopy").length, 0,
      "the binder grid stays browsable; the actions live in the inspection drawer");
  });
});

describe("Copying changes nothing", () => {
  test("copying does not alter tpInterest or binder counts", () => {
    setClipboard(working);
    const r = render();
    goProfile(r, "James Rivera");
    const before = byClass(r, "cp-bind-x").map((b) => b.props["aria-pressed"]).join(",");
    const count = byClass(r, "cp-bind").length;
    click(byClass(r, "cp-bind-view")[0]);
    press(infoBtn(r));
    click(btns(r, "").find((b) => b.props["aria-label"] === "Close"));
    eq(byClass(r, "cp-bind-x").map((b) => b.props["aria-pressed"]).join(","), before, "tpInterest untouched");
    eq(byClass(r, "cp-bind").length, count, "no cards added or removed");
  });

  test("copying does not accept or reject a proposed card", () => {
    setClipboard(working);
    const r = openOpp(render(), "Alex Trinh");
    const before = byClass(r, "st-card").length;
    press(infoBtn(r));
    press(certBtn(r));
    eq(byClass(r, "st-card").length, before, "the card is still awaiting a decision");
    assert(text(byClass(r, "st-card")[0]).includes("Would you accept"), "decision still open");
  });

  test("copying during negotiation preserves the counter inputs", () => {
    setClipboard(working);
    const r = openOpp(render(), "Hiro Tanaka");
    const mkt = () => byClass(r, "pn").filter((n) =>
      /market value|Opening market/.test(text(n)) && !/trade %/i.test(text(n)))[0];
    TR.act(() => { mkt().findAllByType("input")[0].props.onChange({ target: { value: "123" } }); });
    click(byClassIn(mkt(), "pn-send")[0]);
    TR.act(() => { mkt().findAllByType("input")[0].props.onChange({ target: { value: "98" } }); });
    const before = mkt().findAllByType("input").map((i) => i.props.value).join("|");
    const copy = byClassIn(byClass(r, "vt-mkt-copy")[0], "ccopy")[0];
    press(copy.findAllByType("button")[0]);
    eq(mkt().findAllByType("input").map((i) => i.props.value).join("|"), before,
      "the amount and its percentage are intact");
  });

  test("copying does not advance a stage or change ownership", () => {
    setClipboard(working);
    const r = openOpp(render(), "Alex Trinh");
    const before = text(byClass(r, "vt-wrap")[0]);
    press(infoBtn(r));
    press(certBtn(r));
    eq(text(byClass(r, "vt-wrap")[0]), before, "the whole surface is unchanged");
  });
});

describe("Clipboard robustness", () => {
  test("A. the modern API is used when available, and the fallback is not", async () => {
    installDom();
    setClipboard(working);
    writes.length = 0;
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    eq(writes.length, 1, "the Clipboard API received the write");
    eq(writes[0], "Charizard · Base Set · 4/102 · Holo · Unlimited · English · PSA 9", "exact text");
    eq(dom.execCalls, 0, "the legacy path was not touched");
    eq(dom.created.length, 0, "no scratch element was created");
    assert(allText(r).includes("Card information copied"), "success toast");
  });

  test("B. with no Clipboard API the fallback copies the exact text", async () => {
    installDom();
    setClipboard(noClipboard);
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    eq(dom.execCalls, 1, "execCommand('copy') ran");
    eq(dom.created.length, 1, "one scratch textarea");
    eq(dom.created[0].value, "Charizard · Base Set · 4/102 · Holo · Unlimited · English · PSA 9",
      "carrying the exact identity string");
    eq(dom.selected[0], dom.created[0].value, "its full contents were selected");
    assert(dom.created[0].focused, "and focused");
    eq(dom.created[0].attrs.readonly, "", "readonly, so no mobile keyboard opens");
    assert(allText(r).includes("Card information copied"), "success toast from the fallback");
  });

  test("B. the fallback does not disturb layout or scroll", async () => {
    installDom();
    setClipboard(noClipboard);
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    const st = dom.created[0].style;
    eq(st.position, "fixed", "fixed, so nothing reflows");
    eq(st.opacity, "0", "invisible");
    eq(st.pointerEvents, "none", "and not interactive");
  });

  test("C. a rejecting Clipboard API falls through to the legacy path", async () => {
    installDom();
    setClipboard(failing);
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    eq(dom.execCalls, 1, "the fallback ran after the rejection");
    assert(allText(r).includes("Card information copied"), "and the user sees success");
  });

  test("D. only when both paths fail does the failure toast appear", async () => {
    installDom();
    dom.execResult = false;
    setClipboard(failing);
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    assert(allText(r).includes("Couldn't copy"), "the failure toast");
    assert(!allText(r).includes("Card information copied"), "and not a false success");
    dom.execResult = true;
  });

  test("D. a total failure raises nothing and leaves the app intact", async () => {
    removeDom();
    setClipboard(noClipboard);
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    assert(allText(r).includes("Couldn't copy"), "handled, not thrown");
    assert(byClass(r, "vt-wrap").length > 0, "the workspace still renders");
  });

  test("D. no browser error text is ever surfaced", async () => {
    installDom();
    dom.execResult = false;
    setClipboard(failing);
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    for (const leak of ["denied", "NotAllowed", "Error", "undefined"]) {
      assert(!allText(r).includes(leak), `no raw browser error surfaced: ${leak}`);
    }
    dom.execResult = true;
  });

  test("E. the cert copy takes the same fallback and stays a bare number", async () => {
    installDom();
    setClipboard(noClipboard);
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { certBtn(r).props.onClick(); });
    eq(dom.created[0].value, "71230068", "only the number, no prefix or label");
    assert(allText(r).includes("PSA certification copied"), "cert toast");
  });

  test("F. the scratch element is removed after a successful fallback", async () => {
    installDom();
    setClipboard(noClipboard);
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    eq(dom.attached.length, 0, "nothing left attached to the document");
    eq(dom.created[0].parentNode, null, "and it was detached");
  });

  test("F. the scratch element is removed after a failed fallback", async () => {
    installDom();
    dom.execResult = false;
    setClipboard(noClipboard);
    const r = openOpp(render(), "Alex Trinh");
    await TR.act(async () => { infoBtn(r).props.onClick(); });
    eq(dom.attached.length, 0, "cleaned up on the failure path too");
    dom.execResult = true;
  });

  test("the copy happens inline, with nothing scheduled first", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const fn = src.slice(src.indexOf("const copyText = (text) =>"), src.indexOf("/* Clipboard convenience"));
    for (const delay of ["setTimeout", "requestAnimationFrame", "setInterval", "queueMicrotask"]) {
      assert(!fn.includes(delay), `user activation must not be deferred via ${delay}`);
    }
  });

  test("restore a working clipboard for the remaining suites", () => {
    installDom();
    setClipboard(working);
    assert(true);
  });
});

/* ---- compact rollout: Inventory, goals, Cultivate ---------------------------- */
const inventory = (r) => { click(btnExact(r, "Inventory37")); return r; };
const cultivate = (r) => { inventory(r); click(btns(r, "Cultivate")[0]); return r; };
const actionsIn = (node) => byClassIn(node, "ccopy").flatMap((n) => n.findAllByType("button"));
const labelsIn = (node) => actionsIn(node).map((b) => b.props["aria-label"]);

describe("Inventory rows — compact Card Info", () => {
  test("every row carries exactly one copy action", () => {
    const r = inventory(render());
    const rows = byClass(r, "inv-row");
    eq(rows.length, 37, "the full seeded inventory");
    const counts = [...new Set(rows.map((n) => actionsIn(n).length))];
    eq(counts.join(","), "1", "one affordance per row, never a toolbar");
  });

  test("no row offers a PSA cert copy, even where the copy has a cert", () => {
    const r = inventory(render());
    byClass(r, "inv-row").forEach((n) => {
      eq(labelsIn(n).join(","), "Copy card information", "identity only on the row");
    });
  });

  test("the row action is icon-only, with no visible label text", () => {
    const r = inventory(render());
    const b = actionsIn(byClass(r, "inv-row")[0])[0];
    eq(text(b).trim(), "", "icon only");
    eq(b.type, "button", "a real button");
    assert(b.props.title, "with a tooltip");
  });

  test("clicking copies the exact canonical identity", async () => {
    installDom(); setClipboard(working);
    const r = inventory(render());
    const row = byClass(r, "inv-row").find((n) => text(n).includes("Charizard — Base Set #4/102"));
    assert(row, "a known row");
    writes.length = 0;
    await TR.act(async () => { actionsIn(row)[0].props.onClick(); });
    assert(/^Charizard · Base Set · 4\/102 · /.test(writes[0]), "canonical string: " + writes[0]);
    assert(!/\d{7,}/.test(writes[0]), "no cert number in the identity");
  });

  test("CardDrawer still owns the full actions including cert", () => {
    const r = inventory(render());
    const link = byClass(r, "link").find((b) => /#\d/.test(text(b)));
    click(link);
    const d = byClass(r, "drawer")[0];
    assert(d, "the drawer opened");
    const labels = labelsIn(d);
    assert(labels.includes("Copy card information"), "identity action");
    assert(labels.includes("Copy PSA certification number"), "and cert, where the slab is inspected");
  });
});

describe("Goal cards — compact Card Info", () => {
  test("primary and secondary goal cards each carry one copy action", () => {
    const r = render();
    goProfile(r, "Alex Trinh");
    const cards = byClass(r, "gc");
    assert(cards.length > 0, "goal cards render");
    cards.forEach((n) => eq(actionsIn(n).length, 1, "one action per goal card"));
  });

  test("goal cards never offer a cert copy", () => {
    const r = render();
    goProfile(r, "Alex Trinh");
    byClass(r, "gc").forEach((n) =>
      eq(labelsIn(n).join(","), "Copy card information", "a goal is an identity, not a slab"));
  });

  test("secondary goals get the same treatment behind their disclosure", () => {
    const r = render();
    goProfile(r, "James Rivera");
    const sec = btns(r, "Secondary Goals")[0];
    if (sec) click(sec);
    const cards = byClass(r, "gc");
    const secondary = cards.filter((n) => String(n.props.className).includes("sec"));
    if (!secondary.length) return;
    secondary.forEach((n) => {
      eq(actionsIn(n).length, 1, "one action");
      eq(labelsIn(n).join(","), "Copy card information", "no cert");
    });
  });

  test("copying a goal card yields that goal's identity", async () => {
    installDom(); setClipboard(working);
    const r = render();
    goProfile(r, "Alex Trinh");
    const card0 = byClass(r, "gc")[0];
    const name = text(byClassIn(card0, "gc-name")[0]).trim();
    writes.length = 0;
    await TR.act(async () => { actionsIn(card0)[0].props.onClick(); });
    assert(writes[0].startsWith(name), `copied "${writes[0]}" for goal "${name}"`);
  });

  test("existing goal actions and the tier distinction are unchanged", () => {
    const r = render();
    goProfile(r, "Alex Trinh");
    assert(btns(r, "Reach out").length > 0, "Reach out preserved");
    const cards = byClass(r, "gc");
    assert(cards.some((n) => !String(n.props.className).includes("sec")), "primary styling preserved");
  });
});

describe("Cultivate rows — compact Card Info", () => {
  test("every gap row carries exactly one copy action", () => {
    const r = cultivate(render());
    const rows = byClass(r, "cv-row");
    assert(rows.length > 0, "gap rows render");
    rows.forEach((n) => eq(actionsIn(n).length, 1, "one action per row"));
  });

  test("no cert action, because no physical copy exists here", () => {
    const r = cultivate(render());
    byClass(r, "cv-row").forEach((n) =>
      eq(labelsIn(n).join(","), "Copy card information", "identity only"));
  });

  test("copying yields the surfaced card's identity", async () => {
    installDom(); setClipboard(working);
    const r = cultivate(render());
    const row = byClass(r, "cv-row")[0];
    const title = text(byClassIn(row, "cv-t")[0]);
    writes.length = 0;
    await TR.act(async () => { actionsIn(row)[0].props.onClick(); });
    const name = writes[0].split(" · ")[0];
    assert(title.includes(name), `copied "${writes[0]}" matches the row "${title}"`);
  });

  test("ranking and navigation are unchanged", () => {
    const r = cultivate(render());
    const ranks = byClass(r, "cv-rank").map(text);
    eq(ranks.join(","), ranks.map((_, i) => i + 1).join(","), "rank order intact");
  });

  test("no external search affordances were added", () => {
    const t = text(byClass(cultivate(render()), "cv-row")[0]);
    for (const banned of ["eBay", "Card Ladder", "Find comps", "Search"]) {
      assert(!t.includes(banned), `stays tool-agnostic — no "${banned}"`);
    }
  });
});

describe("The rollout stayed disciplined", () => {
  test("Trade Binder tiles still carry no copy action", () => {
    const r = render();
    goProfile(r, "Ellen Fisher");
    eq(byClass(r, "cp-bind").flatMap((n) => byClassIn(n, "ccopy")).length, 0,
      "the scalable grid is untouched");
  });

  test("the Value Trade evidence panel did not gain a duplicate action", () => {
    const r = render();
    goProfile(r, "Hiro Tanaka");
    click(btns(r, "Open").filter((b) => text(b).trim() === "Open")[0]);
    const expand = byClass(r, "tbl")[0].findAllByType("button").find((b) => text(b).trim() === "+");
    if (expand) click(expand);
    const ev = byClass(r, "vt-evidence")[0];
    if (ev) eq(byClassIn(ev, "ccopy").length, 0, "capability already reachable elsewhere");
  });

  test("Deal and Fulfillment carry no copy actions", () => {
    for (const [who, i] of [["Nina Alvarez", 0], ["Casey Lin", 1]]) {
      const r = render();
      goProfile(r, who);
      const opens = btns(r, "Open").filter((b) => text(b).trim() === "Open");
      if (!opens[i]) continue;
      click(opens[i]);
      const ws = byClass(r, "ws-stagework")[0];
      if (ws) eq(byClassIn(ws, "ccopy").length, 0, who + ": settled stages need no research");
    }
  });

  test("Add Inventory search results carry no copy action", () => {
    const r = inventory(render());
    click(btn(r, "Add card"));
    const m = byClass(r, "modal")[0];
    TR.act(() => { m.findAllByType("input")[0].props.onChange({ target: { value: "Charizard" } }); });
    eq(byClassIn(byClass(r, "modal")[0], "ccopy").length, 0, "selection, not research");
  });

  test("the existing DIRECT surfaces all remain", () => {
    // Select Trade
    const a = render(); goProfile(a, "Alex Trinh");
    click(btns(a, "Open").filter((b) => text(b).trim() === "Open")[0]);
    assert(byClassIn(byClass(a, "st-details")[0], "ccopy").length === 1, "Select Trade Card Details");
    assert(byClassIn(byClass(a, "ws-top")[0], "ccopy").length === 1, "opportunity target card");
    // Value Trade market review
    const b = render(); goProfile(b, "Hiro Tanaka");
    click(btns(b, "Open").filter((x) => text(x).trim() === "Open")[0]);
    eq(byClassIn(byClass(b, "vt-mkt-copy")[0], "ccopy").length, 1, "Value Trade market review");
    // Trade Binder copy drawer
    const d = render(); goProfile(d, "Alex Trinh");
    click(byClass(d, "cp-bind-view")[0]);
    eq(byClassIn(byClass(d, "drawer")[0], "ccopy").length, 1, "binder copy drawer");
  });
});

describe("Compact copy changes nothing", () => {
  test("copying from an inventory row does not modify inventory", async () => {
    installDom(); setClipboard(working);
    const r = inventory(render());
    const before = byClass(r, "inv-row").length;
    const snapshot = text(byClass(r, "inv-row")[0]);
    await TR.act(async () => { actionsIn(byClass(r, "inv-row")[0])[0].props.onClick(); });
    eq(byClass(r, "inv-row").length, before, "no rows added or removed");
    eq(text(byClass(r, "inv-row")[0]), snapshot, "the row is untouched");
  });

  test("copying from a goal card does not change goals or tpInterest", async () => {
    installDom(); setClipboard(working);
    const r = render();
    goProfile(r, "James Rivera");
    const goalsBefore = byClass(r, "gc").length;
    const flags = byClass(r, "cp-bind-x").map((b) => b.props["aria-pressed"]).join(",");
    await TR.act(async () => { actionsIn(byClass(r, "gc")[0])[0].props.onClick(); });
    eq(byClass(r, "gc").length, goalsBefore, "goals unchanged");
    eq(byClass(r, "cp-bind-x").map((b) => b.props["aria-pressed"]).join(","), flags, "tpInterest unchanged");
  });

  test("copying from Cultivate does not change its ranking", async () => {
    installDom(); setClipboard(working);
    const r = cultivate(render());
    const before = byClass(r, "cv-row").map((n) => text(byClassIn(n, "cv-t")[0])).join("|");
    await TR.act(async () => { actionsIn(byClass(r, "cv-row")[0])[0].props.onClick(); });
    eq(byClass(r, "cv-row").map((n) => text(byClassIn(n, "cv-t")[0])).join("|"), before,
      "ranking and order intact");
  });
});

require("./run.cjs").run();
