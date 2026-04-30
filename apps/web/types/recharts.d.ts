/**
 * Stub type declarations for `recharts` so `tsc --noEmit` passes before the
 * package is installed. The dependency is declared in package.json — once
 * `pnpm install` runs, recharts ships its own types and these declarations
 * are still safe (a real .d.ts inside node_modules wins via TS module
 * resolution). When the install lands, this file can be deleted.
 */
declare module "recharts" {
  import * as React from "react";

  export interface PieChartProps {
    children?: React.ReactNode;
    width?: number;
    height?: number;
  }
  export const PieChart: React.FC<PieChartProps>;

  export interface PieProps {
    data: ReadonlyArray<unknown>;
    dataKey: string;
    nameKey?: string;
    cx?: number | string;
    cy?: number | string;
    innerRadius?: number | string;
    outerRadius?: number | string;
    paddingAngle?: number;
    stroke?: string;
    children?: React.ReactNode;
  }
  export const Pie: React.FC<PieProps>;

  export interface CellProps {
    fill?: string;
    stroke?: string;
  }
  export const Cell: React.FC<CellProps>;

  export interface ResponsiveContainerProps {
    width?: number | string;
    height?: number | string;
    children?: React.ReactNode;
  }
  export const ResponsiveContainer: React.FC<ResponsiveContainerProps>;

  export interface TooltipProps {
    formatter?: (
      value: number,
      name: string,
      props?: unknown,
    ) => [React.ReactNode, React.ReactNode] | React.ReactNode;
  }
  export const Tooltip: React.FC<TooltipProps>;
}
