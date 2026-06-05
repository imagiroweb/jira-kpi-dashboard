/* eslint-disable react-refresh/only-export-components -- mock recharts pour les tests */
import type { PropsWithChildren, ReactNode } from 'react';

type RechartsProps = PropsWithChildren<Record<string, unknown>>;

function ChartShell({ 'data-testid': testId = 'recharts-chart', ...rest }: RechartsProps) {
  return <div data-testid={testId} {...rest} />;
}

function Passthrough({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

/** Stub recharts pour éviter les crashs jsdom (ResponsiveContainer, SVG, layout) */
export function createRechartsMock() {
  return {
    ResponsiveContainer: () => <div data-testid="recharts-responsive-container" />,
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
