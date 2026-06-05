import type { PropsWithChildren, ReactNode } from 'react';

type RechartsProps = PropsWithChildren<Record<string, unknown>>;

function ChartShell({ children, 'data-testid': testId = 'recharts-chart', ...rest }: RechartsProps) {
  return (
    <div data-testid={testId} {...rest}>
      {children}
    </div>
  );
}

function Passthrough({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

/** Stub recharts pour éviter les crashs jsdom (ResponsiveContainer, SVG, layout) */
export function createRechartsMock() {
  return {
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
      <div data-testid="recharts-responsive-container">{children}</div>
    ),
    BarChart: ChartShell,
    LineChart: ChartShell,
    AreaChart: ChartShell,
    PieChart: ChartShell,
    ComposedChart: ChartShell,
    ScatterChart: ChartShell,
    Bar: Passthrough,
    Line: Passthrough,
    Area: Passthrough,
    Pie: Passthrough,
    Cell: Passthrough,
    XAxis: Passthrough,
    YAxis: Passthrough,
    CartesianGrid: Passthrough,
    Tooltip: Passthrough,
    Legend: Passthrough,
    ReferenceLine: Passthrough,
    Brush: Passthrough,
    Label: Passthrough,
    LabelList: Passthrough,
  };
}
