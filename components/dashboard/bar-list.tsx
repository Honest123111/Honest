"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Single-series horizontal bars (one hue, magnitude only). Labels on the axis,
 * values at the bar end, hover tooltip, click-through to the filtered table.
 */
export function BarList({ data, valueLabel }: { data: { label: string; value: number; href?: string }[]; valueLabel: string }) {
  const router = useRouter();
  const height = Math.max(120, data.length * 30 + 10);
  return (
    <div style={{ height }} className="text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="label"
            width={130}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }}
            formatter={(v) => [Number(v).toLocaleString(), valueLabel]}
          />
          <Bar
            dataKey="value"
            fill="var(--primary)"
            radius={[0, 4, 4, 0]}
            maxBarSize={16}
            isAnimationActive={false}
            className="cursor-pointer"
            onClick={(d) => {
              const href = (d as unknown as { payload?: { href?: string } }).payload?.href;
              if (href) router.push(href);
            }}
          >
            <LabelList dataKey="value" position="right" fill="var(--foreground)" fontSize={12} formatter={(v: unknown) => Number(v).toLocaleString()} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
