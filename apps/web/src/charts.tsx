import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { money } from "./api";
export default function Charts({
  mode,
  data,
}: {
  mode: "overview" | "spending";
  data: any[];
}) {
  return (
    <ResponsiveContainer width="100%" height={mode === "overview" ? 245 : 240}>
      {mode === "overview" ? (
        <AreaChart
          data={data}
          margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#527F66" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#527F66" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => String(+v.slice(8))}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            minTickGap={25}
          />
          <YAxis
            tickFormatter={(v) => "$" + v / 100000 + "k"}
            axisLine={false}
            tickLine={false}
            width={45}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
          />
          <Tooltip
            formatter={(v: any) => money(Number(v))}
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="Income"
            stroke="#527F66"
            strokeWidth={2.5}
            fill="url(#incomeFill)"
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="Spending"
            stroke="#CAA583"
            strokeWidth={2}
            fill="transparent"
          />
        </AreaChart>
      ) : (
        <BarChart data={data} margin={{ left: 0, right: 20 }}>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 5"
            stroke="var(--border)"
          />
          <XAxis
            dataKey="key"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
          />
          <YAxis
            width={55}
            tickFormatter={(v) => "$" + v / 100000 + "k"}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
          />
          <Tooltip formatter={(v: any) => money(Number(v))} />
          <Bar
            isAnimationActive={false}
            dataKey="amount"
            name="Spending"
            fill="#789980"
            radius={[5, 5, 0, 0]}
          />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
