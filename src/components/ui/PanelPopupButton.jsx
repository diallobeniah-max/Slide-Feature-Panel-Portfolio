import React from "react";
import { PanelLeftOpen } from "lucide-react";
import { Button } from "../ui.jsx";

export default function PanelPopupButton({
  label = "Panel",
  onClick,
  className = "",
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      icon={PanelLeftOpen}
      onClick={onClick}
      className={`shrink-0 ${className}`}
      aria-label={`Open ${label.toLowerCase()} controls`}
      title={`Open ${label} controls`}
    >
      {label}
    </Button>
  );
}
