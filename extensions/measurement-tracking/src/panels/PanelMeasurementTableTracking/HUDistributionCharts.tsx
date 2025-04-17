import React, { useMemo, useRef, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface DataPoint {
  hu: number;
  frequency: number;
}

interface HUDistributionChartProps {
  data: DataPoint[];
  type: 'bone' | 'muscle' | 'fat' | string;
  meanHU?: number;
}

// 定义工具提示组件的接口
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; dataKey: string }>;
  label?: string | number;
}

const HUDistributionChart: React.FC<HUDistributionChartProps> = ({ data, type, meanHU }) => {
  // 引用图表容器
  const chartRef = useRef<HTMLDivElement>(null);

  // Validate input data
  const validData = useMemo(() => {
    if (!data || !Array.isArray(data)) {
      console.warn(`Invalid data passed to HUDistributionChart for ${type}:`, data);
      return [];
    }
    return data;
  }, [data, type]);

  const getChartConfig = () => {
    switch (type) {
      case 'bone':
        return {
          title: '骨骼组织 HU 分布',
          color: '#60A5FA',
          referenceLine: '#93C5FD', // 浅蓝色
          referenceLabel: '平均值',
        };
      case 'muscle':
        return {
          title: '肌肉组织 HU 分布',
          color: '#F87171',
          referenceLine: '#FCA5A5', // 浅红色
          referenceLabel: '平均值',
        };
      case 'fat':
        return {
          title: '脂肪组织 HU 分布',
          color: '#FB923C',
          referenceLine: '#FDBA74', // 浅橙色
          referenceLabel: '平均值',
        };
      default:
        return {
          title: 'HU 分布',
          color: '#94A3B8',
          referenceLine: '#CBD5E1', // 浅灰色
          referenceLabel: '平均值',
        };
    }
  };

  // 计算实际 meanHU 或者从数据中估计
  const calculatedMeanHU = useMemo(() => {
    // 如果外部传入了 meanHU，则使用传入的值
    if (typeof meanHU === 'number' && !isNaN(meanHU)) {
      console.log(`Using provided meanHU for ${type}: ${meanHU}`);
      return meanHU;
    }

    console.log(`Calculating meanHU for ${type} from data`);
    // 否则从数据点计算加权平均值
    if (validData.length > 0) {
      const totalWeightedHU = validData.reduce((sum, point) => {
        return sum + (point.hu || 0) * (point.frequency || 0);
      }, 0);
      const totalWeight = validData.reduce((sum, point) => sum + (point.frequency || 0), 0);
      const result = totalWeight > 0 ? totalWeightedHU / totalWeight : null;
      console.log(`Calculated meanHU for ${type}: ${result}`);
      return result;
    }

    console.log(`No valid data to calculate meanHU for ${type}`);
    return null;
  }, [validData, meanHU, type]);

  // Filter out frequency=0 points and ensure data is sorted by HU value
  const filteredData = useMemo(() => {
    return validData
      .filter(
        point =>
          point &&
          typeof point.hu === 'number' &&
          !isNaN(point.hu) &&
          typeof point.frequency === 'number' &&
          !isNaN(point.frequency)
      )
      .sort((a, b) => a.hu - b.hu);
  }, [validData]);

  // Early return if no valid data
  if (!filteredData.length) {
    return (
      <div className="rounded bg-[#0f1729] p-3">
        <div className="mb-2 text-xs text-blue-100">{getChartConfig().title}</div>
        <div className="flex h-[120px] items-center justify-center text-xs text-gray-400">
          无可用数据
        </div>
      </div>
    );
  }

  // Calculate Y-axis range and ticks
  const yAxisConfig = useMemo(() => {
    const maxFrequency = Math.max(...filteredData.map(d => d.frequency));
    // Round up to the nearest 5
    const roundedMax = Math.max(5, Math.ceil(maxFrequency / 5) * 5);

    // Generate tick values
    const tickCount = 5;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
      return (roundedMax * i) / tickCount;
    });

    return {
      max: roundedMax,
      ticks,
    };
  }, [filteredData]);

  // Calculate X-axis range and domain based on data and mean
  const xAxisConfig = useMemo(() => {
    if (filteredData.length === 0) return { min: 0, max: 100 };

    const minHU = Math.min(...filteredData.map(d => d.hu));
    const maxHU = Math.max(...filteredData.map(d => d.hu));

    // 确保 meanHU 在可视范围内（如果存在）
    let min = minHU;
    let max = maxHU;

    if (calculatedMeanHU !== null && !isNaN(calculatedMeanHU)) {
      // 确保均值可见，并且有一定的边距
      const padding = Math.max(10, (maxHU - minHU) * 0.1); // 至少10个HU的边距或10%的数据范围
      min = Math.min(min, calculatedMeanHU - padding);
      max = Math.max(max, calculatedMeanHU + padding);
    }

    // 生成均匀分布的刻度值
    const range = max - min;
    const step = Math.ceil(range / 4); // 分成4个区间

    const ticks = [];
    for (let i = 0; i <= 4; i++) {
      const tickValue = Math.round(min + i * step);
      ticks.push(tickValue);
    }

    return { min, max, ticks };
  }, [filteredData, calculatedMeanHU]);

  const config = getChartConfig();

  // 使用纯DOM方法绘制参考线
  useEffect(() => {
    if (!calculatedMeanHU || !chartRef.current) return;

    const drawReferenceLine = () => {
      // 清除任何已有的参考线
      const existingLines = chartRef.current.querySelectorAll('.mean-reference-line');
      existingLines.forEach(line => line.remove());

      // 获取图表容器
      const chartContainer = chartRef.current.querySelector('.recharts-wrapper');
      if (!chartContainer) return;

      // 获取图表绘图区域（不包括轴和标签）
      const plotArea = chartContainer.querySelector('.recharts-cartesian-grid');
      if (!plotArea) return;

      // 获取绘图区域的位置和尺寸
      const plotRect = plotArea.getBoundingClientRect();
      const containerRect = chartContainer.getBoundingClientRect();

      // 计算绘图区域相对于容器的位置
      const relativeLeft = plotRect.left - containerRect.left;
      const relativeTop = plotRect.top - containerRect.top;

      // 创建SVG命名空间
      const svgNS = 'http://www.w3.org/2000/svg';

      // 计算参考线的位置（基于X轴值）
      const xRange = xAxisConfig.max - xAxisConfig.min;
      const meanPosition = (calculatedMeanHU - xAxisConfig.min) / xRange;
      const lineX = relativeLeft + meanPosition * plotRect.width;

      // 创建参考线元素
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('class', 'mean-reference-line');
      line.setAttribute('x1', lineX.toString());
      line.setAttribute('x2', lineX.toString());
      line.setAttribute('y1', relativeTop.toString());
      line.setAttribute('y2', (relativeTop + plotRect.height).toString());
      line.setAttribute('stroke', config.referenceLine);
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '3,3');

      // 找到SVG容器并添加参考线
      const svgContainer = chartContainer.querySelector('svg');
      if (svgContainer) {
        svgContainer.appendChild(line);
      }
    };

    // 等待图表完全渲染后绘制参考线
    const timer = setTimeout(() => {
      drawReferenceLine();
    }, 300);

    // 处理窗口大小变化
    const handleResize = () => {
      clearTimeout(timer);
      setTimeout(drawReferenceLine, 300);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [calculatedMeanHU, xAxisConfig.min, xAxisConfig.max, config.referenceLine]);

  // 自定义工具提示组件
  const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            backgroundColor: '#1e293b',
            border: 'none',
            borderRadius: '4px',
            color: '#e2e8f0',
            fontSize: '12px',
            padding: '4px 8px',
          }}
        >
          <p>{`HU值: ${label}`}</p>
          <p>{`频率: ${payload[0].value.toFixed(2)}%`}</p>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="rounded bg-[#0f1729] p-3">
      <div className="mb-2 text-xs text-blue-100">
        {config.title}
        {calculatedMeanHU !== null && (
          <span className="ml-2">
            HU值: <span className="text-white">{calculatedMeanHU.toFixed(2)}</span>
          </span>
        )}
      </div>
      <div
        className="h-[120px] w-full"
        ref={chartRef}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <LineChart
            data={filteredData}
            margin={{ top: 15, right: 10, left: 0, bottom: 5 }} // 修复1: 将左侧边距从 -20 改为 0
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1e293b"
              vertical={false}
            />
            <XAxis
              dataKey="hu"
              stroke="#334155"
              tick={{ fontSize: 10, fill: '#bfdbfe' }}
              tickSize={3}
              domain={[xAxisConfig.min, xAxisConfig.max]}
              ticks={xAxisConfig.ticks}
              allowDataOverflow={false}
              tickMargin={5} // 修复2: 增加刻度与标签的间距
              interval={0} // 修复3: 确保显示所有刻度，不要跳过
            />
            <YAxis
              stroke="#334155"
              tick={{ fontSize: 10, fill: '#bfdbfe' }}
              tickSize={3}
              domain={[0, yAxisConfig.max]}
              ticks={yAxisConfig.ticks}
              allowDecimals={true}
              tickFormatter={value => value.toFixed(1)}
            />
            <Tooltip content={CustomTooltip} />

            {/* 主数据线 */}
            <Line
              type="monotone"
              dataKey="frequency"
              stroke={config.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: config.color }}
              connectNulls
            />

            {/* 均值标签 */}
            {calculatedMeanHU !== null && !isNaN(calculatedMeanHU) && (
              <text
                className="mean-value-label"
                x="50%"
                y={10}
                textAnchor="middle"
                fill={config.referenceLine}
                fontSize={10}
              >
                {`${config.referenceLabel}`}
              </text>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default HUDistributionChart;
