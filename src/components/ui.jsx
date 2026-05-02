import React from "react";

export function Card({ children, className = "", ...props }) {
  return (
    <div
      className={`bg-white/95 dark:bg-zinc-900/95 border border-zinc-200/50 dark:border-zinc-800/80 rounded-[24px] shadow-sm shadow-zinc-950/5 dark:shadow-black/20 overflow-hidden transition-all duration-300 ${className}`}
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
    "inline-flex items-center justify-center gap-2 font-bold transition-all duration-200 ease-out active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600 rounded-2xl";

  const variants = {
    primary:
      "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 shadow-md hover:shadow-lg",
    secondary:
      "bg-white/60 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 shadow-sm",
    outline:
      "border border-zinc-200 text-zinc-700 hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-white dark:hover:text-white bg-transparent",
    ghost:
      "text-zinc-600 hover:bg-white/60 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
    danger:
      "bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 shadow-sm",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-[11px] uppercase tracking-widest rounded-xl",
    md: "px-5 py-2.5 text-sm rounded-2xl",
    lg: "px-6 py-3.5 text-base rounded-[20px]",
    icon: "p-2.5 rounded-xl",
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
        className="w-full px-4 py-3 rounded-2xl border border-zinc-200 bg-white/70 text-sm text-zinc-900 transition-all focus:border-zinc-950 focus:bg-white focus:outline-none focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-white dark:focus:bg-zinc-900 dark:focus:ring-white/5 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-medium shadow-inner-sm"
        {...props}
      />
    </div>
  );
}

export function Badge({ children, variant = "default", className = "" }) {
  const variants = {
    default:
      "bg-white/60 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
    success:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50",
    warning:
      "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50",
    error:
      "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200 dark:border-rose-800/50",
    black:
      "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-transparent",
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
            <span className="text-[10px] font-mono font-bold text-zinc-900 dark:text-zinc-100 bg-white/60 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
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
        className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-zinc-950 dark:accent-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600 transition-all hover:h-2"
      />
    </div>
  );
}

