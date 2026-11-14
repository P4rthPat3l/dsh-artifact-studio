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
    key: option.value, id: `${id}-${option.value}`, type: 'button', role: 'tab', 'aria-selected': option.value === value,
    disabled: option.disabled, onClick: () => { if (option.value !== value) onChange(option.value); },
  }, option.label)));
}

function CodeBlock({ code, className }) {
  return h('pre', { className: ['prim-code', className].filter(Boolean).join(' ') }, h('code', null, code));
}

function TextShimmer({ children, className, active }) {
  return h('span', { className, 'data-shimmer': active ? '' : undefined }, children);
}

function StateDot({ state }) {
  return h('span', { 'aria-hidden': 'true', 'data-state': state });
}

const icon = (name) => function Icon({ size, className }) {
  return h('svg', { 'aria-hidden': 'true', 'data-icon': name, width: size, height: size, className });
};

module.exports = {
  Button, Tooltip, Menu, Modal, Toast, SegmentedControl, CodeBlock, TextShimmer, StateDot,
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
  IconSlidersTwoOutlineRegular: icon('IconSlidersTwoOutlineRegular'),
  IconWarningOutlineRegular: icon('IconWarningOutlineRegular'),
  IconRightUpOutlineRegular: icon('IconRightUpOutlineRegular'),
  IconSaveOutlineRegular: icon('IconSaveOutlineRegular'),
  IconSearchOutlineRegular: icon('IconSearchOutlineRegular'),
  IconCodeOutlineRegular: icon('IconCodeOutlineRegular'),
};
