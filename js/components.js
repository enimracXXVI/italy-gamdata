// js/components.js — filter bar controls (multi-select, date range, segmented
// toggle). Standard UI, not chart marks, per the dataviz interaction rules:
// one row, date range first, everything else scopes what's below it.

let openPopoverCloser = null;

function attachPopover(trigger, popover) {
  function close() {
    popover.hidden = true;
    trigger.classList.remove("filter-trigger--active");
    if (openPopoverCloser === close) openPopoverCloser = null;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }
  function onOutside(evt) {
    if (!popover.contains(evt.target) && !trigger.contains(evt.target)) close();
  }
  function onKey(evt) { if (evt.key === "Escape") close(); }
  function open() {
    if (openPopoverCloser) openPopoverCloser();
    popover.hidden = false;
    trigger.classList.add("filter-trigger--active");
    openPopoverCloser = close;
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }
  trigger.addEventListener("click", () => (popover.hidden ? open() : close()));
  return { open, close };
}

/** A searchable multi-select rendered as a trigger button + popover of
 * checkboxes. `options`: [{key, label, colorClass?}]. `max` (optional) caps
 * how many can be selected — the label so users understand why an option is
 * disabled once the cap is hit. */
export function createMultiSelect({ label, options, selected, max, onChange }) {
  const control = document.createElement("div");
  control.className = "filter-control";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "filter-trigger";
  const triggerText = document.createElement("span");
  const count = document.createElement("span");
  count.className = "filter-trigger__count";
  const chevron = document.createElement("span");
  chevron.className = "filter-trigger__chevron";
  chevron.textContent = "▾";
  trigger.append(triggerText, count, chevron);

  const popover = document.createElement("div");
  popover.className = "filter-popover filter-popover--wide";
  popover.hidden = true;

  let searchInput = null;
  if (options.length > 8) {
    searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = `Search ${label.toLowerCase()}…`;
    searchInput.className = "filter-search";
    popover.appendChild(searchInput);
  }

  const list = document.createElement("div");
  list.className = "filter-option-list";
  popover.appendChild(list);

  const footer = document.createElement("div");
  footer.className = "filter-popover__footer";
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "filter-popover__clear";
  clearBtn.textContent = "Clear";
  const hint = document.createElement("span");
  hint.className = "filter-popover__hint";
  hint.textContent = max ? `Up to ${max}` : "";
  footer.append(clearBtn, hint);
  popover.appendChild(footer);

  function refreshTrigger() {
    triggerText.textContent = label;
    count.textContent = String(selected.size);
    count.style.display = selected.size > 0 ? "" : "none";
  }

  // Rows are built once per options set and then mutated in place
  // (checked/disabled/hidden) rather than torn down and rebuilt on every
  // change. Destroying and recreating the checkbox you just clicked strips
  // its focus, and losing focus on a removed element is a classic cause of
  // an unwanted scroll jump — the browser hunts for somewhere sensible to
  // refocus. `setOptions` (used when the ranking behind this list changes,
  // e.g. the date range) *does* rebuild — safe there since that happens in
  // response to a click on a *different*, unrelated control, not this
  // list's own click handler destroying itself mid-click.
  let rowEntries = [];
  function buildRows(opts) {
    list.innerHTML = "";
    rowEntries = [];
    for (const opt of opts) {
      const row = document.createElement("label");
      row.className = "filter-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(opt.key);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selected.add(opt.key); else selected.delete(opt.key);
        refreshTrigger();
        updateOptionStates();
        onChange(selected);
      });

      if (opt.colorClass) {
        const swatch = document.createElement("span");
        swatch.className = `filter-option__swatch ${opt.colorClass}`;
        row.appendChild(swatch);
      }
      const textEl = document.createElement("span");
      textEl.className = "filter-option__label";
      textEl.textContent = opt.label;

      row.append(checkbox, textEl);
      if (opt.meta) {
        const meta = document.createElement("span");
        meta.className = "filter-option__meta";
        meta.textContent = opt.meta;
        row.appendChild(meta);
      }
      list.appendChild(row);
      rowEntries.push({ opt, row, checkbox });
    }
  }
  buildRows(options);

  function updateOptionStates(filterText) {
    const q = (filterText ?? (searchInput ? searchInput.value : "")).trim().toLowerCase();
    for (const { opt, row, checkbox } of rowEntries) {
      row.hidden = q.length > 0 && !opt.label.toLowerCase().includes(q);
      const atCap = max && selected.size >= max && !selected.has(opt.key);
      checkbox.disabled = atCap;
      checkbox.checked = selected.has(opt.key);
      row.classList.toggle("filter-option--disabled", atCap);
    }
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      updateOptionStates(searchInput.value);
      // A stale scroll position is easy to mistake for "search is broken":
      // with all rows always in the DOM (just hidden), the one matching
      // row can end up scrolled out of the popover's small viewport if the
      // list was scrolled down before typing.
      list.scrollTop = 0;
    });
  }
  clearBtn.addEventListener("click", () => {
    selected.clear();
    refreshTrigger();
    updateOptionStates();
    onChange(selected);
  });

  attachPopover(trigger, popover);
  refreshTrigger();
  updateOptionStates("");

  control.append(trigger, popover);
  return {
    el: control,
    refresh: () => { refreshTrigger(); updateOptionStates(); },
    setOptions: (newOptions) => {
      options = newOptions;
      buildRows(options);
      if (searchInput) updateOptionStates(searchInput.value); else updateOptionStates("");
    },
  };
}

/** Date-range control: preset rows first, custom month-to-month tucked
 * behind a hairline in the footer — per the interaction spec. */
export function createDateRangeControl({ months, value, onChange }) {
  const control = document.createElement("div");
  control.className = "filter-control";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "filter-trigger";
  trigger.textContent = "Date range";

  const popover = document.createElement("div");
  popover.className = "filter-popover";
  popover.hidden = true;

  const presetList = document.createElement("div");
  presetList.className = "filter-preset-list";

  const maxKey = months.length ? months[months.length - 1].key : null;

  function presetRange(monthsBack) {
    if (!maxKey) return { from: null, to: null };
    const to = maxKey;
    const idx = Math.max(0, months.length - monthsBack);
    const from = months[idx] ? months[idx].key : months[0].key;
    return { from, to };
  }
  function yearToDateRange() {
    if (!maxKey) return { from: null, to: null };
    const year = months[months.length - 1].year;
    const first = months.find((m) => m.year === year);
    return { from: first ? first.key : maxKey, to: maxKey };
  }

  const presets = [
    { id: "all", label: "All time", range: () => ({ from: months[0]?.key ?? null, to: maxKey }) },
    { id: "1", label: "Last month", range: () => presetRange(1) },
    { id: "3", label: "Last 3 months", range: () => presetRange(3) },
    { id: "6", label: "Last 6 months", range: () => presetRange(6) },
    { id: "12", label: "Last 12 months", range: () => presetRange(12) },
    { id: "ytd", label: "Year to date", range: () => yearToDateRange() },
    { id: "custom", label: "Custom range", range: () => ({ from: value.from, to: value.to }) },
  ];

  const fromSelect = document.createElement("select");
  fromSelect.className = "filter-date-select";
  const toSelect = document.createElement("select");
  toSelect.className = "filter-date-select";
  for (const sel of [fromSelect, toSelect]) {
    for (const m of months) {
      const opt = document.createElement("option");
      opt.value = m.key;
      opt.textContent = m.label;
      sel.appendChild(opt);
    }
  }

  let activePreset = "all";

  function apply(range, presetId) {
    activePreset = presetId;
    value.from = range.from;
    value.to = range.to;
    fromSelect.value = range.from ?? months[0]?.key;
    toSelect.value = range.to ?? maxKey;
    renderPresetList();
    trigger.textContent = presetId === "custom"
      ? `${labelFor(range.from)} – ${labelFor(range.to)}`
      : presets.find((p) => p.id === presetId).label;
    onChange(value);
  }
  function labelFor(key) {
    const m = months.find((mm) => mm.key === key);
    return m ? m.label : key;
  }

  function renderPresetList() {
    presetList.innerHTML = "";
    for (const p of presets) {
      const row = document.createElement("div");
      row.className = "filter-preset" + (activePreset === p.id ? " filter-preset--selected" : "");
      const check = document.createElement("span");
      check.className = "filter-preset__check";
      check.textContent = "✓";
      const text = document.createElement("span");
      text.textContent = p.label;
      row.append(text, check);
      row.addEventListener("click", () => {
        if (p.id === "custom") { activePreset = "custom"; renderPresetList(); return; }
        apply(p.range(), p.id);
      });
      presetList.appendChild(row);
    }
  }

  const customRow = document.createElement("div");
  customRow.className = "filter-preset-custom";
  const toLabel = document.createElement("span");
  toLabel.textContent = "–";
  toLabel.className = "filter-popover__hint";
  customRow.append(fromSelect, toLabel, toSelect);

  function onCustomChange() {
    if (fromSelect.value > toSelect.value) toSelect.value = fromSelect.value;
    apply({ from: fromSelect.value, to: toSelect.value }, "custom");
  }
  fromSelect.addEventListener("change", onCustomChange);
  toSelect.addEventListener("change", onCustomChange);

  // Initialize from whatever `value` the caller passed in (e.g. a range
  // restored from the URL) rather than always resetting to "all time" — try
  // to match it to a preset so the popover shows the right one checked, and
  // fall back to "custom" if it doesn't line up with any preset window.
  function detectPreset(from, to) {
    for (const p of presets) {
      if (p.id === "custom") continue;
      const r = p.range();
      if (r.from === from && r.to === to) return p.id;
    }
    return "custom";
  }

  renderPresetList();
  popover.append(presetList, customRow);
  attachPopover(trigger, popover);

  control.append(trigger, popover);
  const initialFrom = value.from ?? months[0]?.key ?? null;
  const initialTo = value.to ?? maxKey;
  apply({ from: initialFrom, to: initialTo }, detectPreset(initialFrom, initialTo));

  return { el: control };
}

/** `options`: [{key, label, disabled?, title?}]. A disabled option ignores
 * clicks and gets a `title` tooltip explaining why (e.g. "Only available
 * for GGR or Turnover") — it stays visible rather than vanishing, so the
 * control doesn't silently shrink and the reason is discoverable. */
export function createSegmented({ options, selected, onChange }) {
  const wrap = document.createElement("div");
  wrap.className = "filter-segmented";

  // Buttons are built once and their --selected class toggled in place on
  // click — never torn down and rebuilt, which would destroy the very
  // button that was just clicked (and holds focus), causing a scroll jump.
  const buttons = options.map((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-segmented__option" + (opt.key === selected.value ? " filter-segmented__option--selected" : "");
    btn.textContent = opt.label;
    btn.disabled = !!opt.disabled;
    if (opt.title) btn.title = opt.title;
    btn.addEventListener("click", () => {
      if (opt.disabled) return;
      selected.value = opt.key;
      sync();
      onChange(opt.key);
    });
    wrap.appendChild(btn);
    return { opt, btn };
  });

  function sync() {
    for (const { opt, btn } of buttons) {
      btn.classList.toggle("filter-segmented__option--selected", opt.key === selected.value);
      btn.disabled = !!opt.disabled;
      if (opt.title) btn.title = opt.title; else btn.removeAttribute("title");
    }
  }

  return { el: wrap, refresh: sync };
}

export function createResetButton(onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "filter-reset";
  btn.textContent = "Reset filters";
  btn.addEventListener("click", onClick);
  return btn;
}
