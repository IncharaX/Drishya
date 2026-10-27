"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@drishya/ui/components/select";
export function ChoiceSelect({
  value,
  onChange,
  options,
  label,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label} className="v2-select-trigger">
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        sideOffset={6}
        className="v2-select-content"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="v2-select-item"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
