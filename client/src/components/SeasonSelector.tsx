import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_SEASONS = [2026,2025,2024,2023,2022,2021,2020,2019,2018,2017,2016,2015,2014,2013,2012,2011,2010,2009];

interface SeasonSelectorProps {
  value: number;
  onChange: (season: number) => void;
  className?: string;
}

export default function SeasonSelector({ value, onChange, className }: SeasonSelectorProps) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className={className || "w-32"}>
        <SelectValue placeholder="Season" />
      </SelectTrigger>
      <SelectContent>
        {ALL_SEASONS.map((s) => (
          <SelectItem key={s} value={String(s)}>
            {s} Season
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
