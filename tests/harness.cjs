const React = require("react");
const TR = require("react-test-renderer");
const MetYet = require("../dist/MetYet.cjs").default;

function render() {
  let r;
  TR.act(() => { r = TR.create(React.createElement(MetYet)); });
  return r;
}

// collect visible text of a node tree
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node.children) return node.children.map(textOf).join("");
  return "";
}
const allText = (r) => textOf(r.toJSON());

function buttons(r) { return r.root.findAllByType("button"); }

function findButton(r, matcher) {
  const m = typeof matcher === "string" ? (t) => t.includes(matcher) : matcher;
  return buttons(r).find((b) => m(textOf(b.children.map((c) => (typeof c === "object" && c.children ? { children: c.children } : c)))
    || m(textOf({ children: b.children }))));
}

// simpler: text of an instance
function instText(inst) {
  const json = inst.toJSON ? inst.toJSON() : null;
  return textOf(reactInstToJson(inst));
}
function reactInstToJson(inst) {
  // walk rendered output
  const out = [];
  const walk = (i) => {
    for (const c of i.children) {
      if (typeof c === "string" || typeof c === "number") out.push(String(c));
      else walk(c);
    }
  };
  walk(inst);
  return out.join("");
}

function btnByText(r, needle) {
  return buttons(r).filter((b) => reactInstToJson(b).includes(needle));
}

function click(inst) {
  TR.act(() => { inst.props.onClick({ stopPropagation() {}, preventDefault() {} }); });
}

module.exports = { React, TR, MetYet, render, allText, buttons, btnByText, click, reactInstToJson, textOf };
