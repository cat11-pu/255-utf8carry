// ui.js：操作面板与视图（原生 DOM，无弹窗）
import { render } from "./app.js";

export function mount(spec, parts) {
  parts.log.textContent = "块 " + (spec.blocks || []).length + " 个，本轮字节预算 " + (spec.budget || 0) + " 字节。";

  function draw() {
    let view = null;
    try {
      view = render(spec);
    } catch (error) {
      parts.out.textContent = String(error && error.code ? error.code : error);
      parts.log.textContent = "跑不动：" + String(error && error.message ? error.message : error);
      return;
    }
    parts.out.textContent = JSON.stringify(view, null, 1);
    parts.stage.textContent = "";
    (view.pending || []).forEach(function (id) {
      const row = document.createElement("div");
      row.className = "row";
      const head = document.createElement("span");
      head.textContent = "块 " + id + " 压在账上";
      row.appendChild(head);
      const chip = document.createElement("span");
      chip.className = "chip warn";
      chip.textContent = "等收尾";
      row.appendChild(chip);
      parts.stage.appendChild(row);
    });
    const line = document.createElement("div");
    line.className = "row";
    const text = document.createElement("span");
    text.textContent = "收尾后文本 " + view.text;
    line.appendChild(text);
    const chip = document.createElement("span");
    chip.className = "chip " + (view.carry_after === 0 ? "ok" : "bad");
    chip.textContent = "残字节 " + view.carry_after;
    line.appendChild(chip);
    parts.stage.appendChild(line);
    parts.legend.textContent = "首轮消费 " + view.used_first + " 字节，二档 " + view.used_wide
      + " 字节，首轮解出 " + view.chars + " 个字符，收尾补齐 " + view.catchup
      + " 块、解出 " + view.chars_catch + " 个字符";
    parts.log.textContent = "工作计数 " + view.judged + " / 上界 " + view.judged_bound
      + "，重放新增字符 " + view.replay_new + "，与全量对照差异 " + view.full_diff;
  }

  const budgetInput = document.createElement("input");
  budgetInput.type = "number";
  budgetInput.value = "5";
  parts.controls.appendChild(budgetInput);

  const runButton = document.createElement("button");
  runButton.className = "primary";
  runButton.textContent = "跑一遍";
  runButton.addEventListener("click", draw);
  parts.controls.appendChild(runButton);

  const budgetButton = document.createElement("button");
  budgetButton.textContent = "把字节预算换成输入框的值";
  budgetButton.addEventListener("click", function () {
    const next = Number(budgetInput.value);
    spec.budget = Number.isFinite(next) ? Math.max(1, Math.round(next)) : 1;
    draw();
  });
  parts.controls.appendChild(budgetButton);

  const dropButton = document.createElement("button");
  dropButton.textContent = "删最后一个块";
  dropButton.addEventListener("click", function () {
    spec.blocks = (spec.blocks || []).slice(0, Math.max(0, (spec.blocks || []).length - 1));
    draw();
  });
  parts.controls.appendChild(dropButton);

  draw();
}
