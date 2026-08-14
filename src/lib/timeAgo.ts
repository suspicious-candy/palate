const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["week", 7 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export default function timeAgo(value: string | Date): string {
    const elapsed = Date.now() - new Date(value).getTime();
    for (const [unit, ms] of UNITS) {
        if (elapsed >= ms) return relative.format(-Math.floor(elapsed / ms), unit);
    }
    return "just now";
}