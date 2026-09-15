/* ============================================================================
   ASKING A PERSON FOR A SECRET, AT A TERMINAL

     await askSecret("code:        ")   -> what they typed, trimmed

   Two operator commands need a credential from the person running them — the
   sign-in code, and the invitation credential — and neither may take it as an
   argument. An argument is in shell history and in `ps` output for every other
   process on the machine for as long as the command runs, which is the whole
   reason these prompts exist.

   SO: TYPED, NOT PIPED. A terminal is REQUIRED. No TTY means something is
   feeding it in — a file, a heredoc, a pipeline written in a shell — and every
   one of those is the thing being avoided, so it fails rather than quietly
   working. That is not an inconvenience to route around; it is the guarantee.

   AND NOT ECHOED. readline is given a sink instead of the real output, so
   nothing reaches the screen, the scrollback, a screen share or a screenshot.
   The label is written directly to the output first, so there is still a prompt
   to answer.

   One module, because two commands doing this slightly differently is how one
   of them ends up echoing.
   ========================================================================== */

const readline = require("readline");
const { Writable } = require("stream");

function askSecret(label, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) {
    return Promise.reject(new Error("that has to be typed at a terminal. Piping it in would put it "
      + "in a file or a shell history, which is what this avoids."));
  }
  return new Promise((resolve, reject) => {
    const muted = new Writable({ write(chunk, encoding, done) { done(); } });
    const rl = readline.createInterface({ input, output: muted, terminal: true });
    output.write(label);
    rl.question("", (answer) => { rl.close(); output.write("\n"); resolve(String(answer).trim()); });
    rl.on("error", reject);
  });
}

module.exports = { askSecret };
