/**
 * A DOM-equivalent stand-in for the Harness shared component module, which the
 * Web shell provides at runtime. It keeps the roles, names, and controlled
 * open and close behavior the plugin relies on, without the shell's styles.
 */
const React = require('react');

const h = React.createElement;

const Button = React.forwardRef(function Button({ variant, size, icon, className, children, ...rest }, ref) {
  return h('button', { ref, type: 'button', className: ['prim-button', className].filter(Boolean).join(' '), 'data-variant': variant ?? 'ghost', 'data-size': size ?? 'md', ...rest }, icon, children);
});

function Tooltip({ children }) {
  return children;
}

function Menu({ open, anchor, items = [], onSelect, onClose, className, autoFocus }) {
  const wrap = React.useRef(null);
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open) {
      wasOpen.current = true;
      if (autoFocus) wrap.current?.querySelector('[role="menuitem"]')?.focus();
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      wrap.current?.querySelector('button')?.focus();
    }
  }, [open]);
  const rows = items.map((item) => {
    if (item.type === 'separator') return h('div', { key: item.id, role: 'separator' });
    if (item.type === 'label') return h('div', { key: item.id, className: 'prim-menu-label' }, item.text);
    return h('button', { key: item.id, type: 'button', role: 'menuitem', disabled: item.disabled, onClick: () => onSelect?.(item.id) }, item.icon, item.label);
  });
  const list = open
    ? h('div', { role: 'menu', onKeyDown: (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } } }, rows)
    : null;
  return h('span', { ref: wrap, className }, anchor, list);
}

function Modal({ open, onClose, title, closeLabel, description, children, footer, className }) {
  if (!open) return null;
  return h('div', {
    role: 'dialog', 'aria-modal': 'true', 'aria-label': title, className,
    onKeyDown: (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } },
  }, h('h2', null, title), description ? h('p', null, description) : null,
  closeLabel ? h('button', { type: 'button', 'aria-label': closeLabel, onClick: onClose }) : null, children, footer);
}

function Toast({ text }) {
  return h('div', { role: 'alert', className: 'prim-toast' }, text);
}

function SegmentedControl({ id, value, options, onChange, label, className }) {
  return h('div', { role: 'tablist', 'aria-label': label, className }, options.map((option) => h('button', {
    key: option.value, id: `${id}-${option.value}`, type: 'button', role: 'tab', 'aria-controls': `${id}-${option.value}-panel`, 'aria-selected': option.value === value,
    disabled: option.disabled, onClick: () => { if (option.value !== value) onChange(option.value); },
  }, option.label)));
}

function CodeBlock({ code, className }) {
  return h('pre', { className: ['prim-code', className].filter(Boolean).join(' ') }, h('code', null, code));
}

function TextShimmer({ children, className, active }) {
  return h('span', { className, 'data-shimmer': active ? '' : undefined }, children);
}

function Tag({ tone, children }) {
  return h('span', { 'data-tone': tone }, children);
}

function StateDot({ state }) {
  return h('span', { 'aria-hidden': 'true', 'data-state': state });
}

const ZoomControls = React.forwardRef(function ZoomControls({ zoom, fit, className, labels, visible, onZoom, onActiveChange }, ref) {
  const [open, setOpen] = React.useState(false);
  React.useImperativeHandle(ref, () => ({ showZoom: () => undefined }));
  React.useEffect(() => { onActiveChange?.(open); }, [open]);
  const presets = [0.25, 0.5, 1, 1.5, 2];
  const rows = [];
  if (fit !== undefined) {
    rows.push(h('button', { key: 'fit', type: 'button', role: 'menuitem', 'data-selected': fit.selected, onClick: () => { setOpen(false); fit.onSelect(); } }, fit.label));
  }
  for (const preset of presets) {
    rows.push(h('button', { key: preset, type: 'button', role: 'menuitem', onClick: () => { setOpen(false); onZoom(preset); } }, labels.value(preset * 100)));
  }
  return h('div', { role: 'toolbar', 'aria-label': labels.controls, className, 'data-document-zoom-controls': true, 'data-visible': visible ? '' : undefined },
    h('button', { type: 'button', 'aria-label': labels.out, disabled: zoom <= 0.25, onClick: () => onZoom(Math.max(0.25, zoom - 0.25)) }),
    h('button', { type: 'button', 'aria-label': labels.menu, 'aria-expanded': open, onClick: () => setOpen((value) => !value) }, labels.value(Math.round(zoom * 100))),
    open ? h('div', { role: 'menu' }, rows) : null,
    h('button', { type: 'button', 'aria-label': labels.into, disabled: zoom >= 4, onClick: () => onZoom(Math.min(4, zoom + 0.25)) }));
});

function Switch({ checked, onChange, label, disabled = false, title, className }) {
  return h('button', { type: 'button', role: 'switch', 'aria-checked': checked, 'aria-label': label, title, disabled, className, onClick: () => onChange(!checked) }, h('span', null));
}

const Input = React.forwardRef(function Input({ icon, className, ...rest }, ref) {
  return h('span', { className }, icon, h('input', { ref, ...rest }));
});

const icon = (name) => function Icon({ size, className }) {
  return h('svg', { 'aria-hidden': 'true', 'data-icon': name, width: size, height: size, className });
};

module.exports = {
  Button, Tooltip, Menu, Modal, Toast, Tag, SegmentedControl, ZoomControls, Switch, Input, CodeBlock, TextShimmer, StateDot,
  IconChevronLeftOutlineRegular: icon('IconChevronLeftOutlineRegular'),
  IconChevronDownOutlineRegular: icon('IconChevronDownOutlineRegular'),
  IconChevronRightOutlineRegular: icon('IconChevronRightOutlineRegular'),
  IconClockOutlineRegular: icon('IconClockOutlineRegular'),
  IconDownloadOutlineRegular: icon('IconDownloadOutlineRegular'),
  IconEllipsisOutlineRegular: icon('IconEllipsisOutlineRegular'),
  IconCloseOutlineRegular: icon('IconCloseOutlineRegular'),
  IconPlusOutlineRegular: icon('IconPlusOutlineRegular'),
  IconRefreshOutlineRegular: icon('IconRefreshOutlineRegular'),
  IconPinOutlineRegular: icon('IconPinOutlineRegular'),
  IconPinFillRegular: icon('IconPinFillRegular'),
  IconCopyOutlineRegular: icon('IconCopyOutlineRegular'),
  IconTrashOutlineRegular: icon('IconTrashOutlineRegular'),
  IconEditOutlineRegular: icon('IconEditOutlineRegular'),
  IconSparkleRegular: icon('IconSparkleRegular'),
  IconWarningOutlineRegular: icon('IconWarningOutlineRegular'),
  IconRightUpOutlineRegular: icon('IconRightUpOutlineRegular'),
  IconSaveOutlineRegular: icon('IconSaveOutlineRegular'),
  IconSearchOutlineRegular: icon('IconSearchOutlineRegular'),
  IconCodeOutlineRegular: icon('IconCodeOutlineRegular'),
  IconSlidersTwoOutlineRegular: icon('IconSlidersTwoOutlineRegular'),
  IconFlatListOutlineRegular: icon('IconFlatListOutlineRegular'),
  IconCheckOutlineRegular: icon('IconCheckOutlineRegular'),
};
