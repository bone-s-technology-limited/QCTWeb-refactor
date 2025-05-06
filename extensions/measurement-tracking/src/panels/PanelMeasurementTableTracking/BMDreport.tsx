import React from 'react';
import { createRoot } from 'react-dom/client';
import PropTypes from 'prop-types';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
  ChartData
} from 'chart.js';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// --- Interfaces ---
interface Vertebra {
  label: string;
  bmd: number | string;
  bmc?: number | string;
  tScore: number | string;
  zScore: number | string;
}

interface Measurements {
  averageBMD: number | string;
  averageTScore: number | string;
  averageZScore: number | string;
  vertebrae?: Vertebra[];
}

interface PatientInfo {
  id?: string;
  name?: string | string[] | any;
  age?: string;
  gender?: string;
  weight?: string;
  height?: string;
  examDate?: string;
  examLocation?: string;
  printDate?: string;
  referringDoctor?: string;
  referringDept?: string;
  examNumber?: string;
  origin?: string;
  bodyType?: string;
  ward?: string;
  bedNumber?: string;
}

interface ScanParams {
  kvp?: string;
  bedHeight?: string;
  thickness?: string;
  scanField?: string;
  ma?: string;
  referenceDensity?: string;
  collimation?: string;
  kernel?: string;
  bedRotation?: string;
}

interface HospitalInfo {
  Title?: string;
  Address?: string;
  Doctor?: string;
  Department?: string;
}

interface BMDReportProps {
  measurements: Measurements;
  patientInfo: PatientInfo;
  scanParams: ScanParams;
  hospitalInfo?: HospitalInfo;
  chartOptions?: any;
}

// --- Helper function for diagnosis rows ---
function generateDiagnosisRows() {
  const diagnosisData = [
    { range: 'vBMD > 120 mg/cc', result: '正常' },
    { range: '80 mg/cc ≤ vBMD ≤ 120 mg/cc', result: '低骨量' },
    { range: 'vBMD < 80 mg/cc', result: '骨质疏松' },
    { range: 'vBMD < 80 mg/cc, 伴脆性骨折', result: '严重骨质疏松' },
  ];

  return diagnosisData.map((row, index) =>
    React.createElement(
      'tr',
      {
        key: `diagnosis-${index}`,
        className: 'border border-black', // Keep Tailwind for component view
      },
      [
        // Use Tailwind classes for component view, PDF styling is handled separately
        React.createElement('td', { key: 'range', className: 'p-1 border border-black text-xs align-middle' }, row.range),
        React.createElement('td', { key: 'result', className: 'p-1 border border-black text-xs align-middle' }, row.result),
      ]
    )
  );
}

// --- Component definition ---
const BMDReport = ({
  measurements,
  patientInfo,
  scanParams,
  hospitalInfo = {},
  chartOptions = {},
}: BMDReportProps) => {
  // Format numbers safely
  const safeNumberFormat = (value: string | number | undefined, decimals = 1): string => {
    if (value === undefined || value === null || value === '') return '-';
    const number = parseFloat(String(value));
    return !isNaN(number) ? number.toFixed(decimals) : '-';
  };

  const safeScoreFormat = (value: string | number | undefined | null): string => {
    return safeNumberFormat(value, 2);
  };

  // Safely handle patient name
  const patientName = (() => {
    if (!patientInfo?.name) {
      return 'Anonymous';
    }
    if (typeof patientInfo.name === 'string') {
      return patientInfo.name;
    }
    if (Array.isArray(patientInfo.name)) {
      return patientInfo.name.join(' ');
    }
    return String(patientInfo.name);
  })();

  // Generate chart data
  const generateChartData = () => {
    const ages = Array.from({ length: 8 }, (_, i) => 20 + i * 10);
    const normals = ages.map(age => 180 - (age - 20) * 1.3);
    const normalPlus1SD = normals.map(n => n + 20);
    const normalMinus1SD = normals.map(n => n - 20);
    const normalPlus2SD = normals.map(n => n + 40);
    const normalMinus2SD = normals.map(n => n - 40);
    const osteoporosisThreshold = Array(ages.length).fill(80);
    const osteopeniaThreshold = Array(ages.length).fill(120);
    const datasets: any[] = [];

    datasets.push({
      label: '正常±2SD', data: normalPlus2SD, borderColor: 'rgba(178, 223, 219, 1)', backgroundColor: 'rgba(178, 223, 219, 0.5)', borderWidth: 1, pointRadius: 0, fill: false, tension: 0.4
    });
    datasets.push({
      label: '', data: normalMinus2SD, borderColor: 'rgba(178, 223, 219, 1)', backgroundColor: 'rgba(178, 223, 219, 0.5)', borderWidth: 1, pointRadius: 0, fill: '-1', tension: 0.4
    });
    datasets.push({
      label: '正常±1SD', data: normalPlus1SD, borderColor: 'rgba(77, 182, 172, 1)', backgroundColor: 'rgba(77, 182, 172, 0.5)', borderWidth: 1, pointRadius: 0, fill: false, tension: 0.4
    });
    datasets.push({
      label: '', data: normalMinus1SD, borderColor: 'rgba(77, 182, 172, 1)', backgroundColor: 'rgba(77, 182, 172, 0.5)', borderWidth: 1, pointRadius: 0, fill: '-1', tension: 0.4
    });
    datasets.push({
      label: '正常', data: normals, borderColor: '#000000', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false
    });
    datasets.push({
      label: 'ACR 骨质疏松', data: osteoporosisThreshold, borderColor: '#FF5252', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0, fill: false
    });
    datasets.push({
      label: 'ACR 骨质减少', data: osteopeniaThreshold, borderColor: '#FFC107', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0, fill: false
    });

    if (patientInfo?.age && measurements?.averageBMD) {
      const age = parseInt(patientInfo.age, 10);
      const bmdValue = parseFloat(String(measurements.averageBMD));
      if (!isNaN(age) && !isNaN(bmdValue)) {
        const patientData = Array(ages.length).fill(null);
        let closestAgeIndex = -1;
        let minDiff = Infinity;
        ages.forEach((axisAge, index) => {
            const diff = Math.abs(axisAge - age);
            if (diff < minDiff) {
                minDiff = diff;
                closestAgeIndex = index;
            }
        });
        if (closestAgeIndex !== -1) {
          patientData[closestAgeIndex] = bmdValue;
        }
        datasets.push({
          label: '骨密度', data: patientData, borderColor: '#000', backgroundColor: '#000', borderWidth: 0, pointRadius: 5, fill: false, tension: 0,
        });
      }
    }
    return { labels: ages, datasets, };
  };

  // Create chart options
  const finalChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    devicePixelRatio: 4,
    layout: { padding: { left: 10, right: 20, top: 10, bottom: 10, }, },
    plugins: {
      legend: { display: false, },
      tooltip: {
        enabled: true, mode: 'index', intersect: false, padding: 8,
        titleFont: { size: 12, }, bodyFont: { size: 12, },
        callbacks: {
          title: function(tooltipItems: any) { return `年龄: ${tooltipItems[0].label}岁`; },
          label: function(context: any) {
            if (context.dataset.label && context.raw !== null && context.raw !== undefined) {
              if (context.dataset.label === '骨密度') { return `${context.dataset.label}: ${Number(context.raw).toFixed(1)} mg/cc`; }
            }
            return null;
          }
        }
      },
      filler: { propagate: true }
    },
    scales: {
      y: {
        title: { display: true, text: '骨密度 (mg/cc)', font: { size: 12, weight: 'normal' as 'normal' }, padding: { bottom: 5 }, },
        min: 0, max: 240, grid: { color: '#E5E7EB', drawBorder: true, },
        ticks: { padding: 5, font: { size: 10, }, stepSize: 40, },
      },
      x: {
        title: { display: true, text: '', font: { size: 12, weight: 'normal' as 'normal' }, padding: { top: 5 }, },
        grid: { color: '#E5E7EB', drawBorder: true, },
        ticks: { padding: 5, font: { size: 10, }, },
      },
    },
    ...chartOptions,
  };

  const chartDataForRender = generateChartData();
  const chartOptionsForRender = finalChartOptions;

  const today = new Date();
  const defaultPrintDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const displayPatientInfo = { printDate: defaultPrintDate, ...patientInfo };
  const displayHospitalInfo = { Title: '深圳医院', Address: '深圳', ...hospitalInfo };
  const displayMeasurements = { averageBMD: '161.3', averageTScore: '-0.06', averageZScore: '0.46', ...measurements };
  const displayScanParams = { kvp: '120', bedHeight: '153', thickness: '1.000 mm', scanField: '500', ma: '150', collimation: '19.200 mm', kernel: 'B30f', bedRotation: 'undefined', ...scanParams };
  const displayVertebrae = (measurements?.vertebrae && measurements.vertebrae.length > 0)
    ? measurements.vertebrae
    : [{ label: 'L3', bmd: '161.3', tScore: '-0.06', zScore: '0.46' }];


  return React.createElement(
    React.Fragment,
    null,
    [
      React.createElement(
        'div', { key: 'h-row1', className: 'flex justify-between items-center mb-1' },
        React.createElement('div', { className: 'text-lg font-bold' }, 'QCT骨密度检测报告'),
        React.createElement('div', { className: 'text-lg font-bold' }, displayHospitalInfo.Title)
      ),
      React.createElement(
        'div', { key: 'h-row2', className: 'flex justify-between items-center text-sm mb-2' },
        React.createElement('div', null, `打印日期: ${displayPatientInfo.printDate}`),
        React.createElement('div', null, displayHospitalInfo.Address)
      ),
      React.createElement('div', { key: 'h-divider', className: 'border-b-2 border-black mb-2' }),

      React.createElement(
        'div', { key: 'p-info', className: 'mb-3 pb-2 border-b-2 border-black' },
        React.createElement('div', { className: 'font-bold text-sm mb-2' }, '病人信息'),
        React.createElement('div', { className: 'grid grid-cols-4 gap-x-4 gap-y-1 text-sm' },
          React.createElement('div', { key:'p1' }, `病人ID: ${displayPatientInfo.id || '-'}`),
          React.createElement('div', { key:'p2' }, `年龄: ${displayPatientInfo.age || '-'} 岁`),
          React.createElement('div', { key:'p3' }, `性别: ${displayPatientInfo.gender || '-'}`),
          React.createElement('div', { key:'p4' }, `病区: ${displayPatientInfo.ward || '-'}`),
          React.createElement('div', { key:'p5' }, `姓名: ${patientName}`),
          React.createElement('div', { key:'p6' }, `体重: ${displayPatientInfo.weight || '-'}`),
          React.createElement('div', { key:'p7' }, `身高: ${displayPatientInfo.height || '-'}`),
          React.createElement('div', { key:'p8' }, `床号: ${displayPatientInfo.bedNumber || '-'}`)
        )
      ),

      React.createElement(
        'div', { key: 'e-info', className: 'mb-3 pb-2 border-b-2 border-black' },
         React.createElement('div', { className: 'font-bold text-sm mb-2' }, '检测信息'),
         React.createElement('div', { className: 'grid grid-cols-4 gap-x-4 gap-y-1 text-sm' },
            React.createElement('div', { key:'e1' }, `开单医生: ${displayPatientInfo.referringDoctor || '-'}`),
            React.createElement('div', { key:'e2' }, `开单科室: ${displayPatientInfo.referringDept || '-'}`),
            React.createElement('div', { key:'e3' }, `报告医生: ${displayHospitalInfo.Doctor || '-'}`),
            React.createElement('div', { key:'e4' }, `报告科室: ${displayHospitalInfo.Department || '-'}`),
            React.createElement('div', { key:'e5' }, `检测日期: ${displayPatientInfo.examDate || '-'}`),
            React.createElement('div', { key:'e6' }, `检测部位: ${displayPatientInfo.examLocation || '-'}`),
            React.createElement('div', { key:'e7' }, `体检编号: ${displayPatientInfo.examNumber || '-'}`)
         )
      ),

      React.createElement(
        'div', { key: 's-params', className: 'mb-4 pb-2 border-b-2 border-black' },
         React.createElement('div', { className: 'font-bold text-sm mb-2' }, '扫描参数'),
         React.createElement('div', { className: 'grid grid-cols-4 gap-x-4 gap-y-1 text-sm' },
            React.createElement('div', { key:'s1' }, `kVp: ${displayScanParams.kvp}`),
            React.createElement('div', { key:'s2' }, `床高: ${displayScanParams.bedHeight}`),
            React.createElement('div', { key:'s3' }, `层厚: ${displayScanParams.thickness}`),
            React.createElement('div', { key:'s4' }, `扫描野: ${displayScanParams.scanField}`),
            React.createElement('div', { key:'s5' }, `mA: ${displayScanParams.ma}`),
            React.createElement('div', { key:'s6' }, `床旋进比: ${displayScanParams.bedRotation}`),
            React.createElement('div', { key:'s7' }, `准直宽度: ${displayScanParams.collimation}`),
            React.createElement('div', { key:'s8' }, `卷积核: ${displayScanParams.kernel}`)
         )
      ),

       React.createElement(
         'div', { key: 'results', className: 'mb-4' },
         [
            React.createElement('div', { key: 'res-title', className: 'font-bold text-center text-base mb-3' }, '骨密度结果表图表'),
            React.createElement('div', { key: 'res-top', className: 'flex justify-between mb-3 gap-6' },
             [
                React.createElement('div', { key: 'res-left', className: 'flex-1' },
                 [
                    React.createElement('table', { key: 'res-ltable', className: 'w-full text-xs border-collapse border-2 border-black' },
                      React.createElement('tbody', null,
                       [
                          React.createElement('tr', { key: 'res-lr1', className: 'border-b border-black' }, [ React.createElement('td', { className: 'p-2 border-r border-black font-semibold bg-gray-100 align-middle', style:{width:'70%'} }, '平均体积骨密度 (mg/cc)'), React.createElement('td', { className: 'p-2 text-right font-semibold align-middle' }, safeNumberFormat(displayMeasurements.averageBMD)) ]), // Added p-2, align-middle
                          React.createElement('tr', { key: 'res-lr2', className: 'border-b border-black' }, [ React.createElement('td', { className: 'p-2 border-r border-black align-middle' }, 'T值'), React.createElement('td', { className: 'p-2 text-right align-middle' }, safeScoreFormat(displayMeasurements.averageTScore)) ]), // Added p-2, align-middle
                          React.createElement('tr', { key: 'res-lr3', className: '' }, [ React.createElement('td', { className: 'p-2 border-r border-black align-middle' }, 'Z值'), React.createElement('td', { className: 'p-2 text-right align-middle' }, safeScoreFormat(displayMeasurements.averageZScore)) ]) // Added p-2, align-middle
                       ]
                     )
                   ),
                    React.createElement('div', { key: 'res-lnote', className: 'text-xs mt-1' }, '注: 可参考右侧标准')
                 ]
               ),
                React.createElement('div', { key: 'res-right', className: 'flex-1' },
                 [
                    React.createElement('table', { key: 'res-rtable', className: 'w-full text-xs border-collapse border-2 border-black' },
                     [
                        React.createElement('thead', { key: 'res-rthead' }, React.createElement('tr', { className: 'border-b-2 border-black bg-gray-100' }, [ React.createElement('th', { className: 'p-2 border-r-2 border-black font-semibold text-left align-middle' }, '体积骨密度诊断标准'), React.createElement('th', { className: 'p-2 font-semibold text-left align-middle' }, '诊断结果') ]) ), // Added p-2, align-middle
                        React.createElement('tbody', { key: 'res-rtbody' }, generateDiagnosisRows()) // generateDiagnosisRows now adds align-middle
                     ]
                   ),
                    React.createElement('div', { key: 'res-rnote', className: 'text-xs mt-1 text-center' }, '标准来源：骨质疏松的影像学与骨密度诊断专家共识 (2020)')
                 ]
               )
             ]
           ),
            React.createElement('div', { key: 'res-bottom', className: 'flex gap-6' },
             [
                React.createElement('div', { key: 'res-btable', className: 'w-5/12' },
                  React.createElement('table', { className: 'w-full text-xs border-collapse border-2 border-black' },
                   [
                      React.createElement('thead', null, React.createElement('tr', { className: 'border-b-2 border-black bg-gray-100' }, [ React.createElement('th', { key: 'vth1', className: 'p-2 border-r-2 border-black text-center font-semibold align-middle' }, '椎体'), React.createElement('th', { key: 'vth2', className: 'p-2 border-r-2 border-black text-center font-semibold align-middle' }, '骨密度'), React.createElement('th', { key: 'vth3', className: 'p-2 border-r-2 border-black text-center font-semibold align-middle' }, 'T值'), React.createElement('th', { key: 'vth4', className: 'p-2 text-center font-semibold align-middle' }, 'Z值') ]) ), // Added p-2, align-middle
                      React.createElement('tbody', null,
                        displayVertebrae.map((vertebra, index) =>
                            React.createElement('tr', { key: `${vertebra.label}-${index}`, className: 'border-b border-black last:border-b-0' }, [
                              React.createElement('td', { key: 'vtd1', className: 'p-2 border-r-2 border-black text-center align-middle' }, vertebra.label), // Added p-2, align-middle
                              React.createElement('td', { key: 'vtd2', className: 'p-2 border-r-2 border-black text-right align-middle' }, safeNumberFormat(vertebra.bmd)), // Added p-2, align-middle
                              React.createElement('td', { key: 'vtd3', className: 'p-2 border-r-2 border-black text-center align-middle' }, safeScoreFormat(vertebra.tScore)), // Added p-2, align-middle
                              React.createElement('td', { key: 'vtd4', className: 'p-2 text-center align-middle' }, safeScoreFormat(vertebra.zScore)), // Added p-2, align-middle
                            ])
                         )
                      )
                   ]
                 )
               ),
                React.createElement('div', { key: 'res-bchart', className: 'w-7/12 flex flex-col' },
                 [
                    React.createElement('div', { key: 'chart-wrapper', className: 'relative', style: { height: '280px'} },
                        React.createElement(Line, {
                          data: chartDataForRender,
                          options: chartOptionsForRender,
                          redraw: true
                        })
                    ),
                    React.createElement('div', { key: 'age-label', className: 'text-center text-sm mt-1 font-semibold' }, '年龄'),
                    React.createElement('div', { key: 'legend', className: 'flex flex-wrap justify-center items-center gap-x-3 gap-y-1 mt-1 px-2 text-xs' },
                      [
                          React.createElement('div',{key:"l1",className:'flex items-center mr-1'},[React.createElement('div',{className:'w-3 h-3 mr-1',style:{backgroundColor:'rgba(77, 182, 172, 0.5)',border:'1px solid rgba(77, 182, 172, 1)'}}),React.createElement('span',null,'正常 ± 1 S.D.')]),
                          React.createElement('div',{key:"l2",className:'flex items-center mr-1'},[React.createElement('div',{className:'w-3 h-3 mr-1',style:{backgroundColor:'rgba(178, 223, 219, 0.5)',border:'1px solid rgba(178, 223, 219, 1)'}}),React.createElement('span',null,'正常 ± 2 S.D.')]),
                          React.createElement('div',{key:"l3",className:'flex items-center mr-1'},[React.createElement('div',{className:'w-4 h-4 mr-1 flex items-center justify-center'},React.createElement('div',{className:'w-4 h-0.5',style:{backgroundColor:'#FF5252'}})),React.createElement('span',null,'ACR 骨质疏松')]),
                          React.createElement('div',{key:"l4",className:'flex items-center mr-1'},[React.createElement('div',{className:'w-4 h-4 mr-1 flex items-center justify-center'},React.createElement('div',{className:'w-4 h-0.5',style:{backgroundColor:'#FFC107'}})),React.createElement('span',null,'ACR 骨质减少')]),
                          React.createElement('div',{key:"l5",className:'flex items-center mr-1'},[React.createElement('div',{className:'w-4 h-4 mr-1 flex items-center justify-center'},React.createElement('div',{className:'w-4 h-0.5',style:{backgroundColor:'#000000'}})),React.createElement('span',null,'正常')]),
                          React.createElement('div',{key:"l6",className:'flex items-center'},[React.createElement('div',{className:'w-4 h-4 mr-1 flex items-center justify-center'},React.createElement('div',{className:'w-2 h-2 rounded-full',style:{backgroundColor:'#000000'}})),React.createElement('span',null,'骨密度')])
                      ]
                    ),
                    React.createElement('div', { key: 'chart-source', className: 'text-xs text-center mt-1' },
                      '标准来源：中国⼈群定量CT(QCT)脊柱骨密度正常参考值的建立和骨质疏松症 QCT诊断标准的验证（2019）'
                    )
                 ]
               )
             ]
           )
         ]
       ),

      React.createElement(
        'div', { key: 'footer', className: 'mt-4 pt-3 border-t-2 border-black text-sm' },
         React.createElement('div', { className: 'font-bold mb-1' }, '诊断建议:'),
         React.createElement('div', { className: 'mb-2 text-xs' }, '该患者椎体平均体积骨密度值大于120毫克/立方厘米，诊断结果为正常。'),
         React.createElement('div', { className: 'font-bold mb-1' }, '备注:'),
         React.createElement('div', { className: 'mb-3 min-h-[2em] text-xs' }, ''),
         React.createElement('div', { className: 'flex justify-between items-end' },
            React.createElement('div', { className: 'text-xs text-gray-600' }, '此报告仅供参考。'),
            React.createElement('div', { className: 'text-sm' }, '医生签名: ___________')
         )
      )
    ]
  );
};

// --- PropTypes ---
BMDReport.propTypes = {
  measurements: PropTypes.shape({
    averageBMD: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    averageTScore: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    averageZScore: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    vertebrae: PropTypes.arrayOf(
      PropTypes.shape({
        label: PropTypes.string,
        bmd: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        bmc: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        tScore: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        zScore: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      })
    ),
  }).isRequired,
  patientInfo: PropTypes.shape({
    id: PropTypes.string, name: PropTypes.any, age: PropTypes.string, gender: PropTypes.string, weight: PropTypes.string, height: PropTypes.string, examDate: PropTypes.string, examLocation: PropTypes.string, printDate: PropTypes.string, referringDoctor: PropTypes.string, referringDept: PropTypes.string, examNumber: PropTypes.string, origin: PropTypes.string, bodyType: PropTypes.string, ward: PropTypes.string, bedNumber: PropTypes.string,
  }).isRequired,
  scanParams: PropTypes.shape({
    kvp: PropTypes.string, bedHeight: PropTypes.string, thickness: PropTypes.string, scanField: PropTypes.string, ma: PropTypes.string, referenceDensity: PropTypes.string, collimation: PropTypes.string, kernel: PropTypes.string, bedRotation: PropTypes.string,
  }).isRequired,
  hospitalInfo: PropTypes.shape({
    Title: PropTypes.string, Address: PropTypes.string, Doctor: PropTypes.string, Department: PropTypes.string,
  }),
  chartOptions: PropTypes.object,
};

// --- PDF Generation Function ---
export const convertBMDReportToPDF = async (
  measurements: Measurements,
  patientInfo: PatientInfo,
  hospitalInfo: HospitalInfo | undefined,
  scanParams: ScanParams
): Promise<jsPDF> => {
  console.log('Starting PDF generation with A4 format (Improved Clarity & Table Padding)');

  const A4_WIDTH_PT = 595.28;
  const A4_HEIGHT_PT = 841.89;

  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.left = '-9999px';
  tempContainer.style.width = `${A4_WIDTH_PT}pt`;
  tempContainer.style.height = `${A4_HEIGHT_PT}pt`;
  tempContainer.style.backgroundColor = '#FFFFFF';
  tempContainer.style.overflow = 'hidden';
  tempContainer.style.fontFamily = 'SimSun, "宋体", serif'; // Ensure base font
  tempContainer.style.fontSize = '10pt';
  tempContainer.style.color = '#000';
  tempContainer.style.padding = '20pt';
  tempContainer.style.border = '2px solid black';
  tempContainer.style.boxSizing = 'border-box';
  tempContainer.style.display = 'flex';
  tempContainer.style.flexDirection = 'column';

  document.body.appendChild(tempContainer);

  // Style adjustments for PDF rendering clarity
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    canvas { max-width: 100%; height: auto !important; display: block !important; }
    table { border-collapse: collapse; width: 100%; }
    /* Use pt for PDF consistency */
    th, td {
        border: 0.75px solid #555; /* Slightly darker internal border */
        padding: 5pt 5pt; /* MODIFIED: Added vertical padding */
        vertical-align: middle; /* Ensure vertical centering */
        font-size: 8.5pt; /* Consistent smaller font for tables */
        line-height: 1.3; /* Adjust line height for better spacing */
    }
    thead th {
        background-color: #f0f0f0;
        font-weight: bold;
        text-align: center;
        font-size: 9pt; /* Slightly larger header font */
    }
    /* Specific alignments if needed */
    td[align="right"] { text-align: right; }
    td[align="center"] { text-align: center; }
    td[align="left"] { text-align: left; }
  `;
  document.head.appendChild(styleEl);


  const format = (value: number | string | undefined | null, decimals = 1): string => {
      if (value === undefined || value === null || value === '') return '-';
      const number = parseFloat(String(value));
      return !isNaN(number) ? number.toFixed(decimals) : '-';
  };
  const formatScore = (value: number | string | undefined | null): string => format(value, 2);
  const getName = (): string => {
    if (!patientInfo?.name) return 'anonymous';
    if (typeof patientInfo.name === 'string') return patientInfo.name;
    if (Array.isArray(patientInfo.name)) return patientInfo.name.join(' ');
    return String(patientInfo.name);
  };

  const generateLocalChartData = (): ChartData<'line'> => {
      // Same chart data generation logic as before
      const ages = Array.from({ length: 8 }, (_, i) => 20 + i * 10);
      const normals = ages.map(age => 180 - (age - 20) * 1.3);
      const normalPlus1SD = normals.map(n => n + 20);
      const normalMinus1SD = normals.map(n => n - 20);
      const normalPlus2SD = normals.map(n => n + 40);
      const normalMinus2SD = normals.map(n => n - 40);
      const osteoporosisThreshold = Array(ages.length).fill(80);
      const osteopeniaThreshold = Array(ages.length).fill(120);
      const datasets: any[] = [];
      datasets.push({ label: '正常±2SD', data: normalPlus2SD, borderColor: 'rgba(178, 223, 219, 1)', backgroundColor: 'rgba(178, 223, 219, 0.4)', borderWidth: 0.5, pointRadius: 0, fill: false, tension: 0.4, order: 4 });
      datasets.push({ label: '_hidden_2sd_fill', data: normalMinus2SD, borderColor: 'rgba(178, 223, 219, 1)', backgroundColor: 'rgba(178, 223, 219, 0.4)', borderWidth: 0.5, pointRadius: 0, fill: '-1', tension: 0.4, order: 4 });
      datasets.push({ label: '正常±1SD', data: normalPlus1SD, borderColor: 'rgba(77, 182, 172, 1)', backgroundColor: 'rgba(77, 182, 172, 0.5)', borderWidth: 0.5, pointRadius: 0, fill: false, tension: 0.4, order: 3 });
      datasets.push({ label: '_hidden_1sd_fill', data: normalMinus1SD, borderColor: 'rgba(77, 182, 172, 1)', backgroundColor: 'rgba(77, 182, 172, 0.5)', borderWidth: 0.5, pointRadius: 0, fill: '-1', tension: 0.4, order: 3 });
      datasets.push({ label: '正常', data: normals, borderColor: '#000000', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: false, order: 2 });
      datasets.push({ label: 'ACR 骨质疏松', data: osteoporosisThreshold, borderColor: '#FF5252', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0, fill: false, order: 1 });
      datasets.push({ label: 'ACR 骨质减少', data: osteopeniaThreshold, borderColor: '#FFC107', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0, fill: false, order: 1 });
      if (patientInfo?.age && measurements?.averageBMD) {
        const age = parseInt(patientInfo.age, 10);
        const bmdValue = parseFloat(String(measurements.averageBMD));
        if (!isNaN(age) && !isNaN(bmdValue)) {
            const patientData = Array(ages.length).fill(null);
            let closestAgeIndex = -1;
            let minDiff = Infinity;
            ages.forEach((axisAge, index) => {
                const diff = Math.abs(axisAge - age);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestAgeIndex = index;
                }
            });
            if (closestAgeIndex !== -1) {
                 patientData[closestAgeIndex] = bmdValue;
            }
            datasets.push({ label: '骨密度', data: patientData, borderColor: '#000', backgroundColor: '#000', borderWidth: 0, pointRadius: 4, fill: false, tension: 0, order: 0 });
        }
    }
    return { labels: ages, datasets };
  };
  const localChartOptions: ChartOptions<'line'> = {
      // Same chart options as before
      responsive: true, maintainAspectRatio: false, animation: false, devicePixelRatio: 4,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
          y: { min: 0, max: 240, title: { display: true, text: '骨密度 (mg/cc)', font: { size: 9, weight: 'normal' }, color: '#000', padding: {bottom: 2} }, ticks: { font: { size: 7 }, color: '#000', stepSize: 40, padding: 2 }, grid: { color: '#e0e0e0', drawBorder: true, borderWidth: 0.5 } },
          x: { title: { display: false }, grid: { color: '#e0e0e0', drawBorder: true, borderWidth: 0.5 }, ticks: { font: { size: 7 }, color: '#000', padding: 2 }, }
      },
    layout: {
        padding: { top: 5, right: 10, bottom: 0, left: 5 }
    }
  };

  const today = new Date();
  const defaultPrintDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const currentPatientInfo = { printDate: defaultPrintDate, ...patientInfo };
  const currentHospitalInfo = { Title: '深圳大学总医院', Address: '深圳', Department: '放射科', ...hospitalInfo };
  const currentMeasurements = measurements;
  const currentScanParams = scanParams;
  const currentVertebrae = (currentMeasurements?.vertebrae && currentMeasurements.vertebrae.length > 0)
    ? currentMeasurements.vertebrae
    : [{ label: 'L3', bmd: '-', tScore: '-', zScore: '-' }];

  // MODIFIED: Helper functions for PDF table cells with improved padding and styling
  const createPdfTableCell = (text: string, styles: React.CSSProperties = {}, colSpan?: number, rowSpan?: number) => {
    // Default styles applied via CSS <style> tag now
    return React.createElement('td', { style: styles, colSpan, rowSpan, align: styles.textAlign as string || 'left' }, text);
  };

  const createPdfTableHeaderCell = (text: string, styles: React.CSSProperties = {}, colSpan?: number) => {
    // Default styles applied via CSS <style> tag now
    return React.createElement('th', { style: styles, colSpan }, text);
  };


  return new Promise((resolve, reject) => {
    try {
      const root = createRoot(tempContainer);

      const reportElementForPDF = React.createElement(
         'div',
         { style: { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'SimSun, "宋体", serif' } },
         [
            // Header Section (unchanged)
            React.createElement(
               'div', { key: 'pdf-header', style: { marginBottom: '0.2rem' } },
              [
                 React.createElement('div', { key: 'pdf-report-title', style: { fontSize: '14pt', fontWeight: 'bold', textAlign: 'left', marginBottom: '2pt' } }, 'QCT骨密度检测报告'),
                 React.createElement('div', { key: 'pdf-hospital-name', style: { fontSize: '12pt', fontWeight: 'bold', textAlign: 'center', marginTop: '0pt', marginBottom: '3pt' } }, currentHospitalInfo.Title),
                 React.createElement('div', { key: 'pdf-date-address', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8.5pt', marginTop: '2pt' } },
                  [
                    React.createElement('div', { key: 'pdf-print-date' }, `打印日期: ${currentPatientInfo.printDate}`),
                    React.createElement('div', { key: 'pdf-address' }, currentHospitalInfo.Address)
                  ]
                )
              ]
            ),
            React.createElement('div', { key: 'pdf-divider-1', style: { borderTop: '1.5px solid #000', marginTop: '0.2rem', marginBottom: '0.4rem' } }),

            // Info Sections (unchanged layout, styling handled by CSS)
            React.createElement(
                'div', { key: 'pdf-patient-info', style: { marginBottom: '0.4rem', paddingBottom: '0.3rem', borderBottom: '1.5px solid #000' } },
                [
                    React.createElement('div', { style: { fontWeight: 'bold', fontSize: '10pt', marginBottom: '0.2rem' } }, '病人信息'),
                    React.createElement(
                        'div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', columnGap: '0.75rem', rowGap: '1pt', fontSize: '9pt' } },
                        [ /* Patient info items */
                            React.createElement('div', { key: 'p1' }, `病人ID: ${currentPatientInfo.id || '-'}`),
                            React.createElement('div', { key: 'p2' }, `年龄: ${currentPatientInfo.age || '-'} 岁`),
                            React.createElement('div', { key: 'p3' }, `性别: ${currentPatientInfo.gender || '-'}`),
                            React.createElement('div', { key: 'p4' }, `病区: ${currentPatientInfo.ward || '-'}`),
                            React.createElement('div', { key: 'p5' }, `姓名: ${getName()}`),
                            React.createElement('div', { key: 'p6' }, `体重: ${currentPatientInfo.weight || '-'}`),
                            React.createElement('div', { key: 'p7' }, `身高: ${currentPatientInfo.height || '-'}`),
                            React.createElement('div', { key: 'p8' }, `床号: ${currentPatientInfo.bedNumber || '-'}`)
                        ]
                    )
                ]
            ),
            React.createElement(
                'div', { key: 'pdf-exam-info', style: { marginBottom: '0.4rem', paddingBottom: '0.3rem', borderBottom: '1.5px solid #000' } },
                [
                    React.createElement('div', { style: { fontWeight: 'bold', fontSize: '10pt', marginBottom: '0.2rem' } }, '检测信息'),
                    React.createElement(
                        'div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', columnGap: '0.75rem', rowGap: '1pt', fontSize: '9pt' } },
                        [ /* Exam info items */
                            React.createElement('div', { key: 'e1' }, `开单医生: ${currentPatientInfo.referringDoctor || '-'}`),
                            React.createElement('div', { key: 'e2' }, `开单科室: ${currentPatientInfo.referringDept || '-'}`),
                            React.createElement('div', { key: 'e3' }, `报告医生: ${currentHospitalInfo.Doctor || '-'}`),
                            React.createElement('div', { key: 'e4' }, `报告科室: ${currentHospitalInfo.Department || '-'}`),
                            React.createElement('div', { key: 'e5' }, `检测日期: ${currentPatientInfo.examDate || '-'}`),
                            React.createElement('div', { key: 'e6' }, `检测部位: ${currentPatientInfo.examLocation || '-'}`),
                            React.createElement('div', { key: 'e7' }, `体检编号: ${currentPatientInfo.examNumber || '-'}`)
                        ]
                    )
                ]
            ),
            React.createElement(
                'div', { key: 'pdf-scan-params', style: { marginBottom: '0.5rem', paddingBottom: '0.3rem', borderBottom: '1.5px solid #000' } },
                [
                    React.createElement('div', { style: { fontWeight: 'bold', fontSize: '10pt', marginBottom: '0.2rem' } }, '扫描参数'),
                    React.createElement(
                        'div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', columnGap: '0.75rem', rowGap: '1pt', fontSize: '9pt' } },
                        [ /* Scan params items */
                            React.createElement('div', { key: 's1' }, `kVp: ${currentScanParams.kvp || '-'}`),
                            React.createElement('div', { key: 's2' }, `床高: ${currentScanParams.bedHeight || '-'}`),
                            React.createElement('div', { key: 's3' }, `层厚: ${currentScanParams.thickness || '-'}`),
                            React.createElement('div', { key: 's4' }, `扫描野: ${currentScanParams.scanField || '-'}`),
                            React.createElement('div', { key: 's5' }, `mA: ${currentScanParams.ma || '-'}`),
                            React.createElement('div', { key: 's6' }, `床旋进比: ${currentScanParams.bedRotation || '-'}`),
                            React.createElement('div', { key: 's7' }, `准直宽度: ${currentScanParams.collimation || '-'}`),
                            React.createElement('div', { key: 's8' }, `卷积核: ${currentScanParams.kernel || '-'}`)
                        ]
                    )
                ]
            ),

            // Results Section - Tables and Chart
             React.createElement(
                'div', { key: 'pdf-results', style: { marginBottom: '0.5rem', flexGrow: 1 } },
                [
                    React.createElement('div', { style: { fontWeight: 'bold', textAlign: 'center', fontSize: '11pt', marginBottom: '0.4rem' } }, '骨密度结果表与图表'),
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', columnGap: '0.75rem' } },
                        [ // Top Row: Average BMD Table & Diagnosis Table
                            React.createElement('div', { style: { flex: '1 1 0%' } },
                                [
                                    React.createElement('table', { style: { border: '1px solid #000'} }, // Outer border for this table
                                        React.createElement('tbody', null, [
                                            // Using createPdfTableCell which now gets default padding/alignment from CSS
                                            React.createElement('tr', { key: 'rl1'}, [createPdfTableCell('平均体积骨密度 (mg/cc)', { fontWeight: 'bold', backgroundColor: '#f3f4f6', width: '65%'}), createPdfTableCell(format(currentMeasurements?.averageBMD), { textAlign: 'right', fontWeight: '600'}) ]),
                                            React.createElement('tr', { key: 'rl2'}, [createPdfTableCell('T值',{ fontWeight: 'bold', backgroundColor: '#f3f4f6', width: '65%'}), createPdfTableCell(formatScore(currentMeasurements?.averageTScore), { textAlign: 'right'}) ]),
                                            React.createElement('tr', { key: 'rl3'}, [createPdfTableCell('Z值',{ fontWeight: 'bold', backgroundColor: '#f3f4f6', width: '65%'}), createPdfTableCell(formatScore(currentMeasurements?.averageZScore), { textAlign: 'right'}) ])
                                        ])
                                    ),
                                    React.createElement('div', { style: { fontSize: '7.5pt', marginTop: '2pt' } }, '注: 可参考右侧标准')
                                ]
                            ),
                            React.createElement('div', { style: { flex: '1 1 0%' } },
                                [
                                    React.createElement('table', { style: { border: '1px solid #000' } }, // Outer border for this table
                                        [
                                            React.createElement('thead', null, React.createElement('tr', null, [createPdfTableHeaderCell('体积骨密度诊断标准', {fontWeight: 'bold', textAlign: 'left'}), createPdfTableHeaderCell('诊断结果', {fontWeight: 'bold', textAlign: 'left'}) ]) ),
                                            React.createElement('tbody', null,
                                            generateDiagnosisRows().map(row => {
                                                // Get original text content
                                                const rangeText = row.props.children[0].props.children;
                                                const resultText = row.props.children[1].props.children;
                                                // Create new cells using the helper for PDF styling
                                                return React.createElement('tr', { key: row.key }, [
                                                    createPdfTableCell(rangeText, {textAlign: 'left'}), // Apply specific alignment
                                                    createPdfTableCell(resultText, {textAlign: 'left'}), // Apply specific alignment
                                                ]);
                                            })
                                        )
                                        ]
                                    ),
                                    React.createElement('div', { style: { fontSize: '7.5pt', marginTop: '2pt', textAlign: 'center' } }, '标准来源：骨质疏松的影像学与骨密度诊断专家共识 (2020)')
                                ]
                            )
                        ]
                    ),
                    React.createElement('div', { style: { display: 'flex', columnGap: '0.75rem', marginTop: '0.6rem' } },
                        [ // Bottom Row: Vertebrae Table & Chart
                            React.createElement('div', { style: { width: '41.666667%' } }, // w-5/12
                                React.createElement('table', { style: { border: '1px solid #000' } }, // Outer border for this table
                                    [
                                        React.createElement('thead', null, React.createElement('tr', null, [createPdfTableHeaderCell('椎体'), createPdfTableHeaderCell('骨密度'), createPdfTableHeaderCell('T值'), createPdfTableHeaderCell('Z值') ]) ),
                                        React.createElement('tbody', null,
                                            currentVertebrae.map((vertebra, index) =>
                                                React.createElement('tr', { key: `${vertebra.label}-${index}`}, [
                                                createPdfTableCell(vertebra.label, {textAlign: 'center'}), // Apply specific alignment
                                                createPdfTableCell(format(vertebra.bmd), {textAlign: 'right'}), // Apply specific alignment
                                                createPdfTableCell(formatScore(vertebra.tScore), {textAlign: 'center'}), // Apply specific alignment
                                                createPdfTableCell(formatScore(vertebra.zScore), {textAlign: 'center'}), // Apply specific alignment
                                            ])
                                            )
                                        )
                                    ]
                                )
                            ),
                            React.createElement('div', { style: { width: '58.333333%', display: 'flex', flexDirection: 'column' } }, // w-7/12
                                [
                                    React.createElement('div', { key: 'chart-area', style: { position: 'relative', height: '240px', width: '100%' } }, // Chart height remains the same
                                        React.createElement(Line, { data: generateLocalChartData(), options: localChartOptions })
                                    ),
                                    React.createElement('div', { style: { textAlign: 'center', fontSize: '9pt', fontWeight: '600', marginTop: '1pt' } }, '年龄'),
                                    React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: '0.4rem', rowGap: '0.1rem', marginTop: '0.2rem', fontSize: '7.5pt' } }, // Applied font size to parent
                                        [ // Legend items
                                          React.createElement('div',{key:"l1",style:{display:'flex',alignItems:'center'}},[React.createElement('div',{style:{width:'8px',height:'8px',marginRight:'2px',backgroundColor:'rgba(77, 182, 172, 0.5)',border:'0.5px solid rgba(77, 182, 172, 1)'}}),React.createElement('span',null,'正常 ± 1 S.D.')]),
                                          React.createElement('div',{key:"l2",style:{display:'flex',alignItems:'center'}},[React.createElement('div',{style:{width:'8px',height:'8px',marginRight:'2px',backgroundColor:'rgba(178, 223, 219, 0.4)',border:'0.5px solid rgba(178, 223, 219, 1)'}}),React.createElement('span',null,'正常 ± 2 S.D.')]),
                                          React.createElement('div',{key:"l3",style:{display:'flex',alignItems:'center'}},[React.createElement('div',{style:{width:'10px',height:'1.5px',marginRight:'2px',backgroundColor:'#FF5252'}}),React.createElement('span',null,'ACR 骨质疏松')]),
                                          React.createElement('div',{key:"l4",style:{display:'flex',alignItems:'center'}},[React.createElement('div',{style:{width:'10px',height:'1.5px',marginRight:'2px',backgroundColor:'#FFC107'}}),React.createElement('span',null,'ACR 骨质减少')]),
                                          React.createElement('div',{key:"l5",style:{display:'flex',alignItems:'center'}},[React.createElement('div',{style:{width:'10px',height:'1.5px',marginRight:'2px',backgroundColor:'#000000'}}),React.createElement('span',null,'正常')]),
                                          React.createElement('div',{key:"l6",style:{display:'flex',alignItems:'center'}},[React.createElement('div',{style:{width:'5px',height:'5px',borderRadius:'50%',marginRight:'2px',backgroundColor:'#000000'}}),React.createElement('span',null,'骨密度')])
                                        ]
                                    ),
                                    React.createElement('div', { style: { fontSize: '7.5pt', textAlign: 'center', marginTop: '0.2rem' } }, '标准来源：中国人群定量CT(QCT)脊柱骨密度正常参考值的建立...')
                                ]
                            )
                        ]
                    )
                ]
            ),

            // Footer Section (unchanged)
            React.createElement(
              'div', { key: 'pdf-footer', style: { marginTop: 'auto', paddingTop: '0.4rem', borderTop: '1.5px solid #000', fontSize: '8.5pt' } },
              [
                 React.createElement('div', { style: { fontWeight: 'bold', marginBottom: '1pt' } }, '诊断建议:'),
                 React.createElement('div', { style: { marginBottom: '2pt', fontSize: '8pt' } }, '该患者椎体平均体积骨密度值大于120毫克/立方厘米，诊断结果为正常。'),
                 React.createElement('div', { style: { fontWeight: 'bold', marginBottom: '1pt' } }, '备注:'),
                 React.createElement('div', { style: { marginBottom: '3pt', minHeight: '1.5em', fontSize: '8pt', borderBottom: '0.5px dotted #777' } }, ''),
                 React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '3pt' } },
                  [
                     React.createElement('div', { style: { fontSize: '7.5pt', color: '#555', alignItems: 'center' } }, '此报告仅供参考。'),
                     React.createElement('div', { style: { fontSize: '8.5pt' } }, '医生签名: _________________')
                  ]
                )
              ]
            )
         ]
       );

      root.render(reportElementForPDF);

      setTimeout(async () => {
        try {
          console.log('Capturing PDF content with scale 4...');
          const captureWidth = tempContainer.offsetWidth;
          const captureHeight = tempContainer.offsetHeight;

          const canvas = await html2canvas(tempContainer, {
             scale: 4, // MODIFIED: Increased scale for better clarity
             useCORS: true,
             logging: false,
             backgroundColor: '#FFFFFF',
             width: captureWidth,
             height: captureHeight,
             scrollX: -window.scrollX,
             scrollY: -window.scrollY,
             windowWidth: document.documentElement.offsetWidth,
             windowHeight: document.documentElement.offsetHeight,
            onclone: (document) => {
                // Re-apply styles in the cloned document for html2canvas
                const style = document.createElement('style');
                style.textContent = styleEl.textContent; // Use the same styles defined above
                document.head.appendChild(style);
                const clonedContainer = document.body.querySelector('div'); // Target the main container
                if (clonedContainer) {
                    clonedContainer.style.fontFamily = 'SimSun, "宋体", serif'; // Ensure font
                }
            }
          });
          console.log(`Canvas captured: ${canvas.width}px x ${canvas.height}px`);

          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'a4',
            compress: true,
          });

          const imgData = canvas.toDataURL('image/png', 1.0); // High quality PNG
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();

          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');


          document.body.removeChild(tempContainer);
          document.head.removeChild(styleEl);
          root.unmount();

          console.log('PDF generation completed successfully.');
          resolve(pdf);
        } catch (error) {
          console.error('Error during html2canvas or PDF generation:', error);
          // Cleanup on error
          if (tempContainer.parentNode) document.body.removeChild(tempContainer);
          if (styleEl.parentNode) document.head.removeChild(styleEl);
          try { root.unmount(); } catch (e) { /* Ignore */ }
          reject(error);
        }
      }, 1500); // Keep timeout for rendering

    } catch (error) {
      console.error('PDF setup failed:', error);
      // Cleanup on error
      if (tempContainer.parentNode) document.body.removeChild(tempContainer);
      if (styleEl.parentNode) document.head.removeChild(styleEl);
      reject(error);
    }
  });
};

export default BMDReport;
