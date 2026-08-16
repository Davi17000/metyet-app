const React = require("react");
const TR = require("react-test-renderer");
const MetYet = require("../dist/MetYet.cjs").default;

function render() {
  let r;
  TR.act(() => { r = TR.create(React.createElement(MetYet)); });
  return r;
}
function text(inst) {
  const out = [];
  const walk = (i) => {
    for (const c of i.children || []) {
      if (typeof c === "string" || typeof c === "number") out.push(String(c));
      else walk(c);
    }
  };
  walk(inst);
  return out.join("");
}
const allText = (r) => text(r.root);
const buttons = (r) => r.root.findAllByType("button");
const btns = (r, needle) => buttons(r).filter((b) => text(b).includes(needle));
const btn = (r, needle) => {
  const m = btns(r, needle);
  if (!m.length) throw new Error(`no button matching "${needle}"`);
  return m[0];
};
const btnExact = (r, label) => {
  const m = buttons(r).filter((b) => text(b).trim() === label);
  if (!m.length) throw new Error(`no button with exact text "${label}"`);
  return m[0];
};
const click = (inst) => TR.act(() => { inst.props.onClick({ stopPropagation() {}, preventDefault() {} }); });

// find rendered elements by className token
function byClass(r, cls) {
  const root = r.root || r;
  return root.findAll((n) => typeof n.type === "string"
    && typeof n.props.className === "string"
    && n.props.className.split(/\s+/).includes(cls), { deep: true });
}

/* The binder heading now carries two derived numbers, so tests read them from the
   rendered spans rather than matching one concatenated string. */
function binderCounts(r) {
  const head = byClass(r, "cp-sec-h").find((n) => text(n).startsWith("Trade Binder"));
  if (!head) return null;
  const total = Number(text(byClass(head, "mono").filter((n) => !n.props.className.includes("cp-bind-open"))[0] || { children: ["NaN"] }));
  const openEl = byClass(head, "cp-bind-open")[0];
  return { total, open: openEl ? Number(text(byClass(openEl, "mono")[0])) : null, raw: text(head) };
}
function byClassIn(node, cls) {
  return node.findAll((n) => typeof n.type === "string"
    && typeof n.props.className === "string"
    && n.props.className.split(/\s+/).includes(cls), { deep: true });
}

function goProfile(r, name) {
  click(btn(r, "Collector Network"));
  click(btnExact(r, name));
  return r;
}
module.exports = { React, TR, render, text, allText, buttons, btns, btn, btnExact, click, byClass, byClassIn, binderCounts, goProfile };
