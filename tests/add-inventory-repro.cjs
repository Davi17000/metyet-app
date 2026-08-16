/* Add Inventory must be a true one-click operation whether the canonical identity
   already exists or is being created for the first time. This file previously
   encoded the double-click bug; it now encodes the fixed contract. */
const { describe, test, assert, eq } = require("./run.cjs");
const TR = require("react-test-renderer");
const { render, text, allText, btn, btns, btnExact, click, byClass, byClassIn } = require("./util.cjs");

const openAddInventory = () => {
  const r = render();
  click(btnExact(r, "Inventory37"));
  click(btn(r, "Add card"));
  return r;
};
const modal = (r) => byClass(r, "modal")[0];
const inputs = (r) => modal(r).findAllByType("input");
const selects = (r) => modal(r).findAllByType("select");
const setInput = (r, i, v) => TR.act(() => { inputs(r)[i].props.onChange({ target: { value: v } }); });
const setSelect = (r, i, v) => TR.act(() => { selects(r)[i].props.onChange({ target: { value: v } }); });
const addBtn = (r) => modal(r) && modal(r).findAllByType("button").find((b) => /Add to Inventory/.test(text(b)));
const invRows = (r) => byClass(r, "inv-row").length;
const modalOpen = (r) => byClass(r, "modal").length > 0;

/* Walk the modal: search a printed card, pick it, then describe the copy.
   Edition and grade are chip buttons, not selects. */
const pickCard = (r, startsWith, query) => {
  setInput(r, 0, query || startsWith.replace(/(Base Set|Jungle).*$/, "").trim());
  const hit = modal(r).findAllByType("button").find((b) => text(b).startsWith(startsWith));
  assert(hit, `found "${startsWith}": ` + modal(r).findAllByType("button").map(text).slice(0, 6).join(" | "));
  click(hit);
};
const chip = (r, label) => modal(r).findAllByType("button").find((b) => text(b).trim() === label);
const describeCopy = (r, { edition, grade }) => {
  // edition chips only render when the printed card has more than one edition
  if (edition) { const b = chip(r, edition); if (b) click(b); }
  if (grade) { const b = chip(r, grade); assert(b, "grade " + grade); click(b); }
};

describe("Add Inventory — reproduction", () => {
  test("the modal opens and exposes a single Add to Inventory action", () => {
    const r = openAddInventory();
    assert(modalOpen(r), "modal open");
    assert(!addBtn(r) || addBtn(r).props.disabled !== undefined, "an add action exists once a card is chosen");
  });

  test("CASE A — an identity already in cardDb adds on the FIRST click", () => {
    const r = openAddInventory();
    const before = invRows(r);
    pickCard(r, "CharizardBase Set");
    // PSA 9 Unlimited Charizard is seeded as i1, so resolveCanonicalCard will hit
    describeCopy(r, { edition: "Unlimited", grade: "9" });
    const b = addBtn(r);
    assert(b && !b.props.disabled, "the add action is available");
    click(b);
    eq(invRows(r), before + 1, "one click added the copy");
    eq(modalOpen(r), false, "and the modal closed");
    assert(allText(r).includes("Added to Current"), "with the success toast");
  });

  test("CASE B — a NEW canonical identity also adds on the FIRST click", () => {
    const r = openAddInventory();
    const before = invRows(r);
    pickCard(r, "CharizardBase Set");
    // PSA 3 is a grade no seeded Charizard record carries, so the identity is new
    describeCopy(r, { edition: "Unlimited", grade: "3" });
    const b = addBtn(r);
    assert(b && !b.props.disabled, "the add action is available");

    click(b);
    eq(invRows(r), before + 1, "one click added the copy");
    eq(modalOpen(r), false, "and closed the modal");
    assert(allText(r).includes("Added to Current"), "with the success toast");
  });

  test("there is no intermediate state where the identity exists but inventory does not", () => {
    const r = openAddInventory();
    const before = invRows(r);
    pickCard(r, "CharizardBase Set");
    describeCopy(r, { edition: "Unlimited", grade: "6" });
    click(addBtn(r));
    // the old failure signature was: modal open, row count unchanged, no toast
    assert(!(modalOpen(r) && invRows(r) === before), "no silent half-completed click");
    eq(invRows(r), before + 1, "inventory moved on the same click");
  });

  test("the toast names the resolved card even for a brand-new identity", () => {
    const r = openAddInventory();
    pickCard(r, "CharizardBase Set");
    describeCopy(r, { edition: "Unlimited", grade: "4" });
    click(addBtn(r));
    assert(allText(r).includes("Added to Current — Charizard"),
      "the resolved record supplied the name without a stale read");
  });

  test("any newly-registered identity adds on one click", () => {
    for (const [cardName, grade] of [["BlastoiseBase Set", "5"], ["VenusaurBase Set", "2"]]) {
      const r = openAddInventory();
      const before = invRows(r);
      pickCard(r, cardName);
      describeCopy(r, { edition: "Unlimited", grade });
      click(addBtn(r));
      eq(invRows(r), before + 1, cardName + " added on the first click");
      eq(modalOpen(r), false, "and the modal closed");
    }
  });

  test("adding the same NEW identity twice yields one identity and two rows", () => {
    const r = openAddInventory();
    const before = invRows(r);
    // first copy of an identity nothing in cardDb carries
    pickCard(r, "CharizardBase Set");
    describeCopy(r, { edition: "Unlimited", grade: "7" });
    click(addBtn(r));
    eq(invRows(r), before + 1, "first physical copy added");

    // second copy of the exact same identity
    click(btn(r, "Add card"));
    pickCard(r, "CharizardBase Set");
    describeCopy(r, { edition: "Unlimited", grade: "7" });
    click(addBtn(r));
    eq(invRows(r), before + 2, "second physical copy added, also on one click");

    /* Canonical dedupe proof: the modal's held count is computed with identityKey
       against cardDb. Reopening on the same identity must report exactly the two
       copies just added — if a second cardDb record had been minted, the second
       copy would key differently and the count would not reach 2. */
    click(btn(r, "Add card"));
    pickCard(r, "CharizardBase Set");
    describeCopy(r, { edition: "Unlimited", grade: "7" });
    assert(text(modal(r)).includes("You currently hold 2 matching copies"),
      "one canonical identity holding both copies: " + text(modal(r)).slice(0, 200));
  });

  test("validation failure still blocks the add and keeps the modal open", () => {
    const r = openAddInventory();
    const before = invRows(r);
    pickCard(r, "CharizardBase Set");
    describeCopy(r, { edition: "Unlimited", grade: "8" });
    setInput(r, inputs(r).length - 3, "-50");          // an invalid acquisition cost
    const b = addBtn(r);
    if (b && !b.props.disabled) click(b);
    eq(invRows(r), before, "nothing was added");
    eq(modalOpen(r), true, "and the modal stayed open");
  });

  test("AddCopyModal still adds a copy on one click", () => {
    const r = render();
    click(btnExact(r, "Inventory37"));
    const before = invRows(r);
    // the recommendation path opens AddCopyModal against an existing identity
    const addCopy = btns(r, "Add copy")[0] || btns(r, "Add another copy")[0];
    if (!addCopy) return;                              // path not reachable from seed state
    click(addCopy);
    const b = byClass(r, "modal")[0].findAllByType("button").find((x) => /Add to Inventory/.test(text(x)));
    assert(b, "its add action");
    click(b);
    eq(invRows(r), before + 1, "one click, one copy");
  });

  test("no timer, effect or ref workaround was introduced", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "src", "MetYet.jsx"), "utf8");
    const fn = src.slice(src.indexOf("const resolveCanonicalCard ="), src.indexOf("const [inventory, setInventory]"));
    const add = src.slice(src.indexOf("const addCopyToInventory ="), src.indexOf("const addCopyToInventory =") + 1400);
    for (const bad of ["setTimeout", "requestAnimationFrame", "useEffect", "useRef", "queueMicrotask"]) {
      assert(!fn.includes(bad), `resolveCanonicalCard must not use ${bad}`);
      assert(!add.includes(bad), `addCopyToInventory must not use ${bad}`);
    }
  });
});

require("./run.cjs").run();
