/**
 * The parts of the Harness shared component module this plugin uses. The Web
 * shell provides the module to plugin bundles at runtime; it ships no type
 * declarations, so the props here follow its source in the installed Harness.
 */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, ComponentType, ForwardRefExoticComponent, InputHTMLAttributes, ReactElement, ReactNode, RefAttributes } from 'react';

  export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'ghost' | 'outline' | 'toolbar';
    size?: 'md' | 'sm';
    icon?: ReactNode;
  }
  export const Button: ForwardRefExoticComponent<ButtonProps & RefAttributes<HTMLButtonElement>>;

  export interface TooltipProps {
    label: string | (() => string);
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    delayMs?: number;
    portal?: boolean;
    disabled?: boolean;
    children: ReactElement;
  }
  export function Tooltip(props: TooltipProps): ReactElement;

  export type MenuEntry =
    | { id: string; label: ReactNode; icon?: ReactNode; disabled?: boolean; danger?: boolean }
    | { type: 'separator'; id: string }
    | { type: 'label'; id: string; text: string };
  export interface MenuProps {
    open: boolean;
    anchor: ReactElement;
    items?: readonly MenuEntry[];
    onSelect?: (id: string) => void;
    onClose: () => void;
    align?: 'start' | 'end';
    side?: 'top' | 'bottom';
    portal?: boolean;
    autoFocus?: boolean;
    minWidthFromAnchor?: boolean;
    className?: string;
    listClassName?: string;
  }
  export function Menu(props: MenuProps): ReactElement;

  export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    closeLabel?: string;
    description?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
    className?: string;
    contentClassName?: string;
  }
  export function Modal(props: ModalProps): ReactElement | null;

  export interface ToastProps {
    text: string;
    icon?: ReactNode;
    tone?: 'success';
    holdMs?: number;
    onDone: () => void;
  }
  export function Toast(props: ToastProps): ReactElement;

  export interface SegmentedOption<V extends string> {
    value: V;
    label: string;
    disabled?: boolean;
    title?: string;
  }
  export interface SegmentedTabItem<V extends string> {
    value: V;
    label: string;
    id: string;
    panelId: string;
  }
  export function SegmentedTabs<V extends string>(props: {
    items: readonly SegmentedTabItem<V>[];
    value: V;
    onChange: (value: V) => void;
    label: string;
    className?: string;
    size?: 'sm' | 'md';
  }): ReactElement;

  export interface ZoomControlsHandle {
    showZoom(zoom: number | undefined): void;
  }
  export interface ZoomControlsLabels {
    controls: string;
    out: string;
    into: string;
    menu: string;
    value(percent: number): string;
  }
  export interface ZoomControlsProps {
    zoom: number;
    fit?: { label: string; selected: boolean; onSelect(): void };
    className?: string;
    labels: ZoomControlsLabels;
    visible: boolean;
    onZoom(zoom: number): void;
    onActiveChange(active: boolean): void;
  }
  export const ZoomControls: ForwardRefExoticComponent<ZoomControlsProps & RefAttributes<ZoomControlsHandle>>;

  export interface SwitchProps {
    checked: boolean;
    onChange(next: boolean): void;
    label: string;
    disabled?: boolean;
    title?: string;
    className?: string;
  }
  export function Switch(props: SwitchProps): ReactElement;

  export const Input: ForwardRefExoticComponent<InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode } & RefAttributes<HTMLInputElement>>;

  export function SegmentedControl<V extends string>(props: {
    id: string;
    value: V;
    options: readonly SegmentedOption<V>[];
    onChange: (value: V) => void;
    label: string;
    disabled?: boolean;
    className?: string;
  }): ReactElement;

  export function CodeBlock(props: {
    code: string;
    lang: string;
    className?: string;
    lineNumbers?: boolean;
    showHeader?: boolean;
    copyLabel?: string;
    copiedLabel?: string;
    toolbarLabels?: { codeLabel: string; wrapLabel: string; unwrapLabel: string };
    wrap?: boolean;
  }): ReactElement;

  export const TextShimmer: ComponentType<{ children: ReactNode; active?: boolean; className?: string }>;

  export function StateDot(props: { state: 'done' | 'warning' | 'ongoing' | 'error' | 'idle'; size?: number; className?: string }): ReactElement;

  type Icon = ComponentType<{ size?: number; className?: string }>;
  export const IconChevronLeftOutlineRegular: Icon;
  export const IconChevronDownOutlineRegular: Icon;
  export const IconChevronRightOutlineRegular: Icon;
  export const IconClockOutlineRegular: Icon;
  export const IconDownloadOutlineRegular: Icon;
  export const IconEllipsisOutlineRegular: Icon;
  export const IconCloseOutlineRegular: Icon;
  export const IconPlusOutlineRegular: Icon;
  export const IconRefreshOutlineRegular: Icon;
  export const IconPinOutlineRegular: Icon;
  export const IconPinFillRegular: Icon;
  export const IconCopyOutlineRegular: Icon;
  export const IconTrashOutlineRegular: Icon;
  export const IconEditOutlineRegular: Icon;
  export const IconSparkleRegular: Icon;
  export const IconWarningOutlineRegular: Icon;
  export const IconRightUpOutlineRegular: Icon;
  export const IconSaveOutlineRegular: Icon;
  export const IconSearchOutlineRegular: Icon;
  export const IconCodeOutlineRegular: Icon;
  export const IconSlidersTwoOutlineRegular: Icon;
  export const IconFlatListOutlineRegular: Icon;
  export const IconCheckOutlineRegular: Icon;
}
