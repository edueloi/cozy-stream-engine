import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Country = { code: string; dial: string; flag: string; label: string };

export const COUNTRIES: Country[] = [
  { code: "BR", dial: "55", flag: "🇧🇷", label: "Brasil" },
  { code: "PT", dial: "351", flag: "🇵🇹", label: "Portugal" },
  { code: "US", dial: "1", flag: "🇺🇸", label: "EUA / Canadá" },
  { code: "ES", dial: "34", flag: "🇪🇸", label: "Espanha" },
  { code: "MX", dial: "52", flag: "🇲🇽", label: "México" },
  { code: "AR", dial: "54", flag: "🇦🇷", label: "Argentina" },
  { code: "CL", dial: "56", flag: "🇨🇱", label: "Chile" },
  { code: "CO", dial: "57", flag: "🇨🇴", label: "Colômbia" },
  { code: "PE", dial: "51", flag: "🇵🇪", label: "Peru" },
  { code: "UY", dial: "598", flag: "🇺🇾", label: "Uruguai" },
  { code: "PY", dial: "595", flag: "🇵🇾", label: "Paraguai" },
  { code: "GB", dial: "44", flag: "🇬🇧", label: "Reino Unido" },
  { code: "FR", dial: "33", flag: "🇫🇷", label: "França" },
  { code: "DE", dial: "49", flag: "🇩🇪", label: "Alemanha" },
  { code: "IT", dial: "39", flag: "🇮🇹", label: "Itália" },
];

function parse(value: string | undefined): { dial: string; local: string } {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return { dial: "55", local: "" };
  // sort dial codes by length desc to match longest first
  const dials = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of dials) {
    if (digits.startsWith(c.dial)) {
      return { dial: c.dial, local: digits.slice(c.dial.length) };
    }
  }
  return { dial: "55", local: digits };
}

export function PhoneInput({
  name,
  defaultValue,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const initial = useMemo(() => parse(defaultValue), [defaultValue]);
  const [dial, setDial] = useState(initial.dial);
  const [local, setLocal] = useState(initial.local);
  const composed = local ? `+${dial}${local.replace(/\D/g, "")}` : "";
  return (
    <div className="flex gap-1.5">
      <Select value={dial} onValueChange={setDial}>
        <SelectTrigger className="w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.dial}>
              {c.flag} +{c.dial}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        inputMode="tel"
        placeholder={placeholder ?? "11999999999"}
        value={local}
        onChange={(e) => setLocal(e.target.value.replace(/[^\d\s()-]/g, ""))}
        className="flex-1"
      />
      <input type="hidden" name={name} value={composed} />
    </div>
  );
}