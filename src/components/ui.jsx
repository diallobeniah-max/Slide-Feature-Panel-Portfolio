import React from "react";

export function Card({ children, className = "", ...props }) {
  return (
    <div
      className={`bg-[var(--flow-card)] dark:bg-[var(--flow-card)] border border-[var(--flow-border)] rounded-[24px] shadow-sm shadow-[var(--flow-shadow)] overflow-hidden transition-[background-color,border-color,box-shadow,transform] duration-300 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
  icon: Icon,
  type = "button",
  ...props
}) {
  const baseStyles =
      "inline-flex items-center justify-center gap-2.5 font-extrabold transition-all duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--pumpkin-400)] rounded-[var(--flow-radius-button)]";

  const variants = {
    primary:
      "bg-[linear-gradient(135deg,var(--pumpkin-500),var(--pumpkin-700))] text-white hover:brightness-105 shadow-md shadow-[rgba(204,88,0,0.22)] hover:shadow-lg hover:shadow-[rgba(204,88,0,0.28)]",
    secondary:
      "bg-[var(--flow-soft)] text-[var(--flow-text)] hover:bg-[var(--flow-soft-strong)] shadow-sm",
    outline:
      "border border-[var(--flow-border)] text-[var(--flow-muted)] hover:border-[var(--pumpkin-500)] hover:text-[var(--flow-text)] bg-transparent",
    ghost:
      "text-[var(--flow-muted)] hover:bg-[var(--flow-soft)] hover:text-[var(--flow-text)]",
    danger:
      "bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 shadow-sm",
  };

  const sizes = {
    sm: "min-h-[var(--flow-button-compact-height)] px-4 text-[11px] uppercase tracking-widest rounded-[var(--flow-radius-button)]",
    md: "min-h-[var(--flow-button-height)] px-6 text-sm rounded-[var(--flow-radius-button)]",
    lg: "min-h-[3.75rem] px-7 text-base rounded-[20px]",
    icon: "h-10 w-10 p-0 rounded-2xl",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {Icon && (
        <Icon
          size={size === "sm" ? 14 : size === "lg" ? 20 : 16}
          className="shrink-0"
        />
      )}
      {children}
    </button>
  );
}

export function Input({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  onWheel,
  className = "",
  ...props
}) {
  const handleWheel = (event) => {
    onWheel?.(event);
    if (type !== "number" || event.defaultPrevented) return;

    event.preventDefault();
    event.stopPropagation();

    const stepValue = Number(step) || 1;
    const minValue = min === undefined || min === "" ? -Infinity : Number(min);
    const maxValue = max === undefined || max === "" ? Infinity : Number(max);
    const current = value === "" ? (Number.isFinite(minValue) ? minValue : 0) : Number(value);
    if (!Number.isFinite(current)) return;

    const direction = event.deltaY < 0 ? 1 : -1;
    const next = Math.min(maxValue, Math.max(minValue, current + direction * stepValue));
    const stepText = String(step || "");
    const decimals = stepText.includes(".") ? stepText.split(".")[1].length : 0;
    const nextValue = decimals ? next.toFixed(decimals) : String(Math.round(next));
    onChange?.({ target: { value: nextValue, name: props.name } });
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 ml-1">
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onWheel={handleWheel}
        className="w-full px-4 py-3 rounded-2xl border border-[var(--flow-border)] bg-[var(--flow-input)] text-sm text-[var(--flow-text)] transition-all focus:border-[var(--pumpkin-500)] focus:bg-[var(--flow-card)] focus:outline-none focus:ring-4 focus:ring-[rgba(255,110,0,0.14)] placeholder:text-[var(--flow-faint)] font-medium shadow-inner-sm"
        {...props}
      />
    </div>
  );
}

export function Badge({ children, variant = "default", className = "" }) {
  const variants = {
    default:
      "bg-[var(--flow-soft)] text-[var(--flow-muted)] border-[var(--flow-border)]",
    success:
      "bg-[rgba(255,110,0,0.12)] text-[var(--pumpkin-700)] dark:text-[var(--pumpkin-200)] border-[rgba(255,110,0,0.28)]",
    warning:
      "bg-[rgba(255,139,51,0.14)] text-[var(--pumpkin-700)] dark:text-[var(--pumpkin-200)] border-[rgba(255,139,51,0.35)]",
    error:
      "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200 dark:border-rose-800/50",
    black:
      "bg-[var(--pumpkin-800)] text-white dark:bg-[var(--pumpkin-400)] dark:text-[var(--pumpkin-950)] border-transparent",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function RangeSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className = "",
  valueLabel,
}) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {(label || valueLabel) && (
        <div className="flex justify-between items-end ml-1">
          {label && (
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              {label}
            </label>
          )}
          {valueLabel && (
            <span className="text-[10px] font-mono font-bold text-[var(--flow-text)] bg-[var(--flow-soft)] px-2 py-0.5 rounded-md">
              {valueLabel}
            </span>
          )}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        onInput={onChange}
        className="w-full h-1.5 bg-[var(--flow-soft-strong)] rounded-full appearance-none cursor-pointer accent-[var(--pumpkin-500)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pumpkin-400)] transition-all hover:h-2"
      />
    </div>
  );
}

